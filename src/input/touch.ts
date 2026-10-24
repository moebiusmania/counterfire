// On-screen controls for phones and tablets (SPEC §13.3): a d-pad on the left and the action
// buttons on the right, an HTML overlay over the canvas. They drive P1 the way a gamepad does,
// menus included, and their buttons carry the gamepad's names (A, B, X, LB, RB), so the controls
// legend reads the same for both. Pointer events, so a mouse works them too.

import type { InputFrame } from '../sim/types';
import { HUD } from '../ui/palette';
import type { Action } from './bindings';
import { inputToMenu, type PadMenuAction } from './gamepad';

const SETTING_KEY = 'counterfire.touch';

/** The share of the d-pad's radius, from its centre, where a press counts. */
const DPAD_DEAD_ZONE = 0.25;

/** Which ways a d-pad press leans; +y is down, as on screen. A diagonal presses two. */
export function dpadDirection(
  dx: number,
  dy: number,
  deadZone = 0,
): Pick<InputFrame, 'forward' | 'back' | 'left' | 'right'> {
  if (Math.hypot(dx, dy) <= deadZone) return { forward: false, back: false, left: false, right: false };
  const a = Math.atan2(-dy, dx); // 0 is right, π/2 up
  // each way covers 3/8 of a turn, so the eighths between two ways press both
  const near = (to: number) => Math.abs(Math.atan2(Math.sin(a - to), Math.cos(a - to))) < (3 * Math.PI) / 8;
  return { forward: near(Math.PI / 2), back: near(-Math.PI / 2), left: near(Math.PI), right: near(0) };
}

/** The right-hand buttons: the action each presses, its gamepad name, and where it sits. */
const BUTTONS: { action: Action; label: string; className: string }[] = [
  { action: 'fireGround', label: 'A', className: 'a' },
  { action: 'fireAir', label: 'B', className: 'b' },
  { action: 'switch', label: 'X', className: 'x' },
  { action: 'auxLeft', label: 'LB', className: 'lb' },
  { action: 'auxRight', label: 'RB', className: 'rb' },
];

const STYLE = `
.cf-touch { position: fixed; inset: 0; pointer-events: none; z-index: 10; user-select: none;
  -webkit-user-select: none; -webkit-touch-callout: none; font: bold 15px monospace; --u: clamp(44px, 9vmin, 68px); }
.cf-touch[hidden] { display: none; }
.cf-touch > * { position: absolute; pointer-events: auto; touch-action: none; box-sizing: border-box;
  background: ${HUD.panel}; border: 2px solid ${HUD.edge}; color: ${HUD.text}; }
.cf-touch .pressed { background: rgba(74, 90, 42, .9); border-color: #e8d23a; }
.cf-dpad { left: calc(var(--u) * .5); bottom: calc(var(--u) * .5); width: calc(var(--u) * 2.8);
  height: calc(var(--u) * 2.8); border-radius: 50%; }
.cf-dpad i { position: absolute; width: 0; height: 0; border: calc(var(--u) * .22) solid transparent; }
.cf-dpad .up { left: 50%; top: 8%; transform: translateX(-50%); border-bottom-color: currentColor; }
.cf-dpad .down { left: 50%; bottom: 8%; transform: translateX(-50%); border-top-color: currentColor; }
.cf-dpad .left { top: 50%; left: 8%; transform: translateY(-50%); border-right-color: currentColor; }
.cf-dpad .right { top: 50%; right: 8%; transform: translateY(-50%); border-left-color: currentColor; }
.cf-dpad i.on { color: #e8d23a; }
.cf-button { display: flex; align-items: center; justify-content: center; border-radius: 50%;
  width: var(--u); height: var(--u); }
.cf-button.a { right: calc(var(--u) * 1.4); bottom: calc(var(--u) * .4); width: calc(var(--u) * 1.25); height: calc(var(--u) * 1.25); }
.cf-button.b { right: calc(var(--u) * .3); bottom: calc(var(--u) * 1.3); }
.cf-button.x { right: calc(var(--u) * 2.9); bottom: calc(var(--u) * 1.15); }
.cf-button.lb, .cf-button.rb { border-radius: 10px; height: calc(var(--u) * .7); width: calc(var(--u) * 1.3); bottom: calc(var(--u) * 2.6); }
.cf-button.lb { right: calc(var(--u) * 2.4); }
.cf-button.rb { right: calc(var(--u) * .5); }
.cf-menu { top: 12px; left: 50%; transform: translateX(-50%); padding: 6px 14px; border-radius: 6px; }
`;

