# Counterfire

A browser remake of the 1996 game *Return Fire*, built with Bun, TypeScript and LittleJS. See [SPEC.md](SPEC.md).

Play it at https://moebiusmania.github.io/counterfire/, and build your own maps at https://moebiusmania.github.io/counterfire/editor/.

## Features

- **Capture the flag** with four vehicles, each with its own job: the tank, the armoured support vehicle (lays mines in two-player games), the helicopter and the jeep, the only one that can carry the flag home.
- **Game modes**: Training (six lessons), Tournament (nine tiers of six maps against the CPU, each won map unlocks the next), Two Players (split-screen duels on mirrored maps) and Bonus. Wins are saved in the browser.
- **72 maps in six biomes**: temperate, desert, winter, plus the bonus city, old west and alien worlds. Each biome has its own colours, trees and buildings.
- **Vehicle skins**: in the bunker, press up or down on a vehicle slot to change its look. The tank can be a pocket tank or a stinger, the support vehicle an action van, the helicopter a stealth jet or a UFO, and the jeep a hobby car. Skins only change the look; every vehicle plays the same.
- **Keyboard, gamepad and touch**: rebind the keys for each player in Controls on the title menu. Gamepads work for both players. Phones and tablets get an on-screen d-pad and buttons (A, B, X, LB, RB, like a gamepad) that drive P1, menus included. They turn on by themselves on a touch screen and can be switched with the button in the top right corner of the menu, which also holds full screen.
- **Music and sound**: a soundtrack (F2 turns it off and on) and sound effects.
- **Level editor**: paint terrain, place structures for any team, set the stock of vehicles, rough in a map from a tier, seed and layout, validate it, play it straight away and export it as JSON. Runs at `/editor/`.

## Run

```sh
bun install        # also applies patches/littlejsengine@1.28.0.patch
bun run dev        # http://localhost:3000, add ?players=2 for split-screen
```

| Command | What it does |
|---|---|
| `bun test` | simulation, replay and level-validation tests |
| `bun run e2e` | builds and runs a headless Chromium smoke test |
| `bun check` | typecheck |
| `bun run lint` | Biome |
| `bun run build` | production build into `dist/` |
| `bun tools/build-levels.ts` | regenerate the 72-map set and its catalog |
| `bun tools/og-image.ts` | render the social share card, `assets/og-image.svg`, to `og-image.png` |

Locally, the level editor runs at http://localhost:3000/editor/ while `bun run dev` is up. Every push to `main` is tested and deployed to GitHub Pages, editor included.

## Controls

| | Player 1 | Player 2 |
|---|---|---|
| Drive / bunker: choose slot | W A S D | Numpad 8 4 5 6 |
| Turret (tank) / strafe (helicopter) | Q / E | Numpad 7 / 9 |
| Ground Fire: shoot / deploy / go down on the bunker | H | Numpad − |
| Air Fire: mine (ASV) / tyres (jeep) / go down on the bunker | J | Numpad + |
| Switch: centre turret / change weapon | K | Numpad Enter |
| Self-destruct | H + J + K | − + Enter |

Gamepads: the first one plays P1 and the second P2 (stick/d-pad drive, shoulders turret/strafe, A/B/X the three fire keys).

Touch: the d-pad drives, A, B and X are Ground Fire, Air Fire and Switch, LB and RB turn the turret or strafe, MENU goes back to the menu.

| Other keys | |
|---|---|
| Esc | back to the menu |
| F2 | music off / on |
| F3 | pause |
| Alt + Enter | full screen |
| Up / down on a bunker slot | change the vehicle's skin |

Dev URLs: `?players=2` for a split-screen duel, `?level=<id>` for any level, `?showcase` for a still line-up of every model, `?seed=N` for a fixed seed, `?test` to expose the world to the smoke test. In the bunker, Air Fire (J) opens the map.

## Licence

Counterfire is free software under the [GNU General Public License v3.0 or later](LICENSE): anyone may copy, change and share it, and anyone who distributes it, changed or not, must share the full source under the same licence. It is an unofficial fan remake, not affiliated with the owners of *Return Fire*. See [NOTICE.md](NOTICE.md).
