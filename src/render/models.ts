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
  type Vector3,
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

const SLUG_METAL = rgb(0.55, 0.57, 0.6);
const SLUG_METAL_DARK = rgb(0.38, 0.4, 0.43);
const GUNMETAL = rgb(0.26, 0.28, 0.31);

/**
 * The tank's Metal Slug skin, after the SV-001 of the arcade series, built like the standard tank: a
 * short grey steel hull with rounded armour and a raised front, and a round turret with the
 * stubby cannon low and the twin Vulcans on top, a closed hatch behind. Same footprint and turret
 * pivot as the tank.
 */
export function buildMetalSlug(team: Team): TankMeshes {
  const hull = new Mesh();
  hull.combine(buildBox(vec3(0.6, 0.22, 0.86), 0.06), vec3(0, 0.21, 0.02), SLUG_METAL);
  for (const side of [-1, 1]) {
    hull.combine(buildBox(vec3(0.18, 0.2, 0.96), 0.06), vec3(side * 0.36, 0.1, 0), DARK); // tracks
    for (let i = 0; i < 4; i++) {
      const z = -0.33 + i * 0.22;
      hull.combine(wheel(0.17, 0.03, 10), vec3(side * 0.455, 0.1, z), GUNMETAL);
      hull.combine(wheel(0.07, 0.035, 6), vec3(side * 0.455, 0.1, z), SLUG_METAL_DARK); // hub
    }
    // rounded fenders over the tracks, and the round headlamps in the raised front
    hull.combine(buildBox(vec3(0.21, 0.05, 0.98), 0.025), vec3(side * 0.36, 0.215, 0), SLUG_METAL_DARK);
    hull.combine(
      buildCylinder(0.07, 0.03, 8),
      buildMatrix(vec3(side * 0.18, 0.27, -0.42), vec3(Math.PI / 2, 0, 0)),
      LAMP,
    );
    hull.combine(
      buildCylinder(0.05, 0.08, 6),
      buildMatrix(vec3(side * 0.18, 0.25, 0.46), vec3(Math.PI / 2, 0, 0)),
      DARK,
    ); // exhausts
  }
  hull.combine(
    buildBox(vec3(0.52, 0.04, 0.18), 0.015),
    buildMatrix(vec3(0, 0.3, -0.38), vec3(0.4, 0, 0)),
    SLUG_METAL_DARK,
  ); // raised front plate
  for (let i = 0; i < 3; i++)
    hull.combine(buildBox(vec3(0.34, 0.015, 0.03)), vec3(0, 0.325, 0.2 + i * 0.06), DARK); // engine louvres
  hull.combine(buildBox(vec3(0.46, 0.02, 0.1)), vec3(0, 0.325, 0.39), TEAM_COLORS[team]);

  const turret = new Mesh();
  turret.combine(buildCylinder(0.44, 0.16, 12), vec3(0, 0.08, 0.04), SLUG_METAL);
  turret.combine(buildCylinder(0.48, 0.03, 12), vec3(0, 0.015, 0.04), SLUG_METAL_DARK); // ring
  // the stubby cannon low in a round mantlet, with its muzzle brake
  turret.combine(buildSphere(0.16, 8, 6), vec3(0, 0.08, -0.17), SLUG_METAL_DARK);
  turret.combine(
    buildCylinder(0.09, 0.3, 8),
    buildMatrix(vec3(0, 0.08, -0.36), vec3(Math.PI / 2, 0, 0)),
    GUNMETAL,
  );
  turret.combine(buildBox(vec3(0.13, 0.09, 0.07), 0.01), vec3(0, 0.08, -0.53), DARK);
  // the twin Vulcans on their cradle on top
  turret.combine(buildBox(vec3(0.16, 0.06, 0.14), 0.015), vec3(0, 0.19, -0.08), GUNMETAL);
  for (const side of [-1, 1])
    turret.combine(
      buildCylinder(0.035, 0.32, 6),
      buildMatrix(vec3(side * 0.045, 0.2, -0.29), vec3(Math.PI / 2, 0, 0)),
      DARK,
    );
  turret.combine(buildCylinder(0.15, 0.04, 10), vec3(0.04, 0.18, 0.12), SLUG_METAL_DARK); // closed hatch
  turret.combine(buildCylinder(0.015, 0.36, 4), vec3(-0.15, 0.34, 0.2), DARK); // aerial
  turret.combine(buildBox(vec3(0.1, 0.012, 0.1)), vec3(-0.11, 0.165, 0.1), TEAM_COLORS[team]);
  return { hull, turret };
}

const UNSC_GREEN = rgb(0.36, 0.41, 0.3);
const UNSC_GREEN_DARK = rgb(0.26, 0.3, 0.22);
const UNSC_GREY = rgb(0.42, 0.43, 0.42);

