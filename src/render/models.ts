// Placeholder models built from primitives. They keep each vehicle's type readable from the
// top-down camera (SPEC §12.2) until the recreated glTF models land in milestone 8.

import {
  buildBox,
  buildCone,
  buildCylinder,
  buildMatrix,
  buildSphere,
  buildTorus,
  type Color,
  Mesh,
  rgb,
  vec3,
  WHITE,
} from 'littlejsengine';
import type { Team } from '../sim/types';

export const TEAM_COLORS: Record<Team, Color> = {
  P1: rgb(0.85, 0.75, 0.2),
  P2: rgb(0.25, 0.5, 0.9),
  CPU: rgb(0.8, 0.2, 0.15),
  NEUTRAL: rgb(0.7, 0.7, 0.7),
};

const OLIVE = rgb(0.33, 0.37, 0.2);
const OLIVE_DARK = rgb(0.27, 0.3, 0.16);
const DARK = rgb(0.12, 0.12, 0.1);
const STEEL = rgb(0.25, 0.27, 0.22);
const LAMP = rgb(0.95, 0.92, 0.7);
const TAIL_LAMP = rgb(0.7, 0.12, 0.1);
const CONCRETE = rgb(0.5, 0.5, 0.48);
const HAZARD = rgb(0.9, 0.75, 0.1);
const WINDOW = rgb(0.25, 0.32, 0.38);

/** A wheel or road wheel turned to roll along Z: `size` across, `width` thick. */
function wheel(size: number, width: number, sides = 8): Mesh {
  return buildCylinder(size, width, sides).transform(buildMatrix(vec3(), vec3(0, 0, Math.PI / 2)));
}

/** Road wheels and fenders along both sides of a tracked hull. */
function addRunningGear(m: Mesh, halfWidth: number, length: number, wheels: number): void {
  for (const side of [-1, 1]) {
    for (let i = 0; i < wheels; i++) {
      const z = (i / (wheels - 1) - 0.5) * (length - 0.22);
      m.combine(wheel(0.15, 0.03), vec3(side * (halfWidth + 0.09), 0.09, z), STEEL);
    }
    m.combine(buildBox(vec3(0.21, 0.025, length + 0.04)), vec3(side * halfWidth, 0.215, 0), OLIVE_DARK);
  }
}

export interface TankMeshes {
  hull: Mesh;
  turret: Mesh;
}

/** Tank: tracked hull plus a separate turret with one long gun, facing -Z. */
export function buildTank(team: Team): TankMeshes {
  const hull = new Mesh();
  hull.combine(buildBox(vec3(0.62, 0.22, 0.95), 0.03), vec3(0, 0.2, 0), OLIVE);
  // tracks
  for (const side of [-1, 1])
    hull.combine(buildBox(vec3(0.18, 0.2, 1.0), 0.04), vec3(side * 0.36, 0.1, 0), DARK);
  addRunningGear(hull, 0.36, 1.0, 5);
  // sloped glacis plate, headlights, engine grille and exhausts
  hull.combine(
    buildBox(vec3(0.56, 0.03, 0.2)),
    buildMatrix(vec3(0, 0.26, -0.47), vec3(0.45, 0, 0)),
    OLIVE_DARK,
  );
  for (const side of [-1, 1]) {
    hull.combine(buildBox(vec3(0.07, 0.05, 0.03)), vec3(side * 0.22, 0.3, -0.48), LAMP);
    hull.combine(
      buildCylinder(0.05, 0.08, 6),
      buildMatrix(vec3(side * 0.2, 0.24, 0.5), vec3(Math.PI / 2, 0, 0)),
      DARK,
    );
  }
  for (let i = 0; i < 3; i++)
    hull.combine(buildBox(vec3(0.4, 0.015, 0.03)), vec3(0, 0.315, 0.16 + i * 0.06), DARK);
  // team stripe across the rear deck
  hull.combine(buildBox(vec3(0.5, 0.02, 0.12)), vec3(0, 0.32, 0.36), TEAM_COLORS[team]);

  const turret = new Mesh();
  turret.combine(buildCylinder(0.46, 0.16, 12), vec3(0, 0.08, 0.04), OLIVE);
  turret.combine(buildBox(vec3(0.34, 0.12, 0.2), 0.02), vec3(0, 0.08, 0.27), OLIVE_DARK); // bustle
  turret.combine(buildBox(vec3(0.16, 0.13, 0.1), 0.02), vec3(0, 0.09, -0.22), STEEL); // mantlet
  const barrel = buildCylinder(0.07, 0.6, 8);
  turret.combine(barrel, buildMatrix(vec3(0, 0.09, -0.42), vec3(Math.PI / 2, 0, 0)), STEEL);
  turret.combine(
    buildCylinder(0.1, 0.08, 8),
    buildMatrix(vec3(0, 0.09, -0.69), vec3(Math.PI / 2, 0, 0)),
    DARK,
  ); // muzzle
  turret.combine(buildBox(vec3(0.1, 0.06, 0.1)), vec3(0.1, 0.19, 0.08), DARK); // commander's hatch
  turret.combine(buildCylinder(0.015, 0.4, 4), vec3(-0.14, 0.36, 0.26), DARK); // aerial
  turret.combine(buildBox(vec3(0.12, 0.012, 0.16)), vec3(-0.1, 0.165, -0.02), TEAM_COLORS[team]);
  return { hull, turret };
}

