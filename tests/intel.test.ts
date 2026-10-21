import { describe, expect, test } from 'bun:test';
import { Drone } from '../src/sim/drones';
import { RADAR } from '../src/sim/tuning';
import { World } from '../src/sim/world';
import { hasRadar, mapMarkers, radarContacts } from '../src/ui/intel';
import { twoPlayerLevel } from './helpers';

function duel() {
  const level = twoPlayerLevel([
    '.........',
    '....C....',
    '.........',
    '.........',
    '....B....',
    '.........',
  ]);
  level.entities.push({ id: 'gun', type: 'turret', team: 'P2', variant: 'gun', x: 7.5, y: 4.5 });
  return new World(level, 1);
}

describe('bunker map', () => {
  test('shows bunkers, turrets and every flag tower, but not hidden flags or mines', () => {
    const world = duel();
    world.mines.push({ id: 99, team: 'P2', x: 3, y: 3 });
    const kinds = mapMarkers(world, 'P1').map((m) => m.kind);
    expect(kinds.filter((k) => k === 'bunker').length).toBe(2);
    expect(kinds).toContain('turret');
    expect(kinds.filter((k) => k === 'flagTower').length).toBe(2);
    expect(kinds).not.toContain('flag');
    expect(kinds).not.toContain('mine');
  });

  test('shows a flag once found, and the enemy player where they are', () => {
    const world = duel();
    const flag = world.flags[0];
    if (!flag) throw new Error('no flag');
    flag.state = 'exposed';
    const enemy = world.spawnVehicle('P2', 'tank');
    const markers = mapMarkers(world, 'P1');
    expect(markers).toContainEqual({ kind: 'flag', team: flag.team, x: flag.x, y: flag.y });
    expect(markers).toContainEqual({ kind: 'enemy', team: 'P2', x: enemy.x, y: enemy.y });
    // you are not your own enemy
    expect(mapMarkers(world, 'P2').some((m) => m.kind === 'enemy')).toBe(false);
  });
});

describe('radar', () => {
  test('the armoured vehicles have one, the jeep does not', () => {
    const world = duel();
    expect(hasRadar(world.spawnVehicle('P1', 'tank'))).toBe(true);
    expect(hasRadar(world.spawnVehicle('P1', 'asv'))).toBe(true);
    expect(hasRadar(world.spawnVehicle('P1', 'jeep'))).toBe(false);
  });

  test('shows enemies, drones and all mines in range, relative to the vehicle', () => {
    const world = duel();
    const tank = world.spawnVehicle('P1', 'tank');
    const enemy = world.spawnVehicle('P2', 'jeep');
    world.mines.push(
      { id: 98, team: 'P2', x: tank.x + 2, y: tank.y },
      { id: 97, team: 'P1', x: tank.x - 1, y: tank.y },
    );
    world.drones.push(new Drone(96, 'CPU', 'x', tank.x, tank.y + 1));
    const contacts = radarContacts(world, tank);
    expect(contacts).toContainEqual({ kind: 'enemy', x: enemy.x - tank.x, y: enemy.y - tank.y });
    expect(contacts).toContainEqual({ kind: 'mine', x: 2, y: 0, own: false });
    expect(contacts).toContainEqual({ kind: 'mine', x: -1, y: 0, own: true });
    expect(contacts).toContainEqual({ kind: 'drone', x: 0, y: 1 });
  });

  test('ignores anything out of range', () => {
    const world = duel();
    const tank = world.spawnVehicle('P1', 'tank');
    world.mines.push({ id: 95, team: 'P2', x: tank.x + RADAR.range + 1, y: tank.y });
    expect(radarContacts(world, tank)).toEqual([]);
  });
});
