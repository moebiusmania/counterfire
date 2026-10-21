// Player cameras and split-screen (SPEC §9.1).
//
// LittleJS draws one 3D pass per frame with one camera. For two players we draw the
// engine's own pass into the left half (our preRender hook runs just before it sets the
// viewport and camera), then run a second pass for the right half from gameRender, through
// render3DRenderPass, which patches/littlejsengine@1.28.0.patch exports.
// The pass resets the viewport after drawing the shadow map, so real shadows are turned off
// in split-screen and objects use soft blob shadows instead.

import {
  Camera3D,
  engineAddPlugin,
  glCanvas,
  glContext,
  render3D,
  render3DRenderPass,
  type Vector3,
  vec3,
} from 'littlejsengine';

/** The original's high, slightly tilted bird's-eye view. [VERIFY] pitch and height against captures. */
const CAMERA_HEIGHT = 13;
const CAMERA_BACK = 6.5;
const CAMERA_FOV = 0.75;
const FOLLOW_RATE = 0.12;

export class PlayerView {
  readonly camera = new Camera3D();
  private target = vec3();

  constructor(target: Vector3) {
    this.camera.fov = CAMERA_FOV;
    this.camera.far = 200;
    this.snap(target);
  }

  snap(target: Vector3): void {
    this.target = target.copy();
    this.place();
  }

  follow(target: Vector3): void {
    this.target = this.target.lerp(target, FOLLOW_RATE);
    this.place();
  }

  private place(): void {
    this.camera.pos = this.target.add(vec3(0, CAMERA_HEIGHT, CAMERA_BACK));
    this.camera.lookAt(this.target);
  }
}

interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class SplitScreen {
  views: PlayerView[] = [];
  /** The view being drawn right now, for draws that differ per player. */
  current = 0;
  private aspect?: number;

  /** Call before `new Render3DPlugin`, so this preRender runs ahead of the engine's 3D pass. */
  constructor() {
    engineAddPlugin(undefined, undefined, undefined, undefined, () => this.beginFirstView());
  }

  /** Call once the Render3DPlugin exists. */
  install(): void {
    const updateMatrices = render3D.updateMatrices.bind(render3D);
    render3D.updateMatrices = (aspect?: number) => updateMatrices(this.aspect ?? aspect);
  }

  get split(): boolean {
    return this.views.length > 1;
  }

  /** The viewport of player `i` in canvas pixels, origin bottom left as WebGL wants. */
  viewport(i: number): Viewport {
    const w = glCanvas.width;
    const h = glCanvas.height;
    if (!this.split) return { x: 0, y: 0, w, h };
    const half = Math.floor(w / 2);
    return i === 0 ? { x: 0, y: 0, w: half - 1, h } : { x: half + 1, y: 0, w: w - half - 1, h };
  }

  private apply(i: number): void {
    const view = this.views[i];
    if (!view) return;
    const vp = this.viewport(i);
    const gl = glContext;
    gl.viewport(vp.x, vp.y, vp.w, vp.h);
    gl.scissor(vp.x, vp.y, vp.w, vp.h);
    this.aspect = vp.w / vp.h;
    render3D.camera = view.camera;
    this.current = i;
  }

  private beginFirstView(): void {
    if (!this.views.length) return;
    render3D.shadows = !this.split;
    this.current = 0;
    if (!this.split) {
      this.aspect = undefined;
      render3D.camera = (this.views[0] as PlayerView).camera;
      return;
    }
    glContext.enable(glContext.SCISSOR_TEST);
    this.apply(0);
  }

  /** Draw the second player's view; call from gameRender. */
  renderOtherViews(): void {
    if (!this.split) return;
    const gl = glContext;
    try {
      for (let i = 1; i < this.views.length; i++) {
        this.apply(i);
        render3D.updateMatrices();
        render3DRenderPass(false);
      }
    } finally {
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      this.aspect = undefined;
      render3D.camera = (this.views[0] as PlayerView).camera;
      render3D.updateMatrices();
    }
  }
}