/**
 * The tank's Scorpion skin, after the M808 of the Halo series: a wide, flat, faceted hull riding on
 * four separate track pods at its corners, and a low angular turret with a very long main gun and
 * a coaxial machine gun beside it. Same footprint and turret pivot as the tank.
 */
export function buildScorpion(team: Team): TankMeshes {
  const hull = new Mesh();
  hull.combine(buildBox(vec3(0.42, 0.14, 0.86), 0.02), vec3(0, 0.25, 0), UNSC_GREEN); // spine
  hull.combine(
    buildBox(vec3(0.4, 0.03, 0.22)),
    buildMatrix(vec3(0, 0.27, -0.47), vec3(0.5, 0, 0)),
    UNSC_GREEN_DARK,
  ); // glacis
  hull.combine(
    buildBox(vec3(0.4, 0.03, 0.16)),
    buildMatrix(vec3(0, 0.28, 0.46), vec3(-0.6, 0, 0)),
    UNSC_GREEN_DARK,
  ); // rear wedge
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const x = side * 0.34;
      const z = end * 0.3;
      // a track pod: the track, its road wheels, the armoured housing with its nose angled away
      hull.combine(buildBox(vec3(0.17, 0.17, 0.36), 0.05), vec3(x, 0.1, z), DARK);
      for (let i = 0; i < 3; i++)
        hull.combine(wheel(0.1, 0.03, 8), vec3(x + side * 0.09, 0.09, z + (i - 1) * 0.11), UNSC_GREY);
      hull.combine(buildBox(vec3(0.2, 0.07, 0.3), 0.015), vec3(x, 0.22, z), UNSC_GREEN);
      hull.combine(
        buildBox(vec3(0.2, 0.025, 0.12)),
        buildMatrix(vec3(x, 0.2, z + end * 0.19), vec3(-end * 0.6, 0, 0)),
        UNSC_GREEN_DARK,
      );
      hull.combine(buildBox(vec3(0.1, 0.05, 0.1)), vec3(side * 0.23, 0.2, z), UNSC_GREY); // pod arm
    }
    hull.combine(buildBox(vec3(0.06, 0.03, 0.02)), vec3(side * 0.13, 0.29, -0.43), LAMP); // light bar
    hull.combine(buildBox(vec3(0.04, 0.025, 0.02)), vec3(side * 0.15, 0.27, 0.48), TAIL_LAMP);
  }
  // engine deck grilles and the team stripe ahead of them
  for (let i = 0; i < 4; i++)
    hull.combine(buildBox(vec3(0.3, 0.012, 0.025)), vec3(0, 0.325, 0.22 + i * 0.05), DARK);
  hull.combine(buildBox(vec3(0.34, 0.02, 0.06)), vec3(0, 0.325, -0.3), TEAM_COLORS[team]);

  const turret = new Mesh();
  turret.combine(buildCylinder(0.38, 0.06, 10), vec3(0, 0.02, 0.02), UNSC_GREY); // ring
  turret.combine(buildBox(vec3(0.38, 0.11, 0.36), 0.02), vec3(0, 0.08, 0.06), UNSC_GREEN); // body
  turret.combine(
    buildBox(vec3(0.34, 0.025, 0.16)),
    buildMatrix(vec3(0, 0.1, -0.15), vec3(0.45, 0, 0)),
    UNSC_GREEN_DARK,
  ); // sloped face
  for (const side of [-1, 1])
    turret.combine(
      buildBox(vec3(0.02, 0.1, 0.32)),
      buildMatrix(vec3(side * 0.2, 0.08, 0.06), vec3(0, 0, side * 0.3)),
      UNSC_GREEN_DARK,
    ); // angled cheeks
  turret.combine(buildBox(vec3(0.3, 0.08, 0.12), 0.015), vec3(0, 0.08, 0.3), UNSC_GREEN_DARK); // bustle
  // the long main gun: sleeve, barrel and a boxy muzzle brake
  turret.combine(buildBox(vec3(0.12, 0.1, 0.12), 0.02), vec3(0, 0.09, -0.2), UNSC_GREY);
  turret.combine(
    buildCylinder(0.06, 0.72, 8),
    buildMatrix(vec3(0, 0.09, -0.6), vec3(Math.PI / 2, 0, 0)),
    UNSC_GREY,
  );
  turret.combine(buildBox(vec3(0.1, 0.08, 0.12)), vec3(0, 0.09, -0.98), DARK);
  // the coaxial machine gun on the right, a sensor block and the commander's hatch
  turret.combine(buildBox(vec3(0.06, 0.06, 0.1)), vec3(0.13, 0.1, -0.16), DARK);
  turret.combine(
    buildCylinder(0.025, 0.22, 6),
    buildMatrix(vec3(0.13, 0.1, -0.31), vec3(Math.PI / 2, 0, 0)),
    DARK,
  );
  turret.combine(buildBox(vec3(0.08, 0.04, 0.06)), vec3(-0.11, 0.155, -0.04), DARK);
  turret.combine(buildCylinder(0.1, 0.025, 8), vec3(0.06, 0.145, 0.12), UNSC_GREY);
  turret.combine(buildBox(vec3(0.1, 0.012, 0.1)), vec3(-0.08, 0.14, 0.2), TEAM_COLORS[team]);
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

