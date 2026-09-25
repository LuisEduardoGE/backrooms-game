import * as THREE from 'three';
import type { Arrow } from './clues';
import type { Level } from './generator';
import { CELL_SIZE, cellToWorld, type Dir, DIR_STEP, WALL_HEIGHT } from './grid';
import type { Item } from './items';
import { WALL_FACE_DISTANCE } from './solids';
import { type Paper, paperFor, wallHeightShade } from './chunkMesh';

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

/**
 * The noclip wall: the very same lit, embossed wallpaper as every other wall (so it is not a flat
 * tell from across the room), but up close its rows shear and it sparks now and then.
 */
function noclipMaterial(wall: THREE.MeshStandardMaterial, time: { value: number }): THREE.MeshStandardMaterial {
  const mat = wall.clone();
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  const lit = wall.onBeforeCompile.bind(wall);
  mat.onBeforeCompile = (shader, renderer) => {
    lit(shader, renderer);
    shader.uniforms.uTime = time;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;\nfloat noclipHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        float nt = fract(uTime / 100.0) * 100.0;
        float nrow = floor(vMapUv.y * 40.0);
        // Most of the time only a few rows slip; now and then the whole wall tears.
        float burst = step(0.8, noclipHash(vec2(floor(nt * 1.5), 7.0)));
        float slip = step(0.85 - burst * 0.5, noclipHash(vec2(nrow, floor(nt * 6.0))));
        vec2 shearUv = vMapUv + vec2((noclipHash(vec2(nrow, floor(nt * 6.0) + 1.0)) - 0.5) * 0.08 * slip, 0.0);
        vec4 sampledDiffuseColor = texture2D(map, shearUv);
        diffuseColor *= sampledDiffuseColor;
        float spark = step(0.996 - burst * 0.01, noclipHash(floor(vMapUv * vec2(60.0, 80.0)) + floor(nt * 8.0)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.6), spark * 0.6);`,
      );
  };
  mat.customProgramCacheKey = () => `noclip:${wall.customProgramCacheKey()}`;
  return mat;
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
  /** The wall papers by name (see chunkMesh paperFor): the exit wears the same paper as its wall. */
  papers: Record<Paper, THREE.MeshStandardMaterial>,
  /** Baked light at a world point; props sit in the same light as the surfaces around them. */
  shade: (x: number, z: number) => number = () => 1,
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
    const mat = (TEXTURE_RIGHT[a.wall] === a.points ? arrowMat : arrowMatMirrored).clone();
    const mesh = new THREE.Mesh(arrowGeo, mat);
    mesh.position.copy(wallFacePosition(a.cell, a.wall, 0.06, 1.35));
    mat.color.multiplyScalar(shade(mesh.position.x, mesh.position.z));
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
    const l = shade(obj.position.x, obj.position.z);
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = (o.material as THREE.MeshStandardMaterial).clone();
        (o.material as THREE.MeshStandardMaterial).color.multiplyScalar(l);
      }
    });
    group.add(obj);
    itemMeshes.set(item.id, obj);
  }

  // The noclip wall: a wall-sized quad just in front of the real face, UVs in the walls' world-metre
  // mapping and vertex colours from the baked light, so it matches the wall it replaces.
  const time = { value: 0 };
  const n = DIR_STEP[level.exitSide];
  const [nx, nz] = [-n.x, -n.y]; // the face looks back into the cell
  const face = wallFacePosition(level.exit, level.exitSide, 0, 0);
  const noclip = noclipMaterial(papers[paperFor(nx, nz, face.x, face.z)], time);
  const exitGeo = new THREE.PlaneGeometry(CELL_SIZE, WALL_HEIGHT, 4, 8);
  const exitWall = new THREE.Mesh(exitGeo, noclip);
  // Behind the baseboard's front (1.5 cm proud), in front of the wallpaper.
  exitWall.position.copy(wallFacePosition(level.exit, level.exitSide, 0.005, WALL_HEIGHT / 2));
  exitWall.rotation.y = FACE_ROTATION[level.exitSide];
  const left = exitWall.position.clone().addScaledVector(new THREE.Vector3(nz, 0, -nx), -CELL_SIZE / 2);
  const u0 = left.x * nz - left.z * nx;
  const light = shade(exitWall.position.x + nx * 0.1, exitWall.position.z + nz * 0.1);
  const uv = exitGeo.getAttribute('uv');
  const pos = exitGeo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + WALL_HEIGHT / 2;
    uv.setXY(i, u0 + uv.getX(i) * CELL_SIZE, y);
    colors.fill(light * wallHeightShade(y), i * 3, i * 3 + 3);
  }
  exitGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  group.add(exitWall);

  return {
    update(timeSec: number): void {
      time.value = timeSec;
    },
    hideItem(id: number): void {
      const obj = itemMeshes.get(id);
      if (obj) obj.visible = false;
    },
  };
}
