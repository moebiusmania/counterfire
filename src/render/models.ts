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
const DARK = rgb(0.12, 0.12, 0.1);
const STEEL = rgb(0.25, 0.27, 0.22);

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
  // team stripe across the rear deck
  hull.combine(buildBox(vec3(0.5, 0.02, 0.12)), vec3(0, 0.32, 0.36), TEAM_COLORS[team]);

  const turret = new Mesh();
  turret.combine(buildCylinder(0.46, 0.16, 12), vec3(0, 0.08, 0.04), OLIVE);
  const barrel = buildCylinder(0.07, 0.6, 8);
  turret.combine(barrel, buildMatrix(vec3(0, 0.09, -0.42), vec3(Math.PI / 2, 0, 0)), STEEL);
  turret.combine(buildBox(vec3(0.1, 0.06, 0.1)), vec3(0.1, 0.19, 0.08), DARK); // commander's hatch
  return { hull, turret };
}

/** A conifer for forest tiles. */
export function buildTree(): Mesh {
  const tree = new Mesh();
  tree.combine(buildCylinder(0.14, 0.3, 6), vec3(0, 0.15, 0), rgb(0.35, 0.22, 0.1));
  tree.combine(buildCone(0.8, 0.9, 7), vec3(0, 0.65, 0), rgb(0.1, 0.35, 0.12));
  tree.combine(buildCone(0.55, 0.6, 7), vec3(0, 1.0, 0), rgb(0.13, 0.42, 0.15));
  return tree;
}

/** Bunker: a low concrete pad with the elevator hatch in team colour. */
export function buildBunker(team: Team): Mesh {
  const m = new Mesh();
  m.combine(buildBox(vec3(1.8, 0.08, 1.8), 0.04), vec3(0, 0.04, 0), rgb(0.5, 0.5, 0.48));
  m.combine(buildBox(vec3(1.1, 0.02, 1.1)), vec3(0, 0.09, 0), TEAM_COLORS[team]);
  m.combine(buildBox(vec3(0.9, 0.03, 0.9)), vec3(0, 0.1, 0), rgb(0.2, 0.2, 0.2));
  return m;
}

export function buildFlagTower(team: Team): Mesh {
  const m = new Mesh();
  m.combine(buildBox(vec3(0.8, 1.4, 0.8), 0.03), vec3(0, 0.7, 0), rgb(0.62, 0.58, 0.5));
  m.combine(buildBox(vec3(0.9, 0.12, 0.9)), vec3(0, 1.46, 0), TEAM_COLORS[team]);
  return m;
}

export function buildDepot(kind: 'fuelDepot' | 'ammoTent', team: Team): Mesh {
  const m = new Mesh();
  if (kind === 'fuelDepot') {
    m.combine(buildCylinder(0.45, 0.6, 10), vec3(-0.2, 0.3, 0), rgb(0.75, 0.72, 0.6));
    m.combine(buildCylinder(0.45, 0.6, 10), vec3(0.25, 0.3, 0.1), rgb(0.75, 0.72, 0.6));
  } else {
    m.combine(
      buildCone(1.0, 0.6, 4),
      buildMatrix(vec3(0, 0.3, 0), vec3(0, Math.PI / 4, 0)),
      rgb(0.4, 0.45, 0.25),
    );
  }
  m.combine(buildBox(vec3(0.3, 0.05, 0.3)), vec3(0, 0.02, 0.45), TEAM_COLORS[team]);
  return m;
}

export function buildWallBlock(): Mesh {
  return new Mesh().combine(buildBox(vec3(1, 0.7, 1), 0.02), vec3(0, 0.35, 0), rgb(0.55, 0.52, 0.45));
}

export function buildBridgeDeck(): Mesh {
  const m = new Mesh();
  m.combine(buildBox(vec3(1, 0.1, 1)), vec3(0, 0.02, 0), rgb(0.45, 0.33, 0.2));
  for (const side of [-1, 1]) m.combine(buildBox(vec3(1, 0.12, 0.06)), vec3(0, 0.12, side * 0.47), DARK);
  return m;
}

