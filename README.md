# Counterfire

A browser remake of the 1996 game *Return Fire*, built with Bun, TypeScript and LittleJS. See [SPEC.md](SPEC.md).

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

## Controls

| | Player 1 | Player 2 |
|---|---|---|
| Drive / bunker: choose slot | W A S D | Numpad 8 4 5 6 |
| Turret (tank) / strafe (helicopter) | Q / E | Numpad 7 / 9 |
| Ground Fire: shoot / deploy / go down on the bunker | H | Numpad − |
| Air Fire: mine (ASV) / tyres (jeep) / go down on the bunker | J | Numpad + |
| Switch: centre turret / change weapon | K | Numpad Enter |
| Self-destruct | H + J + K | − + Enter |

Dev URLs: `?players=2` for split-screen, `?showcase` for a still line-up of every model, `?seed=N` for a fixed seed.
