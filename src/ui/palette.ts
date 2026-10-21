// Shared 2D colours for the map, radar and HUD.

import { Tile, type TileChar } from '../sim/terrain';
import type { Team } from '../sim/types';

export const TEAM_CSS: Record<Team, string> = {
  P1: '#e2c234',
  P2: '#4b84e6',
  CPU: '#d33a2c',
  NEUTRAL: '#b3b3b3',
};

/** Map colours per tile, darker and flatter than the 3D view, like a printed chart. */
export const MAP_TILE_CSS: Record<TileChar, string> = {
  [Tile.Grass]: '#5b7a3a',
  [Tile.Road]: '#8a8170',
  [Tile.Sand]: '#c9b77e',
  [Tile.Shallow]: '#4f7f8f',
  [Tile.Deep]: '#1f3d52',
  [Tile.Forest]: '#2f4d23',
  [Tile.Wall]: '#2a2a2a',
  [Tile.Bridge]: '#7a5a34',
  [Tile.Rubble]: '#5e4d3c',
};

/** The HUD's dashboard look. */
export const HUD = {
  panel: 'rgba(20, 24, 16, .78)',
  edge: '#6b6f4a',
  text: '#e7e2c4',
  dim: '#9a9677',
  font: 'bold 13px monospace',
};
