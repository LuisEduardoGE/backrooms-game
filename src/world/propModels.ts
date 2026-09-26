import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import type { PropKind, PropPlacement } from './furnishing';

/** Wall-mounted fixtures (placed per chunk from the wall faces, see dressing.ts). */
export type FixtureKind = 'clock' | 'fireAlarm';

/** Poly Haven model per prop (CC0; public/models/<id>/<id>_1k.gltf, textures downsized). */
const MODEL: Record<PropKind | FixtureKind, string> = {
  desk: 'metal_office_desk',
  schoolDesk: 'SchoolDesk_01',
  schoolChair: 'SchoolChair_01',
  monobloc: 'plastic_monobloc_chair_01',
  armchair: 'modern_arm_chair_01',
  wetFloor: 'WetFloorSign_01',
  ladder: 'wooden_ladder',
  box: 'cardboard_box_01',
  crate: 'plastic_crate_01',
  shelves: 'steel_frame_shelves_01',
  sofa: 'Sofa_01',
  tv: 'television_02',
  clock: 'wall_clock',
  fireAlarm: 'fire_alarm',
};

/**
 * Models not exported in metres: uniform scale to real size (Poly Haven's steel shelves come in
 * about 12× too large — 21 m tall — and are brought to 1.8 m).
 */
const RESCALE: Partial<Record<PropKind | FixtureKind, number>> = { shelves: 1.8 / 21.41 };

/** One mesh of a model: geometry, material and its transform inside the normalised model. */
interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4;
}

export type PropTemplates = Record<PropKind | FixtureKind, Part[]> & { sizes: Record<PropKind | FixtureKind, ModelSize> };

/**
 * Loads every prop model once. Each is normalised to stand on y = 0, centred on its footprint;
 * wall fixtures are normalised to hang with their back at z = 0 (facing +Z).
 */
export async function loadPropModels(): Promise<PropTemplates> {
  const loader = new GLTFLoader();
  const entries = await Promise.all(
    (Object.keys(MODEL) as (PropKind | FixtureKind)[]).map(async (kind) => {
      const id = MODEL[kind];
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${id}/${id}_1k.gltf`);
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const centre = box.getCenter(new THREE.Vector3());
      const wall = kind === 'clock' || kind === 'fireAlarm';
      const scale = RESCALE[kind] ?? 1;
      const shift = new THREE.Matrix4()
        .makeScale(scale, scale, scale)
        .multiply(new THREE.Matrix4().makeTranslation(-centre.x, wall ? -centre.y : -box.min.y, wall ? -box.min.z : -centre.z));
      const meshes: THREE.Mesh[] = [];
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) meshes.push(o);
      });
      const parts: Part[] = await Promise.all(
        meshes.map(async (o) => ({
          geometry: await lighten(o.geometry),
          material: (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.Material,
          matrix: shift.clone().multiply(o.matrixWorld),
        })),
      );
      const size = new THREE.Box3();
      for (const part of parts) {
        part.geometry.computeBoundingBox();
        size.union(part.geometry.boundingBox!.clone().applyMatrix4(part.matrix));
      }
      const dims = size.getSize(new THREE.Vector3());
      return [kind, parts, { w: dims.x, h: dims.y, d: dims.z }] as const;
    }),
  );
  const templates = Object.fromEntries(entries.map(([k, parts]) => [k, parts])) as unknown as PropTemplates;
  templates.sizes = Object.fromEntries(entries.map(([k, , size]) => [k, size])) as PropTemplates['sizes'];
  return templates;
}

/** Parts denser than this (triangles) are simplified at load. */
const MAX_TRIANGLES = 2000;
/** Share of vertices a dense part keeps (meshoptimizer respects normals and UV seams). */
const KEEP = 0.25;
const simplifier = new SimplifyModifier();

/**
 * Some scans are far denser than a prop needs (a cardboard box at 17k triangles), and every prop is
 * drawn again into each shadow map — so dense parts are simplified once, here.
 */
async function lighten(geometry: THREE.BufferGeometry): Promise<THREE.BufferGeometry> {
  const triangles = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
  if (triangles <= MAX_TRIANGLES) return geometry;
  const vertices = geometry.getAttribute('position').count;
  return simplifier.modify(geometry, Math.floor(vertices * (1 - KEEP)));
}

/** A placed instance: kind, world transform, and the baked light it stands in. */
export interface PropInstance {
  kind: PropKind | FixtureKind;
  matrix: THREE.Matrix4;
  light: number;
}

/** A normalised model's size (metres): width (x), height (y), depth (z). */
export interface ModelSize {
  w: number;
  h: number;
  d: number;
}

/**
 * World transform of a floor prop placement. Upright: turned by its yaw, standing at (x, y, z).
 * Knocked over: laid on its back — rotated about its own X, then lifted by half its depth and
 * centred — so it rests on the floor instead of sinking into it.
 */
export function placementMatrix(p: PropPlacement, size: ModelSize): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(new THREE.Matrix4().makeRotationY(p.yaw));
  if (p.tilt === 0) return m;
  return m.multiply(new THREE.Matrix4().makeTranslation(0, size.d / 2, -size.h / 2)).multiply(new THREE.Matrix4().makeRotationX(p.tilt));
}

/**
 * Instanced meshes for a chunk's props: one InstancedMesh per model part, instance colour = the
 * baked light at the prop, so props sit in the same light as the room. They cast and receive the
 * real panel shadows.
 */
export function buildPropMeshes(templates: PropTemplates, instances: readonly PropInstance[]): THREE.InstancedMesh[] {
  const byKind = new Map<PropKind | FixtureKind, PropInstance[]>();
  for (const it of instances) {
    const list = byKind.get(it.kind);
    if (list) list.push(it);
    else byKind.set(it.kind, [it]);
  }
  const meshes: THREE.InstancedMesh[] = [];
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  for (const [kind, list] of byKind) {
    for (const part of templates[kind]) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, m.multiplyMatrices(it.matrix, part.matrix));
        mesh.setColorAt(i, color.setScalar(it.light));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      // Flat wall fixtures would only add shadow-map work; furniture casts real shadows.
      mesh.castShadow = kind !== 'clock' && kind !== 'fireAlarm';
      mesh.receiveShadow = true;
      meshes.push(mesh);
    }
  }
  return meshes;
}
