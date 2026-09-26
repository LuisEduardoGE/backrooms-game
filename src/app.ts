import * as THREE from 'three';
import { createAudioEngine } from './audio/engine';
import { footstepLevel, footWetness, humLevel, maybeEcho, whisperLevel } from './audio/mix';
import { nextPhase, type Phase, type PhaseEvent } from './core/gameState';
import { autopilotInput, createAutopilot } from './game/autopilot';
import { createInput } from './core/input';
import { createFixedStepper, FIXED_DT } from './core/loop';
import { createRng, deriveSeed } from './core/rng';
import { nudgeSensitivity, parseSensitivity, sensitivityLabel } from './core/sensitivity';
import { createVhsComposer } from './fx/composer';
import { glitchAmount } from './fx/glitch';
import { createDirector, type DirectorEvent, updateDirector } from './game/director';
import { caughtPlayer, createEntity, type Entity, updateEntity } from './game/entity';
import { findInteractable, promptFor } from './game/interact';
import { hasLineOfSight } from './game/los';
import { createFootsteps, type NoiseEvent, stepFootsteps } from './game/noise';
import { NOTES } from './game/notes';
import {
  createSanity, distortionFromSanity, drinkAlmondWater, fearDrain, isInsane, jolt, updateSanity,
} from './game/sanity';
import { spawnHowlerCell, spawnSmilerCells } from './game/spawns';
import { AMBIENT_DARK, createLightField } from './lighting/bake';
import { isFaultyLight, nearestLitLightsAt, panelLevel, sceneExposure } from './lighting/lights';
import { createPanelMap } from './lighting/panelMap';
import { createShadowLights } from './lighting/shadowLights';
import { createSlots, updateSlots } from './lighting/shadowSlots';
import { lightAt } from './lighting/sample';
import { addBattery, createCamcorder, toggleNightVision, updateCamcorder } from './player/camcorder';
import { applyLook, createPlayer, headBob, NO_INPUT, updatePlayer } from './player/controller';
import { createDebugHud } from './ui/debugHud';
import { createHud } from './ui/hud';
import { createNoteReader } from './ui/noteReader';
import { formatDuration, tapeStartTime } from './ui/osd';
import { parseParams, tapeUrl } from './ui/params';
import { placeArrows, shortestPath } from './world/clues';
import { createEntityViews } from './world/entityViews';
import { reachedExit } from './world/exit';
import { WALL_FACE_DISTANCE } from './world/solids';
import { generateLevel } from './world/generator';
import { Cell, CELL_SIZE, cellToWorld, DIR_STEP, getCell, isDark, worldToCell } from './world/grid';
import { ITEM_COUNTS, type Item, placeItems } from './world/items';
import { createProps } from './world/props';
import type { ChunkPanels } from './world/chunkMesh';
import { CHUNK_CELLS } from './world/chunks';
import { ceilingDressing, type Puddle, puddles, wallFixtures } from './world/dressing';
import { headroomAt } from './world/headers';
/** How far ahead (m) the Howler notices a doorway header, so it is already stooped as its head reaches it at a sprint. */
const HOWLER_LOOKAHEAD = 1.4;
import { createChunkStreamer } from './world/streamer';
import { furnishRooms, type PropPlacement } from './world/furnishing';
import { buildPropMeshes, loadPropModels, placementMatrix, type PropInstance } from './world/propModels';
import { wallQuads } from './world/wallFaces';
import type { Rect } from './world/solids';
import { loadWorldMaterials } from './world/textures';

