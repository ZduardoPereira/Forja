import { defineConfig } from 'drizzle-kit';

// Gera migrações SQL versionadas em ./drizzle a partir de src/db/schema.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
