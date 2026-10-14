import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
process.chdir(projectRoot);

await build({
  entryPoints: ['./scripts/pelav-supabase-entry.js'],
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'PelavSupabase',
  outfile: './public/pelav/auth/supabase-client.js',
});
