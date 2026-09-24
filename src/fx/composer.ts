import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
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
 * Scene → OutputPass (linear → sRGB) → VHS pass, so the VHS maths runs on display colours.
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
  composer.addPass(new OutputPass());
  const vhs = new ShaderPass(VhsShader);
  composer.addPass(vhs);
  const buffer = new THREE.Vector2();

  const setSize = (w: number, h: number) => {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
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
