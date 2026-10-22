import { expect, test } from 'bun:test';
import type { Mesh } from 'littlejsengine';
import { buildAsv, buildHeli, buildJeep, buildTank } from '../src/render/models';

const triangles = (...meshes: Mesh[]) =>
  meshes.reduce((n, m) => n + (m.toIndexed().indices?.length ?? 0) / 3, 0);

test('each vehicle stays inside the polygon budget (SPEC §12.2)', () => {
  const tank = buildTank('P1');
  const heli = buildHeli('P1');
  const jeep = buildJeep('P1');
  const counts = {
    tank: triangles(tank.hull, tank.turret),
    asv: triangles(buildAsv('P1')),
    heli: triangles(heli.body, heli.rotor, heli.tailRotor),
    jeep: triangles(jeep.body) + 4 * triangles(jeep.wheel),
  };
  for (const n of Object.values(counts)) {
    expect(n).toBeGreaterThanOrEqual(500);
    expect(n).toBeLessThanOrEqual(3000);
  }
});