/** Bunker: a low concrete pad with hazard-striped edges round the elevator hatch in team colour. */
export function buildBunker(team: Team): Mesh {
  const m = new Mesh();
  m.combine(buildBox(vec3(1.8, 0.08, 1.8), 0.04), vec3(0, 0.04, 0), CONCRETE);
  m.combine(buildBox(vec3(1.1, 0.02, 1.1)), vec3(0, 0.09, 0), TEAM_COLORS[team]);
  m.combine(buildBox(vec3(0.9, 0.03, 0.9)), vec3(0, 0.1, 0), rgb(0.2, 0.2, 0.2));
  // hazard dashes along each edge of the pad
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < 5; i++) {
      const along = (i - 2) * 0.3;
      const [x, z] = side % 2 ? [0.82 * (side - 2), along] : [along, 0.82 * (side - 1)];
      m.combine(
        buildBox(vec3(0.14, 0.01, 0.06)),
        buildMatrix(vec3(x, 0.085, z), vec3(0, side % 2 ? Math.PI / 2 : 0, 0)),
        HAZARD,
      );
    }
  }
  // vent stacks in two corners
  for (const c of [-1, 1])
    m.combine(buildBox(vec3(0.14, 0.16, 0.14), 0.02), vec3(c * 0.75, 0.14, -c * 0.75), rgb(0.4, 0.4, 0.38));
  return m;
}

export function buildFlagTower(team: Team): Mesh {
  const m = new Mesh();
  const stone = rgb(0.62, 0.58, 0.5);
  m.combine(buildBox(vec3(0.92, 0.16, 0.92), 0.02), vec3(0, 0.08, 0), rgb(0.5, 0.47, 0.4)); // plinth
  m.combine(buildBox(vec3(0.8, 1.4, 0.8), 0.03), vec3(0, 0.7, 0), stone);
  // a slit window on each face
  for (let f = 0; f < 4; f++)
    m.combine(
      buildBox(vec3(0.08, 0.26, 0.02)),
      buildMatrix(vec3(0, 0.95, 0), vec3(0, (f * Math.PI) / 2, 0)).multiply(buildMatrix(vec3(0, 0, -0.405))),
      DARK,
    );
  m.combine(buildBox(vec3(0.9, 0.12, 0.9)), vec3(0, 1.46, 0), TEAM_COLORS[team]);
  // corner merlons on the parapet
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    m.combine(buildBox(vec3(0.18, 0.14, 0.18)), vec3(x * 0.36, 1.59, z * 0.36), stone);
  return m;
}