const VAN_BLACK = rgb(0.1, 0.1, 0.11);
const VAN_GREY = rgb(0.45, 0.46, 0.48);
const VAN_RED = rgb(0.75, 0.1, 0.08);
const CHROME = rgb(0.78, 0.78, 0.8);

/**
 * The ASV's A-Team skin: the early-80s full-size van, black over metallic grey with the red stripe
 * that sweeps up at the back, a red roof spoiler and red rims. It fires and lays mines the same as
 * the ASV, from the same footprint.
 */
export function buildATeamVan(team: Team): Mesh {
  const m = new Mesh();
  // grey below the beltline, the black box above it, the short bonnet and the raked windscreen
  m.combine(buildBox(vec3(0.62, 0.22, 1.1), 0.02), vec3(0, 0.25, 0), VAN_GREY);
  m.combine(buildBox(vec3(0.62, 0.3, 0.8), 0.02), vec3(0, 0.51, 0.15), VAN_BLACK);
  m.combine(
    buildBox(vec3(0.6, 0.04, 0.22), 0.01),
    buildMatrix(vec3(0, 0.37, -0.43), vec3(-0.08, 0, 0)),
    VAN_BLACK,
  );
  const rake = vec3(0.39, 0, 0);
  m.combine(buildBox(vec3(0.62, 0.29, 0.04)), buildMatrix(vec3(0, 0.505, -0.29), rake), VAN_BLACK);
  m.combine(buildBox(vec3(0.54, 0.24, 0.01)), buildMatrix(vec3(0, 0.51, -0.315), rake), WINDOW);
  for (const side of [-1, 1]) {
    // the red stripe along the beltline and its kick up over the back wheel
    m.combine(buildBox(vec3(0.006, 0.035, 0.78)), vec3(side * 0.312, 0.37, -0.12), VAN_RED);
    m.combine(
      buildBox(vec3(0.006, 0.035, 0.34)),
      buildMatrix(vec3(side * 0.312, 0.47, 0.37), vec3(-0.75, 0, 0)),
      VAN_RED,
    );
    // cab window, the sliding door's seams, the mirror
    m.combine(buildBox(vec3(0.006, 0.15, 0.2)), vec3(side * 0.313, 0.54, -0.12), WINDOW);
    for (const z of [0.04, 0.4])
      m.combine(buildBox(vec3(0.004, 0.42, 0.006)), vec3(side * 0.312, 0.43, z), DARK);
    m.combine(buildBox(vec3(0.04, 0.07, 0.03)), vec3(side * 0.33, 0.5, -0.27), DARK);
    // wheels with the red rims, front and back
    for (const z of [-0.36, 0.36]) {
      m.combine(wheel(0.25, 0.1, 10), vec3(side * 0.28, 0.125, z), DARK);
      m.combine(wheel(0.15, 0.105, 8), vec3(side * 0.28, 0.125, z), VAN_RED);
      m.combine(wheel(0.05, 0.11, 6), vec3(side * 0.28, 0.125, z), CHROME);
    }
    // square headlamps either side of the grille, tall tail lamps, the rear door windows
    m.combine(buildBox(vec3(0.1, 0.06, 0.01)), vec3(side * 0.22, 0.32, -0.552), LAMP);
    m.combine(buildBox(vec3(0.05, 0.14, 0.01)), vec3(side * 0.28, 0.3, 0.552), TAIL_LAMP);
    m.combine(buildBox(vec3(0.2, 0.12, 0.01)), vec3(side * 0.13, 0.55, 0.552), WINDOW);
    m.combine(buildBox(vec3(0.03, 0.08, 0.06)), vec3(side * 0.24, 0.7, 0.48), VAN_RED); // spoiler post
  }
  // the grille, chrome bumpers, the red spoiler, a sunroof and the team stripe across the roof
  m.combine(buildBox(vec3(0.3, 0.1, 0.01)), vec3(0, 0.32, -0.552), DARK);
  for (let i = 0; i < 4; i++)
    m.combine(buildBox(vec3(0.28, 0.006, 0.006)), vec3(0, 0.285 + i * 0.024, -0.558), CHROME);
  for (const end of [-1, 1])
    m.combine(buildBox(vec3(0.64, 0.05, 0.05), 0.01), vec3(0, 0.17, end * 0.56), CHROME);
  m.combine(buildBox(vec3(0.6, 0.025, 0.13), 0.008), vec3(0, 0.75, 0.47), VAN_RED);
  m.combine(buildBox(vec3(0.2, 0.015, 0.16)), vec3(0, 0.665, -0.05), WINDOW);
  m.combine(buildBox(vec3(0.42, 0.012, 0.1)), vec3(0, 0.665, 0.2), TEAM_COLORS[team]);
  return m;
}

