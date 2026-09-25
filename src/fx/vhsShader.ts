import * as THREE from 'three';

/**
 * One full-screen pass that turns the (already sRGB) frame into VHS camcorder footage:
 * barrel distortion → tracking jitter/band → chroma bleed + smear → night vision →
 * dead-battery dimming → grain → scanlines → glitch streaks → vignette.
 */
export const VhsShader = {
  name: 'VhsShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uScanlinePeriod: { value: 3 },
    uNightVision: { value: 0 },
    uBattery: { value: 1 },
    uGlitch: { value: 0 },
    uDistortion: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uScanlinePeriod;
    uniform float uNightVision;
    uniform float uBattery;
    uniform float uGlitch;
    uniform float uDistortion;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    vec2 barrel(vec2 uv, float k) {
      vec2 c = uv - 0.5;
      return 0.5 + c * (1.0 + k * dot(c, c));
    }

    void main() {
      vec2 uv = barrel(vUv, 0.045);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      float t = fract(uTime / 1000.0) * 1000.0;

      // Sanity: the picture swims.
      uv += vec2(sin(uv.y * 18.0 + t * 2.3), cos(uv.x * 14.0 + t * 1.7)) * 0.006 * uDistortion;

      // Tracking: per-row jitter plus a slow rolling band; both grow during glitches.
      float row = floor(uv.y * 240.0);
      float jitter = hash(vec2(row, floor(t * 30.0))) - 0.5;
      float bandDist = abs(fract(uv.y - fract(t * 0.07) + 0.5) - 0.5);
      float band = 1.0 - smoothstep(0.0, 0.05, bandDist);
      uv.x += jitter * (0.0006 + uGlitch * 0.03) + band * (0.0012 + uGlitch * 0.02);

      // Chroma bleed and horizontal smear (VHS has little colour bandwidth).
      float bleed = 0.0012 + uGlitch * 0.006 + uDistortion * 0.008;
      vec3 col = vec3(
        texture2D(tDiffuse, uv + vec2(bleed, 0.0)).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - vec2(bleed, 0.0)).b
      );
      col = mix(col, texture2D(tDiffuse, uv - vec2(0.0025, 0.0)).rgb, 0.15);

      // Grade: consumer-camcorder colour — slightly desaturated, warm lifted blacks, soft contrast.
      float g = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(g), col, 0.82);
      col = mix(col, vec3(0.5), 0.08);
      col += vec3(0.035, 0.028, 0.0) * (1.0 - g);

      // Night vision: luminance → green phosphor with gain.
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 nv = vec3(0.25, 1.0, 0.35) * pow(clamp(luma * 1.8, 0.0, 1.0), 0.85);
      col = mix(col, nv, uNightVision);

      // Dead battery: the picture sags.
      float power = smoothstep(0.0, 0.05, uBattery);
      col *= mix(0.35, 1.0, power);

      // Grain — heavier in night vision and on a dead battery.
      float grain = 0.035 + uNightVision * 0.10 + (1.0 - power) * 0.15 + uDistortion * 0.12;
      col += (hash(uv * uResolution + fract(t) * 100.0) - 0.5) * grain;

      // Scanlines in screen space with a whole-pixel period, so they never alias into moiré.
      float scan = mod(gl_FragCoord.y, uScanlinePeriod) / uScanlinePeriod;
      col *= 0.95 + 0.05 * sin(scan * 6.28318);

      // White streaks during glitch bursts.
      float streak = step(0.995 - uGlitch * 0.02, hash(vec2(floor(uv.y * 120.0), floor(t * 20.0))));
      col = mix(col, vec3(hash(uv + fract(t))), streak * uGlitch);

      // Vignette.
      col *= 1.0 - 0.7 * smoothstep(0.4 - 0.15 * uDistortion, 0.9 - 0.25 * uDistortion, length(vUv - 0.5));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