export function buildDepot(kind: 'fuelDepot' | 'ammoTent', team: Team): Mesh {
  const m = new Mesh();
  if (kind === 'fuelDepot') {
    const tank = rgb(0.75, 0.72, 0.6);
    for (const [x, z] of [
      [-0.2, 0],
      [0.25, 0.1],
    ] as const) {
      m.combine(buildCylinder(0.45, 0.6, 10), vec3(x, 0.3, z), tank);
      for (const y of [0.15, 0.45]) m.combine(buildCylinder(0.47, 0.03, 10), vec3(x, y, z), STEEL); // bands
      m.combine(buildCylinder(0.12, 0.05, 6), vec3(x, 0.62, z), STEEL); // filler cap
    }
    m.combine(buildBox(vec3(0.5, 0.05, 0.05)), vec3(0.02, 0.1, 0.05), DARK); // pipe between the tanks
  } else {
    m.combine(
      buildCone(1.0, 0.6, 4),
      buildMatrix(vec3(0, 0.3, 0), vec3(0, Math.PI / 4, 0)),
      rgb(0.4, 0.45, 0.25),
    );
    // stacked crates by the tent flap
    m.combine(buildBox(vec3(0.2, 0.14, 0.14), 0.01), vec3(0.32, 0.07, -0.3), rgb(0.45, 0.35, 0.2));
    m.combine(buildBox(vec3(0.2, 0.14, 0.14), 0.01), vec3(0.32, 0.07, -0.14), rgb(0.4, 0.31, 0.18));
    m.combine(buildBox(vec3(0.18, 0.12, 0.13), 0.01), vec3(0.32, 0.2, -0.22), rgb(0.45, 0.35, 0.2));
  }
  // the resupply bell on its post, by the team pad
  m.combine(buildCylinder(0.03, 0.4, 4), vec3(-0.3, 0.2, 0.42), DARK);
  m.combine(buildCone(0.1, 0.09, 8), vec3(-0.3, 0.38, 0.42), rgb(0.85, 0.7, 0.25));
  m.combine(buildBox(vec3(0.3, 0.05, 0.3)), vec3(0, 0.02, 0.45), TEAM_COLORS[team]);
  return m;
}

export function buildWallBlock(): Mesh {
  const m = new Mesh();
  m.combine(buildBox(vec3(1, 0.7, 1), 0.02), vec3(0, 0.35, 0), rgb(0.55, 0.52, 0.45));
  m.combine(buildBox(vec3(1.02, 0.06, 1.02)), vec3(0, 0.72, 0), rgb(0.48, 0.45, 0.39)); // coping
  return m;
}

/** One tile of bridge deck; bridges are several tiles wide, so the rails are separate. */
export function buildBridgeDeck(): Mesh {
  const m = new Mesh();
  m.combine(buildBox(vec3(1, 0.1, 1)), vec3(0, 0.02, 0), rgb(0.45, 0.33, 0.2));
  // plank seams across the deck
  for (let i = 0; i < 4; i++)
    m.combine(buildBox(vec3(0.015, 0.01, 0.88)), vec3(-0.375 + i * 0.25, 0.075, 0), rgb(0.3, 0.22, 0.13));
  return m;
}

/** A tile's length of rail along the deck's -Z edge, turned to face whichever side has water. */
export function buildBridgeRail(): Mesh {
  const m = new Mesh();
  m.combine(buildBox(vec3(1, 0.12, 0.06)), vec3(0, 0.12, -0.47), DARK);
  m.combine(buildBox(vec3(0.06, 0.2, 0.08)), vec3(0, 0.15, -0.47), STEEL); // rail post
  return m;
}

