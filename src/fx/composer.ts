import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { scanlinePeriod } from './scanlines';
import { VhsShader } from './vhsShader';

export interface VhsParams {
  time: number;
  /** 0..1 night-vision blend. */
  nightVision: number;
  /** 0..1 battery charge. */
  battery: number;
  /** 0..1 tape-glitch intensity. */
  glitch: number;
  /** 0..1 sanity distortion. */
  distortion: number;
}

/**
 * Scene → GTAO (soft contact darkening where walls meet floor/ceiling, and around the player's
 * surroundings) → bloom (panels glow into the haze) → OutputPass (AgX tone map, linear → sRGB)
 * → VHS pass, so the VHS maths runs on display colours. GTAO and bloom run at half resolution.
 */
export function createVhsComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, width / 2, height / 2);
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.2, samples: 12 });
  gtao.blendIntensity = 0.7;
  composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(width / 2, height / 2), 0.35, 0.6, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const vhs = new ShaderPass(VhsShader);
  composer.addPass(vhs);
  const buffer = new THREE.Vector2();

  const setSize = (w: number, h: number) => {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    // Effects at half resolution: the soft look hides it and it halves their cost.
    gtao.setSize(w / 2, h / 2);
    bloom.setSize(w / 2, h / 2);
    renderer.getDrawingBufferSize(buffer);
    vhs.uniforms.uResolution.value.copy(buffer);
    vhs.uniforms.uScanlinePeriod.value = scanlinePeriod(buffer.y);
  };
  setSize(width, height);

  return {
    setSize,
    render(p: VhsParams): void {
      vhs.uniforms.uTime.value = p.time;
      vhs.uniforms.uNightVision.value = p.nightVision;
      vhs.uniforms.uBattery.value = p.battery;
      vhs.uniforms.uGlitch.value = p.glitch;
      vhs.uniforms.uDistortion.value = p.distortion;
      composer.render();
    },
  };
}