export interface HeliMeshes {
  body: Mesh;
  /** The rotors, which a fixed-wing skin does without. */
  rotor?: Mesh;
  tailRotor?: Mesh;
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
  // the chin turret tucked under the nose, its gun pointing out ahead
  body.combine(buildSphere(0.12, 6, 4), vec3(0, 0.2, -0.42), STEEL);
  body.combine(
    buildCylinder(0.03, 0.22, 4),
    buildMatrix(vec3(0, 0.18, -0.53), vec3(Math.PI / 2, 0, 0)),
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
    // skid struts leaning in from the skid to meet the belly
    for (const z of [-0.25, 0.15])
      body.combine(
        buildBox(vec3(0.03, 0.22, 0.03)),
        buildMatrix(vec3(side * 0.17, 0.115, z), vec3(0, 0, side * 0.69)),
        DARK,
      );
  }
  body.combine(buildBox(vec3(0.3, 0.02, 0.3)), vec3(0, 0.67, 0.1), TEAM_COLORS[team]);
  const rotor = new Mesh();
  for (const a of [0, Math.PI / 2])
    rotor.combine(buildBox(vec3(2.1, 0.02, 0.1)), buildMatrix(vec3(), vec3(0, a, 0)), DARK);
  rotor.combine(buildCylinder(0.1, 0.1, 6), vec3(), STEEL);
  rotor.combine(buildCylinder(0.05, 0.08, 6), vec3(0, -0.07, 0), STEEL); // mast
  const tailRotor = new Mesh();
  tailRotor.combine(buildBox(vec3(0.02, 0.45, 0.06)), vec3(), DARK);
  tailRotor.combine(wheel(0.06, 0.04, 6), vec3(-0.015, 0, 0), STEEL); // hub, against the fin
  return { body, rotor, tailRotor };
}

/** A faceted shell from flat triangles, each drawn from both sides so its winding never matters. */
function facets(triangles: readonly (readonly [Vector3, Vector3, Vector3])[], color: Color): Mesh {
  const m = new Mesh();
  for (const [a, b, c] of triangles) {
    m.addQuad(a, b, c, c, color);
    m.addQuad(c, b, a, a, color);
  }
  return m;
}

const STEALTH = rgb(0.15, 0.15, 0.17);
const STEALTH_LIGHT = rgb(0.22, 0.22, 0.25);
const CANOPY = rgb(0.3, 0.26, 0.16);

/**
 * The helicopter's F-117A skin: the faceted black stealth jet, a swept flying wing with a sawtooth
 * trailing edge, the canopy at the peak of its facets and a V-tail canted outward. It has no rotors;
 * the gun and rockets fly the same as the helicopter's.
 */