/** ASV: long tracked chassis with a box rocket pod on the back and a cab up front, facing -Z. */
export function buildAsv(team: Team): Mesh {
  const m = new Mesh();
  m.combine(buildBox(vec3(0.7, 0.22, 1.15), 0.03), vec3(0, 0.22, 0), OLIVE);
  for (const side of [-1, 1])
    m.combine(buildBox(vec3(0.18, 0.22, 1.2), 0.04), vec3(side * 0.4, 0.11, 0), DARK);
  addRunningGear(m, 0.4, 1.2, 6);
  m.combine(buildBox(vec3(0.6, 0.22, 0.32), 0.03), vec3(0, 0.44, -0.38), OLIVE); // cab
  m.combine(buildBox(vec3(0.5, 0.06, 0.12)), vec3(0, 0.46, -0.56), DARK); // windscreen
  m.combine(buildBox(vec3(0.14, 0.03, 0.14)), vec3(0.15, 0.565, -0.36), DARK); // roof hatch
  for (const side of [-1, 1]) {
    m.combine(buildBox(vec3(0.07, 0.05, 0.03)), vec3(side * 0.24, 0.35, -0.59), LAMP);
    m.combine(buildBox(vec3(0.05, 0.03, 0.02)), vec3(side * 0.28, 0.3, 0.58), TAIL_LAMP);
  }
  m.combine(buildCylinder(0.06, 0.24, 6), vec3(-0.27, 0.62, -0.2), DARK); // exhaust stack
  m.combine(buildBox(vec3(0.62, 0.34, 0.62), 0.03), vec3(0, 0.52, 0.22), STEEL); // launcher pod
  for (const z of [0.02, 0.42]) m.combine(buildBox(vec3(0.66, 0.37, 0.04)), vec3(0, 0.52, z), OLIVE_DARK); // pod frame
  for (let i = 0; i < 6; i++) {
    const x = ((i % 3) - 1) * 0.18;
    const y = i < 3 ? 0.6 : 0.44;
    m.combine(buildBox(vec3(0.12, 0.12, 0.02)), vec3(x, y, -0.1), DARK); // tube mouths
  }
  m.combine(buildBox(vec3(0.6, 0.02, 0.1)), vec3(0, 0.7, 0.4), TEAM_COLORS[team]);
  return m;
}

export interface HeliMeshes {
  body: Mesh;
  rotor: Mesh;
  tailRotor: Mesh;
}

/** Helicopter: single main rotor, tail boom with tail rotor, stub wings with rocket pods, skids. */
export function buildHeli(team: Team): HeliMeshes {
  const body = new Mesh();
  body.combine(
    buildSphere(0.55, 12, 8),
    buildMatrix(vec3(0, 0.35, -0.1), vec3(), vec3(0.75, 0.7, 1.4)),
    OLIVE,
  );
  body.combine(buildSphere(0.3, 10, 6), buildMatrix(vec3(0, 0.45, -0.45), vec3(), vec3(0.9, 0.7, 1)), DARK);
  body.combine(buildSphere(0.12, 6, 4), vec3(0, 0.16, -0.72), STEEL); // chin sensor turret
  body.combine(
    buildCylinder(0.03, 0.22, 4),
    buildMatrix(vec3(0, 0.12, -0.84), vec3(Math.PI / 2, 0, 0)),
    DARK,
  ); // chin gun
  body.combine(buildBox(vec3(0.36, 0.12, 0.5), 0.03), vec3(0, 0.6, 0.05), OLIVE_DARK); // engine housing
  for (const side of [-1, 1])
    body.combine(buildBox(vec3(0.06, 0.06, 0.1)), vec3(side * 0.2, 0.6, 0.32), DARK); // exhausts
  body.combine(buildBox(vec3(0.12, 0.12, 1.0)), vec3(0, 0.42, 0.75), OLIVE); // tail boom
  body.combine(buildBox(vec3(0.04, 0.3, 0.2)), vec3(0, 0.55, 1.2), OLIVE); // fin
  body.combine(buildBox(vec3(0.42, 0.03, 0.12)), vec3(0, 0.42, 1.08), OLIVE); // tailplane
  body.combine(buildBox(vec3(0.9, 0.04, 0.16)), vec3(0, 0.3, 0), OLIVE); // stub wings
  for (const side of [-1, 1]) {
    body.combine(
      buildCylinder(0.1, 0.32, 6),
      buildMatrix(vec3(side * 0.42, 0.24, 0), vec3(Math.PI / 2, 0, 0)),
      STEEL,
    );
    body.combine(
      buildCone(0.1, 0.06, 6),
      buildMatrix(vec3(side * 0.42, 0.24, -0.19), vec3(-Math.PI / 2, 0, 0)),
      DARK,
    ); // pod nose
    body.combine(buildBox(vec3(0.04, 0.04, 0.8)), vec3(side * 0.24, 0.02, -0.05), DARK); // skids
    for (const z of [-0.25, 0.15])
      body.combine(buildBox(vec3(0.03, 0.18, 0.03)), vec3(side * 0.2, 0.1, z), DARK); // skid struts
  }
  body.combine(buildBox(vec3(0.3, 0.02, 0.3)), vec3(0, 0.67, 0.1), TEAM_COLORS[team]);
  const rotor = new Mesh();
  for (const a of [0, Math.PI / 2])
    rotor.combine(buildBox(vec3(2.1, 0.02, 0.1)), buildMatrix(vec3(), vec3(0, a, 0)), DARK);
  rotor.combine(buildCylinder(0.1, 0.1, 6), vec3(), STEEL);
  rotor.combine(buildCylinder(0.05, 0.08, 6), vec3(0, -0.07, 0), STEEL); // mast
  const tailRotor = new Mesh();
  tailRotor.combine(buildBox(vec3(0.02, 0.45, 0.06)), vec3(), DARK);
  return { body, rotor, tailRotor };
}