/** ASV: long tracked chassis with a box rocket pod on the back and a cab up front, facing -Z. */
export function buildAsv(team: Team): Mesh {
  const m = new Mesh();
  m.combine(buildBox(vec3(0.7, 0.22, 1.15), 0.03), vec3(0, 0.22, 0), OLIVE);
  for (const side of [-1, 1])
    m.combine(buildBox(vec3(0.18, 0.22, 1.2), 0.04), vec3(side * 0.4, 0.11, 0), DARK);
  m.combine(buildBox(vec3(0.6, 0.22, 0.32), 0.03), vec3(0, 0.44, -0.38), OLIVE); // cab
  m.combine(buildBox(vec3(0.5, 0.06, 0.12)), vec3(0, 0.46, -0.56), DARK); // windscreen
  m.combine(buildBox(vec3(0.62, 0.34, 0.62), 0.03), vec3(0, 0.52, 0.22), STEEL); // launcher pod
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
  body.combine(buildBox(vec3(0.12, 0.12, 1.0)), vec3(0, 0.42, 0.75), OLIVE); // tail boom
  body.combine(buildBox(vec3(0.04, 0.3, 0.2)), vec3(0, 0.55, 1.2), OLIVE); // fin
  body.combine(buildBox(vec3(0.9, 0.04, 0.16)), vec3(0, 0.3, 0), OLIVE); // stub wings
  for (const side of [-1, 1]) {
    body.combine(
      buildCylinder(0.1, 0.32, 6),
      buildMatrix(vec3(side * 0.42, 0.24, 0), vec3(Math.PI / 2, 0, 0)),
      STEEL,
    );
    body.combine(buildBox(vec3(0.04, 0.04, 0.8)), vec3(side * 0.24, 0.02, -0.05), DARK); // skids
  }
  body.combine(buildBox(vec3(0.3, 0.02, 0.3)), vec3(0, 0.62, 0.1), TEAM_COLORS[team]);
  const rotor = new Mesh();
  for (const a of [0, Math.PI / 2])
    rotor.combine(buildBox(vec3(2.1, 0.02, 0.1)), buildMatrix(vec3(), vec3(0, a, 0)), DARK);
  rotor.combine(buildCylinder(0.1, 0.1, 6), vec3(), STEEL);
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
  body.combine(buildCylinder(0.03, 0.4, 4), vec3(0.17, 0.45, 0.3), DARK); // radio aerial / flag mount
  body.combine(buildBox(vec3(0.42, 0.02, 0.1)), vec3(0, 0.31, 0.37), TEAM_COLORS[team]);
  const wheel = buildCylinder(0.2, 0.08, 10);
  wheel.transform(buildMatrix(vec3(), vec3(0, 0, Math.PI / 2)));
  wheel.setColor(DARK);
  return { body, wheel };
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
      break;
    case 'hangar': {
      const shell = buildCylinder(0.9, 0.9, 10);
      shell.transform(buildMatrix(vec3(0, 0, 0), vec3(Math.PI / 2, 0, 0)));
      m.combine(shell, buildMatrix(vec3(0, 0.05, 0), vec3(), vec3(1, 0.8, 1)), rgb(0.55, 0.57, 0.55));
      m.combine(buildBox(vec3(0.5, 0.4, 0.02)), vec3(0, 0.2, -0.46), DARK);
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
  const head = new Mesh();
  if (variant === 'missile') {
    head.combine(buildBox(vec3(0.3, 0.2, 0.3)), vec3(0, 0.1, 0), rgb(0.4, 0.42, 0.38));
    for (const side of [-1, 1])
      head.combine(buildBox(vec3(0.16, 0.16, 0.5)), vec3(side * 0.2, 0.22, -0.05), STEEL);
  } else {
    head.combine(buildBox(vec3(0.4, 0.25, 0.45), 0.03), vec3(0, 0.12, 0), rgb(0.4, 0.42, 0.38));
    head.combine(
      buildCylinder(0.08, 0.55, 6),
      buildMatrix(vec3(0, 0.15, -0.45), vec3(Math.PI / 2, 0, 0)),
      STEEL,
    );
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
  m.combine(buildBox(vec3(0.03, 0.12, 0.03)), vec3(0.08, 0.26, 0), uniform); // raised arm, to wave
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
  m.combine(buildBox(vec3(0.3, 0.5, 0.7), 0.05), vec3(0, 0.35, -0.2), rgb(0.15, 0.16, 0.18));
  m.combine(buildBox(vec3(0.8, 0.04, 0.2)), vec3(0, 0.45, -0.3), rgb(0.15, 0.16, 0.18));
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
  return m;
}