/** Distance falls off into dim olive, as in the references — never a pale white haze. */
const FOG_COLOR = 0x5e5628;
/** Peak intensity of the camcorder's infrared illuminator in night vision. */
const IR_INTENSITY = 6;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;
const titleScreen = document.getElementById('title-screen') as HTMLDivElement;
const pauseScreen = document.getElementById('pause-screen') as HTMLDivElement;
const endScreen = document.getElementById('end-screen') as HTMLDivElement;
const escapeScreen = document.getElementById('escape-screen') as HTMLDivElement;
/** The fall through the floor lasts a little longer than the TAPE ENDS glitch. */
const ESCAPE_REVEAL_SEC = 1.4;
const lockError = document.getElementById('lock-error') as HTMLParagraphElement;
/** Seconds of glitching before an end screen appears. */
const END_REVEAL_SEC = 1.0;

const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'high-performance' });
const MAX_PIXEL_RATIO = 1.5;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(window.innerWidth, window.innerHeight);
// AgX: soft filmic highlight roll-off, so bright panels and walls bloom into haze instead of clipping.
renderer.toneMapping = THREE.AgXToneMapping;
// Soft shadow maps for the few real panel lights near the player.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Shadow maps are redrawn every other frame (see the loop): lights barely move frame to frame.
renderer.shadowMap.autoUpdate = false;
let shadowFrame = 0;
/** Exposed for the walls (the photo's brightest surfaces), as an auto-exposing camcorder would. */
const EXPOSURE = 1.75;
renderer.toneMappingExposure = EXPOSURE;

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.02);
// Soft ambient fill; per-area brightness (and darkness in dead zones) is baked into the meshes.
scene.add(new THREE.HemisphereLight(0xfff0c4, 0xa08e4c, 1.25));

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';
// The camcorder's infrared illuminator: always in the scene (stable light count), lit only in night vision.
const irLight = new THREE.PointLight(0xffffff, 0, 14, 1.5);
scene.add(irLight);