export interface JeepMeshes {
  body: Mesh;
  wheel: Mesh;
}

/** Jeep: open-top 4x4 body; the wheels are separate so they can swell when the tyres inflate. */
export function buildJeep(team: Team): JeepMeshes {
  const body = new Mesh();
  body.combine(buildBox(vec3(0.46, 0.16, 0.8), 0.03), vec3(0, 0.22, 0), OLIVE);
  body.combine(buildBox(vec3(0.42, 0.1, 0.24), 0.02), vec3(0, 0.33, -0.26), OLIVE); // bonnet
  body.combine(buildBox(vec3(0.42, 0.16, 0.03)), vec3(0, 0.38, -0.1), DARK); // windscreen
  body.combine(buildBox(vec3(0.36, 0.06, 0.3)), vec3(0, 0.33, 0.12), DARK); // seats
  for (const side of [-1, 1])
    body.combine(buildBox(vec3(0.14, 0.12, 0.03)), vec3(side * 0.1, 0.39, 0.05), DARK); // seat backs
  body.combine(buildTorus(0.1, 0.012, 8, 3), buildMatrix(vec3(-0.1, 0.4, -0.04), vec3(1.1, 0, 0)), DARK); // steering wheel
  // slatted grille and headlights on the nose
  body.combine(buildBox(vec3(0.3, 0.1, 0.02)), vec3(0, 0.28, -0.405), DARK);
  for (const side of [-1, 1])
    body.combine(
      buildCylinder(0.06, 0.02, 6),
      buildMatrix(vec3(side * 0.16, 0.3, -0.41), vec3(Math.PI / 2, 0, 0)),
      LAMP,
    );
  // roll bar over the rear seats
  for (const side of [-1, 1])
    body.combine(buildBox(vec3(0.025, 0.2, 0.025)), vec3(side * 0.2, 0.4, 0.22), STEEL);
  body.combine(buildBox(vec3(0.42, 0.025, 0.025)), vec3(0, 0.5, 0.22), STEEL);
  body.combine(wheel(0.22, 0.07, 10), buildMatrix(vec3(-0.08, 0.3, 0.43), vec3(0, Math.PI / 2, 0)), DARK); // spare tyre
  body.combine(buildCylinder(0.03, 0.4, 4), vec3(0.17, 0.45, 0.3), DARK); // radio aerial / flag mount
  body.combine(buildBox(vec3(0.42, 0.02, 0.1)), vec3(0, 0.31, 0.37), TEAM_COLORS[team]);
  const tyre = wheel(0.2, 0.08, 10).setColor(DARK);
  tyre.combine(wheel(0.1, 0.085, 6), vec3(), STEEL); // hub
  return { body, wheel: tyre };
}

export function buildMine(): Mesh {
  const m = new Mesh();
  m.combine(buildCylinder(0.28, 0.06, 10), vec3(0, 0.03, 0), rgb(0.25, 0.25, 0.2));
  m.combine(buildCylinder(0.08, 0.04, 6), vec3(0, 0.08, 0), rgb(0.5, 0.1, 0.1));
  return m;
}

/** The bunker light: a lamp on the pad that glows while the player can go down (SPEC §6). */
export function buildBunkerLamp(): Mesh {
  return new Mesh().combine(buildSphere(0.16, 8, 6), vec3(), WHITE);
}

