import * as THREE from 'three';
import { createAudioEngine } from './audio/engine';
import { footstepLevel, humLevel, maybeEcho, whisperLevel } from './audio/mix';
import { nextPhase, type Phase, type PhaseEvent } from './core/gameState';
import { autopilotInput, createAutopilot } from './game/autopilot';
import { createInput } from './core/input';
import { createFixedStepper, FIXED_DT } from './core/loop';
import { createRng, deriveSeed } from './core/rng';
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
import { createLightPool } from './lighting/lightPool';
import { nearestLitLightsAt, panelGlow } from './lighting/lights';
import { addBattery, createCamcorder, toggleNightVision, updateCamcorder } from './player/camcorder';
import { applyLook, createPlayer, NO_INPUT, updatePlayer } from './player/controller';
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
import { createChunkStreamer } from './world/streamer';
import { createWorldMaterials } from './world/textures';

const FOG_COLOR = 0x3b3318;
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

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.06);
scene.add(new THREE.HemisphereLight(0xfff2c4, 0x4a3f1c, 0.3));

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';
// The camcorder's infrared illuminator: always in the scene (stable light count), lit only in night vision.
const irLight = new THREE.PointLight(0xffffff, 0, 14, 1.5);
scene.add(irLight);

const params = parseParams(window.location.search);
const seed = params.seed ?? Math.floor(Math.random() * 0xffffffff) >>> 0;
const level = generateLevel(seed);
const materials = createWorldMaterials(createRng(deriveSeed(seed, 'textures')));
const streamer = createChunkStreamer(scene, level.grid, materials);
const lightPool = createLightPool(scene, level.grid, deriveSeed(seed, 'lights'));
const panelEmissive = materials.lightOn.emissiveIntensity;
const truePath = shortestPath(level.grid, level.start, level.exit);
const arrows = placeArrows(level.grid, truePath, createRng(deriveSeed(seed, 'clues')));
const items = placeItems(level, truePath, createRng(deriveSeed(seed, 'items')));
const props = createProps(scene, level, arrows, items, materials.wall.map);
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
  // Browsers refuse to re-lock for ~1 s after Esc; swallow that rejection — the next click works.
  Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
});
document.addEventListener('pointerlockerror', () => {
  lockError.hidden = false;
});
document.getElementById('retry-tape')?.addEventListener('click', () => location.assign(tapeUrl(location.href, seed)));
for (const button of document.querySelectorAll('.new-tape')) {
  button.addEventListener('click', () => location.assign(tapeUrl(location.href, null)));
}
document.addEventListener('pointerlockchange', () => {
  if (isLocked()) lockError.hidden = true;
  input.clear();
  setPhase(isLocked() ? 'lock' : 'unlock');
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') audio.toggleMute();
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
        ? input.moveInput()
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
    updatePlayer(player, stepInput, FIXED_DT, level.grid);
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
        audio.footstep(footstepLevel(player.gait), player.gait === 'sprint');
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
  camera.rotation.set(player.pitch, player.yaw, 0);
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
  lightPool.update(camera.position.x, camera.position.z, now / 1000, activeBlackout, gameMs < dimUntil);
  materials.lightOn.emissiveIntensity = panelEmissive * panelGlow(activeBlackout !== null, gameMs < dimUntil);
  props.update(now / 1000);
  entityViews.sync(entities, a, frameDt, phase === 'playing');
  irLight.position.copy(camera.position);
  irLight.intensity = IR_INTENSITY * camcorder.nvBlend;

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