export class TouchControls {
  private readonly root = document.createElement('div');
  private readonly arrows: Record<'forward' | 'back' | 'left' | 'right', HTMLElement>;
  private readonly menuButton = document.createElement('button');
  /** What each pointer on the controls holds: a button's action, or the d-pad. */
  private readonly pointers = new Map<number, Action | 'dpad'>();
  private dpad = dpadDirection(0, 0);
  private on: boolean;

  /** `onMenu` runs when the in-game MENU button is pressed, the touch screen's Esc. */
  constructor(onMenu: () => void) {
    this.on = loadSetting();
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);
    this.root.className = 'cf-touch';
    this.root.hidden = true;

    const pad = document.createElement('div');
    pad.className = 'cf-dpad';
    const arrow = (name: string) => {
      const el = document.createElement('i');
      el.className = name;
      pad.append(el);
      return el;
    };
    this.arrows = { forward: arrow('up'), back: arrow('down'), left: arrow('left'), right: arrow('right') };
    const steer = (e: PointerEvent) => {
      if (this.pointers.get(e.pointerId) !== 'dpad') return;
      const r = pad.getBoundingClientRect();
      const radius = r.width / 2;
      const dx = (e.clientX - r.left - radius) / radius;
      const dy = (e.clientY - r.top - radius) / radius;
      this.setDpad(dpadDirection(dx, dy, DPAD_DEAD_ZONE));
    };
    pad.addEventListener('pointerdown', (e) => {
      this.grab(pad, e, 'dpad');
      steer(e);
    });
    pad.addEventListener('pointermove', steer);
    this.root.append(pad);

    for (const b of BUTTONS) {
      const el = document.createElement('div');
      el.className = `cf-button ${b.className}`;
      el.textContent = b.label;
      el.addEventListener('pointerdown', (e) => this.grab(el, e, b.action));
      this.root.append(el);
    }

    this.menuButton.className = 'cf-menu';
    this.menuButton.textContent = 'MENU';
    this.menuButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onMenu();
    });
    this.root.append(this.menuButton);

    // a finger lifted or taken by the browser lets go of whatever it held
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
      this.root.addEventListener(type, (e) => this.release(e.pointerId));
    document.body.append(this.root);
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Turn the controls on or off, remembered for next time. */
  toggle(): void {
    this.on = !this.on;
    try {
      localStorage.setItem(SETTING_KEY, this.on ? 'on' : 'off');
    } catch {
      // private browsing: the choice lasts this visit only
    }
    if (!this.on) this.releaseAll();
  }

  /** Show the controls when they are on; `inGame` adds the MENU button. */
  show(visible: boolean, inGame: boolean): void {
    this.root.hidden = !(visible && this.on);
    this.menuButton.hidden = !inGame;
    if (this.root.hidden) this.releaseAll();
  }

  /** What the controls hold this frame, as P1's input. */
  read(): InputFrame {
    const held = new Set(this.pointers.values());
    return {
      ...this.dpad,
      auxLeft: held.has('auxLeft'),
      auxRight: held.has('auxRight'),
      fireGround: held.has('fireGround'),
      fireAir: held.has('fireAir'),
      switch: held.has('switch'),
    };
  }

  /** What the controls hold, as menu controls. */
  readMenu(): Set<PadMenuAction> {
    return this.on && !this.root.hidden ? inputToMenu(this.read()) : new Set();
  }

  private grab(el: HTMLElement, e: PointerEvent, what: Action | 'dpad'): void {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, what);
    if (what !== 'dpad') el.classList.add('pressed');
  }

  private release(id: number): void {
    const what = this.pointers.get(id);
    if (what === undefined) return;
    this.pointers.delete(id);
    if (what === 'dpad') this.setDpad(dpadDirection(0, 0));
    else if (![...this.pointers.values()].includes(what))
      this.root
        .querySelector(`.cf-button.${BUTTONS.find((b) => b.action === what)?.className}`)
        ?.classList.remove('pressed');
  }

  private releaseAll(): void {
    for (const id of [...this.pointers.keys()]) this.release(id);
  }

  private setDpad(d: typeof this.dpad): void {
    this.dpad = d;
    for (const k of Object.keys(d) as (keyof typeof d)[]) this.arrows[k].classList.toggle('on', d[k]);
  }
}

/** On if the player turned them on, else on for a touch screen. */
function loadSetting(): boolean {
  try {
    const saved = localStorage.getItem(SETTING_KEY);
    if (saved) return saved === 'on';
  } catch {
    // no storage: fall back to the device
  }
  return matchMedia('(pointer: coarse)').matches;
}
