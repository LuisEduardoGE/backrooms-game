import * as THREE from 'three';
import { isLightCell } from '../lighting/lights';
import { contactShadow, type LightField, lightAt } from '../lighting/sample';
import { CHUNK_CELLS } from './chunks';
import { CELL_SIZE, cellToWorld, type Grid, isDark, WALL_HEIGHT } from './grid';
import { CEILING_TILE, type WorldMaterials } from './textures';
import { faceStyle, type OutletSpot, outletSpots, type Paper, type WallQuad, wallQuads } from './wallFaces';

export type { LightField };

/** Bumper rail on some walls (the photo's thin brown rail; there is no white skirting). */
const RAIL_Y0 = 0.22;
const RAIL_Y1 = 0.25;
const RAIL_D = 0.012;
/** Outlet plate: width, height, depth (metres) and the height of its centre. */
const OUTLET = { w: 0.07, h: 0.115, d: 0.006, y: 0.3 };
/** Longest wall/floor/ceiling segment between shading vertices (metres). */
const SEG = 1;
/** Rows of shading vertices up a wall: dense near the floor and ceiling where the shadows are. */
const WALL_ROWS = [0, 0.12, 0.4, 1.2, 2.2, 2.55, WALL_HEIGHT];
/** Brightness of a dark-zone panel (a dead tube, barely visible). */
export const PANEL_OFF = 0.01;

/** A square 2×2 ft panel over every lit cell: exactly the ceiling tile at the cell's centre. */
const trofferGeo = new THREE.PlaneGeometry(CEILING_TILE, CEILING_TILE).rotateX(Math.PI / 2);

/** Soft, low-frequency damp patches on the carpet (deterministic value noise, 0..1 darkening). */
function hash(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz) * (1 - sx) + hash(ix + 1, iz) * sx;
  const b = hash(ix, iz + 1) * (1 - sx) + hash(ix + 1, iz + 1) * sx;
  return a * (1 - sz) + b * sz;
}
function damp(wx: number, wz: number): number {
  const n = valueNoise(wx / 6, wz / 6) * 0.65 + valueNoise(wx / 2.3 + 17, wz / 2.3 - 5) * 0.35;
  const t = Math.min(1, Math.max(0, (n - 0.58) / 0.2));
  return 1 - 0.22 * t * t * (3 - 2 * t);
}

/** Light pooling on the ceiling tiles right around a lit panel. */
function ceilingGlow(grid: Grid, wx: number, wz: number): number {
  const cx = Math.floor(wx / CELL_SIZE);
  const cz = Math.floor(wz / CELL_SIZE);
  let g = 0;
  for (let y = cz - 1; y <= cz + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (!isLightCell(grid, x, y) || isDark(grid, x, y)) continue;
      const d2 = (cellToWorld(x) - wx) ** 2 + (trofferZ(y) - wz) ** 2;
      // A tight halo: with a panel every 2 m, wide glows would light the whole ceiling evenly.
      g += 0.35 * Math.exp(-d2 / 0.3);
    }
  }
  return 1 + g;
}

function trofferZ(y: number): number {
  return cellToWorld(y);
}

/** Accumulates positions / normals / uvs / colours / indices for one merged mesh. */
class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: number): number {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(c, c, c);
    return this.pos.length / 3 - 1;
  }
  /**
   * A grid of vertices (cols × rows) already pushed from `first`, row-major. Unflipped, each quad
   * is wound (a, right, up) — front-facing when columns run left→right and rows bottom→top.
   */
  grid(first: number, cols: number, rows: number, flip = false): void {
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = first + r * cols + c;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        if (flip) this.idx.push(a, d, b, b, d, e);
        else this.idx.push(a, b, d, b, e, d);
      }
    }
  }
  mesh(mat: THREE.Material): THREE.Mesh | null {
    if (this.idx.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    geo.computeBoundingSphere();
    return new THREE.Mesh(geo, mat);
  }
}

/** Shading for a wall point: room light × corner occlusion × darkening where it meets floor and ceiling. */
/** Light and corner occlusion just in front of a point along a wall (the same for every height). */
function wallColumn(grid: Grid, light: LightField, q: WallQuad, t: number): [number, number] {
  const x = q.x0 + (q.x1 - q.x0) * t + q.nx * 0.06;
  const z = q.z0 + (q.z1 - q.z0) * t + q.nz * 0.06;
  // The wall itself is right behind the probe, so a flat wall reads ~0.8 — rescale so only
  // corners (and columns beside it) darken.
  return [lightAt(grid, light, x, z), Math.min(1, contactShadow(grid, x, z) / 0.8)];
}

