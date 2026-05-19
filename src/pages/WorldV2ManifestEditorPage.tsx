import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { BoxSelect, Copy, Eraser, PenLine, Plus, Save, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';

type ManifestRole = 'ground-baked' | 'walkable-ground' | 'blocking-ground' | 'occluder' | 'decor-cluster' | 'interactive';
type CollisionKind = 'none' | 'rect' | 'rects' | 'polygon';
type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
type EditorMode = 'box' | 'mask';
type PointEditTarget = 'removalMask' | 'collision' | 'walkable';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WorldPoint {
  x: number;
  y: number;
}

interface RemovalMask {
  kind: 'polygon';
  points: WorldPoint[];
}

interface WalkableArea {
  kind: 'polygon';
  points: WorldPoint[];
}

interface ManifestImageChunk {
  id?: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ManifestObject {
  id: string;
  zone: string;
  label: string;
  category: string;
  role: ManifestRole;
  layerTarget: string;
  bbox: Bounds;
  depthY?: number;
  collision: {
    kind: CollisionKind;
    bbox?: Bounds;
    points?: WorldPoint[];
    notes?: string;
  };
  occlusion: {
    required: boolean;
    notes?: string;
  };
  removalMask?: RemovalMask;
  walkable?: WalkableArea;
  status: string[];
  notes?: string;
}

interface Manifest {
  schemaVersion: number;
  source: {
    referenceImage: string;
    groundImage: string;
    referenceChunks?: ManifestImageChunk[];
    groundChunks?: ManifestImageChunk[];
    coordinateSpace: string;
    imageSize: { width: number; height: number };
  };
  statusDefinitions: Record<string, string>;
  roleDefinitions: Record<ManifestRole, string>;
  zones: Array<{ id: string; label: string; bbox: Bounds; status: string; notes?: string }>;
  objects: ManifestObject[];
}

const ROLE_OPTIONS: ManifestRole[] = ['ground-baked', 'walkable-ground', 'blocking-ground', 'occluder', 'decor-cluster', 'interactive'];
const COLLISION_OPTIONS: CollisionKind[] = ['none', 'rect', 'rects', 'polygon'];
const API_PATH = '/api/world-v2/object-manifest';
const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const RESIZE_HANDLE_SIZE = 14;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.2;

const ROLE_COLORS: Record<ManifestRole, string> = {
  'ground-baked': '#5de4ff',
  'walkable-ground': '#2ee6c4',
  'blocking-ground': '#ff4e4e',
  occluder: '#ffe05a',
  'decor-cluster': '#8cff78',
  interactive: '#b68cff',
};

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
  nw: 'nwse-resize',
};

interface DraftBox {
  start: { x: number; y: number };
  current: { x: number; y: number };
}

interface BoxDrag {
  id: string;
  pointerStart: { x: number; y: number };
  bboxStart: Bounds;
  depthYStart?: number;
  collisionBboxStart?: Bounds;
  collisionPointsStart?: WorldPoint[];
  walkablePointsStart?: WorldPoint[];
}

interface BoxResize {
  id: string;
  handle: ResizeHandle;
  pointerStart: { x: number; y: number };
  bboxStart: Bounds;
  depthYBottomOffset?: number;
}

interface MaskPointDrag {
  id: string;
  pointIndex: number;
  target: PointEditTarget;
}

interface DepthDrag {
  id: string;
}

export function WorldV2ManifestEditorPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string>('apex');
  const [roleFilter, setRoleFilter] = useState<ManifestRole | 'all'>('all');
  const [zoom, setZoom] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [showBoxes, setShowBoxes] = useState(true);
  const [editorMode, setEditorMode] = useState<EditorMode>('box');
  const [draftBox, setDraftBox] = useState<DraftBox | null>(null);
  const [boxDrag, setBoxDrag] = useState<BoxDrag | null>(null);
  const [boxResize, setBoxResize] = useState<BoxResize | null>(null);
  const [maskPointDrag, setMaskPointDrag] = useState<MaskPointDrag | null>(null);
  const [depthDrag, setDepthDrag] = useState<DepthDrag | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    document.body.dataset.route = 'manifest-editor';
    return () => {
      delete document.body.dataset.route;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(API_PATH)
      .then((response) => {
        if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
        return response.json() as Promise<Manifest>;
      })
      .then((nextManifest) => {
        if (cancelled) return;
        setManifest(nextManifest);
        const firstZone = nextManifest.zones[0]?.id ?? 'apex';
        setZoneFilter(firstZone);
        setSelectedId(nextManifest.objects.find((object) => object.zone === firstZone)?.id ?? nextManifest.objects[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setSaveState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredObjects = useMemo(() => {
    if (!manifest) return [];
    return manifest.objects.filter((object) => (
      object.zone === zoneFilter
      && (roleFilter === 'all' || object.role === roleFilter)
    ));
  }, [manifest, roleFilter, zoneFilter]);

  const selectedObject = manifest?.objects.find((object) => object.id === selectedId) ?? null;
  const imageSize = manifest?.source.imageSize ?? { width: 1536, height: 1024 };
  const referenceChunks = useMemo(() => {
    if (!manifest) return [];
    if (manifest.source.referenceChunks?.length) return manifest.source.referenceChunks;
    return [{
      id: 'reference',
      src: manifest.source.referenceImage,
      x: 0,
      y: 0,
      width: imageSize.width,
      height: imageSize.height,
    }];
  }, [imageSize.height, imageSize.width, manifest]);
  const selectedPointEditTarget = selectedObject ? pointEditTarget(selectedObject) : null;
  const canEditSelectedPointPolygon = selectedPointEditTarget !== null;
  const selectedPointCount = selectedObject && selectedPointEditTarget
    ? pointsForTarget(selectedObject, selectedPointEditTarget).length
    : 0;

  const updateSelected = (updater: (object: ManifestObject) => ManifestObject) => {
    if (!manifest || !selectedId) return;
    setManifest({
      ...manifest,
      objects: manifest.objects.map((object) => (object.id === selectedId ? updater(object) : object)),
    });
    setSaveState('idle');
  };

  const setSelectedField = (field: keyof ManifestObject, value: string | boolean | string[]) => {
    const currentId = selectedId;
    updateSelected((object) => {
      const nextObject = { ...object, [field]: value };
      if (field === 'role' && typeof value === 'string') {
        return sanitizePointPolygons(nextObject);
      }
      return nextObject;
    });
    if (field === 'id') setSelectedId(String(value || currentId));
    if (field === 'zone' && typeof value === 'string') setZoneFilter(value);
    if (field === 'role' && typeof value === 'string' && !pointEditTarget({ ...(selectedObject ?? {}), role: value } as ManifestObject)) {
      setEditorMode('box');
    }
  };

  const handleRoleFilterChange = (nextFilter: ManifestRole | 'all') => {
    setRoleFilter(nextFilter);
    if (!manifest) return;

    const selectedObjectStillVisible = manifest.objects.some(
      (object) => object.id === selectedId
        && object.zone === zoneFilter
        && (nextFilter === 'all' || object.role === nextFilter),
    );
    if (selectedObjectStillVisible) return;

    const firstVisibleObject = manifest.objects.find((object) => (
      object.zone === zoneFilter
      && (nextFilter === 'all' || object.role === nextFilter)
    ));
    setSelectedId(firstVisibleObject?.id ?? null);
  };

  const handleZoneFilterChange = (nextZone: string) => {
    setZoneFilter(nextZone);
    if (!manifest) return;

    const selectedObjectStillVisible = manifest.objects.some(
      (object) => object.id === selectedId
        && object.zone === nextZone
        && (roleFilter === 'all' || object.role === roleFilter),
    );
    if (selectedObjectStillVisible) return;

    const firstVisibleObject = manifest.objects.find((object) => (
      object.zone === nextZone
      && (roleFilter === 'all' || object.role === roleFilter)
    ));
    setSelectedId(firstVisibleObject?.id ?? null);
  };

  const setSelectedBboxField = (field: keyof Bounds, value: number) => {
    updateSelected((object) => ({
      ...object,
      bbox: {
        ...object.bbox,
        [field]: Math.max(0, Math.round(value)),
      },
    }));
  };

  const setSelectedCollisionKind = (kind: CollisionKind) => {
    updateSelected((object) => {
      const nextObject: ManifestObject = {
        ...object,
        collision: {
          ...object.collision,
          kind,
          ...(kind === 'polygon' ? {} : { points: undefined }),
        },
      };
      if (kind !== 'polygon' && editorMode === 'mask' && pointEditTarget(nextObject) === null) setEditorMode('box');
      return sanitizePointPolygons(nextObject);
    });
  };

  const setSelectedDepthY = (value: string) => {
    updateSelected((object) => ({
      ...object,
      depthY: value === '' ? undefined : Math.max(0, Math.round(Number(value))),
    }));
  };

  const setSelectedOcclusionRequired = (required: boolean) => {
    updateSelected((object) => {
      const nextObject: ManifestObject = {
        ...object,
        occlusion: {
          ...object.occlusion,
          required,
        },
        ...(object.role === 'interactive'
          ? {
              layerTarget: required ? 'foreground-occluder' : 'base-ground',
              depthY: required ? (object.depthY ?? object.bbox.y + object.bbox.height) : object.depthY,
            }
          : {}),
      };
      return sanitizePointPolygons(nextObject);
    });
    if (!required && selectedObject?.role === 'interactive') setEditorMode('box');
  };

  const setSelectedStatus = (value: string) => {
    setSelectedField('status', value.split(',').map((status) => status.trim()).filter(Boolean));
  };

  const appendSelectedPoint = (point: WorldPoint) => {
    const target = selectedObject ? pointEditTarget(selectedObject) : null;
    if (!target) return;
    updateSelected((object) => appendPointToTarget(object, target, point));
  };

  const removeLastSelectedPoint = () => {
    updateSelected((object) => {
      const target = pointEditTarget(object);
      if (!target) return object;
      return setTargetPoints(object, target, pointsForTarget(object, target).slice(0, -1));
    });
  };

  const clearSelectedPointPolygon = () => {
    updateSelected((object) => {
      const target = pointEditTarget(object);
      return target ? setTargetPoints(object, target, []) : object;
    });
  };

  const setEditorModeForSelection = (mode: EditorMode) => {
    if (mode === 'mask' && selectedObject?.role === 'blocking-ground' && selectedObject.collision.kind !== 'polygon') {
      updateSelected((object) => ({
        ...object,
        collision: {
          ...object.collision,
          kind: 'polygon',
        },
      }));
    }
    if (mode === 'mask' && selectedObject?.role === 'walkable-ground' && !selectedObject.walkable?.points.length) {
      updateSelected((object) => ({
        ...object,
        walkable: {
          kind: 'polygon',
          points: boundsToPoints(object.bbox),
        },
      }));
    }
    setEditorMode(mode);
  };

  const adjustZoom = (delta: number) => {
    setZoom((currentZoom) => clampZoom(currentZoom + delta));
  };

  const imagePointFromPointer = (event: PointerEvent<SVGElement>) => {
    const rect = (svgRef.current ?? event.currentTarget).getBoundingClientRect();
    return clampPoint({
      x: ((event.clientX - rect.left) / rect.width) * imageSize.width,
      y: ((event.clientY - rect.top) / rect.height) * imageSize.height,
    }, imageSize);
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    setBoxDrag(null);
    setBoxResize(null);
    setMaskPointDrag(null);
    setDepthDrag(null);
    const point = imagePointFromPointer(event);

    if (editorMode === 'mask') {
      setDraftBox(null);
      appendSelectedPoint(point);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    setDraftBox({ start: point, current: point });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (maskPointDrag) updateDraggedMaskPoint(event);
    if (depthDrag) updateDraggedDepthY(event);
    if (!draftBox) return;
    setDraftBox({ ...draftBox, current: imagePointFromPointer(event) });
  };

  const handlePointerUp = () => {
    setBoxDrag(null);
    setBoxResize(null);
    setMaskPointDrag(null);
    setDepthDrag(null);
    if (!draftBox || !manifest) {
      setDraftBox(null);
      return;
    }
    const nextBox = normalizedBox(draftBox.start, draftBox.current);
    setDraftBox(null);
    if (nextBox.width < 3 || nextBox.height < 3) return;

    if (selectedId) {
      updateSelected((object) => ({
        ...object,
        bbox: nextBox,
        depthY: object.depthY === undefined ? object.depthY : nextBox.y + nextBox.height,
      }));
      return;
    }

    const nextObject = createDefaultObject(nextBox, roleFilter === 'all' ? 'decor-cluster' : roleFilter, zoneFilter, manifest);
    setManifest({ ...manifest, objects: [...manifest.objects, nextObject] });
    setSelectedId(nextObject.id);
    setSaveState('idle');
  };

  const handleObjectPointerDown = (object: ManifestObject, event: PointerEvent<SVGRectElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(object.id);

    if (editorMode === 'mask') return;
    if (object.id !== selectedId) return;

    setDraftBox(null);
    setBoxResize(null);
    setBoxDrag({
      id: object.id,
      pointerStart: imagePointFromPointer(event),
      bboxStart: object.bbox,
      depthYStart: object.depthY,
      collisionBboxStart: object.collision.bbox,
      collisionPointsStart: object.collision.points,
      walkablePointsStart: object.walkable?.points,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleObjectPointerMove = (event: PointerEvent<SVGRectElement>) => {
    if (!boxDrag || boxResize) return;

    const point = imagePointFromPointer(event);
    const deltaX = Math.round(point.x - boxDrag.pointerStart.x);
    const deltaY = Math.round(point.y - boxDrag.pointerStart.y);
    const nextBox = offsetBounds(boxDrag.bboxStart, deltaX, deltaY, imageSize);
    const boundedDeltaX = nextBox.x - boxDrag.bboxStart.x;
    const boundedDeltaY = nextBox.y - boxDrag.bboxStart.y;

    setManifest((currentManifest) => {
      if (!currentManifest) return currentManifest;

      return {
        ...currentManifest,
        objects: currentManifest.objects.map((object) => {
          if (object.id !== boxDrag.id) return object;

          const nextCollisionBbox = boxDrag.collisionBboxStart
            ? offsetBounds(boxDrag.collisionBboxStart, boundedDeltaX, boundedDeltaY, imageSize)
            : undefined;

          return {
            ...object,
            bbox: nextBox,
            depthY: boxDrag.depthYStart === undefined ? undefined : boxDrag.depthYStart + boundedDeltaY,
            collision: {
              ...object.collision,
              ...(nextCollisionBbox ? { bbox: nextCollisionBbox } : {}),
              ...(boxDrag.collisionPointsStart
                ? { points: offsetPoints(boxDrag.collisionPointsStart, boundedDeltaX, boundedDeltaY, imageSize) }
                : {}),
            },
            ...(object.removalMask
              ? { removalMask: offsetRemovalMask(object.removalMask, boundedDeltaX, boundedDeltaY, imageSize) }
              : {}),
            ...(boxDrag.walkablePointsStart
              ? {
                  walkable: {
                    kind: 'polygon',
                    points: offsetPoints(boxDrag.walkablePointsStart, boundedDeltaX, boundedDeltaY, imageSize),
                  },
                }
              : {}),
          };
        }),
      };
    });
    setSaveState('idle');
  };

  const handleObjectPointerUp = () => {
    setBoxDrag(null);
  };

  const handleResizePointerDown = (
    object: ManifestObject,
    handle: ResizeHandle,
    event: PointerEvent<SVGRectElement>,
  ) => {
    if (event.button !== 0) return;
    if (editorMode === 'mask') return;
    event.stopPropagation();
    setSelectedId(object.id);
    setDraftBox(null);
    setBoxDrag(null);
    setBoxResize({
      id: object.id,
      handle,
      pointerStart: imagePointFromPointer(event),
      bboxStart: object.bbox,
      depthYBottomOffset: object.depthY === undefined ? undefined : object.depthY - (object.bbox.y + object.bbox.height),
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizePointerMove = (event: PointerEvent<SVGRectElement>) => {
    if (!boxResize) return;

    const point = imagePointFromPointer(event);
    const deltaX = Math.round(point.x - boxResize.pointerStart.x);
    const deltaY = Math.round(point.y - boxResize.pointerStart.y);
    const nextBox = resizeBounds(boxResize.bboxStart, boxResize.handle, deltaX, deltaY, imageSize);

    setManifest((currentManifest) => {
      if (!currentManifest) return currentManifest;

      return {
        ...currentManifest,
        objects: currentManifest.objects.map((object) => {
          if (object.id !== boxResize.id) return object;

          return {
            ...object,
            bbox: nextBox,
            depthY: boxResize.depthYBottomOffset === undefined
              ? undefined
              : nextBox.y + nextBox.height + boxResize.depthYBottomOffset,
          };
        }),
      };
    });
    setSaveState('idle');
  };

  const handleResizePointerUp = () => {
    setBoxResize(null);
  };

  const handleMaskPointPointerDown = (
    object: ManifestObject,
    target: PointEditTarget,
    pointIndex: number,
    event: PointerEvent<SVGCircleElement>,
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(object.id);
    setDraftBox(null);
    setBoxDrag(null);
    setBoxResize(null);
    setMaskPointDrag({ id: object.id, pointIndex, target });
    setDepthDrag(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMaskPointPointerMove = (event: PointerEvent<SVGCircleElement>) => {
    updateDraggedMaskPoint(event);
  };

  const handleMaskPointPointerUp = () => {
    setMaskPointDrag(null);
  };

  const updateDraggedMaskPoint = (event: PointerEvent<SVGElement>) => {
    if (!maskPointDrag) return;
    const point = imagePointFromPointer(event);
    setManifest((currentManifest) => {
      if (!currentManifest) return currentManifest;

      return {
        ...currentManifest,
        objects: currentManifest.objects.map((object) => {
          if (object.id !== maskPointDrag.id) return object;
          const points = pointsForTarget(object, maskPointDrag.target);
          if (points.length === 0) return object;
          return setTargetPoints(
            object,
            maskPointDrag.target,
            points.map((candidatePoint, index) => (
              index === maskPointDrag.pointIndex ? point : candidatePoint
            )),
          );
        }),
      };
    });
    setSaveState('idle');
  };

  const handleDepthPointerDown = (object: ManifestObject, event: PointerEvent<SVGElement>) => {
    if (event.button !== 0) return;
    if (editorMode === 'mask') return;
    event.stopPropagation();
    setSelectedId(object.id);
    setDraftBox(null);
    setBoxDrag(null);
    setBoxResize(null);
    setMaskPointDrag(null);
    setDepthDrag({ id: object.id });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDepthPointerMove = (event: PointerEvent<SVGElement>) => {
    updateDraggedDepthY(event);
  };

  const handleDepthPointerUp = () => {
    setDepthDrag(null);
  };

  const updateDraggedDepthY = (event: PointerEvent<SVGElement>) => {
    if (!depthDrag) return;
    const point = imagePointFromPointer(event);
    setManifest((currentManifest) => {
      if (!currentManifest) return currentManifest;

      return {
        ...currentManifest,
        objects: currentManifest.objects.map((object) => (
          object.id === depthDrag.id
            ? { ...object, depthY: point.y }
            : object
        )),
      };
    });
    setSaveState('idle');
  };

  const addObject = () => {
    if (!manifest) return;
    const role = roleFilter === 'all' ? 'decor-cluster' : roleFilter;
    const zone = manifest.zones.find((candidate) => candidate.id === zoneFilter);
    const bbox = zone
      ? {
          x: Math.min(imageSize.width - 80, zone.bbox.x + 24),
          y: Math.min(imageSize.height - 80, zone.bbox.y + 24),
          width: 80,
          height: 80,
        }
      : { x: 40, y: 40, width: 80, height: 80 };
    const nextObject = createDefaultObject(bbox, role, zoneFilter, manifest);
    setManifest({ ...manifest, objects: [...manifest.objects, nextObject] });
    setSelectedId(nextObject.id);
    setSaveState('idle');
  };

  const duplicateObject = () => {
    if (!manifest || !selectedObject) return;
    const id = uniqueObjectId(`${selectedObject.id}-copy`, manifest);
    const bbox = {
      ...selectedObject.bbox,
      x: Math.min(imageSize.width - selectedObject.bbox.width, selectedObject.bbox.x + 12),
      y: Math.min(imageSize.height - selectedObject.bbox.height, selectedObject.bbox.y + 12),
    };
    const deltaX = bbox.x - selectedObject.bbox.x;
    const deltaY = bbox.y - selectedObject.bbox.y;
    const nextObject = {
      ...selectedObject,
      id,
      label: `${selectedObject.label} copy`,
      bbox,
      collision: {
        ...selectedObject.collision,
        ...(selectedObject.collision.points
          ? { points: offsetPoints(selectedObject.collision.points, deltaX, deltaY, imageSize) }
          : {}),
      },
      ...(selectedObject.removalMask
        ? { removalMask: offsetRemovalMask(selectedObject.removalMask, deltaX, deltaY, imageSize) }
        : {}),
      ...(selectedObject.walkable
        ? {
            walkable: {
              kind: 'polygon' as const,
              points: offsetPoints(selectedObject.walkable.points, deltaX, deltaY, imageSize),
            },
          }
        : {}),
    };
    setManifest({ ...manifest, objects: [...manifest.objects, nextObject] });
    setSelectedId(id);
    setSaveState('idle');
  };

  const deleteObject = () => {
    if (!manifest || !selectedId) return;
    const nextObjects = manifest.objects.filter((object) => object.id !== selectedId);
    setManifest({ ...manifest, objects: nextObjects });
    setSelectedId(nextObjects.find((object) => object.zone === zoneFilter)?.id ?? null);
    setSaveState('idle');
  };

  const saveManifest = async () => {
    if (!manifest) return;
    setSaveState('saving');
    try {
      const response = await fetch(API_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-world-v2-editor': '1' },
        body: JSON.stringify({
          ...manifest,
          objects: manifest.objects,
        }),
      });
      if (!response.ok) throw new Error(`Save failed: ${response.status}`);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  if (!manifest) {
    return (
      <main className="manifest-editor-page">
        <div className="manifest-editor-loading">Loading manifest editor</div>
      </main>
    );
  }

  const draftRect = draftBox ? normalizedBox(draftBox.start, draftBox.current) : null;

  return (
    <main className="manifest-editor-page">
      <aside className="manifest-editor-sidebar">
        <div className="manifest-editor-header">
          <div>
            <p>World V2</p>
            <h1>Manifest Editor</h1>
          </div>
          <button type="button" className="manifest-editor-save" onClick={saveManifest}>
            <Save size={16} aria-hidden />
            {saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Error' : 'Save'}
          </button>
        </div>

        <div className="manifest-editor-controls">
          <label>
            Zone
            <select value={zoneFilter} onChange={(event) => handleZoneFilterChange(event.target.value)}>
              {manifest.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
            </select>
          </label>
          <label>
            Role filter
            <select
              value={roleFilter}
              onChange={(event) => handleRoleFilterChange(event.target.value as ManifestRole | 'all')}
            >
              <option value="all">all</option>
              {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label>
            Zoom
            <div className="manifest-editor-zoom-row">
              <button type="button" onClick={() => adjustZoom(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM}>
                <ZoomOut size={14} aria-hidden />
              </button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step="0.05"
                value={zoom}
                onChange={(event) => setZoom(clampZoom(Number(event.target.value)))}
              />
              <button type="button" onClick={() => adjustZoom(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM}>
                <ZoomIn size={14} aria-hidden />
              </button>
            </div>
          </label>
          <label className="manifest-editor-checkbox">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(event) => setShowLabels(event.target.checked)}
            />
            labels
          </label>
          <label className="manifest-editor-checkbox">
            <input
              type="checkbox"
              checked={showBoxes}
              onChange={(event) => setShowBoxes(event.target.checked)}
            />
            boxes
          </label>
        </div>

        <div className="manifest-editor-actions">
          <button type="button" onClick={addObject}>
            <Plus size={15} aria-hidden />
            New
          </button>
          <button type="button" onClick={duplicateObject} disabled={!selectedObject}>
            <Copy size={15} aria-hidden />
            Duplicate
          </button>
          <button type="button" onClick={deleteObject} disabled={!selectedObject}>
            <Trash2 size={15} aria-hidden />
            Delete
          </button>
        </div>

        <div className="manifest-editor-object-list">
          {filteredObjects.map((object) => (
            <button
              key={object.id}
              type="button"
              className={object.id === selectedId ? 'manifest-editor-object manifest-editor-object--active' : 'manifest-editor-object'}
              onClick={() => setSelectedId(object.id)}
            >
              <span style={{ backgroundColor: ROLE_COLORS[object.role] }} />
              <strong>{object.id}</strong>
              <small>{object.role}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="manifest-editor-stage-panel">
        <div ref={stageRef} className="manifest-editor-stage-scroll">
          <div
            className="manifest-editor-stage"
            style={{ width: imageSize.width * zoom, height: imageSize.height * zoom }}
          >
            {referenceChunks.map((chunk) => (
              <img
                key={`${chunk.id ?? chunk.src}-${chunk.x}-${chunk.y}`}
                className="manifest-editor-stage-chunk"
                src={chunk.src}
                alt=""
                draggable={false}
                style={{
                  left: chunk.x * zoom,
                  top: chunk.y * zoom,
                  width: chunk.width * zoom,
                  height: chunk.height * zoom,
                }}
              />
            ))}
            <svg
              ref={svgRef}
              viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                setDraftBox(null);
                setMaskPointDrag(null);
                setDepthDrag(null);
              }}
            >
              {filteredObjects.map((object) => (
                <g key={object.id}>
                  {object.collision.points?.length ? (
                    <>
                      <polygon
                        className={object.id === selectedId ? 'manifest-editor-collision-polygon manifest-editor-collision-polygon--active' : 'manifest-editor-collision-polygon'}
                        points={object.collision.points.map((point) => `${point.x},${point.y}`).join(' ')}
                      />
                      {object.id === selectedId && object.collision.points.map((point, pointIndex) => (
                        <circle
                          key={`${object.id}-collision-point-${point.x}-${point.y}-${pointIndex}`}
                          className="manifest-editor-collision-point"
                          cx={point.x}
                          cy={point.y}
                          r={5}
                          onPointerDown={(event) => handleMaskPointPointerDown(object, 'collision', pointIndex, event)}
                          onPointerMove={handleMaskPointPointerMove}
                          onPointerUp={handleMaskPointPointerUp}
                          onPointerCancel={handleMaskPointPointerUp}
                        />
                      ))}
                    </>
                  ) : null}
                  {object.walkable?.points.length ? (
                    <>
                      <polygon
                        className={object.id === selectedId ? 'manifest-editor-walkable-polygon manifest-editor-walkable-polygon--active' : 'manifest-editor-walkable-polygon'}
                        points={object.walkable.points.map((point) => `${point.x},${point.y}`).join(' ')}
                      />
                      {object.id === selectedId && object.walkable.points.map((point, pointIndex) => (
                        <circle
                          key={`${object.id}-walkable-point-${point.x}-${point.y}-${pointIndex}`}
                          className="manifest-editor-walkable-point"
                          cx={point.x}
                          cy={point.y}
                          r={5}
                          onPointerDown={(event) => handleMaskPointPointerDown(object, 'walkable', pointIndex, event)}
                          onPointerMove={handleMaskPointPointerMove}
                          onPointerUp={handleMaskPointPointerUp}
                          onPointerCancel={handleMaskPointPointerUp}
                        />
                      ))}
                    </>
                  ) : null}
                  {object.removalMask?.points.length ? (
                    <>
                      <polygon
                        className={object.id === selectedId ? 'manifest-editor-removal-mask manifest-editor-removal-mask--active' : 'manifest-editor-removal-mask'}
                        points={object.removalMask.points.map((point) => `${point.x},${point.y}`).join(' ')}
                      />
                      {object.id === selectedId && object.removalMask.points.map((point, pointIndex) => (
                        <circle
                          key={`${object.id}-mask-point-${point.x}-${point.y}-${pointIndex}`}
                          className="manifest-editor-mask-point"
                          cx={point.x}
                          cy={point.y}
                          r={5}
                          onPointerDown={(event) => handleMaskPointPointerDown(object, 'removalMask', pointIndex, event)}
                          onPointerMove={handleMaskPointPointerMove}
                          onPointerUp={handleMaskPointPointerUp}
                          onPointerCancel={handleMaskPointPointerUp}
                        />
                      ))}
                    </>
                  ) : null}
                  {showBoxes && (
                    <rect
                      className={object.id === selectedId ? 'manifest-editor-rect manifest-editor-rect--active' : 'manifest-editor-rect'}
                      x={object.bbox.x}
                      y={object.bbox.y}
                      width={object.bbox.width}
                      height={object.bbox.height}
                      fill={ROLE_COLORS[object.role]}
                      stroke={ROLE_COLORS[object.role]}
                      pointerEvents={editorMode === 'mask' ? 'none' : object.id === selectedId ? 'all' : 'stroke'}
                      onPointerDown={(event) => handleObjectPointerDown(object, event)}
                      onPointerMove={handleObjectPointerMove}
                      onPointerUp={handleObjectPointerUp}
                      onPointerCancel={handleObjectPointerUp}
                    />
                  )}
                  {showLabels && (
                    <text x={object.bbox.x + 4} y={object.bbox.y + 12}>
                      {displayObjectId(object)}
                    </text>
                  )}
                  {object.depthY !== undefined && (
                    <>
                      <line
                        className={object.id === selectedId ? 'manifest-editor-depth-line manifest-editor-depth-line--active' : 'manifest-editor-depth-line'}
                        x1={object.bbox.x}
                        y1={object.depthY}
                        x2={object.bbox.x + object.bbox.width}
                        y2={object.depthY}
                        stroke={ROLE_COLORS[object.role]}
                      />
                      {editorMode === 'box' && object.id === selectedId && (
                        <>
                          <line
                            className="manifest-editor-depth-hit"
                            x1={object.bbox.x}
                            y1={object.depthY}
                            x2={object.bbox.x + object.bbox.width}
                            y2={object.depthY}
                            onPointerDown={(event) => handleDepthPointerDown(object, event)}
                            onPointerMove={handleDepthPointerMove}
                            onPointerUp={handleDepthPointerUp}
                            onPointerCancel={handleDepthPointerUp}
                          />
                          <circle
                            className="manifest-editor-depth-handle"
                            cx={object.bbox.x + object.bbox.width + 8}
                            cy={object.depthY}
                            r={6}
                            onPointerDown={(event) => handleDepthPointerDown(object, event)}
                            onPointerMove={handleDepthPointerMove}
                            onPointerUp={handleDepthPointerUp}
                            onPointerCancel={handleDepthPointerUp}
                          />
                        </>
                      )}
                    </>
                  )}
                  {showBoxes && editorMode === 'box' && object.id === selectedId && RESIZE_HANDLES.map((handle) => {
                    const handleBox = resizeHandleBox(object.bbox, handle);

                    return (
                      <rect
                        key={handle}
                        className="manifest-editor-resize-handle"
                        x={handleBox.x}
                        y={handleBox.y}
                        width={handleBox.width}
                        height={handleBox.height}
                        style={{ cursor: HANDLE_CURSORS[handle] }}
                        onPointerDown={(event) => handleResizePointerDown(object, handle, event)}
                        onPointerMove={handleResizePointerMove}
                        onPointerUp={handleResizePointerUp}
                        onPointerCancel={handleResizePointerUp}
                      />
                    );
                  })}
                </g>
              ))}
              {draftRect && (
                <rect
                  className="manifest-editor-draft"
                  x={draftRect.x}
                  y={draftRect.y}
                  width={draftRect.width}
                  height={draftRect.height}
                />
              )}
            </svg>
          </div>
        </div>
      </section>

      <aside className="manifest-editor-inspector">
        {selectedObject ? (
          <ObjectInspector
            object={selectedObject}
            setField={setSelectedField}
            setBboxField={setSelectedBboxField}
            setCollisionKind={setSelectedCollisionKind}
            setDepthY={setSelectedDepthY}
            setOcclusionRequired={setSelectedOcclusionRequired}
            setStatus={setSelectedStatus}
            editorMode={editorMode}
            setEditorMode={setEditorModeForSelection}
            canEditPointPolygon={canEditSelectedPointPolygon}
            pointPolygonLabel={selectedObject.role === 'blocking-ground'
              ? 'collision boundary'
              : selectedObject.role === 'walkable-ground'
                ? 'walkable boundary'
                : 'removal mask'}
            pointCount={selectedPointCount}
            removeLastPoint={removeLastSelectedPoint}
            clearPointPolygon={clearSelectedPointPolygon}
            zones={manifest.zones}
          />
        ) : (
          <p className="manifest-editor-empty">Select an object or draw a new box.</p>
        )}
      </aside>
    </main>
  );
}

interface ObjectInspectorProps {
  object: ManifestObject;
  zones: Manifest['zones'];
  setField: (field: keyof ManifestObject, value: string | boolean | string[]) => void;
  setBboxField: (field: keyof Bounds, value: number) => void;
  setCollisionKind: (kind: CollisionKind) => void;
  setDepthY: (value: string) => void;
  setOcclusionRequired: (required: boolean) => void;
  setStatus: (value: string) => void;
  editorMode: EditorMode;
  setEditorMode: (mode: EditorMode) => void;
  canEditPointPolygon: boolean;
  pointPolygonLabel: string;
  pointCount: number;
  removeLastPoint: () => void;
  clearPointPolygon: () => void;
}

function ObjectInspector({
  object,
  zones,
  setField,
  setBboxField,
  setCollisionKind,
  setDepthY,
  setOcclusionRequired,
  setStatus,
  editorMode,
  setEditorMode,
  canEditPointPolygon,
  pointPolygonLabel,
  pointCount,
  removeLastPoint,
  clearPointPolygon,
}: ObjectInspectorProps) {
  const input = (field: keyof ManifestObject) => ({
    value: String(object[field] ?? ''),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setField(field, event.target.value),
  });

  return (
    <div className="manifest-editor-inspector-inner">
      <h2>{object.id}</h2>
      <label>
        id
        <input {...input('id')} />
      </label>
      <label>
        zone
        <select value={object.zone} onChange={(event) => setField('zone', event.target.value)}>
          {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
        </select>
      </label>
      <label>
        label
        <input {...input('label')} />
      </label>
      <label>
        category
        <input {...input('category')} />
      </label>
      <label>
        role
        <select value={object.role} onChange={(event) => setField('role', event.target.value)}>
          {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
      </label>
      <label>
        layer target
        <input {...input('layerTarget')} />
      </label>
      <div className="manifest-editor-bounds-grid">
        {(['x', 'y', 'width', 'height'] as const).map((field) => (
          <label key={field}>
            {field}
            <input
              type="number"
              value={object.bbox[field]}
              onChange={(event) => setBboxField(field, Number(event.target.value))}
            />
          </label>
        ))}
      </div>
      <label>
        depthY
        <input
          type="number"
          value={object.depthY ?? ''}
          onChange={(event) => setDepthY(event.target.value)}
        />
      </label>
      <label>
        collision kind
        <select value={object.collision.kind} onChange={(event) => setCollisionKind(event.target.value as CollisionKind)}>
          {COLLISION_OPTIONS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
        </select>
      </label>
      <label className="manifest-editor-checkbox">
        <input
          type="checkbox"
          checked={object.occlusion.required}
          onChange={(event) => setOcclusionRequired(event.target.checked)}
        />
        occlusion required
      </label>
      <div className="manifest-editor-mask-panel">
        <span>{pointPolygonLabel}</span>
        <div className="manifest-editor-mode-toggle">
          <button
            type="button"
            className={editorMode === 'box' ? 'manifest-editor-mode-button manifest-editor-mode-button--active' : 'manifest-editor-mode-button'}
            onClick={() => setEditorMode('box')}
          >
            <BoxSelect size={14} aria-hidden />
            Box
          </button>
          <button
            type="button"
            className={editorMode === 'mask' ? 'manifest-editor-mode-button manifest-editor-mode-button--active' : 'manifest-editor-mode-button'}
            onClick={() => setEditorMode('mask')}
            disabled={!canEditPointPolygon}
          >
            <PenLine size={14} aria-hidden />
            Points
          </button>
        </div>
        <div className="manifest-editor-mask-actions">
          <button type="button" onClick={removeLastPoint} disabled={!canEditPointPolygon || pointCount === 0}>
            <Undo2 size={14} aria-hidden />
            Point
          </button>
          <button type="button" onClick={clearPointPolygon} disabled={!canEditPointPolygon || pointCount === 0}>
            <Eraser size={14} aria-hidden />
            Clear
          </button>
        </div>
        <small>{pointCount} points</small>
      </div>
      <label>
        status
        <input value={object.status.join(', ')} onChange={(event) => setStatus(event.target.value)} />
      </label>
      <label>
        notes
        <textarea {...input('notes')} rows={4} />
      </label>
    </div>
  );
}

function clampPoint(point: { x: number; y: number }, imageSize: { width: number; height: number }) {
  return {
    x: Math.max(0, Math.min(imageSize.width, Math.round(point.x))),
    y: Math.max(0, Math.min(imageSize.height, Math.round(point.y))),
  };
}

function normalizedBox(start: { x: number; y: number }, current: { x: number; y: number }): Bounds {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  return {
    x,
    y,
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

function offsetBounds(bounds: Bounds, deltaX: number, deltaY: number, imageSize: { width: number; height: number }): Bounds {
  const width = Math.min(Math.max(1, Math.round(bounds.width)), imageSize.width);
  const height = Math.min(Math.max(1, Math.round(bounds.height)), imageSize.height);

  return {
    x: Math.max(0, Math.min(imageSize.width - width, Math.round(bounds.x + deltaX))),
    y: Math.max(0, Math.min(imageSize.height - height, Math.round(bounds.y + deltaY))),
    width,
    height,
  };
}

function resizeBounds(
  bounds: Bounds,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  imageSize: { width: number; height: number },
): Bounds {
  const minSize = 4;
  let left = bounds.x;
  let top = bounds.y;
  let right = bounds.x + bounds.width;
  let bottom = bounds.y + bounds.height;

  if (handle.includes('w')) left += deltaX;
  if (handle.includes('e')) right += deltaX;
  if (handle.includes('n')) top += deltaY;
  if (handle.includes('s')) bottom += deltaY;

  if (handle.includes('w')) left = clamp(left, 0, right - minSize);
  if (handle.includes('e')) right = clamp(right, left + minSize, imageSize.width);
  if (handle.includes('n')) top = clamp(top, 0, bottom - minSize);
  if (handle.includes('s')) bottom = clamp(bottom, top + minSize, imageSize.height);

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  };
}

function resizeHandleBox(bounds: Bounds, handle: ResizeHandle): Bounds {
  const half = RESIZE_HANDLE_SIZE / 2;
  const left = bounds.x;
  const centerX = bounds.x + bounds.width / 2;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const centerY = bounds.y + bounds.height / 2;
  const bottom = bounds.y + bounds.height;
  const x = handle.includes('w') ? left : handle.includes('e') ? right : centerX;
  const y = handle.includes('n') ? top : handle.includes('s') ? bottom : centerY;

  return {
    x: x - half,
    y: y - half,
    width: RESIZE_HANDLE_SIZE,
    height: RESIZE_HANDLE_SIZE,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampZoom(value: number) {
  return clamp(Number(value.toFixed(2)), MIN_ZOOM, MAX_ZOOM);
}

function withoutRemovalMask(object: ManifestObject): ManifestObject {
  const nextObject = { ...object };
  delete nextObject.removalMask;
  return nextObject;
}

function withoutWalkable(object: ManifestObject): ManifestObject {
  const nextObject = { ...object };
  delete nextObject.walkable;
  return nextObject;
}

function canUseRemovalMask(object: ManifestObject) {
  return object.role === 'occluder' || (object.role === 'interactive' && object.occlusion?.required === true);
}

function canUseCollisionPolygon(object: ManifestObject) {
  return object.role === 'blocking-ground';
}

function canUseWalkablePolygon(object: ManifestObject) {
  return object.role === 'walkable-ground';
}

function pointEditTarget(object: ManifestObject): PointEditTarget | null {
  if (canUseRemovalMask(object)) return 'removalMask';
  if (canUseCollisionPolygon(object)) return 'collision';
  if (canUseWalkablePolygon(object)) return 'walkable';
  return null;
}

function pointsForTarget(object: ManifestObject, target: PointEditTarget) {
  if (target === 'removalMask') return object.removalMask?.points ?? [];
  if (target === 'walkable') return object.walkable?.points ?? [];
  return object.collision.points ?? [];
}

function appendPointToTarget(object: ManifestObject, target: PointEditTarget, point: WorldPoint): ManifestObject {
  return setTargetPoints(object, target, [...pointsForTarget(object, target), point]);
}

function setTargetPoints(object: ManifestObject, target: PointEditTarget, points: WorldPoint[]): ManifestObject {
  if (target === 'removalMask') {
    if (points.length === 0) return withoutRemovalMask(object);
    return {
      ...object,
      removalMask: {
        kind: 'polygon',
        points,
      },
    };
  }

  if (target === 'walkable') {
    if (points.length === 0) return withoutWalkable(object);
    return {
      ...object,
      walkable: {
        kind: 'polygon',
        points,
      },
    };
  }

  const collision = { ...object.collision };
  if (points.length === 0) {
    delete collision.points;
  } else {
    collision.kind = 'polygon';
    collision.points = points;
  }
  return {
    ...object,
    collision,
  };
}

function sanitizePointPolygons(object: ManifestObject): ManifestObject {
  const withoutMask = canUseRemovalMask(object) ? object : withoutRemovalMask(object);
  if (canUseWalkablePolygon(withoutMask)) {
    const walkableObject = ensureWalkablePolygon(withoutMask);
    return withoutCollisionPoints({
      ...walkableObject,
      collision: {
        ...walkableObject.collision,
        kind: 'none',
      },
    });
  }
  const withoutInvalidWalkable = withoutWalkable(withoutMask);
  if (canUseCollisionPolygon(withoutInvalidWalkable)) return withoutInvalidWalkable;
  return withoutCollisionPoints(withoutInvalidWalkable);
}

function withoutCollisionPoints(object: ManifestObject): ManifestObject {
  const collision = { ...object.collision };
  delete collision.points;
  return {
    ...object,
    collision,
  };
}

function ensureWalkablePolygon(object: ManifestObject): ManifestObject {
  if (object.walkable?.points.length) return object;
  return {
    ...object,
    walkable: {
      kind: 'polygon',
      points: boundsToPoints(object.bbox),
    },
  };
}

function boundsToPoints(bounds: Bounds): WorldPoint[] {
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
}

function offsetRemovalMask(
  removalMask: RemovalMask,
  deltaX: number,
  deltaY: number,
  imageSize: { width: number; height: number },
): RemovalMask {
  return {
    kind: 'polygon',
    points: removalMask.points.map((point) => clampPoint({
      x: point.x + deltaX,
      y: point.y + deltaY,
    }, imageSize)),
  };
}

function offsetPoints(
  points: WorldPoint[],
  deltaX: number,
  deltaY: number,
  imageSize: { width: number; height: number },
) {
  return points.map((point) => clampPoint({
    x: point.x + deltaX,
    y: point.y + deltaY,
  }, imageSize));
}

function createDefaultObject(bbox: Bounds, role: ManifestRole, zone: string, manifest: Manifest): ManifestObject {
  const id = uniqueObjectId(`${zone}-new-${role}`, manifest);
  const requiresForegroundOcclusion = role === 'occluder';
  const isWalkable = role === 'walkable-ground';
  return {
    id,
    zone,
    label: id,
    category: role === 'blocking-ground' || isWalkable ? 'terrain' : 'decor',
    role,
    layerTarget: requiresForegroundOcclusion ? 'foreground-occluder' : 'base-ground',
    bbox,
    depthY: requiresForegroundOcclusion ? bbox.y + bbox.height : undefined,
    collision: {
      kind: role === 'ground-baked' || role === 'decor-cluster' || isWalkable ? 'none' : 'rect',
      notes: 'Authored in manifest editor.',
    },
    occlusion: {
      required: requiresForegroundOcclusion,
    },
    ...(isWalkable
      ? {
          walkable: {
            kind: 'polygon' as const,
            points: boundsToPoints(bbox),
          },
        }
      : {}),
    status: ['inventoried', 'needs-layer-generation'],
    notes: 'Created in the manifest editor.',
  };
}

function displayObjectId(object: ManifestObject) {
  const zonePrefix = `${object.zone}-`;
  return object.id.startsWith(zonePrefix) ? object.id.slice(zonePrefix.length) : object.id;
}

function uniqueObjectId(base: string, manifest: Manifest) {
  const existing = new Set(manifest.objects.map((object) => object.id));
  const slug = slugify(base);
  if (!existing.has(slug)) return slug;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${slug}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${slug}-${Date.now()}`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'object';
}
