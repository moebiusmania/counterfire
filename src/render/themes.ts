// Visual themes (SPEC §10.3 rule 9): the same tiles dressed as temperate grassland, desert or
// winter. Novelty maps use the temperate look. Only colours and trees change; play is the same.

import {
  buildBox,
  buildCone,
  buildCylinder,
  buildMatrix,
  buildSphere,
  type Color,
  Mesh,
  rgb,
  vec3,
} from 'littlejsengine';
import type { Level } from '../levels/schema';
import { Tile, type TileChar } from '../sim/terrain';

export interface Theme {
  tiles: Record<TileChar, Color>;
  sea: Color;
  /** Sky dome: top, horizon, bottom. */
  sky: [Color, Color, Color];
  sun: Color;
  tree: () => Mesh;
}

const conifer = (needles: Color, tips: Color) => () => {
  const tree = new Mesh();
  tree.combine(buildCylinder(0.14, 0.3, 6), vec3(0, 0.15, 0), rgb(0.35, 0.22, 0.1));
  tree.combine(buildCone(0.8, 0.9, 7), vec3(0, 0.65, 0), needles);
  tree.combine(buildCone(0.55, 0.6, 7), vec3(0, 1.0, 0), tips);
  return tree;
};

/** A date palm: a leaning trunk and a crown of drooping fronds. */
function palm(): Mesh {
  const tree = new Mesh();
  tree.combine(
    buildCylinder(0.1, 1.0, 6),
    buildMatrix(vec3(0.05, 0.5, 0), vec3(0, 0, -0.12)),
    rgb(0.5, 0.36, 0.2),
  );
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    tree.combine(
      buildBox(vec3(0.12, 0.03, 0.55)),
      buildMatrix(vec3(0.1 + Math.sin(a) * 0.22, 1.0, Math.cos(a) * 0.22), vec3(0.45, a, 0)),
      rgb(0.35, 0.5, 0.15),
    );
  }
  tree.combine(buildSphere(0.16, 6, 4), vec3(0.1, 1.0, 0), rgb(0.42, 0.3, 0.12));
  return tree;
}

export const THEMES: Record<Level['theme'], Theme> = {
  temperate: {
    tiles: {
      [Tile.Grass]: rgb(0.34, 0.55, 0.22),
      [Tile.Road]: rgb(0.47, 0.44, 0.38),
      [Tile.Sand]: rgb(0.82, 0.75, 0.52),
      [Tile.Shallow]: rgb(0.66, 0.62, 0.45),
      [Tile.Deep]: rgb(0.16, 0.26, 0.33),
      [Tile.Forest]: rgb(0.21, 0.38, 0.15),
      [Tile.Wall]: rgb(0.5, 0.48, 0.42),
      [Tile.Bridge]: rgb(0.16, 0.26, 0.33),
      [Tile.Rubble]: rgb(0.36, 0.31, 0.25),
    },
    sea: rgb(0.15, 0.4, 0.55, 0.78),
    sky: [rgb(0.45, 0.65, 0.9), rgb(0.75, 0.85, 0.95), rgb(0.2, 0.35, 0.45)],
    sun: rgb(1, 0.96, 0.88),
    tree: conifer(rgb(0.1, 0.35, 0.12), rgb(0.13, 0.42, 0.15)),
  },
  desert: {
    tiles: {
      [Tile.Grass]: rgb(0.78, 0.66, 0.42),
      [Tile.Road]: rgb(0.55, 0.47, 0.36),
      [Tile.Sand]: rgb(0.9, 0.82, 0.6),
      [Tile.Shallow]: rgb(0.7, 0.65, 0.48),
      [Tile.Deep]: rgb(0.14, 0.3, 0.36),
      [Tile.Forest]: rgb(0.62, 0.55, 0.32),
      [Tile.Wall]: rgb(0.66, 0.56, 0.4),
      [Tile.Bridge]: rgb(0.14, 0.3, 0.36),
      [Tile.Rubble]: rgb(0.5, 0.4, 0.28),
    },
    sea: rgb(0.12, 0.45, 0.55, 0.8),
    sky: [rgb(0.5, 0.68, 0.88), rgb(0.95, 0.88, 0.75), rgb(0.6, 0.5, 0.35)],
    sun: rgb(1, 0.92, 0.75),
    tree: palm,
  },
  winter: {
    tiles: {
      [Tile.Grass]: rgb(0.88, 0.91, 0.95),
      [Tile.Road]: rgb(0.55, 0.55, 0.58),
      [Tile.Sand]: rgb(0.76, 0.78, 0.8),
      [Tile.Shallow]: rgb(0.6, 0.7, 0.78),
      [Tile.Deep]: rgb(0.12, 0.18, 0.26),
      [Tile.Forest]: rgb(0.75, 0.8, 0.84),
      [Tile.Wall]: rgb(0.45, 0.45, 0.48),
      [Tile.Bridge]: rgb(0.12, 0.18, 0.26),
      [Tile.Rubble]: rgb(0.32, 0.3, 0.3),
    },
    sea: rgb(0.2, 0.32, 0.42, 0.85),
    sky: [rgb(0.55, 0.62, 0.72), rgb(0.85, 0.88, 0.92), rgb(0.4, 0.45, 0.5)],
    sun: rgb(0.92, 0.95, 1),
    tree: conifer(rgb(0.08, 0.22, 0.14), rgb(0.92, 0.95, 0.98)),
  },
  novelty: {} as Theme, // filled in below: the temperate look
};
THEMES.novelty = THEMES.temperate;
