import * as THREE from 'three';
import { isLightCell } from '../lighting/lights';
import { CHUNK_CELLS } from './chunks';
import { Cell, CELL_SIZE, cellToWorld, type Grid, getCell, isDark, PILLAR_SIZE, WALL_HEIGHT } from './grid';
import type { WorldMaterials } from './textures';

// Shared by every chunk; never disposed.
const wallGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
const pillarGeo = new THREE.BoxGeometry(PILLAR_SIZE, WALL_HEIGHT, PILLAR_SIZE);
const floorGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE).rotateX(-Math.PI / 2);
const ceilingGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE).rotateX(Math.PI / 2);

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, positions: number[]): THREE.InstancedMesh | null {
  const count = positions.length / 3;
  if (count === 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m.makeTranslation(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
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

export function buildChunk(grid: Grid, cx: number, cy: number, mats: WorldMaterials): THREE.Group {
  const walls: number[] = [];
  const pillars: number[] = [];
  const floors: number[] = [];
  const ceilings: number[] = [];
  const lightsOn: number[] = [];
  const lightsOff: number[] = [];

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
        if (isExposedWall(grid, x, y)) walls.push(wx, WALL_HEIGHT / 2, wz);
        continue;
      }
      if (c === Cell.Pillar) pillars.push(wx, WALL_HEIGHT / 2, wz);
      floors.push(wx, 0, wz);
      if (isLightCell(grid, x, y)) (isDark(grid, x, y) ? lightsOff : lightsOn).push(wx, WALL_HEIGHT, wz);
      else ceilings.push(wx, WALL_HEIGHT, wz);
    }
  }

  const group = new THREE.Group();
  group.name = `chunk ${cx},${cy}`;
  const meshes = [
    instanced(wallGeo, mats.wall, walls),
    instanced(pillarGeo, mats.wall, pillars),
    instanced(floorGeo, mats.floor, floors),
    instanced(ceilingGeo, mats.ceiling, ceilings),
    instanced(ceilingGeo, mats.lightOn, lightsOn),
    instanced(ceilingGeo, mats.lightOff, lightsOff),
  ];
  for (const mesh of meshes) if (mesh) group.add(mesh);
  return group;
}

/** Frees per-chunk GPU buffers. Geometries and materials are shared and stay alive. */
export function disposeChunk(group: THREE.Group): void {
  for (const child of group.children) if (child instanceof THREE.InstancedMesh) child.dispose();
}