/** Generic buildings by level variant: a house with a pitched roof, a long barracks, a hangar. */
export function buildBuilding(variant: string | undefined, team: Team): Mesh {
  const m = new Mesh();
  const wall = rgb(0.72, 0.66, 0.55);
  const roof = team === 'NEUTRAL' ? rgb(0.55, 0.25, 0.18) : TEAM_COLORS[team];
  switch (variant) {
    case 'barracks':
      m.combine(buildBox(vec3(0.95, 0.5, 0.6), 0.02), vec3(0, 0.25, 0), rgb(0.5, 0.52, 0.4));
      m.combine(buildBox(vec3(1.0, 0.06, 0.66)), vec3(0, 0.53, 0), DARK);
      for (let i = 0; i < 4; i++) {
        const x = -0.36 + i * 0.24;
        if (i === 1)
          m.combine(buildBox(vec3(0.14, 0.28, 0.02)), vec3(x, 0.14, -0.305), DARK); // door
        else m.combine(buildBox(vec3(0.12, 0.1, 0.02)), vec3(x, 0.3, -0.305), WINDOW);
        m.combine(buildBox(vec3(0.12, 0.1, 0.02)), vec3(x, 0.3, 0.305), WINDOW);
      }
      m.combine(buildBox(vec3(0.16, 0.1, 0.16)), vec3(0.3, 0.6, 0.1), STEEL); // roof vent
      break;
    case 'hangar': {
      const shell = buildCylinder(0.9, 0.9, 10);
      shell.transform(buildMatrix(vec3(0, 0, 0), vec3(Math.PI / 2, 0, 0)));
      m.combine(shell, buildMatrix(vec3(0, 0.05, 0), vec3(), vec3(1, 0.8, 1)), rgb(0.55, 0.57, 0.55));
      m.combine(buildBox(vec3(0.5, 0.4, 0.02)), vec3(0, 0.2, -0.46), DARK);
      m.combine(buildBox(vec3(0.58, 0.04, 0.03)), vec3(0, 0.42, -0.46), STEEL); // door rail
      // ribs over the shell
      for (const z of [-0.2, 0.2])
        m.combine(
          buildTorus(0.9, 0.02, 10, 3),
          buildMatrix(vec3(0, 0.05, z), vec3(Math.PI / 2, 0, 0), vec3(1, 1, 0.8)),
          STEEL,
        );
      break;
    }
    default:
      m.combine(buildBox(vec3(0.8, 0.5, 0.7), 0.02), vec3(0, 0.25, 0), wall);
      m.combine(
        buildCone(1.05, 0.4, 4),
        buildMatrix(vec3(0, 0.7, 0), vec3(0, Math.PI / 4, 0), vec3(1, 1, 0.85)),
        roof,
      );
      m.combine(buildBox(vec3(0.16, 0.26, 0.02)), vec3(0.15, 0.13, -0.36), DARK); // door
      m.combine(buildBox(vec3(0.16, 0.12, 0.02)), vec3(-0.18, 0.3, -0.36), WINDOW);
      for (const side of [-1, 1])
        m.combine(buildBox(vec3(0.02, 0.12, 0.14)), vec3(side * 0.41, 0.3, 0), WINDOW);
      m.combine(buildBox(vec3(0.1, 0.3, 0.1)), vec3(0.22, 0.75, 0.12), rgb(0.5, 0.35, 0.28)); // chimney
  }
  return m;
}

/** What a destroyed structure leaves: a low heap of broken blocks. */
export function buildRubble(): Mesh {
  const m = new Mesh();
  const blocks: [number, number, number, number][] = [
    [-0.2, -0.15, 0.3, 0.18],
    [0.18, -0.1, 0.26, 0.14],
    [0, 0.2, 0.34, 0.12],
    [-0.25, 0.2, 0.2, 0.1],
    [0.25, 0.25, 0.18, 0.08],
  ];
  blocks.forEach(([x, z, size, h], i) => {
    m.combine(
      buildBox(vec3(size, h, size * 0.8)),
      buildMatrix(vec3(x, h / 2, z), vec3(0, i * 0.7, 0)),
      i % 2 ? rgb(0.35, 0.32, 0.28) : rgb(0.25, 0.23, 0.2),
    );
  });
  return m;
}

export interface TurretMeshes {
  base: Mesh;
  head: Mesh;
}

