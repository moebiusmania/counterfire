import { expect, test } from 'bun:test';
import type { Mesh } from 'littlejsengine';
import {
  buildAsv,
  buildATeamVan,
  buildF117,
  buildHeli,
  buildJeep,
  buildMetalSlug,
  buildPanda,
  buildScorpion,
  buildTank,
} from '../src/render/models';

const triangles = (...meshes: Mesh[]) =>
  meshes.reduce((n, m) => n + (m.toIndexed().indices?.length ?? 0) / 3, 0);

test('each vehicle stays inside the polygon budget (SPEC §12.2)', () => {
  const tank = buildTank('P1');
  const heli = buildHeli('P1');
  const jeep = buildJeep('P1');
  const panda = buildPanda('P1');
  const slug = buildMetalSlug('P1');
  const scorpion = buildScorpion('P1');
  const counts = {
    tank: triangles(tank.hull, tank.turret),
    asv: triangles(buildAsv('P1')),
    heli: triangles(heli.body, ...[heli.rotor, heli.tailRotor].filter((m) => m !== undefined)),
    f117: triangles(buildF117('P1').body),
    aTeam: triangles(buildATeamVan('P1')),
    jeep: triangles(jeep.body) + 4 * triangles(jeep.wheel),
    slug: triangles(slug.hull, slug.turret),
    scorpion: triangles(scorpion.hull, scorpion.turret),
    panda: triangles(panda.body) + 4 * triangles(panda.wheel),
  };
  for (const n of Object.values(counts)) {
    expect(n).toBeGreaterThanOrEqual(500);
    expect(n).toBeLessThanOrEqual(3000);
  }
});