export function buildF117(team: Team): HeliMeshes {
  const nose = vec3(0, 0.34, -0.78);
  const peak = vec3(0, 0.48, -0.22);
  const spine = vec3(0, 0.45, 0.22);
  const tail = vec3(0, 0.36, 0.48);
  const body = new Mesh();
  for (const side of [-1, 1]) {
    const tip = vec3(side * 0.52, 0.3, 0.34);
    const notch = vec3(side * 0.28, 0.31, 0.2);
    const corner = vec3(side * 0.13, 0.33, 0.52);
    const shoulder = vec3(side * 0.17, 0.42, -0.02);
    // the top in two shades, so the facets catch the light apart, and the flat underside
    body.combine(
      facets(
        [
          [nose, peak, shoulder],
          [peak, spine, shoulder],
          [shoulder, spine, notch],
          [spine, corner, notch],
        ],
        STEALTH,
      ),
    );
    body.combine(
      facets(
        [
          [nose, shoulder, tip],
          [shoulder, notch, tip],
          [spine, tail, corner],
        ],
        STEALTH_LIGHT,
      ),
    );
    body.combine(
      facets(
        [
          [nose, tip, notch],
          [nose, notch, corner],
          [nose, corner, tail],
        ],
        STEALTH,
      ),
    );
    // the V-tail, canted out
    body.combine(
      facets(
        [
          [vec3(side * 0.1, 0.44, 0.18), vec3(side * 0.13, 0.37, 0.5), vec3(side * 0.31, 0.64, 0.58)],
          [vec3(side * 0.1, 0.44, 0.18), vec3(side * 0.31, 0.64, 0.58), vec3(side * 0.27, 0.64, 0.42)],
        ],
        STEALTH_LIGHT,
      ),
    );
    // the canopy's side panes, and the gridded intake behind each
    body.combine(facets([[vec3(0, 0.45, -0.4), vec3(side * 0.08, 0.42, -0.3), peak]], CANOPY));
    body.combine(
      buildBox(vec3(0.03, 0.05, 0.1)),
      buildMatrix(vec3(side * 0.17, 0.41, -0.06), vec3(0, 0, side * 0.5)),
      DARK,
    );
    for (let i = 0; i < 3; i++)
      body.combine(
        buildBox(vec3(0.035, 0.005, 0.1)),
        buildMatrix(vec3(side * 0.172, 0.395 + i * 0.015, -0.06), vec3(0, 0, side * 0.5)),
        STEALTH_LIGHT,
      );
    // two of the four probes at the nose, the main gear and its wheel, the navigation lamps
    for (const x of [0.02, 0.05])
      body.combine(
        buildCylinder(0.008, 0.12, 4),
        buildMatrix(vec3(side * x, 0.34, -0.82), vec3(Math.PI / 2, 0, 0)),
        STEEL,
      );
    body.combine(buildBox(vec3(0.02, 0.22, 0.02)), vec3(side * 0.16, 0.19, 0.12), STEEL);
    body.combine(wheel(0.09, 0.04, 8), vec3(side * 0.16, 0.05, 0.12), DARK);
    body.combine(buildBox(vec3(0.012, 0.12, 0.08)), vec3(side * 0.13, 0.22, 0.12), STEALTH); // gear door
    body.combine(
      buildSphere(0.025, 6, 4),
      vec3(side * 0.5, 0.3, 0.33),
      side < 0 ? TAIL_LAMP : rgb(0.2, 0.8, 0.3),
    );
    body.combine(buildSphere(0.02, 6, 4), vec3(side * 0.3, 0.645, 0.56), LAMP); // fin-tip lamp
  }
  body.combine(facets([[vec3(0, 0.45, -0.4), vec3(-0.08, 0.42, -0.3), vec3(0.08, 0.42, -0.3)]], CANOPY)); // windscreen
  // the nose gear, the flat exhaust slot between the tails, and the team stripe down the spine
  body.combine(buildBox(vec3(0.02, 0.24, 0.02)), vec3(0, 0.2, -0.5), STEEL);
  body.combine(wheel(0.08, 0.035, 8), vec3(0, 0.04, -0.5), DARK);
  body.combine(buildBox(vec3(0.24, 0.025, 0.05)), vec3(0, 0.36, 0.5), DARK);
  for (let i = 0; i < 5; i++)
    body.combine(buildBox(vec3(0.005, 0.02, 0.05)), vec3(-0.1 + i * 0.05, 0.36, 0.52), STEEL); // exhaust vanes
  body.combine(
    buildBox(vec3(0.05, 0.01, 0.3)),
    buildMatrix(vec3(0, 0.47, 0), vec3(0.07, 0, 0)),
    TEAM_COLORS[team],
  );
  return { body };
}

const SAUCER = rgb(0.68, 0.7, 0.74);
const SAUCER_DARK = rgb(0.48, 0.5, 0.55);
const DOME = rgb(0.45, 0.75, 0.72);
const BEAM = rgb(0.55, 0.95, 0.6);

/**
 * The helicopter's UFO skin: the classic 1950s flying saucer, a silver lens-shaped hull under a glass
 * dome, a glowing emitter in its belly and three landing legs. The ring of rim lights sits where the
 * rotor would, so it spins with it; a ray gun under the front rim shows which way it faces.
 */
