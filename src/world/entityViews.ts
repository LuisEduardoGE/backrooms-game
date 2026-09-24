import * as THREE from 'three';
import type { Entity } from '../game/entity';

/** Glowing eyes and a too-wide grin on a transparent card that always faces the camera. */
function smilerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#fffbe8';
  ctx.shadowColor = '#fff6c0';
  ctx.shadowBlur = 18;
  for (const x of [84, 172]) {
    ctx.beginPath();
    ctx.ellipse(x, 48, 16, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(38, 92);
  for (let i = 0; i <= 12; i++) {
    const x = 38 + i * 15;
    ctx.lineTo(x, i % 2 === 0 ? 96 + Math.sin(i) * 3 : 114);
  }
  ctx.quadraticCurveTo(128, 150, 38, 92);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface HowlerRig {
  root: THREE.Group;
  legs: [THREE.Group, THREE.Group];
  arms: [THREE.Group, THREE.Group];
  body: THREE.Group;
  phase: number;
}

/** A 2.45 m, too-thin figure built from primitives, hunched to clear the 2.7 m ceiling. */
function createHowler(): HowlerRig {
  const skin = new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 1 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x110000, emissive: 0x662222, emissiveIntensity: 1.5 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.2), skin);
  torso.position.y = 1.75;
  torso.rotation.x = 0.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin);
  head.scale.set(1, 1.35, 1);
  head.position.set(0, 2.3, -0.14);
  const eyeGeo = new THREE.SphereGeometry(0.018, 6, 6);
  for (const x of [-0.05, 0.05]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 2.33, -0.26);
    body.add(eye);
  }
  body.add(torso, head);

  const limb = (radiusTop: number, radiusBottom: number, length: number, pivot: THREE.Vector3) => {
    const g = new THREE.Group();
    g.position.copy(pivot);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 8), skin);
    m.position.y = -length / 2;
    g.add(m);
    body.add(g);
    return g;
  };
  const arms: [THREE.Group, THREE.Group] = [
    limb(0.035, 0.03, 1.25, new THREE.Vector3(-0.22, 2.1, -0.05)),
    limb(0.035, 0.03, 1.25, new THREE.Vector3(0.22, 2.1, -0.05)),
  ];
  const legs: [THREE.Group, THREE.Group] = [
    limb(0.05, 0.035, 1.35, new THREE.Vector3(-0.1, 1.35, 0)),
    limb(0.05, 0.035, 1.35, new THREE.Vector3(0.1, 1.35, 0)),
  ];
  return { root, legs, arms, body, phase: 0 };
}

export function createEntityViews(scene: THREE.Scene) {
  const smilerMaterial = new THREE.SpriteMaterial({
    map: smilerTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const smilers = new Map<number, THREE.Sprite>();
  const howlers = new Map<number, HowlerRig>();

  return {
    sync(entities: readonly Entity[], alpha: number, dt: number): void {
      for (const e of entities) {
        const x = e.prevPos.x + (e.pos.x - e.prevPos.x) * alpha;
        const z = e.prevPos.z + (e.pos.z - e.prevPos.z) * alpha;
        if (e.kind === 'smiler') {
          let s = smilers.get(e.id);
          if (!s) {
            s = new THREE.Sprite(smilerMaterial);
            s.scale.set(0.9, 0.56, 1);
            scene.add(s);
            smilers.set(e.id, s);
          }
          s.position.set(x, 1.55, z);
        } else {
          let h = howlers.get(e.id);
          if (!h) {
            h = createHowler();
            scene.add(h.root);
            howlers.set(e.id, h);
          }
          h.root.position.set(x, 0, z);
          h.root.rotation.y = e.heading;
          // Last fixed step's displacement × the 60 Hz step rate = metres per second.
          const speed = dt > 0 ? Math.hypot(e.pos.x - e.prevPos.x, e.pos.z - e.prevPos.z) * 60 : 0;
          h.phase += speed * dt * 2.2;
          const swing = Math.sin(h.phase) * 0.5 * Math.min(1, speed / 2);
          h.legs[0].rotation.x = swing;
          h.legs[1].rotation.x = -swing;
          h.arms[0].rotation.x = -swing * 0.7;
          h.arms[1].rotation.x = swing * 0.7;
          h.body.position.y = Math.abs(Math.sin(h.phase)) * 0.04;
        }
      }
    },
  };
}