const params = parseParams(window.location.search);
const seed = params.seed ?? Math.floor(Math.random() * 0xffffffff) >>> 0;
const level = generateLevel(seed);
const panelMap = createPanelMap(level.grid);
const materials = await loadWorldMaterials(createRng(deriveSeed(seed, 'textures')), panelMap);
const lightField = createLightField(level.grid);
/** Baked light at a world point — props, the Howler and the IR light are matched to it. */
const shade = (x: number, z: number) => lightAt(level.grid, lightField, x, z);
const lightSeed = deriveSeed(seed, 'lights');
const truePath = shortestPath(level.grid, level.start, level.exit);
const arrows = placeArrows(level.grid, truePath, createRng(deriveSeed(seed, 'clues')));
const items = placeItems(level, truePath, createRng(deriveSeed(seed, 'items')));
// Furniture keeps off the start, the exit, every item and the whole clue path.
const cellIndex = (p: { x: number; y: number }) => p.y * level.grid.width + p.x;
const furniture = furnishRooms(level, new Set([level.start, level.exit, ...truePath, ...items.map((i) => i.cell)].map(cellIndex)));
const propTemplates = await loadPropModels();
/** Furniture by chunk (of its anchor cell), and its colliders by every cell they overlap. */
const furnitureByChunk = new Map<string, PropPlacement[]>();
const furnitureSolids = new Map<number, Rect[]>();
for (const p of furniture) {
  const key = `${Math.floor(p.cell.x / CHUNK_CELLS)},${Math.floor(p.cell.y / CHUNK_CELLS)}`;
  const list = furnitureByChunk.get(key);
  if (list) list.push(p);
  else furnitureByChunk.set(key, [p]);
  if (!p.collide) continue;
  for (let y = worldToCell(p.collide.minZ); y <= worldToCell(p.collide.maxZ); y++) {
    for (let x = worldToCell(p.collide.minX); x <= worldToCell(p.collide.maxX); x++) {
      const rects = furnitureSolids.get(y * level.grid.width + x);
      if (rects) rects.push(p.collide);
      else furnitureSolids.set(y * level.grid.width + x, [p.collide]);
    }
  }
}
const furnitureAt = (cx: number, cy: number): readonly Rect[] => furnitureSolids.get(cy * level.grid.width + cx) ?? [];
/** Furniture and wall fixtures for one chunk, in the chunk's baked light. */
function chunkFurniture(cx: number, cy: number): THREE.Object3D[] {
  const instances: PropInstance[] = (furnitureByChunk.get(`${cx},${cy}`) ?? []).map((p) => ({
    kind: p.kind,
    matrix: placementMatrix(p, propTemplates.sizes[p.kind]),
    light: shade(p.x, p.z),
  }));
  for (const f of wallFixtures(wallQuads(level.grid, cx, cy, CHUNK_CELLS))) {
    const { spot } = f;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(spot.nx, spot.nz));
    instances.push({
      kind: f.kind,
      matrix: new THREE.Matrix4().compose(new THREE.Vector3(spot.x + spot.nx * 0.005, f.y, spot.z + spot.nz * 0.005), q, new THREE.Vector3(1, 1, 1)),
      light: shade(spot.x + spot.nx * 0.06, spot.z + spot.nz * 0.06),
    });
  }
  return buildPropMeshes(propTemplates, instances);
}
const streamer = createChunkStreamer(scene, level.grid, materials, lightField, chunkFurniture);
// Build the whole starting area up front, behind the title screen, so there's no pop-in at the start.
streamer.update(level.start.x, level.start.y);
streamer.flush();
const props = createProps(scene, level, arrows, items, { chevron: materials.wall, dots: materials.wallDots, stained: materials.wallStained }, shade);
const taken = new Set<number>();
let notesFound = 0;
const sanity = createSanity();
const noteReader = createNoteReader(document.body);
const audio = createAudioEngine(params.debug);
const echoRng = createRng(deriveSeed(seed, 'echoes'));
/** Presence echoes waiting to play (performance.now() ms). */
const pendingEchoes: { at: number; x: number; z: number }[] = [];
const footsteps = createFootsteps();
const directorRng = createRng(deriveSeed(seed, 'director'));
const director = createDirector(directorRng);
const entityRng = createRng(deriveSeed(seed, 'entities'));
const entities: Entity[] = [];
const entityViews = createEntityViews(scene);
const anyFloor = (x: number, y: number) => getCell(level.grid, x, y) === Cell.Floor;
/** Smilers live in the dark and never leave it. */
const darkOnly = (x: number, y: number) => anyFloor(x, y) && isDark(level.grid, x, y);
/** Sight distance (cells) within which a visible Smiler frightens the player. */
const SMILER_FEAR_CELLS = 10;
/** The Presence: lights die around the player for a while. */
const BLACKOUT_MS = 3000;
const BLACKOUT_RADIUS = 8;
const PRESENCE_GLITCH_MS = 800;
const PRESENCE_JOLT = 3;
const HOWLER_WARNING_MS = 1500;
let blackout: { x: number; z: number; until: number } | null = null;
let glitchUntil = 0;
let dimUntil = 0;
/** performance.now() when the tape ended or escaped; null while the tape is running. */
let endedAt: number | null = null;
let endRevealed = false;
const player = createPlayer({ x: cellToWorld(level.start.x), z: cellToWorld(level.start.y) }, level.startYaw);
const debugHud = params.debug ? createDebugHud(level) : null;
// ?debug only: a console handle for inspecting a scene (e.g. teleport: __backrooms.player.pos.x = …).
if (params.debug) Object.assign(window, { __backrooms: { player, level, camera, materials, scene, furniture, renderer, get vhs() { return vhs; } } });
if (params.debug) console.info(`[backrooms] seed ${seed} — reload with ?debug&seed=${seed} to replay`);

const camcorder = createCamcorder();
const glitchSeed = deriveSeed(seed, 'glitch');
const vhs = createVhsComposer(renderer, scene, camera, window.innerWidth, window.innerHeight);
const hud = createHud(document.body);
const tapeStart = tapeStartTime(seed);
/** Seconds of footage recorded; only advances while playing. */
let recordedSec = 0;

