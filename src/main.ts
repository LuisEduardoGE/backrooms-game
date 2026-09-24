import './style.css';
import * as THREE from 'three';
import { createInput } from './core/input';
import { createFixedStepper, FIXED_DT } from './core/loop';
import { createRng, deriveSeed } from './core/rng';
import { createVhsComposer } from './fx/composer';
import { glitchAmount } from './fx/glitch';
import { createLightPool } from './lighting/lightPool';
import { createCamcorder, toggleNightVision, updateCamcorder } from './player/camcorder';
import { applyLook, createPlayer, NO_INPUT, updatePlayer } from './player/controller';
import { createDebugHud } from './ui/debugHud';
import { createHud } from './ui/hud';
import { tapeStartTime } from './ui/osd';
import { parseParams } from './ui/params';
import { generateLevel } from './world/generator';
import { cellToWorld, worldToCell } from './world/grid';
import { createChunkStreamer } from './world/streamer';
import { createWorldMaterials } from './world/textures';

const FOG_COLOR = 0x3b3318;
/** Peak intensity of the camcorder's infrared illuminator in night vision. */
const IR_INTENSITY = 6;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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
const player = createPlayer({ x: cellToWorld(level.start.x), z: cellToWorld(level.start.y) }, level.startYaw);
const debugHud = params.debug ? createDebugHud(level) : null;
if (params.debug) console.info(`[backrooms] seed ${seed} — reload with ?debug&seed=${seed} to replay`);

const camcorder = createCamcorder();
const glitchSeed = deriveSeed(seed, 'glitch');
const vhs = createVhsComposer(renderer, scene, camera, window.innerWidth, window.innerHeight);
const hud = createHud(document.body);
const tapeStart = tapeStartTime(seed);
/** Seconds of footage recorded; only advances while recording. */
let recordedSec = 0;

const isLocked = () => document.pointerLockElement === canvas;
const input = createInput(window, isLocked);
overlay.addEventListener('click', () => canvas.requestPointerLock());
document.addEventListener('pointerlockchange', () => {
  overlay.hidden = isLocked();
  if (!isLocked()) input.clear();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  vhs.setSize(window.innerWidth, window.innerHeight);
});

const stepper = createFixedStepper();
let last = performance.now();

renderer.setAnimationLoop((now: number) => {
  const frameDt = (now - last) / 1000;
  last = now;

  // Look is applied every rendered frame; movement runs in fixed steps and is interpolated below.
  const frameInput = isLocked() ? input.moveInput() : NO_INPUT;
  if (isLocked() && input.consumePressed('KeyN')) toggleNightVision(camcorder);
  applyLook(player, frameInput.lookDX, frameInput.lookDY);
  const stepInput = { ...frameInput, lookDX: 0, lookDY: 0 };
  const steps = stepper.advance(frameDt);
  for (let i = 0; i < steps; i++) {
    updatePlayer(player, stepInput, FIXED_DT, level.grid);
    if (isLocked()) {
      updateCamcorder(camcorder, FIXED_DT);
      recordedSec += FIXED_DT;
    }
  }

  const a = stepper.alpha();
  camera.position.set(
    player.prevPos.x + (player.pos.x - player.prevPos.x) * a,
    player.prevEyeHeight + (player.eyeHeight - player.prevEyeHeight) * a,
    player.prevPos.z + (player.pos.z - player.prevPos.z) * a,
  );
  camera.rotation.set(player.pitch, player.yaw, 0);
  const cellX = worldToCell(player.pos.x);
  const cellY = worldToCell(player.pos.z);
  streamer.update(cellX, cellY);
  lightPool.update(camera.position.x, camera.position.z, now / 1000);
  debugHud?.update(frameDt, player);
  hud.update({
    recording: isLocked(),
    battery: camcorder.battery,
    nightVision: camcorder.nightVision,
    clockMs: tapeStart + recordedSec * 1000,
  });
  irLight.position.copy(camera.position);
  irLight.intensity = IR_INTENSITY * camcorder.nvBlend;
  const t = now / 1000;
  vhs.render({
    time: t,
    nightVision: camcorder.nvBlend,
    battery: camcorder.battery / 100,
    glitch: glitchAmount(t, glitchSeed, camcorder.battery),
  });
});
