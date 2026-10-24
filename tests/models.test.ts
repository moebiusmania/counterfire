import { expect, test } from 'bun:test';
import type { Mesh } from 'littlejsengine';
import {
  buildActionVan,
  buildAsv,
  buildHeli,
  buildHobby,
  buildJeep,
  buildPocketTank,
  buildStealthJet,
  buildStinger,
  buildTank,
  buildUfo,
} from '../src/render/models';

const triangles = (...meshes: Mesh[]) =>
  meshes.reduce((n, m) => n + (m.toIndexed().indices?.length ?? 0) / 3, 0);

test('each vehicle stays inside the polygon budget (SPEC §12.2)', () => {
  const tank = buildTank('P1');
  const heli = buildHeli('P1');
  const ufo = buildUfo('P1');
  const jeep = buildJeep('P1');
  const hobby = buildHobby('P1');
  const pocket = buildPocketTank('P1');
  const stinger = buildStinger('P1');
  const counts = {
    tank: triangles(tank.hull, tank.turret),
    asv: triangles(buildAsv('P1')),
    heli: triangles(heli.body, ...[heli.rotor, heli.tailRotor].filter((m) => m !== undefined)),
    stealthJet: triangles(buildStealthJet('P1').body),
    ufo: triangles(ufo.body, ...[ufo.rotor].filter((m) => m !== undefined)),
    actionVan: triangles(buildActionVan('P1')),
    jeep: triangles(jeep.body) + 4 * triangles(jeep.wheel),
    pocket: triangles(pocket.hull, pocket.turret),
    stinger: triangles(stinger.hull, stinger.turret),
    hobby: triangles(hobby.body) + 4 * triangles(hobby.wheel),
  };
  for (const n of Object.values(counts)) {
    expect(n).toBeGreaterThanOrEqual(500);
    expect(n).toBeLessThanOrEqual(3000);
  }
});
