import { defineConfig } from 'drizzle-kit';

// Only `drizzle-kit generate` is used (it needs no database). Migrations are applied by
// `npm run db:migrate`, which also works against the embedded local database.
export default defineConfig({
    dialect: 'postgresql',
    schema: './src/lib/db/schema.ts',
    out: './drizzle',
});
