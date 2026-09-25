import * as THREE from 'three';
import { isLightCell } from '../lighting/lights';
import { CHUNK_CELLS } from './chunks';
import { Cell, CELL_SIZE, cellToWorld, type Grid, getCell, isDark, PILLAR_SIZE, WALL_HEIGHT } from './grid';
import { solidRects } from './solids';
import type { WorldMaterials } from './textures';

/** Baked light (0..1) for a cell — see src/lighting/bake.ts. */
export type LightField = (x: number, y: number) => number;

/** Metres of floor one carpet texture covers before it repeats (laid in world space, not per cell). */
export const CARPET_METRES = 8;

// Shared by every chunk; never disposed.
/** Unit box, scaled per instance to each thin wall slab. */
const wallGeo = new THREE.BoxGeometry(1, 1, 1);
const pillarGeo = new THREE.BoxGeometry(PILLAR_SIZE, WALL_HEIGHT, PILLAR_SIZE);
const ceilingGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE).rotateX(Math.PI / 2);

interface Instance {
  x: number;
  y: number;
  z: number;
  /** Scale (only used by wall slabs). */
  sx?: number;
  sz?: number;
  light: number;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Instance[], scaleY = 1): THREE.InstancedMesh | null {
  if (items.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  items.forEach((it, i) => {
    pos.set(it.x, it.y, it.z);
    scale.set(it.sx ?? 1, scaleY, it.sz ?? 1);
    mesh.setMatrixAt(i, m.compose(pos, rot, scale));
    mesh.setColorAt(i, color.setScalar(it.light));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Walls fully enclosed by other walls can never be seen — skip them. */
function isExposedWall(grid: Grid, x: number, y: number): boolean {
  return (
    getCell(grid, x + 1, y) !== Cell.Wall ||
    getCell(grid, x - 1, y) !== Cell.Wall ||
    getCell(grid, x, y + 1) !== Cell.Wall ||
    getCell(grid, x, y - 1) !== Cell.Wall
  );
}

/**
 * One carpet plane for the whole chunk: vertex colours carry the baked light (averaged at cell
 * corners, so it shades smoothly) and UVs are world-space, so the carpet never visibly tiles per cell.
 */
function floorPlane(x0: number, y0: number, w: number, h: number, light: LightField, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w * CELL_SIZE, h * CELL_SIZE, w, h).rotateX(-Math.PI / 2);
  const ox = x0 * CELL_SIZE + (w * CELL_SIZE) / 2;
  const oz = y0 * CELL_SIZE + (h * CELL_SIZE) / 2;
  geo.translate(ox, 0, oz);
  const posAttr = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const colors = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i++) {
    const wx = posAttr.getX(i);
    const wz = posAttr.getZ(i);
    uv.setXY(i, wx / CARPET_METRES, -wz / CARPET_METRES);
    // The four cells meeting at this corner.
    const cx = Math.round(wx / CELL_SIZE);
    const cz = Math.round(wz / CELL_SIZE);
    const l = (light(cx - 1, cz - 1) + light(cx, cz - 1) + light(cx - 1, cz) + light(cx, cz)) / 4;
    colors[i * 3] = l;
    colors[i * 3 + 1] = l;
    colors[i * 3 + 2] = l;
  }
  uv.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, mat);
}

export function buildChunk(grid: Grid, cx: number, cy: number, mats: WorldMaterials, light: LightField): THREE.Group {
  const walls: Instance[] = [];
  const pillars: Instance[] = [];
  const ceilings: Instance[] = [];
  const lightsOn: Instance[] = [];
  const lightsOff: Instance[] = [];

  const x0 = cx * CHUNK_CELLS;
  const y0 = cy * CHUNK_CELLS;
  const x1 = Math.min(x0 + CHUNK_CELLS, grid.width);
  const y1 = Math.min(y0 + CHUNK_CELLS, grid.height);

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const wx = cellToWorld(x);
      const wz = cellToWorld(y);
      const c = getCell(grid, x, y);
      if (c === Cell.Wall) {
        if (!isExposedWall(grid, x, y)) continue;
        // A wall is as bright as the brightest room it faces.
        const wallLight = Math.max(light(x + 1, y), light(x - 1, y), light(x, y + 1), light(x, y - 1));
        for (const r of solidRects(grid, x, y)) {
          walls.push({
            x: (r.minX + r.maxX) / 2,
            y: WALL_HEIGHT / 2,
            z: (r.minZ + r.maxZ) / 2,
            sx: r.maxX - r.minX,
            sz: r.maxZ - r.minZ,
            light: wallLight,
          });
        }
        ceilings.push({ x: wx, y: WALL_HEIGHT, z: wz, light: wallLight });
        continue;
      }
      const l = light(x, y);
      if (c === Cell.Pillar) pillars.push({ x: wx, y: WALL_HEIGHT / 2, z: wz, light: l });
      if (isLightCell(grid, x, y)) (isDark(grid, x, y) ? lightsOff : lightsOn).push({ x: wx, y: WALL_HEIGHT, z: wz, light: 1 });
      else ceilings.push({ x: wx, y: WALL_HEIGHT, z: wz, light: l });
    }
  }

  const group = new THREE.Group();
  group.name = `chunk ${cx},${cy}`;
  group.add(floorPlane(x0, y0, x1 - x0, y1 - y0, light, mats.floor));
  const meshes = [
    instanced(wallGeo, mats.wall, walls, WALL_HEIGHT),
    instanced(pillarGeo, mats.wall, pillars),
    instanced(ceilingGeo, mats.ceiling, ceilings),
    instanced(ceilingGeo, mats.lightOn, lightsOn),
    instanced(ceilingGeo, mats.lightOff, lightsOff),
  ];
  for (const mesh of meshes) if (mesh) group.add(mesh);
  return group;
}

/** Frees per-chunk GPU buffers. Shared geometries and materials stay alive. */
export function disposeChunk(group: THREE.Group): void {
  for (const child of group.children) {
    if (child instanceof THREE.InstancedMesh) child.dispose();
    else if (child instanceof THREE.Mesh) child.geometry.dispose(); // per-chunk floor plane
  }
}
