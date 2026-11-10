import { defineConfig } from 'tsup';

// Bundle de produção: ESM com @forja/shared embutido. Migrações (./drizzle) e dados (./data)
// são lidos em tempo de execução ao lado de dist/.
export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@forja/shared'],
});