let phase: Phase = 'title';
const isLocked = () => document.pointerLockElement === canvas;
const input = createInput(window, isLocked);
const SENSITIVITY_KEY = 'backrooms.mouse';
let sensitivity = (() => {
  try {
    return parseSensitivity(localStorage.getItem(SENSITIVITY_KEY));
  } catch {
    return parseSensitivity(null);
  }
})();

const panelColor = new THREE.Color();
/** Real shadow-casting lights on the nearest panels (see lighting/shadowSlots). */
const SHADOW_LIGHTS = 4;
/** Panels farther than this (metres) never get a real light; they fade out before it. */
const SHADOW_LIGHT_REACH = 6;
/** How fast a real light fades in or out when it changes panel (intensity per second). */
const SHADOW_FADE = 3;
const shadowSlots = createSlots(SHADOW_LIGHTS);
const shadowLights = createShadowLights(scene, SHADOW_LIGHTS);
/** Latest brightness and position of every loaded panel, by id (cell index). */
const panelLevels = new Map<number, number>();
const panelPositions = new Map<number, { x: number; z: number }>();
/** Per chunk: which panels are faulty (the only ones that change frame to frame) and the state last written. */
const panelCache = new WeakMap<ChunkPanels, { faulty: number[]; state: string }>();
/**
 * Flicker, the Howler's warning and Presence blackouts act on individual ceiling panels (instance
 * colours) and on the camera exposure — the baked room light itself never changes. A chunk's panels
 * are all rewritten only when the blackout/dim state changes; otherwise just its faulty tubes.
 * Returns the exposure multiplier.
 */