/** Darkening where a wall meets the floor and the ceiling (shared with the noclip exit wall). */
export function wallHeightShade(y: number): number {
  return (1 - 0.28 * Math.exp(-y / 0.22)) * (1 - 0.18 * Math.exp(-(WALL_HEIGHT - y) / 0.25));
}

function wallShade([light, corner]: [number, number], y: number): number {
  // Corner shadow is strongest near the floor.
  const cornerAO = 1 - (1 - corner) * (0.55 + 0.45 * Math.exp(-y / 0.6));
  return light * cornerAO * wallHeightShade(y);
}

function addWall(b: Builder, grid: Grid, light: LightField, q: WallQuad): void {
  const len = Math.hypot(q.x1 - q.x0, q.z1 - q.z0);
  const cols = Math.max(1, Math.ceil(len / SEG)) + 1;
  const first = b.pos.length / 3;
  const column = Array.from({ length: cols }, (_, i) => wallColumn(grid, light, q, i / (cols - 1)));
  for (const y of WALL_ROWS) {
    for (let i = 0; i < cols; i++) {
      const t = i / (cols - 1);
      const x = q.x0 + (q.x1 - q.x0) * t;
      const z = q.z0 + (q.z1 - q.z0) * t;
      b.vert(x, y, z, q.nx, 0, q.nz, q.u0 + (q.u1 - q.u0) * t, y, wallShade(column[i], y));
    }
  }
  b.grid(first, cols, WALL_ROWS.length);
}

/** A thin strip standing proud of the wall between heights y0 and y1: front, top and bottom faces. */
function addStrip(b: Builder, grid: Grid, light: LightField, q: WallQuad, y0: number, y1: number, depth: number): void {
  const ox = q.nx * depth;
  const oz = q.nz * depth;
  const len = Math.hypot(q.x1 - q.x0, q.z1 - q.z0);
  // Extend by the depth at both ends so outside corners close up.
  const ex = ((q.x1 - q.x0) / len) * depth;
  const ez = ((q.z1 - q.z0) / len) * depth;
  const shade = (t: number) => wallShade(wallColumn(grid, light, q, t), (y0 + y1) / 2);
  const s0 = shade(0);
  const s1 = shade(1);
  const [ax, az, bx, bz] = [q.x0 - ex + ox, q.z0 - ez + oz, q.x1 + ex + ox, q.z1 + ez + oz];
  let f = b.vert(ax, y0, az, q.nx, 0, q.nz, 0, 0, s0);
  b.vert(bx, y0, bz, q.nx, 0, q.nz, 1, 0, s1);
  b.vert(ax, y1, az, q.nx, 0, q.nz, 0, 1, s0);
  b.vert(bx, y1, bz, q.nx, 0, q.nz, 1, 1, s1);
  b.grid(f, 2, 2);
  f = b.vert(ax - ox, y1, az - oz, 0, 1, 0, 0, 0, s0);
  b.vert(bx - ox, y1, bz - oz, 0, 1, 0, 1, 0, s1);
  b.vert(ax, y1, az, 0, 1, 0, 0, 1, s0);
  b.vert(bx, y1, bz, 0, 1, 0, 1, 1, s1);
  b.grid(f, 2, 2, true);
  f = b.vert(ax - ox, y0, az - oz, 0, -1, 0, 0, 0, s0 * 0.7);
  b.vert(bx - ox, y0, bz - oz, 0, -1, 0, 1, 0, s1 * 0.7);
  b.vert(ax, y0, az, 0, -1, 0, 0, 1, s0 * 0.7);
  b.vert(bx, y0, bz, 0, -1, 0, 1, 1, s1 * 0.7);
  b.grid(f, 2, 2);
}

/** A horizontal plane over the whole chunk at 1 m vertex spacing, UVs in world metres. */
function addPlane(b: Builder, x0: number, z0: number, w: number, h: number, y: number, up: boolean, shade: (x: number, z: number) => number): void {
  const cols = Math.round(w / SEG) + 1;
  const rows = Math.round(h / SEG) + 1;
  const first = b.pos.length / 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * SEG;
      const z = z0 + r * SEG;
      b.vert(x, y, z, 0, up ? 1 : -1, 0, x, up ? -z : z, shade(x, z));
    }
  }
  // Rows run +z and columns +x, so the unflipped winding faces down (x̂ × ẑ = −ŷ).
  b.grid(first, cols, rows, up);
}