export function buildUfo(team: Team): HeliMeshes {
  const body = new Mesh();
  body.combine(buildSphere(1.3, 18, 8), buildMatrix(vec3(0, 0.36, 0), vec3(), vec3(1, 0.22, 1)), SAUCER);
  body.combine(buildTorus(1.3, 0.05, 18, 4), vec3(0, 0.36, 0), SAUCER_DARK); // rim
  body.combine(buildSphere(0.9, 16, 6), buildMatrix(vec3(0, 0.44, 0), vec3(), vec3(1, 0.3, 1)), SAUCER_DARK);
  body.combine(buildSphere(0.42, 12, 8), buildMatrix(vec3(0, 0.56, 0), vec3(), vec3(1, 0.85, 1)), DOME);
  body.combine(buildTorus(0.78, 0.04, 16, 4), vec3(0, 0.51, 0), TEAM_COLORS[team]); // team band round the deck
  // the belly emitter, and three legs leaning out to their pads
  body.combine(buildCylinder(0.4, 0.04, 12), vec3(0, 0.22, 0), BEAM);
  body.combine(buildTorus(0.44, 0.03, 12, 4), vec3(0, 0.22, 0), STEEL);
  for (let i = 0; i < 3; i++) {
    const turn = buildMatrix(vec3(), vec3(0, Math.PI / 2 + (i * Math.PI * 2) / 3, 0));
    body.combine(
      buildBox(vec3(0.03, 0.25, 0.03))
        .transform(buildMatrix(vec3(0.415, 0.13, 0), vec3(0, 0, 0.28)))
        .transform(turn),
      vec3(),
      STEEL,
    );
    body.combine(
      buildCylinder(0.1, 0.02, 8)
        .transform(buildMatrix(vec3(0.45, 0.01, 0)))
        .transform(turn),
      vec3(),
      DARK,
    );
  }
  // the ray gun under the front rim, and a pair of lamps either side of it
  body.combine(buildSphere(0.12, 8, 6), vec3(0, 0.26, -0.42), STEEL);
  body.combine(
    buildCylinder(0.035, 0.24, 6),
    buildMatrix(vec3(0, 0.25, -0.55), vec3(Math.PI / 2, 0, 0)),
    DARK,
  );
  body.combine(buildSphere(0.05, 6, 4), vec3(0, 0.25, -0.67), BEAM); // muzzle
  for (const side of [-1, 1])
    body.combine(
      buildBox(vec3(0.08, 0.03, 0.02)),
      buildMatrix(vec3(side * 0.18, 0.33, -0.62), vec3(0, side * 0.28, 0)),
      LAMP,
    );
  // the rim lights, alternating, around the mount the rotor would hang from
  const rotor = new Mesh();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    rotor.combine(
      buildSphere(0.07, 6, 4),
      vec3(Math.sin(a) * 0.67, -0.34, Math.cos(a) * 0.67),
      i % 2 ? LAMP : BEAM,
    );
  }
  return { body, rotor };
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

const PANDA_GREY = rgb(0.52, 0.53, 0.55);
const CLADDING = rgb(0.27, 0.27, 0.28);
const TRIM = rgb(0.14, 0.14, 0.15);
const INDICATOR = rgb(0.9, 0.5, 0.12);

/**
 * The jeep's Panda skin: a grey 1990s Fiat Panda, the boxy two-box hatch with flat slab sides, a
 * low beltline under tall flat glass, a short flat bonnet and an upright hatch. Dark plastic does
 * the detailing, as on the real car: the full-width front panel with its offset grille, the
 * wraparound bumpers and the band along the doors. Same footprint and wheels as the jeep.
 */
export function buildPanda(team: Team): JeepMeshes {
  const body = new Mesh();
  // the lower body up to the beltline, and the bonnet over its front, falling a touch to the nose
  body.combine(buildBox(vec3(0.48, 0.18, 0.84), 0.02), vec3(0, 0.22, 0), PANDA_GREY);
  body.combine(
    buildBox(vec3(0.47, 0.02, 0.26), 0.008),
    buildMatrix(vec3(0, 0.31, -0.29), vec3(-0.05, 0, 0)),
    PANDA_GREY,
  );
  // the glasshouse, set in a little from the slab sides: glass, the raked windscreen, a flat roof
  body.combine(buildBox(vec3(0.43, 0.16, 0.49)), vec3(0, 0.39, 0.145), WINDOW);
  const screen = buildMatrix(vec3(0, 0.39, -0.13), vec3(0.45, 0, 0));
  body.combine(buildBox(vec3(0.42, 0.185, 0.015)), screen, WINDOW);
  body.combine(buildBox(vec3(0.45, 0.03, 0.5), 0.01), vec3(0, 0.485, 0.145), PANDA_GREY);
  body.combine(buildBox(vec3(0.2, 0.008, 0.14)), vec3(0, 0.503, 0.2), TEAM_COLORS[team]);
  for (const side of [-1, 1]) {
    // thin pillars: the A along the windscreen, the B at the end of the long door, a broad C
    body.combine(
      buildBox(vec3(0.03, 0.19, 0.03)),
      buildMatrix(vec3(side * 0.215, 0.39, -0.13), vec3(0.45, 0, 0)),
      PANDA_GREY,
    );
    body.combine(buildBox(vec3(0.03, 0.16, 0.04)), vec3(side * 0.215, 0.39, 0.13), PANDA_GREY);
    body.combine(buildBox(vec3(0.03, 0.16, 0.08)), vec3(side * 0.215, 0.39, 0.35), PANDA_GREY);
    // the plastic band along the doors, the door's shut lines, its handle and the mirror
    body.combine(buildBox(vec3(0.012, 0.06, 0.52)), vec3(side * 0.243, 0.18, 0), CLADDING);
    for (const z of [-0.17, 0.15])
      body.combine(buildBox(vec3(0.004, 0.13, 0.006)), vec3(side * 0.241, 0.245, z), TRIM);
    body.combine(buildBox(vec3(0.008, 0.012, 0.04)), vec3(side * 0.243, 0.285, 0.11), TRIM);
    body.combine(buildBox(vec3(0.05, 0.035, 0.025)), vec3(side * 0.25, 0.34, -0.12), TRIM);
    // square headlamps at the ends of the front panel, indicators in the bumper, tall tail lamps
    body.combine(buildBox(vec3(0.1, 0.05, 0.01)), vec3(side * 0.165, 0.27, -0.427), LAMP);
    body.combine(buildBox(vec3(0.04, 0.02, 0.01)), vec3(side * 0.19, 0.17, -0.462), INDICATOR);
    body.combine(buildBox(vec3(0.06, 0.13, 0.012)), vec3(side * 0.205, 0.235, 0.423), TAIL_LAMP);
  }
  // the full-width black front panel, its grille slots offset to one side and the badge on the other
  body.combine(buildBox(vec3(0.46, 0.07, 0.012)), vec3(0, 0.27, -0.422), TRIM);
  for (let i = 0; i < 3; i++)
    body.combine(buildBox(vec3(0.12, 0.007, 0.006)), vec3(-0.03, 0.255 + i * 0.015, -0.429), CLADDING);
  body.combine(buildBox(vec3(0.035, 0.022, 0.006)), vec3(0.07, 0.27, -0.429), STEEL);
  // wraparound bumpers, the plate on the hatch and the exhaust
  for (const end of [-1, 1])
    body.combine(buildBox(vec3(0.5, 0.07, 0.07), 0.015), vec3(0, 0.17, end * 0.425), CLADDING);
  body.combine(buildBox(vec3(0.13, 0.035, 0.008)), vec3(0, 0.27, 0.424), rgb(0.85, 0.85, 0.8));
  body.combine(
    buildCylinder(0.025, 0.06, 6),
    buildMatrix(vec3(0.13, 0.13, 0.45), vec3(Math.PI / 2, 0, 0)),
    DARK,
  );
  const tyre = wheel(0.2, 0.08, 10).setColor(DARK);
  tyre.combine(wheel(0.11, 0.085, 6), vec3(), rgb(0.42, 0.42, 0.43)); // steel wheel
  return { body, wheel: tyre };
}

