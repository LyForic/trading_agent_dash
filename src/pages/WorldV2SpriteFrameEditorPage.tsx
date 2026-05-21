import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  Brush,
  Check,
  ClipboardPaste,
  Copy,
  Eraser,
  FlipHorizontal,
  MousePointer2,
  Move,
  Pause,
  Pipette,
  Play,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 112;
const FRAME_COUNT = 6;
const API_PATH = '/api/world-v2/sprite-sheet-candidate';
const MIN_ZOOM = 4;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1;

const ACTORS = [
  { slug: 'apex-idle', label: 'Apex' },
  { slug: 'metheus-idle', label: 'Metheus' },
  { slug: 'gale-idle', label: 'Gale' },
  { slug: 'apex-helper-idle', label: 'Apex helper' },
  { slug: 'apex-helper-carry', label: 'Apex helper logs' },
  { slug: 'apex-helper-sweep', label: 'Apex helper broom' },
  { slug: 'metheus-helper-books', label: 'Owl books' },
  { slug: 'metheus-helper-scroll', label: 'Owl scroll' },
  { slug: 'metheus-helper-lantern', label: 'Owl lantern' },
  { slug: 'gale-helper-crystal', label: 'Penguin crystal' },
  { slug: 'gale-helper-jar', label: 'Penguin jar' },
  { slug: 'gale-helper-tool', label: 'Penguin tool' },
  { slug: 'bacon-idle', label: 'Bacon' },
  { slug: 'bacon-helper-idle', label: 'Pig helper' },
  { slug: 'bacon-helper-basket', label: 'Pig basket' },
  { slug: 'bacon-helper-stir', label: 'Pig stir' },
  { slug: 'nova-idle', label: 'Nova' },
  { slug: 'nova-helper-idle', label: 'Phoenix helper' },
  { slug: 'nova-helper-gem', label: 'Phoenix gem' },
  { slug: 'nova-helper-scroll', label: 'Phoenix scroll' },
] as const;

const DIRECTIONS = [
  { id: 'down', label: 'Down' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'up', label: 'Up' },
] as const;

type ActorSlug = typeof ACTORS[number]['slug'];
type DirectionKey = typeof DIRECTIONS[number]['id'];
type Tool = 'brush' | 'eraser' | 'picker' | 'select';
type SelectionMode = 'rect' | 'lasso';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SelectionShape extends Rect {
  kind: SelectionMode;
  points?: Point[];
}

interface FloatingSelection extends Rect {
  data: ImageData;
  rotation: number;
  scale: number;
}

type Interaction =
  | { kind: 'paint' }
  | { kind: 'select'; start: Point }
  | { kind: 'lasso'; points: Point[] }
  | { kind: 'move'; offset: Point };

interface EditorSnapshot {
  sheet: ImageData;
  selection: SelectionShape | null;
  floating: FloatingSelection | null;
  selectedDirection: DirectionKey;
  selectedFrame: number;
}