/** Suspended-ceiling T-bar: width and how far it hangs below the tiles (metres). */
const TBAR_W = 0.016;
const TBAR_D = 0.008;

/** Removes [a, b] from each interval. */
function cut(spans: [number, number][], a: number, b: number): [number, number][] {
  return spans.flatMap(([s, e]): [number, number][] => {
    if (b <= s || a >= e) return [[s, e]];
    return [...(a > s ? [[s, a] as [number, number]] : []), ...(b < e ? [[b, e] as [number, number]] : [])];
  });
}

/**
 * The drop ceiling's metal grid as real geometry: a bar under every tile edge (every CEILING_TILE),
 * interrupted where a troffer sits. Lines on the chunk's low edges belong to this chunk, the ones
 * on its high edges to the next, so no bar is built twice.
 */
function addTBars(b: Builder, shade: (x: number, z: number) => number, wx0: number, wz0: number, w: number, h: number, panels: { wx: number; wz: number }[]): void {
  const T = CEILING_TILE;
  const y = WALL_HEIGHT - TBAR_D;
  const bar = (along: 'x' | 'z', c: number, s: number, e: number) => {
    // 2 m shading segments: the bars' light comes from whole-metre samples anyway.
    const n = Math.max(1, Math.ceil((e - s) / 2));
    const hw = TBAR_W / 2;
    const P = (t: number, off: number, yy: number): [number, number, number] =>
      along === 'x' ? [t, yy, c + off] : [c + off, yy, t];
    // Bottom face (normal down), then the two sides.
    const faces: { a: number; bOff: number; y0: number; y1: number; nrm: [number, number, number] }[] = [
      { a: -hw, bOff: hw, y0: y, y1: y, nrm: [0, -1, 0] },
      { a: -hw, bOff: -hw, y0: y, y1: WALL_HEIGHT, nrm: along === 'x' ? [0, 0, -1] : [-1, 0, 0] },
      { a: hw, bOff: hw, y0: y, y1: WALL_HEIGHT, nrm: along === 'x' ? [0, 0, 1] : [1, 0, 0] },
    ];
    for (const f of faces) {
      const first = b.pos.length / 3;
      for (const row of [0, 1]) {
        for (let i = 0; i <= n; i++) {
          const t = s + ((e - s) * i) / n;
          const off = row === 0 ? f.a : f.bOff;
          const yy = row === 0 ? f.y0 : f.y1;
          const [px, py, pz] = P(t, off, yy);
          b.vert(px, py, pz, f.nrm[0], f.nrm[1], f.nrm[2], t, off, shade(px, pz));
        }
      }
      // The bar material is double-sided, so winding doesn't matter here.
      b.grid(first, n + 1, 2);
    }
  };
  const lines = (lo: number, len: number) => {
    const out: number[] = [];
    for (let k = Math.ceil(lo / T - 1e-6); k * T < lo + len - 1e-6; k++) out.push(k * T);
    return out;
  };
  // Bars running along z (constant x): panels sit between them, never across.
  for (const x of lines(wx0, w)) bar('z', x, wz0, wz0 + h);
  // Bars running along x (constant z): a troffer interrupts the one crossing its middle.
  for (const z of lines(wz0, h)) {
    let spans: [number, number][] = [[wx0, wx0 + w]];
    for (const p of panels) if (Math.abs(p.wz - z) < T * 0.5) spans = cut(spans, p.wx - T / 2, p.wx + T / 2);
    for (const [s, e] of spans) if (e - s > 1e-3) bar('x', z, s, e);
  }
}

const outletGeo = new THREE.BoxGeometry(OUTLET.w, OUTLET.h, OUTLET.d);