/** Turrets: a gun turret has one barrel, a missile turret a box launcher; the head turns. */
export function buildTurretParts(variant: 'gun' | 'missile', team: Team): TurretMeshes {
  const base = new Mesh();
  base.combine(buildCylinder(0.75, 0.35, 10), vec3(0, 0.18, 0), rgb(0.45, 0.45, 0.42));
  base.combine(buildCylinder(0.8, 0.04, 10), vec3(0, 0.36, 0), TEAM_COLORS[team]);
  // sandbags heaped round the foot
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    base.combine(
      buildBox(vec3(0.24, 0.1, 0.12), 0.03),
      buildMatrix(vec3(Math.sin(a) * 0.44, 0.05, Math.cos(a) * 0.44), vec3(0, a, 0)),
      rgb(0.6, 0.55, 0.4),
    );
  }
  const head = new Mesh();
  if (variant === 'missile') {
    head.combine(buildBox(vec3(0.3, 0.2, 0.3)), vec3(0, 0.1, 0), rgb(0.4, 0.42, 0.38));
    for (const side of [-1, 1]) {
      head.combine(buildBox(vec3(0.16, 0.16, 0.5)), vec3(side * 0.2, 0.22, -0.05), STEEL);
      for (const dy of [-0.035, 0.035])
        head.combine(buildBox(vec3(0.05, 0.05, 0.01)), vec3(side * 0.2, 0.22 + dy, -0.3), DARK); // tube mouths
    }
    head.combine(buildBox(vec3(0.08, 0.1, 0.08)), vec3(0, 0.25, 0.08), DARK); // guidance radar
  } else {
    head.combine(buildBox(vec3(0.4, 0.25, 0.45), 0.03), vec3(0, 0.12, 0), rgb(0.4, 0.42, 0.38));
    head.combine(
      buildCylinder(0.08, 0.55, 6),
      buildMatrix(vec3(0, 0.15, -0.45), vec3(Math.PI / 2, 0, 0)),
      STEEL,
    );
    head.combine(
      buildCylinder(0.11, 0.08, 6),
      buildMatrix(vec3(0, 0.15, -0.7), vec3(Math.PI / 2, 0, 0)),
      DARK,
    ); // muzzle
    head.combine(buildBox(vec3(0.3, 0.03, 0.06)), vec3(0, 0.12, -0.24), DARK); // gun slit
    head.combine(buildBox(vec3(0.1, 0.06, 0.12)), vec3(0.1, 0.27, 0.05), STEEL); // sight
  }
  return { base, head };
}

/** A soldier, about a quarter of a tile tall, standing on the origin and facing -Z. */
export function buildSoldier(team: Team): Mesh {
  const m = new Mesh();
  const uniform = team === 'NEUTRAL' ? rgb(0.55, 0.5, 0.35) : TEAM_COLORS[team];
  m.combine(buildBox(vec3(0.05, 0.1, 0.05)), vec3(-0.03, 0.05, 0), DARK); // legs
  m.combine(buildBox(vec3(0.05, 0.1, 0.05)), vec3(0.03, 0.05, 0), DARK);
  m.combine(buildBox(vec3(0.12, 0.12, 0.07)), vec3(0, 0.16, 0), uniform);
  m.combine(buildSphere(0.07, 6, 4), vec3(0, 0.26, 0), rgb(0.85, 0.65, 0.5));
  m.combine(buildSphere(0.08, 6, 3), buildMatrix(vec3(0, 0.285, 0), vec3(), vec3(1, 0.55, 1)), OLIVE_DARK); // helmet
  m.combine(buildBox(vec3(0.03, 0.12, 0.03)), vec3(0.08, 0.26, 0), uniform); // raised arm, to wave
  m.combine(buildBox(vec3(0.02, 0.02, 0.16)), vec3(-0.08, 0.16, -0.04), DARK); // rifle
  return m;
}

