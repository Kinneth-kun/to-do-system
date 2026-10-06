import type { NextConfig } from 'next';

const securityHeaders = [
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
    poweredByHeader: false,
    // Hide the Next.js dev-tools badge (the "N" button) in `next dev`; it never shows in production.
    devIndicators: false,
    // `next dev` only: let a tunnel (ngrok) load the dev bundles, so the app is interactive there.
    allowedDevOrigins: ['*.ngrok-free.dev', '*.ngrok-free.app', '*.ngrok.app', '*.ngrok.dev'],
    serverExternalPackages: ['pg', '@electric-sql/pglite', '@electric-sql/pglite-socket'],
    experimental: {
        // Local attachment uploads go through a Server Action (10 MB + form overhead). On Vercel,
        // attachments upload straight to Blob from the browser, so this limit is never reached there.
        serverActions: { bodySizeLimit: '11mb' },
        // Enables forbidden() → app/forbidden.tsx, the equivalent of Laravel's abort(403).
        authInterrupts: true,
    },
    async headers() {
        return [{ source: '/:path*', headers: securityHeaders }];
    },
};

export default nextConfig;
