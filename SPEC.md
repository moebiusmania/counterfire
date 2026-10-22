# Counterfire: Specification

**Counterfire** is a browser game that remakes **Return Fire** (Silent Software, 3DO 1995 / Windows 95 1996) and matches the original's gameplay feature for feature. It is built with **Bun**, **TypeScript** and **LittleJS**. Its levels and 3D models are new, made in the style of the original.

> **Status:** v0.9, 2026-10-22. Milestones 0 to 8 are done (§15); the 72 maps have passed automated checks but no human playtest yet.
> **Name:** Counterfire (§12.3).
> **Source of truth for behaviour:** the original Windows 95 release. Where this spec and the original disagree on rules or mechanics, the original wins and this spec gets corrected. Levels and models deliberately differ from the original (§10, §12). Items marked **[VERIFY]** are not confirmed by a primary source yet. Someone must check them against the original game (by playing it or using the manual) before they count as final.

---

## 1. Goals and non-goals

### Goals
1. **1:1 gameplay parity** with the Windows 95 version: rules, vehicles, weapons, structures, AI, hazards, both game modes, split-screen two-player, the bunker, the map screen, the radar, the jeep beacon, and the death and victory sequences.
2. **A full set of original levels that resemble the original's**: island battlefields with the same building blocks (bunkers, flag-tower clusters, walled towns, turrets, bridges, deep water, forests, depots), the same difficulty curve, and the same Training/Tournament structure. They are not copies of the original maps (§10).
3. **3D models** recreated from the original vehicle and structure types, with design changes allowed. **The vehicle types must stay the same:** a main battle tank with a rotating turret, a tracked rocket-launcher support vehicle, an attack helicopter, and a light utility jeep (§12).
4. Runs at **60 fps** in current Chrome, Firefox and Safari on a mid-range laptop, with two-player split-screen on one machine.
5. Simulation behaviour is identical whatever the frame rate.

### Non-goals (v1)
- Online or network multiplayer. The original was local split-screen only. A netcode-friendly simulation (§4.3) keeps it possible later.
- Content from *Return Fire 2* or the 3DO-only *Maps O' Death* add-on. The format allows adding these later (§10.4).
- Shipping any copyrighted original asset, or copying original map layouts (§12).
- **Music.** v1 ships with sound effects only. The audio system must make it easy to add a music layer later (§11.2).

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Runtime / package manager / bundler / test runner | **Bun** (`bun install`, `bun build`, `bun test`, `Bun.serve` for the dev server) |
| Language | **TypeScript**, `strict: true`, ES2022 modules |
| Engine | **LittleJS** (`littlejsengine` on npm): game loop, input (keyboard, gamepad, touch), audio (including ZzFX), particles, timers, tile collision helpers, pathfinding plugin |
| 3D rendering | LittleJS's **built-in 3D renderer** (`Render3DPlugin`), chosen in phase 0 (§3.2) |
| Models | glTF 2.0 binary (`.glb`), authored in Blender |
| Level data | JSON (schema in §10.3b), authored in the in-house level editor |
| Lint/format | Biome |
| CI | `bun test` + `bun check` + `biome check` + headless smoke test (`bun run e2e`, Playwright) |

### 2.1 Repository layout

```
/src
  main.ts               boot, engine init, scene switching
  sim/                  deterministic game simulation (no rendering, no DOM)
    world.ts            entities, fixed-step update, RNG
    vehicles/           tank.ts asv.ts heli.ts jeep.ts
    structures/         buildings, flag towers, depots, bunker, turrets, bridges, walls
    ai/                 drones, turrets, submarine
    rules.ts            flag logic, win conditions, vehicle stock
  render/               3D scene, cameras, split-screen viewports, effects
  ui/                   bunker screen, map screen, HUD, radar, menus
  audio/                SFX (music layer later)
  input/                key bindings, gamepad, per-player mapping
  levels/               level loader + schema validation
/tools
  level-editor/         browser-based editor (dev only)
/assets
  models/*.glb
  textures/
  sfx/*.ogg
  levels/*.json
/tests
```

---

## 3. Architecture

