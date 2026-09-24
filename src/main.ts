import './style.css';
import * as THREE from 'three';
import { createInput } from './core/input';
import { createFixedStepper, FIXED_DT } from './core/loop';
import { createRng, deriveSeed } from './core/rng';
import { createPlayer, NO_INPUT, updatePlayer } from './player/controller';
import { generateLevel } from './world/generator';
import { cellToWorld, worldToCell } from './world/grid';
import { createChunkStreamer } from './world/streamer';
import { createWorldMaterials } from './world/textures';

const FOG_COLOR = 0x3b3318;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.06);
scene.add(new THREE.HemisphereLight(0xfff2c4, 0x4a3f1c, 0.6));

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';

const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
const level = generateLevel(seed);
const materials = createWorldMaterials(createRng(deriveSeed(seed, 'textures')));
const streamer = createChunkStreamer(scene, level.grid, materials);
const player = createPlayer({ x: cellToWorld(level.start.x), z: cellToWorld(level.start.y) });

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
});

const stepper = createFixedStepper();
let last = performance.now();

renderer.setAnimationLoop((now: number) => {
  const frameDt = (now - last) / 1000;
  last = now;

  const steps = stepper.advance(frameDt);
  for (let i = 0; i < steps; i++) {
    updatePlayer(player, isLocked() ? input.moveInput() : NO_INPUT, FIXED_DT, level.grid);
  }

  camera.position.set(player.pos.x, player.eyeHeight, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  streamer.update(worldToCell(player.pos.x), worldToCell(player.pos.z));
  renderer.render(scene, camera);
});
