import type * as THREE from 'three';
import type { PanelMap } from './panelMap';
import { CELL_SIZE, WALL_HEIGHT } from '../world/grid';

/** Panel slots sit at cell centres (a 2 m lattice); which ones hold a working tube comes from the panel map. */
const PITCH = CELL_SIZE;
const ORIGIN_X = CELL_SIZE / 2;
/**
 * Contribution reaches zero here (metres). The 7×7 window reaches at least 5 m from any point in
 * every direction, so with RANGE 5 no light ever pops in or out.
 */
const RANGE = 5;

export interface PanelLightOptions {
  /** Linear light intensity per panel at ~1 m. */
  intensity: number;
  /** Which cells have a panel and how bright each one is right now. */
  panels: PanelMap;
  /**
   * How far below the ceiling the light sources sit (metres). Panels light floor and walls from just
   * under the diffuser; the ceiling itself is lit by bounce from the room below, so it uses a lower
   * virtual source (a source in its own plane would only catch the tops of its bumps, as glints).
   */
  drop?: number;
}

/**
 * Makes a MeshStandardMaterial lit per pixel by the ceiling panels themselves — the 7×7 nearest
 * lattice panels, computed analytically in the shader (no scene lights, no shadow maps). Light
 * arrives from above and to the side at real angles, so normal and roughness maps finally read:
 * wallpaper emboss, carpet pile and ceiling tile relief catch the light like the real thing.
 * Room-scale brightness (walls, dark zones) still comes from the baked vertex colours.
 */
export function withPanelLights<T extends THREE.MeshStandardMaterial>(mat: T, o: PanelLightOptions): T {
  const ORIGIN_Z = CELL_SIZE / 2;
  const PANEL_Y = WALL_HEIGHT - (o.drop ?? 0.05);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPanelIntensity = { value: o.intensity };
    shader.uniforms.uPanelMap = { value: o.panels.texture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPanelWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPanelWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPanelWorld;\nuniform float uPanelIntensity;\nuniform sampler2D uPanelMap;')
      .replace(
        '#include <lights_fragment_end>',
        /* glsl */ `
        {
          vec2 centre = floor((vPanelWorld.xz - vec2(${ORIGIN_X.toFixed(4)}, ${ORIGIN_Z.toFixed(4)})) / ${PITCH.toFixed(4)} + 0.5);
          for (int j = -3; j <= 3; j++) {
            for (int i = -3; i <= 3; i++) {
              vec2 cell = centre + vec2(float(i), float(j));
              if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= ${o.panels.width.toFixed(1)} || cell.y >= ${o.panels.height.toFixed(1)}) continue;
              // No panel, a dead tube, or one that is off right now: no light from it.
              float level = texelFetch(uPanelMap, ivec2(cell), 0).r;
              if (level <= 0.0) continue;
              vec3 lp = vec3(cell.x * ${PITCH.toFixed(4)} + ${ORIGIN_X.toFixed(4)}, ${PANEL_Y.toFixed(4)}, cell.y * ${PITCH.toFixed(4)} + ${ORIGIN_Z.toFixed(4)});
              vec3 lv = (viewMatrix * vec4(lp, 1.0)).xyz - geometryPosition;
              float d = length(lv);
              float w = saturate(1.0 - (d * d) / ${(RANGE * RANGE).toFixed(1)});
              if (w <= 0.0) continue;
              IncidentLight panel;
              panel.direction = lv / d;
              // Windowed inverse-square: physically shaped near the panel, smoothly zero at RANGE.
              // A troffer is a flat, downward-facing emitter (Lambertian): it barely lights a wall
              // beside it at its own height — no hot spots under the lamps.
              float facing = ${o.drop === undefined ? 'saturate((lp.y - vPanelWorld.y) / max(distance(lp, vPanelWorld), 1e-3))' : '1.0'};
              panel.color = vec3(1.0, 0.96, 0.86) * uPanelIntensity * level * facing * w * w / (1.0 + d * d);
              panel.visible = true;
              RE_Direct(panel, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
            }
          }
        }
        #include <lights_fragment_end>`,
      );
  };
  mat.customProgramCacheKey = () => `panels:${PANEL_Y}`;
  return mat;
}