/** The helicopter's aim marker: a crosshair laid flat on the ground, open in the middle. */
export function buildAimMarker(): Mesh {
  const m = new Mesh();
  const red = rgb(1, 0.3, 0.2);
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2])
    m.combine(
      buildBox(vec3(0.09, 0.012, 0.26)),
      buildMatrix(vec3(), vec3(0, a, 0)).multiply(buildMatrix(vec3(0, 0, 0.24))),
      red,
    );
  m.combine(buildBox(vec3(0.09, 0.012, 0.09)), vec3(), red);
  return m;
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

/** The underground garage's layout, in its own frame: bays along X, the cut face toward +Z, floor at 0. */
export const HANGAR = {
  /** Distance between bay centres. */
  bay: 2.4,
  /** Interior half width and height. */
  halfWidth: 5.2,
  height: 3,
  /** The back wall and the cut face the camera looks through. */
  back: -1.6,
  front: 1.6,
  /** Half width of each elevator shaft, and where its back wall stands. */
  shaft: 0.9,
  shaftBack: -1.1,
};

/** The x of bay `i` of four. */
export function hangarBayX(i: number): number {
  return (i - 1.5) * HANGAR.bay;
}

/** A box spanning [x0, x1] x [y0, y1] x [z0, z1]. */
function slab(
  m: Mesh,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  color: Color,
): void {
  m.combine(
    buildBox(vec3(x1 - x0, y1 - y0, z1 - z0)),
    vec3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
    color,
  );
}

/**
 * The bunker's garage seen in cross-section (SPEC §9.2): a concrete room cut open toward the camera,
 * four bays under four elevator shafts that run up through the earth, the team colour along the back.
 */
