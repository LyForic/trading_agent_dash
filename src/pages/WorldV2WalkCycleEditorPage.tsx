import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Eraser, Pause, Play, RotateCcw, Save, ZoomIn, ZoomOut } from 'lucide-react';

const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 112;
const FRAME_COUNT = 6;
const API_PATH = '/api/world-v2/walk-cycle-guide';
const MIN_ZOOM = 3;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.5;
const MINI_SCALE = 0.72;

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
] as const;

const DIRECTIONS = [
  { id: 'down', label: 'Down' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'up', label: 'Up' },
] as const;

const POSES = [
  { id: 'left-forward', label: 'Left forward' },
  { id: 'passing', label: 'Feet aligned' },
  { id: 'right-forward', label: 'Right forward' },
  { id: 'passing-alt', label: 'Feet aligned alt' },
  { id: 'unclear', label: 'Unclear' },
  { id: 'bad', label: 'Regenerate' },
] as const;

const DEFAULT_POSE_SEQUENCE: PoseKey[] = [
  'left-forward',
  'passing',
  'right-forward',
  'passing-alt',
  'left-forward',
  'passing',
];

const REQUIRED_POSES = [
  {
    id: 'left-contact',
    label: 'Left contact',
    description: 'Left foot forward, planted, or lifted as the clear leading step.',
  },
  {
    id: 'passing-a',
    label: 'Passing pose',
    description: 'Feet aligned under body between contact poses.',
  },
  {
    id: 'right-contact',
    label: 'Right contact',
    description: 'Right foot forward, planted, or lifted as the clear leading step.',
  },
  {
    id: 'passing-b',
    label: 'Passing pose alt',
    description: 'Second feet-aligned in-between pose.',
  },
] as const;

type ActorSlug = typeof ACTORS[number]['slug'];
type DirectionKey = typeof DIRECTIONS[number]['id'];
type PoseKey = typeof POSES[number]['id'];
type FootKey = 'leftFoot' | 'rightFoot';
type RequiredPoseKey = typeof REQUIRED_POSES[number]['id'];
type RequirementStatus = 'present' | 'missing' | 'unclear';

interface FramePoint {
  x: number;
  y: number;
}

interface FrameGuide {
  pose?: PoseKey;
  leftFoot?: FramePoint;
  rightFoot?: FramePoint;
  notes?: string;
}

interface PoseRequirement {
  status?: RequirementStatus;
  frame?: number;
  notes?: string;
}

interface ActorGuide {
  directions?: Partial<Record<DirectionKey, FrameGuide[]>>;
  requirements?: Partial<Record<DirectionKey, Partial<Record<RequiredPoseKey, PoseRequirement>>>>;
}

