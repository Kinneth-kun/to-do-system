import Link from 'next/link';
import { Icon } from '@/components/icon';

export default function NotFound() {
    return (
        <div className="flex min-h-full items-center justify-center px-4 py-16">
            <div className="text-center">
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <Icon name="search" className="h-6 w-6" />
                </span>
                <p className="eyebrow">404</p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Not found</h1>
                <p className="mt-1.5 text-sm text-slate-500">This page doesn&apos;t exist, or it was deleted.</p>
                <Link href="/" className="btn-primary mt-6">
                    Back to dashboard
                </Link>
            </div>
        </div>
    );
}
