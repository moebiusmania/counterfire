// Declarations for what patches/littlejsengine@1.28.0.patch exports and for internals the
// split-screen renderer touches. Keep in step with the patch when upgrading LittleJS.
import 'littlejsengine';

declare module 'littlejsengine' {
  /** One 3D pass; `false` is the layer drawn under the 2D scene. */
  export function render3DRenderPass(after2D: boolean): void;

  interface Render3DPlugin {
    /** Set by the pass once the frame's shadow map is drawn. */
    shadowMapDrawn: boolean;
  }
}
