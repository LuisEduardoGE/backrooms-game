import './style.css';
import * as THREE from 'three';
import { nextPhase, type Phase, type PhaseEvent } from './core/gameState';
import { createInput } from './core/input';
import { createFixedStepper, FIXED_DT } from './core/loop';
import { createRng, deriveSeed } from './core/rng';
import { createVhsComposer } from './fx/composer';
import { glitchAmount } from './fx/glitch';
import { findInteractable, promptFor } from './game/interact';
import { NOTES } from './game/notes';
import { createSanity, distortionFromSanity, drinkAlmondWater, isInsane, updateSanity } from './game/sanity';
import { createLightPool } from './lighting/lightPool';
import { addBattery, createCamcorder, toggleNightVision, updateCamcorder } from './player/camcorder';
import { applyLook, createPlayer, NO_INPUT, updatePlayer } from './player/controller';
import { createDebugHud } from './ui/debugHud';
import { createHud } from './ui/hud';
import { createNoteReader } from './ui/noteReader';
import { formatDuration, tapeStartTime } from './ui/osd';
import { parseParams, tapeUrl } from './ui/params';
import { placeArrows, shortestPath } from './world/clues';
import { reachedExit } from './world/exit';
import { generateLevel } from './world/generator';
import { cellToWorld, isDark, worldToCell } from './world/grid';
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
const truePath = shortestPath(level.grid, level.start, level.exit);
const arrows = placeArrows(level.grid, truePath, createRng(deriveSeed(seed, 'clues')));
const items = placeItems(level, truePath, createRng(deriveSeed(seed, 'items')));
const props = createProps(scene, level, arrows, items, materials.wall.map);
const taken = new Set<number>();
let notesFound = 0;
const sanity = createSanity();
const noteReader = createNoteReader(document.body);
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
  setPhase(event);
  endedAt = now;
  const stats = `RECORDED ${formatDuration(recordedSec)} · NOTES ${notesFound}/${ITEM_COUNTS.note}`;
  for (const el of document.querySelectorAll<HTMLElement>('.stats')) el.textContent = stats;
  document.exitPointerLock();
}
showPhase();

overlay.addEventListener('click', () => {
  if (phase !== 'title' && phase !== 'paused') return;
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
  const frameInput = playing ? input.moveInput() : NO_INPUT;
  if (playing && input.consumePressed('KeyN')) toggleNightVision(camcorder);
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
      if (!params.god) {
        const dark = isDark(level.grid, worldToCell(player.pos.x), worldToCell(player.pos.z));
        updateSanity(sanity, FIXED_DT, { dark, nightVision: camcorder.nightVision });
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
  lightPool.update(camera.position.x, camera.position.z, now / 1000);
  props.update(now / 1000);
  irLight.position.copy(camera.position);
  irLight.intensity = IR_INTENSITY * camcorder.nvBlend;

  hud.update({
    recording: playing,
    battery: camcorder.battery,
    nightVision: camcorder.nightVision,
    clockMs: tapeStart + recordedSec * 1000,
  });
  debugHud?.update(frameDt, player);

  const t = now / 1000;
  const ending = endedAt !== null && !endRevealed;
  vhs.render({
    time: t,
    nightVision: camcorder.nvBlend,
    battery: camcorder.battery / 100,
    glitch: ending ? 1 : glitchAmount(t, glitchSeed, camcorder.battery),
    distortion: ending ? 1 : distortionFromSanity(sanity.value),
  });
});