export function buildHangar(team: Team): Mesh {
  const m = new Mesh();
  const { halfWidth: hw, height: h, back, front, shaft, shaftBack } = HANGAR;
  const t = 0.3; // shell thickness
  const lining = 0.12;
  const top = 30;
  const shell = rgb(0.42, 0.42, 0.4);
  const inner = rgb(0.34, 0.35, 0.33);
  const earth = [rgb(0.45, 0.33, 0.2), rgb(0.38, 0.27, 0.17), rgb(0.5, 0.37, 0.23)];
  const deep = earth[1] as Color;
  // the shell: floor, back wall, side walls
  slab(m, -hw - t, hw + t, -t, 0, back - t, front, shell);
  slab(m, -hw, hw, 0, h, back - t, back, inner);
  for (const s of [-1, 1]) slab(m, s * hw, s * (hw + t), -t, h + t, back - t, front, shell);
  // the ceiling: a strip behind the shafts, and pieces between them
  slab(m, -hw - t, hw + t, h, h + t, back - t, shaftBack, shell);
  const edges = [
    -hw - t,
    ...[0, 1, 2, 3].flatMap((i) => [hangarBayX(i) - shaft, hangarBayX(i) + shaft]),
    hw + t,
  ];
  for (let i = 0; i < edges.length; i += 2) {
    const x0 = edges[i] as number;
    const x1 = edges[i + 1] as number;
    slab(m, x0, x1, h, h + t, shaftBack, front, shell);
    // earth above, in bands, between the shaft linings
    const bands = [h + t, 6, 9, top];
    for (let b = 0; b < 3; b++) {
      const l = i ? lining : 0;
      const r = i < edges.length - 2 ? lining : 0;
      slab(m, x0 + l, x1 - r, bands[b] as number, bands[b + 1] as number, back - 3, front, earth[b] as Color);
    }
  }
  // each shaft: lined in concrete, open at the cut face
  for (let i = 0; i < 4; i++) {
    const x = hangarBayX(i);
    slab(m, x - shaft, x + shaft, h, top, shaftBack - lining, shaftBack, inner);
    for (const s of [-1, 1])
      slab(m, x + s * shaft, x + s * (shaft + lining), h + t, top, shaftBack, front, shell);
    // guide rails up the back of the shaft
    for (const s of [-1, 1])
      slab(m, x + s * 0.6 - 0.04, x + s * 0.6 + 0.04, h, top, shaftBack, shaftBack + 0.06, STEEL);
  }
  slab(m, -hw - t, hw + t, h + t, top, back - 3, shaftBack - lining, deep);
  // the earth around the room
  for (const s of [-1, 1]) slab(m, s * (hw + t), s * 30, -30, h + t, back - 3, front, deep);
  slab(m, -hw - t, hw + t, -30, -t, back - 3, front, earth[2] as Color);
  // team colour band, hazard stripes along the foot of the back wall, pipes under the ceiling
  slab(m, -hw, hw, 2.15, 2.3, back, back + 0.02, TEAM_COLORS[team]);
  for (let x = -hw + 0.2; x < hw; x += 0.4) slab(m, x, x + 0.2, 0, 0.25, back, back + 0.02, HAZARD);
  for (const y of [2.6, 2.78])
    m.combine(
      buildCylinder(0.1, hw * 2, 8),
      buildMatrix(vec3(0, y, back + 0.15), vec3(0, 0, Math.PI / 2)),
      y > 2.7 ? rgb(0.5, 0.15, 0.1) : STEEL,
    );
  // pilasters between the bays, with a hazard band at the foot
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * HANGAR.bay;
    slab(m, x - 0.15, x + 0.15, 0, h, back, back + 0.25, shell);
    slab(m, x - 0.16, x + 0.16, 0, 0.4, back + 0.2, back + 0.26, HAZARD);
  }
  // the spotlight gantry rail along the cut face
  slab(m, -hw, hw, h - 0.12, h - 0.04, front - 0.2, front - 0.1, DARK);
  for (const x of [-hw + 0.3, -1.2, 1.2, hw - 0.3])
    slab(m, x - 0.03, x + 0.03, h - 0.12, h, front - 0.18, front - 0.12, DARK);
  return m;
}

/** An elevator platform: a steel deck with hazard edges, standing on the origin. */
export function buildHangarPlatform(): Mesh {
  const m = new Mesh();
  const half = HANGAR.shaft - 0.05;
  slab(m, -half, half, 0, 0.08, -0.85, 0.85, STEEL);
  for (const z of [-0.8, 0.8])
    for (let x = -half; x < half - 0.1; x += 0.3)
      slab(m, x, x + 0.15, 0.08, 0.09, z - 0.05, z + 0.05, HAZARD);
  for (let i = -2; i <= 2; i++) slab(m, i * 0.3 - 0.01, i * 0.3 + 0.01, 0.08, 0.085, -0.7, 0.7, DARK); // tread
  return m;
}

/** The piston under a platform, one unit tall so it can be stretched up. */
export function buildHangarPiston(): Mesh {
  return new Mesh().combine(buildCylinder(0.22, 1, 10), vec3(0, -0.5, 0), rgb(0.6, 0.62, 0.6));
}

/** The spotlight's housing on the gantry, its lens toward -Z so it can be aimed with lookAt. */
export function buildSpotlightLamp(): Mesh {
  const m = new Mesh();
  m.combine(buildCylinder(0.22, 0.3, 10), buildMatrix(vec3(), vec3(Math.PI / 2, 0, 0)), DARK);
  m.combine(buildCylinder(0.18, 0.02, 10), buildMatrix(vec3(0, 0, -0.16), vec3(Math.PI / 2, 0, 0)), LAMP);
  return m;
}

/** A status lamp on the back wall of a bay. */
export function buildBayLamp(): Mesh {
  return new Mesh().combine(buildBox(vec3(0.16, 0.16, 0.04), 0.02), vec3(), WHITE);
}