export function WorldV2SpriteFrameEditorPage() {
  const [selectedActor, setSelectedActor] = useState<ActorSlug>('apex-idle');
  const [selectedDirection, setSelectedDirection] = useState<DirectionKey>('left');
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [tool, setTool] = useState<Tool>('select');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('rect');
  const [zoom, setZoom] = useState(7);
  const [brushSize, setBrushSize] = useState(1);
  const [color, setColor] = useState('#ffffff');
  const [showPrevious, setShowPrevious] = useState(true);
  const [showNext, setShowNext] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [selection, setSelection] = useState<SelectionShape | null>(null);
  const [floating, setFloating] = useState<FloatingSelection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedPath, setSavedPath] = useState('');
  const [hasClipboard, setHasClipboard] = useState(false);
  const [undoDepth, setUndoDepth] = useState(0);

  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sheetCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const clipboardRef = useRef<ImageData | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const historyRef = useRef<EditorSnapshot[]>([]);

  const directionIndex = useMemo(
    () => Math.max(0, DIRECTIONS.findIndex((direction) => direction.id === selectedDirection)),
    [selectedDirection],
  );
  const actor = ACTORS.find((candidate) => candidate.slug === selectedActor) ?? ACTORS[0];

  useEffect(() => {
    document.body.dataset.route = 'sprite-frame-editor';
    return () => {
      delete document.body.dataset.route;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      sheetCanvasRef.current = canvas;
      historyRef.current = [];
      setSelection(null);
      setFloating(null);
      setUndoDepth(0);
      setSaveState('idle');
      setSavedPath('');
      setLoaded(true);
      setRevision((current) => current + 1);
    };
    image.src = `/world-v2/actors/walk/${selectedActor}-walk.png?edit=${Date.now()}`;

    return () => {
      cancelled = true;
    };
  }, [selectedActor]);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setPreviewFrame((frame) => (frame + 1) % FRAME_COUNT);
    }, 120);
    return () => window.clearInterval(timer);
  }, [playing]);

  const drawFrame = useCallback(() => {
    void revision;
    const sheet = sheetCanvasRef.current;
    const canvas = frameCanvasRef.current;
    if (!sheet || !canvas || !loaded) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);

    if (showPrevious) {
      context.globalAlpha = 0.22;
      context.drawImage(
        sheet,
        ((selectedFrame + FRAME_COUNT - 1) % FRAME_COUNT) * FRAME_WIDTH,
        directionIndex * FRAME_HEIGHT,
        FRAME_WIDTH,
        FRAME_HEIGHT,
        0,
        0,
        FRAME_WIDTH,
        FRAME_HEIGHT,
      );
    }
    if (showNext) {
      context.globalAlpha = 0.16;
      context.drawImage(
        sheet,
        ((selectedFrame + 1) % FRAME_COUNT) * FRAME_WIDTH,
        directionIndex * FRAME_HEIGHT,
        FRAME_WIDTH,
        FRAME_HEIGHT,
        0,
        0,
        FRAME_WIDTH,
        FRAME_HEIGHT,
      );
    }

    context.globalAlpha = 1;
    context.drawImage(
      sheet,
      selectedFrame * FRAME_WIDTH,
      directionIndex * FRAME_HEIGHT,
      FRAME_WIDTH,
      FRAME_HEIGHT,
      0,
      0,
      FRAME_WIDTH,
      FRAME_HEIGHT,
    );

    if (floating) {
      drawFloating(context, floating);
    }
  }, [directionIndex, floating, loaded, selectedFrame, showNext, showPrevious, revision]);

  const drawPreview = useCallback(() => {
    void revision;
    const sheet = sheetCanvasRef.current;
    const canvas = previewCanvasRef.current;
    if (!sheet || !canvas || !loaded) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    context.drawImage(
      sheet,
      previewFrame * FRAME_WIDTH,
      directionIndex * FRAME_HEIGHT,
      FRAME_WIDTH,
      FRAME_HEIGHT,
      0,
      0,
      FRAME_WIDTH,
      FRAME_HEIGHT,
    );
  }, [directionIndex, loaded, previewFrame, revision]);

  useEffect(() => {
    drawFrame();
  }, [drawFrame]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  useEffect(() => {
    const sheet = sheetCanvasRef.current;
    if (!sheet || !loaded) return;
    const nextThumbs = Array.from({ length: FRAME_COUNT }, (_, frameIndex) => {
      const canvas = document.createElement('canvas');
      canvas.width = FRAME_WIDTH;
      canvas.height = FRAME_HEIGHT;
      const context = canvas.getContext('2d');
      if (!context) return '';
      context.imageSmoothingEnabled = false;
      context.drawImage(
        sheet,
        frameIndex * FRAME_WIDTH,
        directionIndex * FRAME_HEIGHT,
        FRAME_WIDTH,
        FRAME_HEIGHT,
        0,
        0,
        FRAME_WIDTH,
        FRAME_HEIGHT,
      );
      return canvas.toDataURL('image/png');
    });
    setThumbs(nextThumbs);
  }, [directionIndex, loaded, revision]);

  const markDirty = () => {
    setRevision((current) => current + 1);
    setSaveState('idle');
    setSavedPath('');
  };

  const frameOrigin = () => ({
    x: selectedFrame * FRAME_WIDTH,
    y: directionIndex * FRAME_HEIGHT,
  });

  const pushUndo = () => {
    const sheet = sheetCanvasRef.current;
    if (!sheet) return;
    const context = sheet.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const nextHistory = historyRef.current;
    nextHistory.push({
      sheet: context.getImageData(0, 0, sheet.width, sheet.height),
      selection: cloneSelectionShape(selection),
      floating: cloneFloatingSelection(floating),
      selectedDirection,
      selectedFrame,
    });
    if (nextHistory.length > 60) {
      nextHistory.shift();
    }
    setUndoDepth(nextHistory.length);
  };

  const undo = () => {
    const snapshot = historyRef.current.pop();
    const sheet = sheetCanvasRef.current;
    if (!snapshot || !sheet) return;
    const context = sheet.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.clearRect(0, 0, sheet.width, sheet.height);
    context.putImageData(snapshot.sheet, 0, 0);
    setSelectedDirection(snapshot.selectedDirection);
    setSelectedFrame(snapshot.selectedFrame);
    setSelection(cloneSelectionShape(snapshot.selection));
    setFloating(cloneFloatingSelection(snapshot.floating));
    setUndoDepth(historyRef.current.length);
    markDirty();
  };

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(Math.floor(((event.clientX - rect.left) / rect.width) * FRAME_WIDTH), 0, FRAME_WIDTH - 1),
      y: clamp(Math.floor(((event.clientY - rect.top) / rect.height) * FRAME_HEIGHT), 0, FRAME_HEIGHT - 1),
    };
  };

  const applyPaint = (point: Point) => {
    const sheet = sheetCanvasRef.current;
    if (!sheet) return;
    const context = sheet.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const origin = frameOrigin();
    const radius = Math.floor(brushSize / 2);
    if (tool === 'eraser') {
      context.clearRect(origin.x + point.x - radius, origin.y + point.y - radius, brushSize, brushSize);
    } else {
      context.fillStyle = color;
      context.fillRect(origin.x + point.x - radius, origin.y + point.y - radius, brushSize, brushSize);
    }
    markDirty();
  };

  const pickColor = (point: Point) => {
    const sheet = sheetCanvasRef.current;
    if (!sheet) return;
    const context = sheet.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const origin = frameOrigin();
    const [red, green, blue, alpha] = context.getImageData(origin.x + point.x, origin.y + point.y, 1, 1).data;
    if (alpha <= 0) return;
    setColor(rgbToHex(red, green, blue));
    setTool('brush');
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!loaded || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);

    if (tool === 'picker') {
      pickColor(point);
      return;
    }

    if (tool === 'brush' || tool === 'eraser') {
      pushUndo();
      interactionRef.current = { kind: 'paint' };
      applyPaint(point);
      return;
    }

    if (floating && pointInside(point, floatingBounds(floating))) {
      pushUndo();
      interactionRef.current = {
        kind: 'move',
        offset: {
          x: point.x - floating.x,
          y: point.y - floating.y,
        },
      };
      return;
    }

    if (selectionMode === 'lasso') {
      const points = [point];
      interactionRef.current = { kind: 'lasso', points };
      setSelection(selectionFromPoints(points));
      return;
    }

    interactionRef.current = { kind: 'select', start: point };
    setSelection(selectionFromRect({ x: point.x, y: point.y, width: 1, height: 1 }));
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || !loaded) return;
    const point = pointFromEvent(event);

    if (interaction.kind === 'paint') {
      applyPaint(point);
      return;
    }

    if (interaction.kind === 'move') {
      setFloating((current) => {
        if (!current) return current;
        const size = floatingDisplaySize(current);
        return {
          ...current,
          x: clampFloatingPosition(point.x - interaction.offset.x, size.width, FRAME_WIDTH),
          y: clampFloatingPosition(point.y - interaction.offset.y, size.height, FRAME_HEIGHT),
        };
      });
      return;
    }

    if (interaction.kind === 'lasso') {
      const lastPoint = interaction.points[interaction.points.length - 1];
      if (lastPoint.x === point.x && lastPoint.y === point.y) return;
      interaction.points.push(point);
      setSelection(selectionFromPoints(interaction.points));
      return;
    }

    const rect = normalizeRect(interaction.start, point);
    setSelection(selectionFromRect(rect));
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    interactionRef.current = null;
  };

  const copySelection = () => {
    const shape = selection;
    const sheet = sheetCanvasRef.current;
    if (!shape || !sheet) return;
    const context = sheet.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const origin = frameOrigin();
    clipboardRef.current = extractSelectionImageData(context, origin, shape);
    setHasClipboard(true);
  };

  const cutSelection = () => {
    liftSelectionToFloating();
  };

  const liftSelectionToFloating = () => {
    const shape = selection;
    const sheet = sheetCanvasRef.current;
    if (!shape || !sheet) return null;
    const context = sheet.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    const origin = frameOrigin();
    pushUndo();
    const data = extractSelectionImageData(context, origin, shape);
    clipboardRef.current = cloneImageData(data);
    setHasClipboard(true);
    clearSelectionPixels(context, origin, shape);
    const nextFloating = {
      x: shape.x,
      y: shape.y,
      width: data.width,
      height: data.height,
      data,
      rotation: 0,
      scale: 1,
    };
    setFloating(nextFloating);
    setSelection(null);
    markDirty();
    return nextFloating;
  };

  const pasteSelection = () => {
    const data = clipboardRef.current;
    if (!data) return;
    pushUndo();
    const x = selection ? selection.x : Math.round((FRAME_WIDTH - data.width) / 2);
    const y = selection ? selection.y : Math.round((FRAME_HEIGHT - data.height) / 2);
    setFloating({
      x: clamp(x, 0, FRAME_WIDTH - data.width),
      y: clamp(y, 0, FRAME_HEIGHT - data.height),
      width: data.width,
      height: data.height,
      data: cloneImageData(data),
      rotation: 0,
      scale: 1,
    });
    setSelection(null);
  };

  const commitFloating = () => {
    const current = floating;
    const sheet = sheetCanvasRef.current;
    if (!current || !sheet) return;
    const context = sheet.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const origin = frameOrigin();
    pushUndo();
    drawFloating(context, current, origin);
    setFloating(null);
    markDirty();
  };

  const cancelFloating = () => {
    pushUndo();
    setFloating(null);
    drawFrame();
  };

  const mirrorCurrent = () => {
    if (floating) {
      pushUndo();
      setFloating((current) => current ? { ...current, data: flipImageData(current.data) } : current);
      return;
    }
    const rect = selection;
    const sheet = sheetCanvasRef.current;
    if (!rect || !sheet) return;
    if (rect.kind === 'lasso') {
      const lifted = liftSelectionToFloating();
      if (!lifted) return;
      setFloating({ ...lifted, data: flipImageData(lifted.data) });
      return;
    }
    const context = sheet.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const origin = frameOrigin();
    pushUndo();
    const data = context.getImageData(origin.x + rect.x, origin.y + rect.y, rect.width, rect.height);
    context.putImageData(flipImageData(data), origin.x + rect.x, origin.y + rect.y);
    markDirty();
  };

  const clearSelection = () => {
    setSelection(null);
    if (floating) {
      cancelFloating();
    } else {
      setFloating(null);
    }
  };

  const updateFloatingTransform = (updater: (current: FloatingSelection) => FloatingSelection) => {
    if (floating) {
      pushUndo();
      setFloating((current) => current ? updater(current) : current);
      return;
    }
    if (!selection) return;
    const lifted = liftSelectionToFloating();
    if (!lifted) return;
    setFloating(updater(lifted));
  };

  const rotateFloatingSelection = (degrees: number) => {
    updateFloatingTransform((current) => ({
      ...current,
      rotation: normalizeDegrees(current.rotation + degrees),
    }));
  };

  const scaleFloatingSelection = (factor: number) => {
    updateFloatingTransform((current) => scaleFloating(current, factor));
  };

  const resetFloatingTransform = () => {
    updateFloatingTransform((current) => ({
      ...current,
      x: clampFloatingPosition(current.x, current.width, FRAME_WIDTH),
      y: clampFloatingPosition(current.y, current.height, FRAME_HEIGHT),
      rotation: 0,
      scale: 1,
    }));
  };

  const canTransformSelection = Boolean(selection || floating);

  const saveCandidate = () => {
    const sheet = sheetCanvasRef.current;
    if (!sheet) return;
    setSaveState('saving');
    fetch(API_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-world-v2-editor': '1' },
      body: JSON.stringify({
        slug: selectedActor,
        dataUrl: sheet.toDataURL('image/png'),
      }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Save failed: ${response.status}`);
        return response.json() as Promise<{ path: string }>;
      })
      .then((payload) => {
        setSavedPath(payload.path);
        setSaveState('saved');
      })
      .catch(() => setSaveState('error'));
  };

  return (
    <main className="sprite-editor-page">
      <aside className="sprite-editor-sidebar">
        <div className="sprite-editor-header">
          <div>
            <p>Trading Gym V2</p>
            <h1>Sprite Editor</h1>
          </div>
          <button type="button" className="sprite-editor-save" onClick={saveCandidate} disabled={!loaded}>
            <Save size={16} aria-hidden />
            {saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save error' : 'Save candidate'}
          </button>
        </div>

        <div className="sprite-editor-controls">
          <label>
            Actor
            <select
              value={selectedActor}
              onChange={(event) => {
                setSelectedActor(event.target.value as ActorSlug);
                setSelectedFrame(0);
              }}
            >
              {ACTORS.map((candidate) => (
                <option key={candidate.slug} value={candidate.slug}>{candidate.label}</option>
              ))}
            </select>
          </label>

          <div className="sprite-editor-direction-tabs">
            {DIRECTIONS.map((direction) => (
              <button
                key={direction.id}
                type="button"
                className={selectedDirection === direction.id ? 'sprite-editor-tab sprite-editor-tab--active' : 'sprite-editor-tab'}
                onClick={() => {
                  setSelectedDirection(direction.id);
                  setSelectedFrame(0);
                  setSelection(null);
                  setFloating(null);
                }}
              >
                {direction.label}
              </button>
            ))}
          </div>

          <div className="sprite-editor-tool-grid">
            <ToolButton active={tool === 'select'} icon={<MousePointer2 size={15} />} label="Select" onClick={() => setTool('select')} />
            <ToolButton active={tool === 'brush'} icon={<Brush size={15} />} label="Brush" onClick={() => setTool('brush')} />
            <ToolButton active={tool === 'eraser'} icon={<Eraser size={15} />} label="Erase" onClick={() => setTool('eraser')} />
            <ToolButton active={tool === 'picker'} icon={<Pipette size={15} />} label="Pick" onClick={() => setTool('picker')} />
          </div>

          <div className="sprite-editor-selection-mode">
            <button
              type="button"
              className={selectionMode === 'rect' ? 'sprite-editor-mode-button sprite-editor-mode-button--active' : 'sprite-editor-mode-button'}
              onClick={() => {
                setTool('select');
                setSelectionMode('rect');
              }}
            >
              Box select
            </button>
            <button
              type="button"
              className={selectionMode === 'lasso' ? 'sprite-editor-mode-button sprite-editor-mode-button--active' : 'sprite-editor-mode-button'}
              onClick={() => {
                setTool('select');
                setSelectionMode('lasso');
              }}
            >
              Freeform
            </button>
          </div>

          <div className="sprite-editor-color-row">
            <label>
              Color
              <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
            </label>
            <label>
              Brush
              <input
                type="number"
                min="1"
                max="8"
                value={brushSize}
                onChange={(event) => setBrushSize(clamp(Number(event.target.value) || 1, 1, 8))}
              />
            </label>
          </div>

          <div className="sprite-editor-zoom-row">
            <button type="button" onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))}>
              <ZoomOut size={15} aria-hidden />
            </button>
            <span>{zoom}x</span>
            <button type="button" onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))}>
              <ZoomIn size={15} aria-hidden />
            </button>
          </div>

          <div className="sprite-editor-toggle-row">
            <label>
              <input type="checkbox" checked={showPrevious} onChange={(event) => setShowPrevious(event.target.checked)} />
              Prev onion
            </label>
            <label>
              <input type="checkbox" checked={showNext} onChange={(event) => setShowNext(event.target.checked)} />
              Next onion
            </label>
          </div>
        </div>
      </aside>

      <section className="sprite-editor-stage-panel">
        <div className="sprite-editor-stage-wrap">
          <div
            className="sprite-editor-frame-stage"
            style={{ width: FRAME_WIDTH * zoom, height: FRAME_HEIGHT * zoom }}
          >
            <canvas
              ref={frameCanvasRef}
              width={FRAME_WIDTH}
              height={FRAME_HEIGHT}
              style={{ width: FRAME_WIDTH * zoom, height: FRAME_HEIGHT * zoom }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
            <svg
              className="sprite-editor-overlay"
              viewBox={`0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`}
              style={{ width: FRAME_WIDTH * zoom, height: FRAME_HEIGHT * zoom }}
            >
              {selection ? (
                selection.kind === 'lasso' && selection.points ? (
                  <polygon points={pointsToSvg(selection.points)} className="sprite-editor-selection" />
                ) : (
                  <rect x={selection.x} y={selection.y} width={selection.width} height={selection.height} className="sprite-editor-selection" />
                )
              ) : null}
              {floating ? (
                <rect
                  {...floatingBounds(floating)}
                  className="sprite-editor-floating-selection"
                  transform={floatingSvgTransform(floating)}
                />
              ) : null}
            </svg>
          </div>

          <div className="sprite-editor-frame-strip">
            {thumbs.map((thumb, frameIndex) => (
              <button
                key={frameIndex}
                type="button"
                className={selectedFrame === frameIndex ? 'sprite-editor-frame-thumb sprite-editor-frame-thumb--active' : 'sprite-editor-frame-thumb'}
                onClick={() => {
                  setSelectedFrame(frameIndex);
                  setSelection(null);
                  setFloating(null);
                }}
              >
                <img src={thumb} alt={`Frame ${frameIndex + 1}`} />
                <span>{frameIndex + 1}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <aside className="sprite-editor-inspector">
        <div className="sprite-editor-inspector-inner">
          <div>
            <p>{actor.label}</p>
            <h2>{DIRECTIONS[directionIndex]?.label} frame {selectedFrame + 1}</h2>
          </div>

          <div className="sprite-editor-preview-panel">
            <div className="sprite-editor-preview-canvas">
              <canvas ref={previewCanvasRef} width={FRAME_WIDTH} height={FRAME_HEIGHT} />
            </div>
            <button type="button" onClick={() => setPlaying((current) => !current)}>
              {playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
              {playing ? 'Pause' : 'Play'}
            </button>
          </div>

          <div className="sprite-editor-action-panel">
            <button type="button" onClick={undo} disabled={undoDepth === 0}>
              <Undo2 size={15} aria-hidden />
              Undo
            </button>
            <button type="button" onClick={copySelection} disabled={!selection}>
              <Copy size={15} aria-hidden />
              Copy
            </button>
            <button type="button" onClick={cutSelection} disabled={!selection}>
              <Scissors size={15} aria-hidden />
              Cut
            </button>
            <button type="button" onClick={pasteSelection} disabled={!hasClipboard}>
              <ClipboardPaste size={15} aria-hidden />
              Paste
            </button>
            <button type="button" onClick={mirrorCurrent} disabled={!selection && !floating}>
              <FlipHorizontal size={15} aria-hidden />
              Mirror
            </button>
            <button type="button" onClick={commitFloating} disabled={!floating}>
              <Check size={15} aria-hidden />
              Commit
            </button>
            <button type="button" onClick={clearSelection} disabled={!selection && !floating}>
              <X size={15} aria-hidden />
              Clear
            </button>
          </div>

          <div className="sprite-editor-transform-panel">
            <button type="button" onClick={() => rotateFloatingSelection(-12)} disabled={!canTransformSelection}>
              <RotateCcw size={15} aria-hidden />
              Rotate -
            </button>
            <button type="button" onClick={() => rotateFloatingSelection(12)} disabled={!canTransformSelection}>
              <RotateCw size={15} aria-hidden />
              Rotate +
            </button>
            <button type="button" onClick={() => scaleFloatingSelection(0.9)} disabled={!canTransformSelection}>
              <ZoomOut size={15} aria-hidden />
              Shrink
            </button>
            <button type="button" onClick={() => scaleFloatingSelection(1.12)} disabled={!canTransformSelection}>
              <ZoomIn size={15} aria-hidden />
              Expand
            </button>
            <button type="button" onClick={resetFloatingTransform} disabled={!floating}>
              <RotateCcw size={15} aria-hidden />
              Reset
            </button>
          </div>

          <div className="sprite-editor-hint">
            <Move size={15} aria-hidden />
            <span>Select pixels with box or freeform, cut or transform them, drag the floating pixels, then commit.</span>
          </div>

          {savedPath ? (
            <div className="sprite-editor-saved-path">
              <span>Saved candidate</span>
              <strong>{savedPath}</strong>
            </div>
          ) : null}
        </div>
      </aside>
    </main>
  );
}

function ToolButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className={active ? 'sprite-editor-tool sprite-editor-tool--active' : 'sprite-editor-tool'} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function selectionFromRect(rect: Rect): SelectionShape {
  return {
    ...rect,
    kind: 'rect',
  };
}

function selectionFromPoints(points: Point[]): SelectionShape {
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const x = Math.min(...xValues);
  const y = Math.min(...yValues);
  const maxX = Math.max(...xValues);
  const maxY = Math.max(...yValues);
  return {
    x,
    y,
    width: Math.max(1, maxX - x + 1),
    height: Math.max(1, maxY - y + 1),
    kind: 'lasso',
    points: points.map((point) => ({ ...point })),
  };
}

function normalizeRect(start: Point, end: Point): Rect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.max(1, Math.abs(start.x - end.x) + 1),
    height: Math.max(1, Math.abs(start.y - end.y) + 1),
  };
}

function pointInside(point: Point, rect: Rect) {
  return point.x >= rect.x
    && point.x < rect.x + rect.width
    && point.y >= rect.y
    && point.y < rect.y + rect.height;
}

function extractSelectionImageData(context: CanvasRenderingContext2D, origin: Point, selection: SelectionShape) {
  const data = context.getImageData(origin.x + selection.x, origin.y + selection.y, selection.width, selection.height);
  if (selection.kind === 'rect') return data;

  const masked = cloneImageData(data);
  for (let y = 0; y < masked.height; y += 1) {
    for (let x = 0; x < masked.width; x += 1) {
      if (pointInsideSelectionPixel(selection, x, y)) continue;
      const index = ((y * masked.width) + x) * 4;
      masked.data[index] = 0;
      masked.data[index + 1] = 0;
      masked.data[index + 2] = 0;
      masked.data[index + 3] = 0;
    }
  }
  return masked;
}

function clearSelectionPixels(context: CanvasRenderingContext2D, origin: Point, selection: SelectionShape) {
  if (selection.kind === 'rect') {
    context.clearRect(origin.x + selection.x, origin.y + selection.y, selection.width, selection.height);
    return;
  }

  const data = context.getImageData(origin.x + selection.x, origin.y + selection.y, selection.width, selection.height);
  for (let y = 0; y < data.height; y += 1) {
    for (let x = 0; x < data.width; x += 1) {
      if (!pointInsideSelectionPixel(selection, x, y)) continue;
      const index = ((y * data.width) + x) * 4;
      data.data[index] = 0;
      data.data[index + 1] = 0;
      data.data[index + 2] = 0;
      data.data[index + 3] = 0;
    }
  }
  context.putImageData(data, origin.x + selection.x, origin.y + selection.y);
}

function pointInsideSelectionPixel(selection: SelectionShape, localX: number, localY: number) {
  if (selection.kind === 'rect' || !selection.points || selection.points.length < 3) return true;
  return pointInPolygon(
    {
      x: selection.x + localX + 0.5,
      y: selection.y + localY + 0.5,
    },
    selection.points,
  );
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    const crossesY = currentPoint.y > point.y !== previousPoint.y > point.y;
    if (!crossesY) continue;
    const xAtY = ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y)
      + currentPoint.x;
    if (point.x < xAtY) {
      inside = !inside;
    }
  }
  return inside;
}

function pointsToSvg(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function drawFloating(context: CanvasRenderingContext2D, floating: FloatingSelection, origin: Point = { x: 0, y: 0 }) {
  const canvas = imageDataToCanvas(floating.data);
  const size = floatingDisplaySize(floating);
  context.save();
  context.imageSmoothingEnabled = false;
  context.translate(origin.x + floating.x + (size.width / 2), origin.y + floating.y + (size.height / 2));
  context.rotate((floating.rotation * Math.PI) / 180);
  context.drawImage(canvas, -size.width / 2, -size.height / 2, size.width, size.height);
  context.restore();
}

function imageDataToCanvas(data: ImageData) {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  const context = canvas.getContext('2d');
  if (context) {
    context.putImageData(data, 0, 0);
  }
  return canvas;
}

function floatingDisplaySize(floating: FloatingSelection) {
  return {
    width: floating.width * floating.scale,
    height: floating.height * floating.scale,
  };
}

function floatingBounds(floating: FloatingSelection): Rect {
  const size = floatingDisplaySize(floating);
  return {
    x: floating.x,
    y: floating.y,
    width: size.width,
    height: size.height,
  };
}

function floatingSvgTransform(floating: FloatingSelection) {
  if (floating.rotation === 0) return undefined;
  const bounds = floatingBounds(floating);
  return `rotate(${floating.rotation} ${bounds.x + (bounds.width / 2)} ${bounds.y + (bounds.height / 2)})`;
}

function scaleFloating(current: FloatingSelection, factor: number) {
  const currentSize = floatingDisplaySize(current);
  const center = {
    x: current.x + (currentSize.width / 2),
    y: current.y + (currentSize.height / 2),
  };
  const maxScale = Math.min(3, FRAME_WIDTH / current.width, FRAME_HEIGHT / current.height);
  const nextScale = clamp(current.scale * factor, 0.35, maxScale);
  const nextSize = {
    width: current.width * nextScale,
    height: current.height * nextScale,
  };
  return {
    ...current,
    scale: nextScale,
    x: clampFloatingPosition(center.x - (nextSize.width / 2), nextSize.width, FRAME_WIDTH),
    y: clampFloatingPosition(center.y - (nextSize.height / 2), nextSize.height, FRAME_HEIGHT),
  };
}

function clampFloatingPosition(value: number, size: number, containerSize: number) {
  if (size >= containerSize) {
    return Math.round((containerSize - size) / 2);
  }
  return clamp(Math.round(value), 0, Math.max(0, Math.round(containerSize - size)));
}

function normalizeDegrees(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function cloneImageData(data: ImageData) {
  return new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
}

function cloneSelectionShape(selection: SelectionShape | null) {
  if (!selection) return null;
  return {
    ...selection,
    points: selection.points?.map((point) => ({ ...point })),
  };
}

function cloneFloatingSelection(floating: FloatingSelection | null) {
  if (!floating) return null;
  return {
    ...floating,
    data: cloneImageData(floating.data),
  };
}

function flipImageData(data: ImageData) {
  const flipped = new ImageData(data.width, data.height);
  for (let y = 0; y < data.height; y += 1) {
    for (let x = 0; x < data.width; x += 1) {
      const source = ((y * data.width) + x) * 4;
      const target = ((y * data.width) + (data.width - 1 - x)) * 4;
      flipped.data[target] = data.data[source];
      flipped.data[target + 1] = data.data[source + 1];
      flipped.data[target + 2] = data.data[source + 2];
      flipped.data[target + 3] = data.data[source + 3];
    }
  }
  return flipped;
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
