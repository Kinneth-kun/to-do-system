import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            'server-only': fileURLToPath(new URL('./tests/stubs/empty.ts', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        setupFiles: ['tests/setup.ts'],
        pool: 'forks',
        testTimeout: 30_000,
        hookTimeout: 60_000,
        env: {
            NODE_ENV: 'test',
            APP_TIMEZONE: 'Asia/Manila',
            BCRYPT_ROUNDS: '4',
            DATABASE_URL: '',
        },
    },
});