### 3.1 Layering
- **sim/** is pure TypeScript. It has no LittleJS rendering calls and no DOM access. It runs at a **fixed 60 Hz tick**. It is deterministic: given a seed, a level, and per-tick input frames, it always produces the same result. That makes replays, regression tests and future netcode possible.
- **render/** reads the sim state each frame and interpolates between the last two ticks. It never writes to the sim.
- **LittleJS** owns the main loop. `gameUpdate` steps the sim (LittleJS's own update already runs at a fixed 60 Hz), and `gameRender`/`gameRenderPost` draw the 3D scene and the HUD.

### 3.2 Phase 0 spike: choosing the 3D path
LittleJS ships a built-in 3D renderer and an optional Three.js renderer plugin. Before building on either, run a one-week spike that answers these questions:
1. Can it load `.glb` files with skinned or node animation (rotor spin, turret yaw, tire inflate, door open)?
2. Can it draw two viewports in one frame (split-screen) at 60 fps with a full level loaded?
3. Does it support shadows or a simple light setup matching the original's directional light?
4. Can it render the 2D overlays (HUD, radar) through LittleJS's normal 2D path on top?

**Result (2026-10-21): the built-in renderer.** LittleJS 1.28.0 has built-in glTF loading with node and skinned animation (no morph targets, so the jeep's tyre inflation is a node scale or swapped mesh), sun shadows, instancing, 3D particles and positional sound, and the 2D HUD draws on top through the normal 2D path. The Three.js plugin is not used.

Split-screen is not built into the engine. The engine's own pass draws player 1's half, with the viewport and scissor set by a preRender hook that runs just before it. A second pass for player 2's half runs from `gameRender`. That second pass calls the engine's internal `render3DRenderPass`, which `patches/littlejsengine@1.28.0.patch` exports (applied by `bun install`); see `src/render/views.ts`. Check the patch whenever LittleJS is upgraded. **Known limit:** the pass resets the viewport after drawing the shadow map, so split-screen uses soft blob shadows instead of real shadows. Fixing this needs an upstream change to LittleJS.

### 3.3 Coordinate system
- The world is a 2D plane (x, y) in **tiles**. Height (z) is only used for the helicopter, projectiles, bridges, and visuals.
- Collision and gameplay are 2.5D: ground units collide on the plane. The helicopter is airborne and ignores ground collision except when landing.
- 1 tile = 1 world unit. Vehicle sizes and speeds are tuned in tiles so the scale feels like the original **[VERIFY]**.

---

## 4. Simulation core

### 4.1 Entities
Every entity has an id, a type, a team (`P1 | P2 | NEUTRAL | CPU`), a position, a heading, hit points, and a collision shape. The main types are vehicles, projectiles, structures, mines, drones, soldiers, the submarine and its missile, the flags, and debris.

### 4.2 Damage model
- Each entity has HP and armour values per weapon type. The tuning table goes in `sim/tuning.ts`, and every value in it is **[VERIFY]**: measure it against the original as "hits to kill" per weapon and target.
- Confirmed by the original manual: the **jeep dies in one hit**, the **helicopter dies after "just a few direct hits"**, and the **ASV has the strongest armour** of all vehicles.

### 4.3 Determinism
- Use one seeded PRNG (e.g. mulberry32) owned by `World`. No `Math.random()` inside `sim/`.
- Input is sampled once per tick into an `InputFrame` per player.
- Replays: record the seed, the level id, and the stream of `InputFrame`s. The tests replay them (§14).

---

## 5. Game structure and modes

### 5.1 Flow
`Title → Mode select → Player name entry → Bunker → Field ↔ Bunker … → Victory / Defeat → next level or menu`

### 5.2 Modes
The original Windows release asks at start-up for **Training** or **Tournament** mode, then for player names.
- **Training:** practice levels. **[VERIFY]** exactly how they differ (no enemy fire? unlimited vehicles? a fixed set of maps?).
- **Tournament:** the campaign, a sequence of levels that get harder (§10.2).
- **One player:** you against the CPU. The CPU has no vehicles of its own and defends with static turrets and drones. You must find and capture its flag.
- **Two player:** split-screen on one machine. Each player has a bunker, a flag hidden in one of their own flag buildings, and their own vehicle stock. Each player tries to capture the other's flag. Turrets belong to either side.

### 5.2a Campaign flow (milestone 7)
- The title menu offers TRAINING, TOURNAMENT and TWO PLAYERS over a circling view of the selected map.
- Each track lists its maps with a preview chart and the map's facts.
- Training and two-player maps are always open. Tournament maps open one at a time as the previous one is won.
- Progress is saved in `localStorage` and survives without it for the session.
- After a win, Ground Fire goes to the next map; after a loss it tries the same map again. Esc returns to the menu, F3 pauses, and Alt+Enter toggles full screen.
- **Not yet:** player name entry (§5.1). The players are called P1 and P2.

### 5.3 Win and loss conditions
- **Win:** a jeep carrying the enemy flag drives back onto its own bunker.
- **Loss:** **[VERIFY]**. Presumably you lose when every vehicle of every type is gone and no jeep can capture. Also confirm whether a stalemate rule exists when no jeeps are left.

---

## 6. Vehicles

All four vehicles share these rules:
- Limited **fuel** and **ammo**. A land vehicle that runs out of fuel **stops, and the driver gets out and flees on foot**.
- **Bunker exit:** the vehicle rises from the bunker elevator.
- **Return to bunker:** drive or fly over the bunker until the **bunker light comes on**, then press either Fire key. Returning to the bunker **fully repairs** the vehicle.
- **Self-destruct:** press both Fire keys and Switch together. The vehicle is lost and the player returns to the bunker.
- **Stock:** each level gives a fixed number of each vehicle type per player. A type whose stock reaches zero shows as an **empty slot** in the bunker.
| | Tank | ASV | Helicopter | Jeep |
|---|---|---|---|---|
| Vehicle type (must stay) | main battle tank, rotating turret | tracked rocket-launcher vehicle | attack helicopter | light 4×4 utility jeep |
| Original's reference | M60 | M270 MLRS | **[VERIFY]** from screenshots | M151 MUTT |
| Speed | medium | slowest | fast | fastest |
| Armour | high | **highest** | light ("a few hits") | none (1 hit) |
| Ground fire | main gun | **[VERIFY]** (rockets?) | **[VERIFY]** | grenades |
| Air fire / alt | turret control | lay mines (2P only) | second weapon system (rockets) | inflate/deflate tyres |
| Radar | yes | yes | **[VERIFY]** | no: uses the beacon |
| Carries flag | no | no | no | **yes** |
| Rearm/refuel | depots | depots | **own base only, landed** | depots |

### 6.1 Tank
- Hull and turret rotate independently. **Q/E** turn the turret, so it can fire in any direction while moving.
- Main gun shells damage vehicles, structures, turrets and trees.

### 6.2 Armoured Support Vehicle (ASV)
- Strongest armour, strongest weapons, slowest vehicle.
- **Mines (2-player only):** they destroy any land vehicle that drives over them, instantly. Mines are invisible on the full map and **visible on radar**. A mine on a bridge destroys both the vehicle and the bridge.

### 6.3 Helicopter
- Fast, with light armour.
- **Q/E bank and strafe** sideways at an angle.
- Has **two weapon systems** and can switch between them during battle. One is **rockets**. Only rockets can destroy mines. The helicopter can also destroy bridges.
- It can only refuel and rearm **after landing at its own base**. It cannot use depots in flight.
- It flies over water and walls. **[VERIFY]** whether it has an altitude control or a fixed flight height plus auto-landing on the bunker pad.

### 6.4 Jeep
- Fastest and unarmoured. One hit destroys it.
- Its only weapon is a **crate of grenades**, effective against trees and brush and little else.
- **Amphibious:** inflate the tyres to cross deep water and deflate them to go back on land. **[VERIFY]** the speed on water and what happens if the jeep enters deep water with deflated tyres.
- **The only vehicle that can pick up, carry and drop a flag.**
- **Beacon light on the dashboard:**
  - **Green plus a chime** when the jeep faces the enemy's *exposed* flag.
  - **Bright red** when the jeep faces its own bunker.
  - **[VERIFY]** the angular tolerance.

### 6.5 Fuel and ammo depots
- Supply depot buildings. Park in front of one and **a bell rings** while the vehicle refuels or rearms. Fuel depots and ammo tents are separate buildings.
- **[VERIFY]** whether depots are team-owned, can be destroyed, and have finite supply.

---

### 6.6 Working assumptions (milestone 2)
The manual does not settle these rules. The code uses the choices below until someone checks them against the original. Each one is **[VERIFY]**, and every number lives in `src/sim/tuning.ts`.

| Topic | Current behaviour |
|---|---|
| ASV weapon | Ground Fire launches rockets straight ahead, alternating left and right pods. Air Fire lays a mine behind it (2-player only, 6 mines). |
| Mines | They destroy any land vehicle, including the layer's own team. Everyone can see them on the field. |
| Helicopter controls | Ground Fire fires the selected weapon and Switch toggles gun and rockets. Air Fire does nothing. Flight height is fixed: it climbs after leaving the elevator and lands before going down. |
| Helicopter hits | Gun and rocket shots fall from the air: they hit land vehicles on the way and act on the ground where they land. Rockets clear trees and destroy bridges and mines. The gun does neither. Nothing can hit the helicopter until turrets and drones arrive (M3). |
| Helicopter fuel | Running out in the air destroys it. |
| Jeep | Air Fire inflates or deflates the tyres, which takes 40 ticks. The tyres cannot be deflated in deep water. Inflated, it is slower on land, and slower still in water. Grenades are lobbed 3 tiles and clear trees. |
| Land vehicles | All of them turn on the spot. They push each other apart and do not pass through each other. A land vehicle over deep water sinks, e.g. when its bridge is destroyed. |
| Depots | Serve vehicles of their own team or neutral ones, without limit. Fuel refills continuously and ammo refills one round every 6 ticks. |
| Bunker | The light comes on only after the vehicle has once driven off the pad. Going down returns the vehicle to stock, fully repaired and resupplied. |
| Losing a vehicle | A destroyed or abandoned vehicle returns the player to the bunker after 2 seconds; the skull comes in M6. Wrecks burn for 3 seconds, then disappear. |
| Bunker screen | Left/Right choose a slot and Ground Fire deploys. The map screen (Air Fire) comes in M6. |
| Input | A key tapped between two updates still counts as one press. |
| Mines in split-screen | Each player sees only their own mines on the field; enemy mines will show on radar (M6). |
| Sound in split-screen | Each sound plays on the side of the player nearest it, quieter with distance. Interface sounds play from the player's own bunker or vehicle. |

## 7. Flags

- Each side's flag is hidden inside one of its **flag buildings** (towers). Destroying a flag building reveals whether the flag is inside. Exposing the flag plays an alert sound and shows a HUD notice to both players.
- A jeep picks up the flag by driving over it. The pickup plays its own alert sound and shows a HUD notice.
- If the jeep carrying the flag is destroyed, the flag drops at that spot. **[VERIFY]**
- Defensive play (2-player): a player's jeep may pick up **its own** exposed flag and then:
  1. hide it behind a building or turret;
  2. move it anywhere on the map;
  3. bring it back to its own bunker, after which it is **re-hidden at random in a new flag tower**;
  4. drop it **at sea**, after which it **slowly floats back to shore** and keeps moving.
- The map shows all flag buildings, and shows flags only once they have been found.

---

### 7.1 Working assumptions (milestone 4)
Each choice below is **[VERIFY]** against the original.

| Topic | Current behaviour |
|---|---|
| Flags in one-player | Only the CPU has a flag. Two-player games have one flag per player. |
| Hiding | The seed picks the tower from the side's `flagCandidates`. A side's own flag brought home goes to a different intact tower when there is one. |
| Pick-up | Any jeep that drives within 0.55 tiles. After a drop, nobody can pick the flag up for 0.75 s. A jeep carries one flag at a time. |
| Capture | Driving onto your own bunker with the enemy flag wins at once. No key press is needed. |
| Dropping | Switch drops it. A destroyed jeep drops it where it was. Dropped in deep water, it drifts to the nearest land at 0.008 tiles per tick. |
| Losing | A player with no vehicles left loses. Alone against the CPU, having no jeep left also loses. With two players, if neither has a jeep left the game is a draw. |
| Game over | The world freezes. After 2 seconds, Ground Fire starts a new game. |
| Jeep beacon | Facing means within 0.25 rad and more than 1 tile away. Green (with a chime) takes priority over red. |
| Drones | Hovering CPU gunships, one per `droneSpawn`. They patrol 4 tiles around the spawn, chase vehicles within 7 tiles and fire within 5. They have 20 HP, every weapon can hit them, and they are replaced 20 s after being destroyed. They count as heat for the submarine's missile. |

## 8. World, structures and hazards

### 8.1 Terrain types
Grass/land, road, sand/beach, shallow water, **deep water** (only the helicopter and an inflated jeep can cross it), forest/brush (destructible), walls around built-up areas (**[VERIFY]** whether they can be destroyed), and bridges (destructible). Add more terrain types only if the level design needs them.

### 8.2 Structures
- **Bunker:** the underground garage with an elevator. It repairs damage, and it is where you enter and leave the field.
- **Flag buildings / towers:** destructible. One per side holds the flag.
- **Generic buildings:** destructible. **Soldiers come out of destroyed buildings** and run around, and vehicles can run them over. **[VERIFY]** exactly how they behave and animate (waving, fleeing, surrendering).
- **Turrets:** rotating gun or missile turrets that track and fire at enemies in range. In 1-player they belong to the CPU. In 2-player they belong to either side. They appear on the map.
- **Fuel depots, ammo tents:** see §6.5.
- **Bridges:** destructible by the helicopter and by mines. A destroyed bridge stays destroyed for the rest of the round.
- **Debris and rubble:** destroyed structures leave persistent rubble, and the map shows the changed terrain.

### 8.3 Drones
CPU-controlled hostile units in single-player. **[VERIFY]** whether they fly or drive, how many spawn and from where, and how they behave. They show on radar.

### 8.4 Submarine (map-boundary enforcement)
- If any vehicle leaves the playable bounds ("special provisions for deserters"), a submarine surfaces offshore and fires a **heat-seeking missile**. The submarine **cannot be destroyed**.
- The missile is truly heat-seeking: **it locks onto whatever heat source is closest to it**, including drones, the enemy player, or the vehicle that caused the sub to surface. Implement it as re-targeting the nearest valid heat source each tick. This makes it possible to use the missile tactically, as the manual describes.

### 8.4a Working assumptions (milestone 3)
Each choice below is **[VERIFY]** against the original. The numbers are in `src/sim/tuning.ts`.

| Topic | Current behaviour |
|---|---|
| Structure toughness | Flag tower 120 HP, building 60, turret 80, fuel depot 60, ammo tent 50. The bunker cannot be destroyed. Walls stay indestructible. |
| Structures in play | Intact structures block land vehicles and ground shots. Air shots (helicopter, grenades) damage whatever structure they land on. A destroyed structure leaves rubble that can be driven over, and a destroyed depot stops serving. |
| Building variants | `house`, `barracks` and `hangar`, chosen by the level entity's `variant`. |
| Soldiers | 2 to 4 run out of a destroyed building or flag tower. They flee vehicles within 4 tiles, otherwise wander or wave. Any blast, or a moving land vehicle, kills them. A driver who bails out walks back to the bunker and disappears into it. |
| Turrets | Variant `gun` has range 6, fires shells, and cannot hit the helicopter. Variant `missile` has range 8 and fires homing missiles that can. Each aims at the nearest enemy vehicle in range. CPU turrets attack both players; a player's turrets attack the other player. |
| Submarine | Surfaces 4 tiles beyond the edge, toward whoever left the bounds, aims for 0.75 s, fires, then dives. Only one heat-seeker flies at a time. The missile retargets every tick to the nearest active vehicle, whoever's it is, and destroys whatever it hits. |
| Friendly fire | Shots hurt everything except the vehicle or turret that fired them. |

### 8.5 Destruction persistence
All terrain and structure changes persist for the whole round and appear on the bunker map.

---

## 9. UI and presentation

### 9.1 Camera
- Top-down 3D bird's-eye view at a fixed angle, following the player's vehicle. Match the original's camera pitch, field of view and look-ahead from reference captures **[VERIFY]**.
- Split-screen: in 2-player mode the screen splits into two viewports. **[VERIFY]** whether the split is vertical or horizontal in the Windows version.

### 9.2 Bunker screen
- Shows the underground garage with the four vehicle slots. A vehicle type with no stock left shows an empty slot.
- **Ground Fire** selects a vehicle. **Air Fire** opens the map.
- The elevator animation plays when a vehicle leaves or arrives.

### 9.3 Map screen (only available in the bunker)
It shows the island outline(s), your bunker, the enemy bunker (in 2-player), all turrets, walls, all flag buildings, flags that have been found, the current state of the terrain (destruction), and the enemy's current position. It does **not** show mines.

### 9.4 HUD
Per player: fuel, ammo for each weapon, damage, the current weapon, the radar (for vehicles that have one), and the jeep beacon. Reproduce the original's layout and art style from screenshots **[VERIFY]**.

### 9.5 Radar
Shows the nearby area only: your position, enemies, drones and mines.

### 9.6 Death and victory
- **Player death:** a laughing skull with laughter audio.
- **Victory:** a ticker-tape celebration. Make it a new 3D or 2D animated sequence, because the original FMV cannot be shipped. In v1 it has crowd and fireworks sound effects and no music.

### 9.6a Working assumptions (milestone 6)
Each choice below is **[VERIFY]** against the original.

| Topic | Current behaviour |
|---|---|
| Map screen | Air Fire in the bunker opens and closes it; deploying closes it. It shows the terrain as it is now, both bunkers, turrets (hollow once destroyed), flag towers (crossed out once destroyed), found flags, and the enemy player's vehicle, blinking. Never mines. |
| Radar | Tank and ASV only; the helicopter has none. 10-tile range, north up. It shows the ground, other vehicles (enemy red, friendly green), drones, and every mine (own green, enemy yellow), with a sweep line. |
| Dashboard | A riveted panel with segmented armour, fuel and ammo gauges, the vehicle's extras, and the radar or the jeep's beacon. |
| Skull | Drawn in vector, laughing with a chattering jaw while the player waits to return to the bunker after a vehicle is destroyed. An abandoned vehicle shows a message instead. |
| Victory | Ticker tape over the winner's view, a cheer and fireworks. No music. |
| Test hook | `?test` exposes the live world as `globalThis.counterfire`, so the smoke test can stage scenes such as the skull and victory. |

### 9.7 System
- **Esc** quits to the menu, **F3** pauses, **Alt+Enter** toggles fullscreen (Fullscreen API).

---

## 10. Levels

### 10.1 Requirement
The levels are **new, hand-made maps that resemble the original's**. A player of the original should recognise the style and feel of every map. No map copies an original layout tile for tile.

### 10.2 Level set and progression
- **Training:** 6 maps, each built to teach one thing: driving and depots, the tank turret, the helicopter and landing, the jeep with tyres and the beacon, finding and capturing the flag, and the submarine boundary.
- **Tournament:** 9 tiers of 6 maps each (54 maps), from easy to hard. This follows the original's "9 levels of play" structure. Difficulty goes up across the tiers through:
  - fewer vehicles in stock;
  - more turrets and drones;
  - more flag-tower candidates, spread further apart;
  - more deep water and fewer bridges, so the routes are longer;
  - fewer depots placed further from the bunker.
- **Two-player:** 12 maps, symmetric or deliberately balanced, each player with their own bunker and flag-tower cluster.
- The total is 72 maps for v1. The count can grow because levels are data-only (§10.4).

### 10.3 Design rules (to match the original's feel)
Every map must:
1. Be one or more **islands** surrounded by sea, with a clear playable boundary (the submarine edge).
2. Put the player's **bunker** on open ground near an edge, with a safe run-out area.
3. Hide each side's flag in one of **3 to 8 flag towers**, grouped in one or more **walled compounds**. Some towers sit behind deep water or on islands only an inflated jeep or the helicopter can reach.
4. Place **turrets** to guard approaches, bridges and compounds, with overlapping fields of fire at higher tiers.
5. Include **fuel depots and ammo tents** along the main routes.
6. Use **forests and brush** as cover that blocks the way and can be cleared with grenades or gunfire.
7. Include at least one **bridge** that is critical to the route, so that destroying or mining it matters.
8. Have at least one jeep route from the bunker to every flag candidate and back that works with the starting stock. The validator checks this.
9. Use one of several visual themes in the original's spirit: temperate grassland, desert, snow and winter, and a few novelty layouts such as a chessboard island or letters spelled in land.

Every map goes through a **playtest review** for readability, fairness and difficulty against its tier.

### 10.3a Generation workflow
1. Draft the layout in the level editor (§10.5), using the original game's screenshots only as a reference for mood and style.
2. Optionally, a procedural "rough-in" tool places islands, water and forests from a seed and a tier, and a designer then finishes the map by hand.
3. Run the validator: schema, reachability, the jeep route, bounds, and the stock budget.
4. Playtest, tune, and commit.

### 10.3b Level JSON schema (v1)
```ts
interface Level {
  id: string;                 // "t01-03"
  name: string;               // new map name
  tier?: number;              // 1–9 for tournament maps
  theme: "temperate" | "desert" | "winter" | "novelty";
  mode: "training" | "tournament";
  players: 1 | 2 | "both";
  size: { w: number; h: number };       // tiles
  tiles: string[];            // terrain rows, north first, one character per tile (see src/sim/terrain.ts)
  entities: Array<{
    type: "bunker" | "flagTower" | "building" | "turret" | "fuelDepot" | "ammoTent"
        | "bridge" | "wall" | "tree" | "droneSpawn";
    team?: "P1" | "P2" | "CPU" | "NEUTRAL";
    x: number; y: number; rot?: number;
    variant?: string;         // model variant
  }>;
  stock: Record<"P1" | "P2", { tank: number; asv: number; heli: number; jeep: number }>;
  flagCandidates: Record<"P1" | "P2" | "CPU", string[]>; // flagTower ids
  bounds: { x: number; y: number; w: number; h: number };  // submarine trigger
}
```
`levels/schema.ts` validates every file at build time.

### 10.4 Extensibility
The schema and loader must also accept user-made or add-on map packs without code changes.

### 10.4a Two-player maps
Two-player maps are point-symmetric so both sides are equal. The designer draws the southern half in `assets/levels/src/<id>.half.json`, with P1's and neutral entities only. `bun tools/mirror-level.ts <half> <out>` turns it half a turn about the map centre and gives P2 the mirrored copy of everything P1 has. The tool validates the result and writes it to `assets/levels/`. The first one is `duel-01` "Twin Bridges". `src/levels/index.ts` lists every shipped level; `?level=<id>` loads one, and `?players=2` loads `duel-01`.

### 10.4b How the shipped maps are made (milestone 7)
- `src/levels/generate.ts` is the rough-in of §10.3a step 2. From a seed and a tier it builds a whole map following §10.3:
  - islands, `chessboard` or `atoll` layouts
  - rivers and lakes
  - a road from the bunker to each walled compound, bridging water on the way
  - forests, depots along the road, flag towers (most inside the compounds), turrets at gates, bridges and approaches (never within 10 tiles of the bunker), drone spawns, and a neutral village

  Tier rules (`tierCounts`, `tierStock`) raise towers, turrets, drones and lakes and lower depots and stock as the tier rises. From tier 7 some maps have no bridges, so the compound is left to the helicopter and an amphibious jeep. Duels build the southern half and mirror it, with bridges in mirrored pairs so each span joins up.
- `bun tools/build-levels.ts` regenerates the whole set from fixed seeds: training-02 to 06 (one lesson each), t1-1 to t9-6, and duel-02 to 12, plus `src/levels/catalog.ts`. training-01 and duel-01 are hand-made.
  - Themes per tier slot: temperate, temperate, desert, winter, temperate, novelty.
  - To hand-tune a map, edit it in the editor and take its id off the generated list.
- Tests check every map: valid, deterministic, harder by tier, a fuel depot near each bunker, land access to the compound on early tiers, unique names, every theme used.

### 10.5 Level editor (development tool)
A browser editor at `/editor` in dev builds (`bun run dev`). It does the following:
- loads any shipped level, or roughs in a new one from a tier, seed and layout
- paints terrain and places structures for any team (right click removes)
- edits the id, name, mode, players, theme, tier, size, bounds inset and stock
- runs the validator
- **Play** opens the map in the game as `?level=custom`
- **Export JSON** downloads it for `assets/levels/`

Flag candidates are every flag tower of each side. A later version could ship the editor to players.

---

## 11. Audio

### 11.1 Sound effects (v1)
Engines for each vehicle, rotor, gunfire, rockets, grenades, explosions, building collapse, soldier screams, the depot bell, the beacon chime, the bunker elevator, the submarine surfacing, the missile, tyre inflation, splashing, the flag-exposed and flag-captured alerts, the victory crowd and fireworks, and the skull laugh. Make them new or use ZzFX/CC0 sources, matching the original's character. Use stereo panning by position (LittleJS spatial audio). In split-screen, pan each sound to the side of the player it belongs to. Never rip the original game's audio.

### 11.2 Music (out of scope for v1)
v1 has no music. The game emits the events a future music layer will need: `vehicleSelected(type)`, `combatIntensity(0..1)`, `flagExposed`, `flagCaptured`, `victory`, and `death`. The audio module keeps a separate music bus with its own volume setting, which stays empty for now. A music track per vehicle, as in the original, can then be added without touching gameplay code.

---

## 12. Art, models and legal constraints

### 12.1 Model list
| Asset | Notes / animated parts |
|---|---|
| Tank (main battle tank, inspired by the M60) | turret yaw, barrel recoil, tread scroll |
| ASV (tracked rocket launcher, inspired by the M270) | launcher pod, mine drop |
| Helicopter (attack helicopter) | main and tail rotor, bank, landing gear |
| Jeep (light 4×4, inspired by the M151) | tyre inflate/deflate morph, flag mount, beacon light |
| Bunker + elevator | platform rise/lower, light on/off |
| Flag tower | intact and destroyed states, flag reveal |
| Generic buildings (all variants) | intact, damaged, rubble |
| Turrets (gun, missile) | yaw, fire |
| Fuel depot, ammo tent | bell |
| Bridge | intact, destroyed |
| Walls, trees, brush | intact, destroyed (instanced) |
| Drone | **[VERIFY]** form |
| Submarine + heat-seeking missile | surface/dive |
| Soldier | run, wave, death (instanced, low-poly) |
| Flags (one per team colour) | cloth wave, float on water |
| Victory set piece | ticker-tape |

### 12.2 Recreation rules
- Every model is **recreated from scratch**, using the original's look as a reference, and **modified a bit**: changed proportions, different detailing (hatches, antennas, stowage, lights), a new paint scheme, and a new team-colour treatment.
- **What must not change:** the vehicle **type** and its gameplay-readable features:
  - the tank has tracks and a turret that rotates independently, with a single main gun;
  - the ASV is tracked, bulky, and has a box rocket launcher on the back;
  - the helicopter is a single-rotor attack helicopter with a tail rotor and visible weapon pylons;
  - the jeep is an open-top 4×4 with no armour, and its tyres visibly inflate.
- Each vehicle must be recognisable from the top-down game camera at a glance and from its silhouette alone. Test this with a silhouette-recognition check at gameplay zoom.
- Structures (bunker, flag towers, turrets, depots, buildings) follow the same rule: same function and recognisable type, new design.
- Keep the polygon budget "period-appropriate plus" (about 500 to 3000 triangles per vehicle). Use a stylised, slightly pre-rendered look, and keep the shading flat enough to read clearly from the top-down camera.

### 12.3 Legal and naming
- **Never redistribute the original game's models, textures, audio, video or map files.** All shipped assets and levels are original work.
- "Return Fire" is a trademark, so the public game ships as **Counterfire**. Clear the "Counterfire" trademark and domain before any public release. Use only "Counterfire" in the game, the UI, the store pages and the repository. Mention "Return Fire" only as an inspiration, e.g. in the credits.

### 12.4 How the shipped models are made (milestone 8)
- Every model is built in code from LittleJS primitives (`src/render/models.ts`), with flat vertex colours and no textures. Milestone 8 kept the existing shapes and added detail: road wheels, fenders, lights, hatches, exhausts, windows, sandbags, fins and similar.
- No `.glb` files ship yet. LittleJS's `loadGLTF` is there for when artist-made models replace the code-built ones.
- Silhouette check: `?showcase&silhouette` shows the line-up in black from the gameplay camera, and the browser smoke test screenshots it. `tests/models.test.ts` keeps each vehicle within 500 to 3000 triangles.
- Not done: barrel recoil, tread scroll and the elevator platform animation.

---

## 13. Input

### 13.1 Default keyboard bindings (from the original manual)
| Action | Player 1 | Player 2 (numpad) |
|---|---|---|
| Ground Fire / Select vehicle (bunker) | H | − |
| Air Fire / Tyres / View map (bunker) | J | + |
| Switch weapon / Drop flag / Centre turret | K | Enter |
| Forward | W | 8 |
| Back | S | 5 |
| Turn left | A | 4 |
| Turn right | D | 6 |
| Turret / bank left | Q | 7 |
| Turret / bank right | E | 9 |
| Self-destruct | H+J+K | −, +, Enter |
| Quit / Pause / Fullscreen | Esc / F3 / Alt+Enter | |

Players can rebind keys, and bindings persist in `localStorage`.

### 13.2 Gamepads
Gamepad 0 plays as P1 and gamepad 1 as P2, alongside the keyboard. The left stick or d-pad drives, the shoulder buttons and triggers turn the turret or bank, A is Ground Fire, B is Air Fire and X is Switch. LittleJS's on-screen gamepad is an optional touch layout. **[VERIFY]** the stick's up direction on real hardware; the mapping is unit-tested only.

---

## 14. Testing and acceptance

### 14.1 Automated
- **Unit tests** (`bun test`) for the sim: damage tables, fuel and ammo consumption, the flag state machine, bunker repair, stock depletion, mine triggers, heat-seeker retargeting, jeep beacon angles, and win conditions.
- **Replay tests:** recorded input streams must reproduce the same final world-state hash.
- **Level validation:** every level JSON passes the schema, has reachable flag towers, has a valid bunker, and has in-bounds entities.
- **Smoke test:** `bun run e2e` builds the game, loads it headless in Chromium in one-player and split-screen mode, drives with scripted keys, and fails on any page error. It saves screenshots to `smoke-out/`. Next step: run it for every level.

### 14.2 Parity checklist (manual, against the original)
For each item in §6 to §11, record a side-by-side clip of the original and the remake. A feature counts as "done" only when it passes parity review. Keep the checklist in `docs/parity.md`, one row per feature or **[VERIFY]** item.

### 14.3 Performance
60 fps for the 2-player split-screen on the largest level on the reference laptop. Initial load under 10 MB gzipped.

---

## 15. Milestones

| # | Milestone | Exit criteria |
|---|---|---|
| 0 | **Spike** ✅ | 3D path chosen (§3.2), split-screen proof. A glTF proof waits for the first recreated model (M8). |
| 1 | **Sim core** ✅ | tank drives on a test map, fixed-step sim, deterministic replay test |
| 2 | **All vehicles** ✅ | 4 vehicles with weapons, fuel, ammo, damage, bunker loop |
| 3 | **World** ✅ | structures, destruction, turrets, depots, bridges, soldiers, submarine |
| 4 | **Rules** ✅ | flags, capture, win/loss, stock, 1P vs CPU with drones |
| 5 | **2-player** ✅ | split-screen, mines, flag-defence behaviours |
| 6 | **UI/Audio** ✅ | bunker, map, radar, HUD, beacon, SFX, skull, victory |
| 7 | **Content** ✅ | level editor + validator, all 72 maps built (§10.2). Automated checks done; human playtesting still to do. |
| 8 | **Art pass** ✅ | models refined in code (§12.4), silhouette check (§12.2) |
| 9 | **Polish/Release** | performance targets, rebinding, gamepads, "Counterfire" trademark and domain cleared |

---

## 16. Open questions ([VERIFY] summary)
1. How the original's Training mode differs from Tournament.
2. Hits-to-kill table, speeds, fuel burn and ammo capacity for each vehicle.
3. The weapon list for the ASV and helicopter, and whether the helicopter has an altitude control.
4. Drone types and behaviour, and turret ranges and fire rates.
5. Loss and stalemate rules.
6. Whether depots are team-owned, can be destroyed, and have finite supply.
7. The split-screen orientation, the camera parameters and the HUD layout.
8. Trademark and domain clearance for "Counterfire".

---

### Sources
- Original Windows 95 demo help file (*RFIRE.HLP*, 1996): controls, vehicles, bunker, map, radar, beacon, depots, submarine, mines, flag-defence tactics.
- Wikipedia, "Return Fire": vehicle models, the submarine, the skull, platforms.
- LittleJS README: built-in 3D renderer, Three.js plugin, TypeScript, audio, input.
