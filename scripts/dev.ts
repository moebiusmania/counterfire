// Dev server: Bun bundles the pages and their TypeScript on request, with hot reload.
// `/` is the game, `/editor/` the level editor (SPEC §10.5).
import { networkInterfaces } from 'node:os';
import editor from '../editor/index.html';
import index from '../index.html';

const server = Bun.serve({
  hostname: '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  routes: { '/': index, '/editor/': editor },
  development: { hmr: true, console: true },
});

// IPv4 addresses other devices can reach, skipping loopback and Docker bridges.
const lanAddresses = Object.entries(networkInterfaces())
  .filter(([name]) => !name.startsWith('docker') && !name.startsWith('br-') && !name.startsWith('veth'))
  .flatMap(([, addrs]) => addrs ?? [])
  .filter((a) => a.family === 'IPv4' && !a.internal)
  .map((a) => a.address);

const local = `http://localhost:${server.port}/`;
console.log(`Counterfire dev server: ${local}  (level editor: ${local}editor/)`);
for (const address of lanAddresses) {
  console.log(`  on your network:      http://${address}:${server.port}/`);
}