/** Outlet plates on the wall faces, instanced; instance colour carries the baked light there. */
function outlets(spots: OutletSpot[], grid: Grid, light: LightField, mat: THREE.Material): THREE.InstancedMesh | null {
  if (spots.length === 0) return null;
  const mesh = new THREE.InstancedMesh(outletGeo, mat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(up, Math.atan2(s.nx, s.nz)); // box +z face → the wall's outward normal
    m.compose(new THREE.Vector3(s.x + s.nx * (OUTLET.d / 2), OUTLET.y, s.z + s.nz * (OUTLET.d / 2)), q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color.setScalar(lightAt(grid, light, s.x + s.nx * 0.06, s.z + s.nz * 0.06) * wallHeightShade(OUTLET.y)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Per-chunk handle on its troffers, so flicker and blackouts can dim individual panels. */
export interface ChunkPanels {
  mesh: THREE.InstancedMesh;
  cells: { x: number; y: number; wx: number; wz: number }[];
  /** Resting brightness per instance (1 = lit, PANEL_OFF = dead). */
  base: Float32Array;
}

export function buildChunk(grid: Grid, cx: number, cy: number, mats: WorldMaterials, light: LightField): THREE.Group {
  const x0 = cx * CHUNK_CELLS;
  const y0 = cy * CHUNK_CELLS;
  const x1 = Math.min(x0 + CHUNK_CELLS, grid.width);
  const y1 = Math.min(y0 + CHUNK_CELLS, grid.height);
  const wx0 = x0 * CELL_SIZE;
  const wz0 = y0 * CELL_SIZE;
  const w = (x1 - x0) * CELL_SIZE;
  const h = (y1 - y0) * CELL_SIZE;

  const papers: Record<Paper, Builder> = { chevron: new Builder(), dots: new Builder(), stained: new Builder() };
  const rails = new Builder();
  const quads = wallQuads(grid, cx, cy, CHUNK_CELLS);
  for (const q of quads) {
    const style = faceStyle(grid, q);
    addWall(papers[style.paper], grid, light, q);
    if (style.rail) addStrip(rails, grid, light, q, RAIL_Y0, RAIL_Y1, RAIL_D);
  }

  // Floor and ceiling share one vertex grid: sample light and contact shadow once per point.
  const samples = new Map<number, [number, number]>();
  const sample = (x: number, z: number) => {
    const key = Math.round(x) * 100003 + Math.round(z);
    let s = samples.get(key);
    if (!s) samples.set(key, (s = [lightAt(grid, light, x, z), contactShadow(grid, x, z)]));
    return s;
  };
  const floor = new Builder();
  addPlane(floor, wx0, wz0, w, h, 0, true, (x, z) => {
    const [l, ao] = sample(x, z);
    return l * ao * damp(x, z);
  });
  const ceiling = new Builder();
  addPlane(ceiling, wx0, wz0, w, h, WALL_HEIGHT, false, (x, z) => {
    const [l, shadow] = sample(x, z);
    return l * (1 - (1 - shadow) * 0.5) * ceilingGlow(grid, x, z);
  });

  const cells: ChunkPanels['cells'] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (isLightCell(grid, x, y)) cells.push({ x, y, wx: cellToWorld(x), wz: trofferZ(y) });
  const tbars = new Builder();
  // Bars take the ceiling's light at the nearest whole metre (already sampled; light varies slowly).
  addTBars(tbars, (x, z) => sample(Math.round(x), Math.round(z))[0] * 0.95, wx0, wz0, w, h, cells);

  const group = new THREE.Group();
  group.name = `chunk ${cx},${cy}`;
  const meshes = [
    papers.chevron.mesh(mats.wall),
    papers.dots.mesh(mats.wallDots),
    papers.stained.mesh(mats.wallStained),
    rails.mesh(mats.rail),
    floor.mesh(mats.floor),
    ceiling.mesh(mats.ceiling),
    tbars.mesh(mats.tbar),
    outlets(outletSpots(quads), grid, light, mats.outlet),
  ];
  for (const m of meshes) {
    if (!m) continue;
    // Everything but the floor, ceiling and grid casts shadow from the real panel lights.
    const flat = m.material === mats.floor || m.material === mats.ceiling || m.material === mats.tbar;
    m.castShadow = !flat;
    m.receiveShadow = m.material !== mats.ceiling && m.material !== mats.tbar;
    group.add(m);
  }
  if (cells.length > 0) {
    const mesh = new THREE.InstancedMesh(trofferGeo, mats.troffer, cells.length);
    const m = new THREE.Matrix4();
    const base = new Float32Array(cells.length);
    const color = new THREE.Color();
    cells.forEach((c, i) => {
      mesh.setMatrixAt(i, m.makeTranslation(c.wx, WALL_HEIGHT - 0.004, c.wz));
      base[i] = isDark(grid, c.x, c.y) ? PANEL_OFF : 1;
      mesh.setColorAt(i, color.setScalar(base[i]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    const panels: ChunkPanels = { mesh, cells, base };
    group.userData.panels = panels;
  }
  return group;
}

/** Frees per-chunk GPU buffers. Shared geometries and materials stay alive. */
export function disposeChunk(group: THREE.Group): void {
  for (const child of group.children) {
    if (child instanceof THREE.InstancedMesh) child.dispose();
    else if (child instanceof THREE.Mesh) child.geometry.dispose();
  }
}
