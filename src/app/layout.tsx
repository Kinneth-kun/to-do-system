import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Settings } from '@/lib/settings';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
    const appName = await Settings.string('general.app_name').catch(() => 'TaskFlow');
    return {
        title: { default: appName, template: `%s · ${appName}` },
        description: 'Projects and tasks, simply on track.',
        robots: { index: false, follow: false },
    };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`h-full ${inter.variable}`}>
            <body className="h-full">{children}</body>
        </html>
    );
}
