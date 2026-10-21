// Dev server: Bun bundles the pages and their TypeScript on request, with hot reload.
// `/` is the game, `/editor` the level editor (SPEC §10.5), which is never in a production build.
import editor from '../editor.html';
import index from '../index.html';

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: { '/': index, '/editor': editor },
  development: { hmr: true, console: true },
});

console.log(`Counterfire dev server: ${server.url}  (level editor: ${server.url}editor)`);
