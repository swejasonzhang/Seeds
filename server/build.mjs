// Production bundle: one CommonJS file. Workspace code (@seeds/shared) and ESM-only jose are bundled in; everything
// else stays in node_modules so Application Insights' require-hooks can instrument express/http/mongodb.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const bundled = new Set(['@seeds/shared', 'jose']);

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.cjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: Object.keys(pkg.dependencies).filter((d) => !bundled.has(d)),
  logLevel: 'info',
});