function updatePanels(timeSec: number, blackout: { x: number; z: number; radius: number } | null, dim: boolean, dt: number): number {
  const state = `${blackout ? `${blackout.x},${blackout.z}` : '-'}|${dim}`;
  const write = (p: ChunkPanels, i: number) => {
    const c = p.cells[i];
    const id = c.y * level.grid.width + c.x;
    const out = blackout !== null && Math.hypot(c.wx - blackout.x, c.wz - blackout.z) <= blackout.radius;
    const lvl = panelLevel(p.base[i], timeSec, id, lightSeed, out, dim);
    p.mesh.setColorAt(i, panelColor.setScalar(lvl));
    // Ceiling bounce and the real lights follow the tube (a dead dark-zone panel gives none).
    const live = p.base[i] < 1 ? 0 : lvl;
    panelMap.set(c.x, c.y, live);
    panelLevels.set(id, live);
  };
  const candidates: { id: number; d: number; x: number; z: number }[] = [];
  for (const p of streamer.panels()) {
    let cache = panelCache.get(p);
    if (!cache) {
      const faulty = p.cells.flatMap((c, i) => (p.base[i] === 1 && isFaultyLight(c.y * level.grid.width + c.x, lightSeed) ? [i] : []));
      panelCache.set(p, (cache = { faulty, state: '' }));
    }
    const full = cache.state !== state;
    if (full) {
      for (let i = 0; i < p.cells.length; i++) write(p, i);
      cache.state = state;
    } else {
      for (const i of cache.faulty) write(p, i);
    }
    if (full || cache.faulty.length > 0) {
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
    for (let i = 0; i < p.cells.length; i++) {
      if (p.base[i] < 1) continue;
      const c = p.cells[i];
      const d = Math.hypot(c.wx - player.pos.x, c.wz - player.pos.z);
      if (d < SHADOW_LIGHT_REACH) candidates.push({ id: c.y * level.grid.width + c.x, d, x: c.wx, z: c.wz });
    }
  }
  panelMap.commit();
  // The real, shadow-casting lights go to the nearest working panels, fading out with distance.
  candidates.sort((a, b) => a.d - b.d);
  const wanted = candidates.slice(0, SHADOW_LIGHTS).map((c) => {
    panelPositions.set(c.id, { x: c.x, z: c.z });
    const distanceFade = Math.min(1, Math.max(0, (SHADOW_LIGHT_REACH - c.d) / 3));
    return { id: c.id, target: (panelLevels.get(c.id) ?? 1) * distanceFade };
  });
  updateSlots(shadowSlots, wanted, dt, SHADOW_FADE);
  shadowLights.update(shadowSlots, (id) => panelPositions.get(id));
  // Flicker is local now (real lights); only blackouts and the Howler's warning move the exposure.
  return sceneExposure(blackout !== null, dim, 1);
}

/**
 * Raw (unaccelerated) mouse input so turning doesn't depend on the OS pointer acceleration;
 * falls back to a plain lock where unsupported. Rejections (e.g. re-locking within ~1 s of Esc)
 * are swallowed — the next click works.
 */
/** Damp carpet patches in the player's chunk (refreshed on chunk change), for wet footsteps. */
let puddleChunk = '';
let nearbyPuddles: Puddle[] = [];
function inPuddle(x: number, z: number): boolean {
  const cx = Math.floor(worldToCell(x) / CHUNK_CELLS);
  const cy = Math.floor(worldToCell(z) / CHUNK_CELLS);
  const key = `${cx},${cy}`;
  if (key !== puddleChunk) {
    puddleChunk = key;
    nearbyPuddles = puddles(level.grid, cx, cy, CHUNK_CELLS);
  }
  return nearbyPuddles.some((p) => Math.hypot(p.x - x, p.z - z) < p.r);
}

/** Vents around the player's chunk, refreshed when the player changes chunk. */
let ventChunk = '';
let nearbyVents: { x: number; z: number }[] = [];
function nearestVent(x: number, z: number): { x: number; z: number } | null {
  const cx = Math.floor(worldToCell(x) / CHUNK_CELLS);
  const cy = Math.floor(worldToCell(z) / CHUNK_CELLS);
  const key = `${cx},${cy}`;
  if (key !== ventChunk) {
    ventChunk = key;
    nearbyVents = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const it of ceilingDressing(level.grid, cx + dx, cy + dy, CHUNK_CELLS)) if (it.kind === 'vent') nearbyVents.push({ x: it.x, z: it.z });
      }
    }
  }
  let best: { x: number; z: number } | null = null;
  let bestD = 12;
  for (const v of nearbyVents) {
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

function lockPointer(): void {
  const request = canvas.requestPointerLock as (options?: { unadjustedMovement?: boolean }) => Promise<void> | void;
  Promise.resolve(request.call(canvas, { unadjustedMovement: true })).catch(() =>
    Promise.resolve(canvas.requestPointerLock()).catch(() => undefined),
  );
}

function showPhase(): void {
  const over = phase === 'ended' || phase === 'escaped';
  overlay.hidden = phase === 'playing' || phase === 'reading' || (over && !endRevealed);
  titleScreen.hidden = phase !== 'title';
  pauseScreen.hidden = phase !== 'paused';
  endScreen.hidden = !(phase === 'ended' && endRevealed);
  escapeScreen.hidden = !(phase === 'escaped' && endRevealed);
  noteReader.setVisible(phase === 'reading');
  hud.setVisible(phase !== 'title' && !(over && endRevealed));
}

function setPhase(event: PhaseEvent): void {
  phase = nextPhase(phase, event);
  showPhase();
}

function interact(item: Item): void {
  taken.add(item.id);
  props.hideItem(item.id);
  if (item.kind === 'battery') addBattery(camcorder);
  else if (item.kind === 'almondWater') drinkAlmondWater(sanity);
  else if (item.note !== null) {
    notesFound++;
    noteReader.show(NOTES[item.note]);
    setPhase('readNote');
  }
}

function endTape(event: 'die' | 'escape', now: number): void {
  const before = phase;
  setPhase(event);
  if (phase === before) return;
  audio.staticBurst();
  endedAt = now;
  const stats = `RECORDED ${formatDuration(recordedSec)} · NOTES ${notesFound}/${ITEM_COUNTS.note}`;
  for (const el of document.querySelectorAll<HTMLElement>('.stats')) el.textContent = stats;
  document.exitPointerLock();
}

/** `gameMs`: the tape clock (recorded time), so Presence/warning timers pause with the game. */
function onDirectorEvent(event: DirectorEvent, gameMs: number): void {
  const here = { x: worldToCell(player.pos.x), y: worldToCell(player.pos.z) };
  if (event === 'spawnSmilers') {
    for (const cell of spawnSmilerCells(level.grid, here, entityRng)) entities.push(createEntity(entities.length, 'smiler', cell));
  } else if (event === 'spawnHowler') {
    const cell = spawnHowlerCell(level.grid, here, entityRng);
    if (cell) entities.push(createEntity(entities.length, 'howler', cell));
    audio.howl();
    glitchUntil = Math.max(glitchUntil, gameMs + HOWLER_WARNING_MS);
    dimUntil = gameMs + HOWLER_WARNING_MS;
  } else if (event === 'presence') {
    blackout = { x: player.pos.x, z: player.pos.z, until: gameMs + BLACKOUT_MS };
    glitchUntil = Math.max(glitchUntil, gameMs + PRESENCE_GLITCH_MS);
    if (!params.god && !params.attract) jolt(sanity, PRESENCE_JOLT);
  }
}
showPhase();

// Attract/trailer mode: no pointer lock; the camcorder walks the true path on its own.
const autopilot = params.attract ? createAutopilot() : null;
const exitFace = {
  x: cellToWorld(level.exit.x) + DIR_STEP[level.exitSide].x * WALL_FACE_DISTANCE,
  z: cellToWorld(level.exit.y) + DIR_STEP[level.exitSide].y * WALL_FACE_DISTANCE,
};
if (autopilot) {
  phase = 'playing';
  showPhase();
}

overlay.addEventListener('click', () => {
  if (phase !== 'title' && phase !== 'paused') return;
  audio.unlock();
  lockPointer();
});
document.addEventListener('pointerlockerror', () => {
  lockError.hidden = false;
});
document.getElementById('retry-tape')?.addEventListener('click', () => location.assign(tapeUrl(location.href, seed)));
for (const button of document.querySelectorAll('.new-tape')) {
  button.addEventListener('click', () => location.assign(tapeUrl(location.href, null)));
}
document.addEventListener('pointerlockchange', () => {
  if (isLocked()) {
    lockError.hidden = true;
    input.skipNextMove();
  }
  input.clear();
  setPhase(isLocked() ? 'lock' : 'unlock');
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') audio.toggleMute();
  if ((e.code === 'BracketLeft' || e.code === 'BracketRight') && !e.repeat) {
    sensitivity = nudgeSensitivity(sensitivity, e.code === 'BracketRight' ? 1 : -1);
    try {
      localStorage.setItem(SENSITIVITY_KEY, String(sensitivity));
    } catch {
      // Storage blocked (private mode): the setting just won't persist.
    }
    hud.flash(sensitivityLabel(sensitivity));
  }
});
// A click while reading puts the note down (the pointer is still locked).
window.addEventListener('mousedown', () => {
  if (phase === 'reading') setPhase('closeNote');
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  // Zoom or moving to another monitor changes devicePixelRatio; re-read it so the VHS pass stays pixel-aligned.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  vhs.setSize(window.innerWidth, window.innerHeight);
});

const stepper = createFixedStepper();
let last = performance.now();

renderer.setAnimationLoop((now: number) => {
  const frameDt = (now - last) / 1000;
  last = now;
  const playing = phase === 'playing';

  // Look is applied every rendered frame; movement runs in fixed steps and is interpolated below.
  const frameInput =
    autopilot && playing
      ? autopilotInput(autopilot, player.pos, player.yaw, truePath, frameDt, exitFace)
      : playing
        ? input.moveInput(sensitivity)
        : NO_INPUT;
  if (playing && input.consumePressed('KeyN')) {
    toggleNightVision(camcorder);
    audio.click();
  }
  const target = playing ? findInteractable(items, taken, player.pos, player.yaw) : null;
  hud.setPrompt(target ? promptFor(target.kind) : null);
  if (input.consumePressed('KeyE')) {
    if (phase === 'reading') setPhase('closeNote');
    else if (target) interact(target);
  }
  // Reading keeps the pointer locked; don't let mouse moves or N presses pile up and fire on close.
  if (phase === 'reading') input.flush();
  applyLook(player, frameInput.lookDX, frameInput.lookDY);
  const stepInput = { ...frameInput, lookDX: 0, lookDY: 0 };
  const seesSmiler = entities.some(
    (e) =>
      e.kind === 'smiler' &&
      Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) / CELL_SIZE <= SMILER_FEAR_CELLS &&
      hasLineOfSight(level.grid, player.pos, e.pos),
  );
  const steps = stepper.advance(frameDt);
  for (let i = 0; i < steps; i++) {
    // Steps keep running when not playing (with no input) so interpolation settles instead of drifting.
    updatePlayer(player, stepInput, FIXED_DT, level.grid, furnitureAt);
    if (playing && reachedExit(level.exit, level.exitSide, player.pos)) {
      endTape('escape', now);
      break;
    }
    if (playing) {
      updateCamcorder(camcorder, FIXED_DT);
      recordedSec += FIXED_DT;
      const footstep = stepFootsteps(footsteps, FIXED_DT, player.moving, player.gait);
      const noises: NoiseEvent[] = footstep ? [{ x: player.pos.x, z: player.pos.z, radius: footstep }] : [];
      if (footstep !== null) {
        audio.footstep(footstepLevel(player.gait), player.gait === 'sprint', footWetness(inPuddle(player.pos.x, player.pos.z), isDark(level.grid, worldToCell(player.pos.x), worldToCell(player.pos.z))));
        const echo = maybeEcho(echoRng, footstep, player.pos, player.yaw, distortionFromSanity(sanity.value));
        if (echo) pendingEchoes.push({ at: now + echo.delaySec * 1000, x: echo.x, z: echo.z });
      }
      for (const event of updateDirector(director, FIXED_DT, footstep, directorRng)) onDirectorEvent(event, recordedSec * 1000);
      for (const e of entities) {
        updateEntity(e, FIXED_DT, {
          grid: level.grid,
          canEnter: e.kind === 'smiler' ? darkOnly : anyFloor,
          mayApproach: e.kind === 'smiler' ? (x, y) => isDark(level.grid, x, y) : () => true,
          rng: entityRng,
          player: player.pos,
          noises,
        });
        if (!params.god && !params.attract && caughtPlayer(e, player.pos)) {
          endTape('die', now);
          break;
        }
      }
      if (phase !== 'playing') break;
      if (!params.god && !params.attract) {
        const dark = isDark(level.grid, worldToCell(player.pos.x), worldToCell(player.pos.z));
        const fear = fearDrain(entities, player.pos, seesSmiler);
        updateSanity(sanity, FIXED_DT, { dark, nightVision: camcorder.nightVision, fear });
      }
    }
  }
  if (phase === 'playing' && isInsane(sanity)) endTape('die', now);
  if (endedAt !== null && !endRevealed && (now - endedAt) / 1000 >= (phase === 'escaped' ? ESCAPE_REVEAL_SEC : END_REVEAL_SEC)) {
    endRevealed = true;
    showPhase();
  }

  const a = stepper.alpha();
  camera.position.set(
    player.prevPos.x + (player.pos.x - player.prevPos.x) * a,
    player.prevEyeHeight + (player.eyeHeight - player.prevEyeHeight) * a,
    player.prevPos.z + (player.pos.z - player.prevPos.z) * a,
  );
  // Camcorder in hand: a small dip on each footstep and a slight sway.
  const bob = headBob(player);
  camera.position.y += bob.y;
  camera.rotation.set(player.pitch, player.yaw, bob.roll);
  if (phase === 'escaped' && endedAt !== null) {
    // Noclip: drop through the floor.
    const fall = (now - endedAt) / 1000;
    camera.position.y -= 4.9 * fall * fall;
  }
  const cellX = worldToCell(player.pos.x);
  const cellY = worldToCell(player.pos.z);
  streamer.update(cellX, cellY);
  // Presence/warning timers run on the tape clock, so they don't expire while paused.
  const gameMs = recordedSec * 1000;
  const activeBlackout = blackout && gameMs < blackout.until ? { x: blackout.x, z: blackout.z, radius: BLACKOUT_RADIUS } : null;
  const exposure = updatePanels(now / 1000, activeBlackout, gameMs < dimUntil, frameDt);
  renderer.shadowMap.needsUpdate = shadowFrame++ % 2 === 0;
  // Night vision has its own gain: a blackout or dim doesn't blind the IR picture.
  renderer.toneMappingExposure = EXPOSURE * (exposure + (1 - exposure) * camcorder.nvBlend);
  props.update(now / 1000);
  entityViews.sync(entities, a, frameDt, phase === 'playing', shade, (x, z) => headroomAt(level.grid, x, z, HOWLER_LOOKAHEAD));
  irLight.position.copy(camera.position);
  // Baked light multiplies every surface's albedo, the IR included; divide it back out so the
  // camcorder sees as far into a dark zone as it always did.
  irLight.intensity = (IR_INTENSITY * camcorder.nvBlend) / Math.max(AMBIENT_DARK, shade(camera.position.x, camera.position.z));

  hud.update({
    recording: playing || phase === 'reading' || (endedAt !== null && !endRevealed),
    battery: camcorder.battery,
    nightVision: camcorder.nightVision,
    clockMs: tapeStart + recordedSec * 1000,
  });
  debugHud?.update(frameDt, player, entities.map((e) => e.pos));

  while (pendingEchoes.length > 0 && pendingEchoes[0].at <= now) {
    const e = pendingEchoes.shift()!;
    audio.echoStep(e.x, e.z);
  }
  const nearestPanel = nearestLitLightsAt(level.grid, player.pos.x, player.pos.z, 1)[0];
  const howler = entities.find((e) => e.kind === 'howler');
  try {
    audio.setFrame({
    listener: { x: camera.position.x, z: camera.position.z, yaw: player.yaw },
    hum: humLevel(
      nearestPanel ? Math.hypot(cellToWorld(nearestPanel.x) - player.pos.x, cellToWorld(nearestPanel.y) - player.pos.z) : null,
      activeBlackout !== null,
    ),
    whisper: whisperLevel(distortionFromSanity(sanity.value)),
    smilers: entities.filter((e) => e.kind === 'smiler').map((e) => ({ id: e.id, x: e.pos.x, z: e.pos.z })),
    howler: howler ? { x: howler.pos.x, z: howler.pos.z, moving: howler.pos.x !== howler.prevPos.x || howler.pos.z !== howler.prevPos.z } : null,
    vent: nearestVent(player.pos.x, player.pos.z),
    paused: phase !== 'playing',
    });
  } catch (err) {
    // Audio is garnish: a browser quirk here must never freeze the picture.
    if (params.debug) console.warn('[backrooms] audio frame failed', err);
  }
  const t = now / 1000;
  const ending = endedAt !== null && !endRevealed;
  vhs.render({
    time: t,
    nightVision: camcorder.nvBlend,
    battery: camcorder.battery / 100,
    glitch: ending || gameMs < glitchUntil ? 1 : glitchAmount(t, glitchSeed, camcorder.battery),
    distortion: ending ? 1 : distortionFromSanity(sanity.value),
  });
});
