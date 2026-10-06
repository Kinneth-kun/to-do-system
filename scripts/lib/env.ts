import nextEnv from '@next/env';

// Load .env, .env.local, .env.development… with the same precedence Next.js uses, so CLI
// scripts see exactly the configuration the app does.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