interface WalkCycleGuide {
  schemaVersion: number;
  source: {
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    directions: DirectionKey[];
    notes?: string;
  };
  poseDefinitions: Record<PoseKey, string>;
  requiredPoseDefinitions?: Record<RequiredPoseKey, string>;
  actors: Partial<Record<ActorSlug, ActorGuide>>;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function WorldV2WalkCycleEditorPage() {
  const [guide, setGuide] = useState<WalkCycleGuide | null>(null);
  const [selectedActor, setSelectedActor] = useState<ActorSlug>('apex-helper-idle');
  const [selectedDirection, setSelectedDirection] = useState<DirectionKey>('right');
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [selectedFoot, setSelectedFoot] = useState<FootKey>('leftFoot');
  const [zoom, setZoom] = useState(6);
  const [playing, setPlaying] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    document.body.dataset.route = 'walk-cycle-editor';
    return () => {
      delete document.body.dataset.route;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(API_PATH)
      .then((response) => {
        if (!response.ok) throw new Error(`Walk guide request failed: ${response.status}`);
        return response.json() as Promise<WalkCycleGuide>;
      })
      .then((nextGuide) => {
        if (cancelled) return;
        setGuide(normalizeGuide(nextGuide));
      })
      .catch(() => {
        if (!cancelled) {
          setGuide(createDefaultGuide());
          setSaveState('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setSelectedFrame((frame) => (frame + 1) % FRAME_COUNT);
    }, 120);
    return () => window.clearInterval(timer);
  }, [playing]);

  const actor = ACTORS.find((candidate) => candidate.slug === selectedActor) ?? ACTORS[0];
  const directionIndex = DIRECTIONS.findIndex((direction) => direction.id === selectedDirection);
  const currentFrameGuide = guide
    ? frameGuideFor(guide, selectedActor, selectedDirection, selectedFrame)
    : defaultFrameGuide(selectedFrame);
  const directionRequirements = guide
    ? requirementsForDirection(guide, selectedActor, selectedDirection)
    : defaultRequirements();
  const actorCompletion = useMemo(() => {
    if (!guide) return { marked: 0, total: ACTORS.length * DIRECTIONS.length * REQUIRED_POSES.length };
    return completionForGuide(guide);
  }, [guide]);

  const setFrameGuide = (updater: (frame: FrameGuide) => FrameGuide) => {
    setGuide((currentGuide) => {
      const baseGuide = normalizeGuide(currentGuide ?? createDefaultGuide());
      const actorGuide = baseGuide.actors[selectedActor] ?? {};
      const directions = { ...(actorGuide.directions ?? {}) };
      const frames = framesForDirection(baseGuide, selectedActor, selectedDirection);
      frames[selectedFrame] = sanitizeFrameGuide(updater(frames[selectedFrame]));

      return {
        ...baseGuide,
        actors: {
          ...baseGuide.actors,
          [selectedActor]: {
            ...actorGuide,
            directions: {
              ...directions,
              [selectedDirection]: frames,
            },
          },
        },
      };
    });
    setSaveState('idle');
  };

  const setDirectionFrames = (updater: (frames: FrameGuide[]) => FrameGuide[]) => {
    setGuide((currentGuide) => {
      const baseGuide = normalizeGuide(currentGuide ?? createDefaultGuide());
      const actorGuide = baseGuide.actors[selectedActor] ?? {};
      const directions = { ...(actorGuide.directions ?? {}) };
      return {
        ...baseGuide,
        actors: {
          ...baseGuide.actors,
          [selectedActor]: {
            ...actorGuide,
            directions: {
              ...directions,
              [selectedDirection]: updater(framesForDirection(baseGuide, selectedActor, selectedDirection)).map(sanitizeFrameGuide),
            },
          },
        },
      };
    });
    setSaveState('idle');
  };

  const seedFootTargets = () => {
    setDirectionFrames((frames) => frames.map((frame, frameIndex) => ({
      ...frame,
      ...defaultFootTargets(selectedDirection, frame.pose ?? DEFAULT_POSE_SEQUENCE[frameIndex], frameIndex),
    })));
  };

  const setRequirement = (requirementKey: RequiredPoseKey, updater: (requirement: PoseRequirement) => PoseRequirement) => {
    setGuide((currentGuide) => {
      const baseGuide = normalizeGuide(currentGuide ?? createDefaultGuide());
      const actorGuide = baseGuide.actors[selectedActor] ?? {};
      const requirements = { ...(actorGuide.requirements ?? {}) };
      const direction = { ...(requirements[selectedDirection] ?? {}) };
      direction[requirementKey] = sanitizeRequirement(updater(direction[requirementKey] ?? {}));

      return {
        ...baseGuide,
        actors: {
          ...baseGuide.actors,
          [selectedActor]: {
            ...actorGuide,
            requirements: {
              ...requirements,
              [selectedDirection]: direction,
            },
          },
        },
      };
    });
    setSaveState('idle');
  };

  const saveGuide = () => {
    if (!guide) return;
    setSaveState('saving');
    fetch(API_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-world-v2-editor': '1' },
      body: JSON.stringify(pruneGuide(guide)),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Save failed: ${response.status}`);
        setSaveState('saved');
      })
      .catch(() => setSaveState('error'));
  };

  const handleStagePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    setFrameGuide((frame) => ({
      ...frame,
      [selectedFoot]: pointFromPointer(event),
    }));
  };

  if (!guide) {
    return (
      <main className="walk-cycle-page">
        <div className="walk-cycle-loading">Loading walk-cycle editor</div>
      </main>
    );
  }

  return (
    <main className="walk-cycle-page">
      <aside className="walk-cycle-sidebar">
        <div className="walk-cycle-header">
          <div>
            <p>Trading Gym V2</p>
            <h1>Walk Cycles</h1>
          </div>
          <button type="button" className="walk-cycle-save" onClick={saveGuide}>
            <Save size={16} aria-hidden />
            {saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save error' : 'Save'}
          </button>
        </div>

        <div className="walk-cycle-controls">
          <label>
            Actor
            <select value={selectedActor} onChange={(event) => setSelectedActor(event.target.value as ActorSlug)}>
              {ACTORS.map((candidate) => (
                <option key={candidate.slug} value={candidate.slug}>{candidate.label}</option>
              ))}
            </select>
          </label>

          <div className="walk-cycle-direction-tabs">
            {DIRECTIONS.map((direction) => (
              <button
                key={direction.id}
                type="button"
                className={selectedDirection === direction.id ? 'walk-cycle-tab walk-cycle-tab--active' : 'walk-cycle-tab'}
                onClick={() => {
                  setSelectedDirection(direction.id);
                  setSelectedFrame(0);
                }}
              >
                {direction.label}
              </button>
            ))}
          </div>

          <div className="walk-cycle-play-row">
            <button type="button" onClick={() => setPlaying((current) => !current)}>
              {playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={() => setDirectionFrames((frames) => frames.map((frame, index) => ({
                ...frame,
                pose: DEFAULT_POSE_SEQUENCE[index],
              })))}
            >
              <RotateCcw size={15} aria-hidden />
              Seed poses
            </button>
            <button type="button" onClick={seedFootTargets}>
              <RotateCcw size={15} aria-hidden />
              Seed foot targets
            </button>
          </div>

          <div className="walk-cycle-zoom-row">
            <button type="button" onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))}>
              <ZoomOut size={15} aria-hidden />
            </button>
            <span>{zoom.toFixed(1)}x</span>
            <button type="button" onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))}>
              <ZoomIn size={15} aria-hidden />
            </button>
          </div>

          <div className="walk-cycle-progress">
            <span>{actorCompletion.marked} / {actorCompletion.total}</span>
          </div>
        </div>

        <div className="walk-cycle-actor-list">
          {ACTORS.map((candidate) => (
            <button
              key={candidate.slug}
              type="button"
              className={candidate.slug === selectedActor ? 'walk-cycle-actor walk-cycle-actor--active' : 'walk-cycle-actor'}
              onClick={() => setSelectedActor(candidate.slug)}
            >
              <span style={miniFrameStyle(candidate.slug, 0, 0, 0.42)} />
              <strong>{candidate.label}</strong>
              <small>{markedForActor(guide, candidate.slug)} / {DIRECTIONS.length * REQUIRED_POSES.length}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="walk-cycle-stage-panel">
        <div
          className="walk-cycle-preview"
          style={{
            width: FRAME_WIDTH * zoom,
            height: FRAME_HEIGHT * zoom,
            backgroundImage: `url(${sheetUrl(selectedActor)})`,
            backgroundSize: `${FRAME_WIDTH * FRAME_COUNT * zoom}px ${FRAME_HEIGHT * DIRECTIONS.length * zoom}px`,
            backgroundPosition: `-${selectedFrame * FRAME_WIDTH * zoom}px -${directionIndex * FRAME_HEIGHT * zoom}px`,
          }}
        >
          <svg
            ref={svgRef}
            className="walk-cycle-marker-layer"
            viewBox={`0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`}
            onPointerDown={handleStagePointerDown}
          >
            <line x1="0" y1="96" x2={FRAME_WIDTH} y2="96" className="walk-cycle-foot-baseline" />
            {currentFrameGuide.leftFoot ? (
              <FootMarker foot="leftFoot" point={currentFrameGuide.leftFoot} selected={selectedFoot === 'leftFoot'} />
            ) : null}
            {currentFrameGuide.rightFoot ? (
              <FootMarker foot="rightFoot" point={currentFrameGuide.rightFoot} selected={selectedFoot === 'rightFoot'} />
            ) : null}
          </svg>
        </div>

        <div className="walk-cycle-strip">
          {Array.from({ length: FRAME_COUNT }, (_, frameIndex) => {
            const frame = frameGuideFor(guide, selectedActor, selectedDirection, frameIndex);
            const pose = frame.pose ?? DEFAULT_POSE_SEQUENCE[frameIndex];
            return (
              <button
                key={frameIndex}
                type="button"
                className={selectedFrame === frameIndex ? 'walk-cycle-frame walk-cycle-frame--active' : 'walk-cycle-frame'}
                onClick={() => setSelectedFrame(frameIndex)}
              >
                <span style={miniFrameStyle(selectedActor, directionIndex, frameIndex, MINI_SCALE)} />
                <small>{frameIndex + 1}. {poseLabel(pose)}</small>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="walk-cycle-inspector">
        <div className="walk-cycle-inspector-inner">
          <div>
            <p>{actor.label}</p>
            <h2>{DIRECTIONS[directionIndex]?.label ?? 'Down'} frame {selectedFrame + 1}</h2>
          </div>

          <div className="walk-cycle-requirement-panel">
            <span>Direction pose checklist</span>
            {REQUIRED_POSES.map((requirement) => {
              const currentRequirement = directionRequirements[requirement.id];
              return (
                <div key={requirement.id} className="walk-cycle-requirement-row">
                  <div>
                    <strong>{requirement.label}</strong>
                    <small>{requirement.description}</small>
                  </div>
                  <select
                    value={requirementSelectValue(currentRequirement)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRequirement(requirement.id, (previousRequirement) => requirementFromSelectValue(value, previousRequirement));
                      if (value.startsWith('frame-')) setSelectedFrame(Number(value.replace('frame-', '')));
                    }}
                  >
                    <option value="">Not reviewed</option>
                    <option value="missing">Missing</option>
                    <option value="unclear">Unclear</option>
                    {Array.from({ length: FRAME_COUNT }, (_, frameIndex) => (
                      <option key={frameIndex} value={`frame-${frameIndex}`}>Present in frame {frameIndex + 1}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={currentRequirement.notes ?? ''}
                    placeholder="Missing right foot lift, needs passing frame..."
                    onChange={(event) => setRequirement(requirement.id, (previousRequirement) => ({
                      ...previousRequirement,
                      notes: event.target.value,
                    }))}
                  />
                </div>
              );
            })}
          </div>

          <label>
            Pose
            <select
              value={currentFrameGuide.pose ?? DEFAULT_POSE_SEQUENCE[selectedFrame]}
              onChange={(event) => setFrameGuide((frame) => ({ ...frame, pose: event.target.value as PoseKey }))}
            >
              {POSES.map((pose) => (
                <option key={pose.id} value={pose.id}>{pose.label}</option>
              ))}
            </select>
          </label>

          <div className="walk-cycle-foot-toggle">
            <button
              type="button"
              className={selectedFoot === 'leftFoot' ? 'walk-cycle-foot-button walk-cycle-foot-button--left walk-cycle-foot-button--active' : 'walk-cycle-foot-button walk-cycle-foot-button--left'}
              onClick={() => setSelectedFoot('leftFoot')}
            >
              Left foot
            </button>
            <button
              type="button"
              className={selectedFoot === 'rightFoot' ? 'walk-cycle-foot-button walk-cycle-foot-button--right walk-cycle-foot-button--active' : 'walk-cycle-foot-button walk-cycle-foot-button--right'}
              onClick={() => setSelectedFoot('rightFoot')}
            >
              Right foot
            </button>
          </div>

          <div className="walk-cycle-foot-readout">
            <FootReadout label="Left" point={currentFrameGuide.leftFoot} />
            <FootReadout label="Right" point={currentFrameGuide.rightFoot} />
          </div>

          <div className="walk-cycle-inspector-actions">
            <button
              type="button"
              onClick={() => setFrameGuide((frame) => ({ ...frame, [selectedFoot]: undefined }))}
            >
              <Eraser size={15} aria-hidden />
              Clear foot
            </button>
            <button
              type="button"
              onClick={() => setFrameGuide(() => defaultFrameGuide(selectedFrame))}
            >
              <RotateCcw size={15} aria-hidden />
              Reset frame
            </button>
          </div>

          <label>
            Notes
            <textarea
              value={currentFrameGuide.notes ?? ''}
              onChange={(event) => setFrameGuide((frame) => ({
                ...frame,
                notes: event.target.value,
              }))}
            />
          </label>
        </div>
      </aside>
    </main>
  );

  function pointFromPointer(event: PointerEvent<SVGSVGElement>): FramePoint {
    const rect = (svgRef.current ?? event.currentTarget).getBoundingClientRect();
    return {
      x: clamp(Math.round(((event.clientX - rect.left) / rect.width) * FRAME_WIDTH), 0, FRAME_WIDTH),
      y: clamp(Math.round(((event.clientY - rect.top) / rect.height) * FRAME_HEIGHT), 0, FRAME_HEIGHT),
    };
  }
}

function FootMarker({ foot, point, selected }: { foot: FootKey; point: FramePoint; selected: boolean }) {
  return (
    <g className={selected ? 'walk-cycle-foot-marker walk-cycle-foot-marker--active' : 'walk-cycle-foot-marker'}>
      <circle
        cx={point.x}
        cy={point.y}
        r={selected ? 3.6 : 3}
        className={foot === 'leftFoot' ? 'walk-cycle-foot-dot walk-cycle-foot-dot--left' : 'walk-cycle-foot-dot walk-cycle-foot-dot--right'}
      />
      <line x1={point.x - 5} y1={point.y} x2={point.x + 5} y2={point.y} />
      <line x1={point.x} y1={point.y - 5} x2={point.x} y2={point.y + 5} />
    </g>
  );
}

function FootReadout({ label, point }: { label: string; point?: FramePoint }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{point ? `${point.x}, ${point.y}` : 'unset'}</strong>
    </div>
  );
}

function sheetUrl(slug: ActorSlug) {
  return `/world-v2/actors/walk/${slug}-walk.png`;
}

function miniFrameStyle(slug: ActorSlug, directionIndex: number, frameIndex: number, scale: number): CSSProperties {
  return {
    width: FRAME_WIDTH * scale,
    height: FRAME_HEIGHT * scale,
    backgroundImage: `url(${sheetUrl(slug)})`,
    backgroundSize: `${FRAME_WIDTH * FRAME_COUNT * scale}px ${FRAME_HEIGHT * DIRECTIONS.length * scale}px`,
    backgroundPosition: `-${frameIndex * FRAME_WIDTH * scale}px -${directionIndex * FRAME_HEIGHT * scale}px`,
  };
}

function normalizeGuide(guide: WalkCycleGuide): WalkCycleGuide {
  return {
    ...createDefaultGuide(),
    ...guide,
    source: {
      ...createDefaultGuide().source,
      ...guide.source,
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
      frameCount: FRAME_COUNT,
      directions: DIRECTIONS.map((direction) => direction.id),
    },
    poseDefinitions: {
      ...createDefaultGuide().poseDefinitions,
      ...guide.poseDefinitions,
    },
    requiredPoseDefinitions: {
      ...createDefaultGuide().requiredPoseDefinitions,
      ...guide.requiredPoseDefinitions,
    } as Record<RequiredPoseKey, string>,
    actors: guide.actors ?? {},
  };
}

function createDefaultGuide(): WalkCycleGuide {
  return {
    schemaVersion: 1,
    source: {
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
      frameCount: FRAME_COUNT,
      directions: DIRECTIONS.map((direction) => direction.id),
      notes: 'Manual walk-cycle pose labels and foot markers for regenerating clearer actor walking sprites.',
    },
    poseDefinitions: Object.fromEntries(POSES.map((pose) => [pose.id, pose.label])) as Record<PoseKey, string>,
    requiredPoseDefinitions: Object.fromEntries(REQUIRED_POSES.map((pose) => [pose.id, pose.description])) as Record<RequiredPoseKey, string>,
    actors: {},
  };
}

function frameGuideFor(guide: WalkCycleGuide, actor: ActorSlug, direction: DirectionKey, frameIndex: number): FrameGuide {
  return {
    ...defaultFrameGuide(frameIndex),
    ...(guide.actors[actor]?.directions?.[direction]?.[frameIndex] ?? {}),
  };
}

function framesForDirection(guide: WalkCycleGuide, actor: ActorSlug, direction: DirectionKey) {
  return Array.from({ length: FRAME_COUNT }, (_, index) => frameGuideFor(guide, actor, direction, index));
}

function requirementsForDirection(guide: WalkCycleGuide, actor: ActorSlug, direction: DirectionKey) {
  const requirements = guide.actors[actor]?.requirements?.[direction] ?? {};
  return Object.fromEntries(
    REQUIRED_POSES.map((requirement) => [requirement.id, requirements[requirement.id] ?? {}]),
  ) as Record<RequiredPoseKey, PoseRequirement>;
}

function defaultRequirements() {
  return Object.fromEntries(
    REQUIRED_POSES.map((requirement) => [requirement.id, {}]),
  ) as Record<RequiredPoseKey, PoseRequirement>;
}

function defaultFrameGuide(frameIndex: number): FrameGuide {
  return { pose: DEFAULT_POSE_SEQUENCE[frameIndex] };
}

function defaultFootTargets(direction: DirectionKey, pose: PoseKey, frameIndex: number): Pick<FrameGuide, 'leftFoot' | 'rightFoot'> {
  const currentPose = pose ?? DEFAULT_POSE_SEQUENCE[frameIndex];
  const passing = currentPose === 'passing' || currentPose === 'passing-alt';
  const secondContact = currentPose === 'right-forward';

  if (direction === 'right') {
    if (passing) return { leftFoot: { x: 50, y: 94 }, rightFoot: { x: 58, y: 94 } };
    return secondContact
      ? { leftFoot: { x: 39, y: 95 }, rightFoot: { x: 65, y: 92 } }
      : { leftFoot: { x: 64, y: 92 }, rightFoot: { x: 39, y: 95 } };
  }

  if (direction === 'left') {
    if (passing) return { leftFoot: { x: 46, y: 94 }, rightFoot: { x: 54, y: 94 } };
    return secondContact
      ? { leftFoot: { x: 57, y: 95 }, rightFoot: { x: 31, y: 92 } }
      : { leftFoot: { x: 32, y: 92 }, rightFoot: { x: 57, y: 95 } };
  }

  if (direction === 'up') {
    if (passing) return { leftFoot: { x: 43, y: 92 }, rightFoot: { x: 55, y: 92 } };
    return secondContact
      ? { leftFoot: { x: 43, y: 94 }, rightFoot: { x: 55, y: 89 } }
      : { leftFoot: { x: 43, y: 89 }, rightFoot: { x: 55, y: 94 } };
  }

  if (passing) return { leftFoot: { x: 42, y: 94 }, rightFoot: { x: 55, y: 94 } };
  return secondContact
    ? { leftFoot: { x: 42, y: 91 }, rightFoot: { x: 56, y: 96 } }
    : { leftFoot: { x: 42, y: 96 }, rightFoot: { x: 56, y: 91 } };
}

function sanitizeFrameGuide(frame: FrameGuide): FrameGuide {
  return {
    ...(frame.pose ? { pose: frame.pose } : {}),
    ...(frame.leftFoot ? { leftFoot: frame.leftFoot } : {}),
    ...(frame.rightFoot ? { rightFoot: frame.rightFoot } : {}),
    ...(frame.notes?.trim() ? { notes: frame.notes } : {}),
  };
}

function sanitizeRequirement(requirement: PoseRequirement): PoseRequirement {
  return {
    ...(requirement.status ? { status: requirement.status } : {}),
    ...(requirement.status === 'present' && requirement.frame !== undefined ? { frame: clamp(requirement.frame, 0, FRAME_COUNT - 1) } : {}),
    ...(requirement.notes?.trim() ? { notes: requirement.notes } : {}),
  };
}

function pruneGuide(guide: WalkCycleGuide): WalkCycleGuide {
  return {
    ...guide,
    actors: Object.fromEntries(
      Object.entries(guide.actors).map(([actor, actorGuide]) => [
        actor,
        {
          directions: Object.fromEntries(
            Object.entries(actorGuide?.directions ?? {}).map(([direction, frames]) => [
              direction,
              (frames ?? []).map(sanitizeFrameGuide),
            ]),
          ),
          requirements: Object.fromEntries(
            Object.entries(actorGuide?.requirements ?? {}).map(([direction, requirements]) => [
              direction,
              Object.fromEntries(
                Object.entries(requirements ?? {})
                  .map(([requirement, value]) => [requirement, sanitizeRequirement(value)])
                  .filter(([, value]) => requirementHasManualData(value as PoseRequirement)),
              ),
            ]),
          ),
        },
      ]),
    ) as Partial<Record<ActorSlug, ActorGuide>>,
  };
}

function requirementSelectValue(requirement: PoseRequirement) {
  if (requirement.status === 'present' && requirement.frame !== undefined) return `frame-${requirement.frame}`;
  return requirement.status ?? '';
}

function requirementFromSelectValue(value: string, previousRequirement: PoseRequirement): PoseRequirement {
  if (value === '') {
    return { notes: previousRequirement.notes };
  }
  if (value === 'missing' || value === 'unclear') {
    return {
      ...previousRequirement,
      status: value,
      frame: undefined,
    };
  }
  if (value.startsWith('frame-')) {
    return {
      ...previousRequirement,
      status: 'present',
      frame: clamp(Number(value.replace('frame-', '')), 0, FRAME_COUNT - 1),
    };
  }
  return previousRequirement;
}

function poseLabel(pose: PoseKey) {
  return POSES.find((candidate) => candidate.id === pose)?.label ?? pose;
}

function completionForGuide(guide: WalkCycleGuide) {
  const total = ACTORS.length * DIRECTIONS.length * REQUIRED_POSES.length;
  const marked = ACTORS.reduce((actorTotal, actor) => (
    actorTotal + markedForActor(guide, actor.slug)
  ), 0);
  return { marked, total };
}

function markedForActor(guide: WalkCycleGuide, actor: ActorSlug) {
  return DIRECTIONS.reduce((directionTotal, direction) => (
    directionTotal + REQUIRED_POSES.map((requirement) => (
      requirementHasManualData(guide.actors[actor]?.requirements?.[direction.id]?.[requirement.id])
    )).filter(Boolean).length
  ), 0);
}

function requirementHasManualData(requirement?: PoseRequirement) {
  return Boolean(requirement?.status || requirement?.notes);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