/** The submarine: a long dark hull with a conning tower, facing -Z. */
export function buildSubmarine(): Mesh {
  const m = new Mesh();
  m.combine(
    buildSphere(1, 12, 8),
    buildMatrix(vec3(0, 0, 0), vec3(), vec3(0.6, 0.45, 3)),
    rgb(0.12, 0.13, 0.15),
  );
  const hull = rgb(0.15, 0.16, 0.18);
  m.combine(buildBox(vec3(0.3, 0.5, 0.7), 0.05), vec3(0, 0.35, -0.2), hull);
  m.combine(buildBox(vec3(0.8, 0.04, 0.2)), vec3(0, 0.45, -0.3), hull);
  m.combine(buildCylinder(0.04, 0.3, 4), vec3(0.05, 0.7, -0.3), STEEL); // periscope
  m.combine(buildBox(vec3(0.03, 0.2, 0.04)), vec3(-0.06, 0.65, -0.1), STEEL); // mast
  // cruciform tail fins and the screw
  m.combine(buildBox(vec3(0.7, 0.03, 0.22)), vec3(0, 0, 1.3), hull);
  m.combine(buildBox(vec3(0.03, 0.55, 0.22)), vec3(0, 0, 1.3), hull);
  m.combine(
    buildCone(0.14, 0.12, 6),
    buildMatrix(vec3(0, 0, 1.52), vec3(Math.PI / 2, 0, 0)),
    rgb(0.55, 0.45, 0.25),
  );
  // deck hatches and the missile doors
  m.combine(buildCylinder(0.12, 0.03, 8), vec3(0, 0.18, -0.9), rgb(0.2, 0.21, 0.23));
  for (let i = 0; i < 3; i++)
    m.combine(buildBox(vec3(0.16, 0.03, 0.14)), vec3(0, 0.215, 0.3 + i * 0.2), rgb(0.22, 0.23, 0.25));
  return m;
}

export interface FlagMeshes {
  pole: Mesh;
  cloth: Mesh;
}

/** A flag on a short pole; the cloth is separate so it can flutter. The pole stands on the origin. */
export function buildFlag(team: Team): FlagMeshes {
  const pole = new Mesh();
  pole.combine(buildCylinder(0.04, 0.9, 6), vec3(0, 0.45, 0), rgb(0.85, 0.85, 0.8));
  pole.combine(buildSphere(0.08, 6, 4), vec3(0, 0.92, 0), rgb(0.9, 0.8, 0.3));
  const cloth = new Mesh();
  // hangs from the pole toward +X, its edge on the cloth object's origin
  cloth.combine(buildBox(vec3(0.42, 0.28, 0.02)), vec3(0.21, 0, 0), TEAM_COLORS[team]);
  cloth.combine(buildBox(vec3(0.14, 0.1, 0.025)), vec3(0.21, 0, 0), WHITE);
  return { pole, cloth };
}

/** A CPU drone: a small hovering saucer with four rotor rings and a gun under the nose, facing -Z. */
export function buildDrone(team: Team): Mesh {
  const m = new Mesh();
  m.combine(buildCylinder(0.36, 0.12, 10), vec3(), rgb(0.3, 0.3, 0.32));
  m.combine(buildSphere(0.2, 8, 5), vec3(0, 0.08, 0), TEAM_COLORS[team]);
  for (const [x, z] of [
    [-0.24, -0.24],
    [0.24, -0.24],
    [-0.24, 0.24],
    [0.24, 0.24],
  ] as const) {
    m.combine(buildTorus(0.24, 0.04, 10, 4), vec3(x, 0.04, z), DARK);
  }
  m.combine(buildCylinder(0.04, 0.3, 5), buildMatrix(vec3(0, -0.08, -0.2), vec3(Math.PI / 2, 0, 0)), STEEL);
  // a strut out to each rotor ring, and a red and a green nav light
  for (const a of [0.25, 0.75, 1.25, 1.75])
    m.combine(
      buildBox(vec3(0.03, 0.02, 0.3)),
      buildMatrix(
        vec3(Math.sin(a * Math.PI) * 0.17, 0.03, Math.cos(a * Math.PI) * 0.17),
        vec3(0, a * Math.PI, 0),
      ),
      STEEL,
    );
  m.combine(buildSphere(0.04, 4, 3), vec3(-0.18, 0.05, -0.05), rgb(0.9, 0.15, 0.1));
  m.combine(buildSphere(0.04, 4, 3), vec3(0.18, 0.05, -0.05), rgb(0.15, 0.9, 0.2));
  return m;
}
