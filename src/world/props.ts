import * as THREE from 'three';
import type { Arrow } from './clues';
import type { Level } from './generator';
import { CELL_SIZE, cellToWorld, type Dir, DIR_STEP, WALL_HEIGHT } from './grid';
import type { Item } from './items';
import { WALL_FACE_DISTANCE } from './solids';

/** Y-rotation that turns a +Z-facing plane to face out of the given wall into the cell. */
const FACE_ROTATION: Record<Dir, number> = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };
/** Which way a plane's texture +u runs in the world for each wall side. */
const TEXTURE_RIGHT: Record<Dir, Dir> = { N: 'E', S: 'W', W: 'N', E: 'S' };

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A hand-painted red arrow pointing +u, with drips. */
function arrowTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = 'rgba(128, 22, 14, 0.92)';
    ctx.strokeStyle = 'rgba(128, 22, 14, 0.92)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(24, 64);
    ctx.lineTo(196, 60);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(232, 62);
    ctx.lineTo(170, 22);
    ctx.lineTo(176, 102);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 4;
    for (const x of [60, 110, 150, 190]) {
      ctx.beginPath();
      ctx.moveTo(x, 70);
      ctx.lineTo(x + 2, 70 + 18 + (x % 3) * 8);
      ctx.stroke();
    }
  });
}

function paperTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 176, (ctx) => {
    ctx.fillStyle = '#e9e1cc';
    ctx.fillRect(0, 0, 128, 176);
    ctx.strokeStyle = 'rgba(40, 40, 70, 0.55)';
    ctx.lineWidth = 2;
    for (let y = 24; y < 160; y += 14) {
      ctx.beginPath();
      ctx.moveTo(14, y);
      for (let x = 14; x < 114; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.7 + y) * 2);
      ctx.stroke();
    }
  });
}

/** Wallpaper with rows shearing and sparking — the noclip wall. `uMap` is assigned by the caller. */
function noclipMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uMap: { value: null } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform sampler2D uMap;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        float t = fract(uTime / 100.0) * 100.0;
        float row = floor(vUv.y * 40.0);
        float shear = (hash(vec2(row, floor(t * 6.0))) - 0.5) * 0.12;
        vec3 c = texture2D(uMap, vUv + vec2(shear, 0.0)).rgb * 0.75;
        float spark = step(0.985, hash(floor(vUv * vec2(60.0, 80.0)) + floor(t * 8.0)));
        c = mix(c, vec3(1.0), spark * 0.7);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

/** Position on the face of `side` wall of `cell`, pulled `offset` metres into the cell. */
function wallFacePosition(cell: { x: number; y: number }, side: Dir, offset: number, height: number): THREE.Vector3 {
  const s = DIR_STEP[side];
  return new THREE.Vector3(
    cellToWorld(cell.x) + s.x * (WALL_FACE_DISTANCE - offset),
    height,
    cellToWorld(cell.y) + s.y * (WALL_FACE_DISTANCE - offset),
  );
}

export function createProps(
  scene: THREE.Scene,
  level: Level,
  arrows: readonly Arrow[],
  items: readonly Item[],
  wallMap: THREE.Texture | null,
) {
  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);

  // Arrows: decals on wall faces.
  const arrowMap = arrowTexture();
  // Mirrored copy for arrows pointing the other way (rotating 180° would flip the drips upward).
  const mirroredMap = arrowMap.clone();
  mirroredMap.repeat.x = -1;
  mirroredMap.offset.x = 1;
  const decal = (map: THREE.Texture) =>
    new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      roughness: 0.9,
    });
  const arrowMat = decal(arrowMap);
  const arrowMatMirrored = decal(mirroredMap);
  const arrowGeo = new THREE.PlaneGeometry(1.2, 0.6);
  for (const a of arrows) {
    const mesh = new THREE.Mesh(arrowGeo, TEXTURE_RIGHT[a.wall] === a.points ? arrowMat : arrowMatMirrored);
    mesh.position.copy(wallFacePosition(a.cell, a.wall, 0.01, 1.35));
    mesh.rotation.y = FACE_ROTATION[a.wall];
    group.add(mesh);
  }

  // Items.
  const batteryGeo = new THREE.BoxGeometry(0.18, 0.07, 0.1);
  const batteryMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, emissive: 0x442200, roughness: 0.5 });
  const bottleGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.24, 12);
  const bottleMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.25, transparent: true, opacity: 0.85 });
  const capGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x3355aa, roughness: 0.4 });
  const paperGeo = new THREE.PlaneGeometry(0.21, 0.29).rotateX(-Math.PI / 2);
  const paperMat = new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 0.95 });
  const itemMeshes = new Map<number, THREE.Object3D>();
  for (const item of items) {
    let obj: THREE.Object3D;
    if (item.kind === 'battery') {
      obj = new THREE.Mesh(batteryGeo, batteryMat);
      obj.position.y = 0.035;
    } else if (item.kind === 'almondWater') {
      const bottle = new THREE.Group();
      const body = new THREE.Mesh(bottleGeo, bottleMat);
      body.position.y = 0.12;
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 0.255;
      bottle.add(body, cap);
      obj = bottle;
    } else {
      obj = new THREE.Mesh(paperGeo, paperMat);
      obj.position.y = 0.005;
    }
    obj.position.x = cellToWorld(item.cell.x);
    obj.position.z = cellToWorld(item.cell.y);
    obj.rotation.y = ((item.id * 2.399) % (Math.PI * 2)) - Math.PI;
    group.add(obj);
    itemMeshes.set(item.id, obj);
  }

  // The noclip wall.
  const noclip = noclipMaterial();
  // Assigned after creation: UniformsUtils.merge would otherwise clone the texture.
  noclip.uniforms.uMap.value = wallMap;
  const exitWall = new THREE.Mesh(new THREE.PlaneGeometry(CELL_SIZE, WALL_HEIGHT), noclip);
  exitWall.position.copy(wallFacePosition(level.exit, level.exitSide, 0.02, WALL_HEIGHT / 2));
  exitWall.rotation.y = FACE_ROTATION[level.exitSide];
  group.add(exitWall);

  return {
    update(timeSec: number): void {
      noclip.uniforms.uTime.value = timeSec;
    },
    hideItem(id: number): void {
      const obj = itemMeshes.get(id);
      if (obj) obj.visible = false;
    },
  };
}
