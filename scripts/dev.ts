// Dev server: Bun bundles index.html and its TypeScript on request, with hot reload.
import index from '../index.html';

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: { '/': index },
  development: { hmr: true, console: true },
});

console.log(`Counterfire dev server: ${server.url}`);
