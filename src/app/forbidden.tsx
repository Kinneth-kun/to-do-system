import Link from 'next/link';
import { Icon } from '@/components/icon';

export default function Forbidden() {
    return (
        <div className="flex min-h-full items-center justify-center px-4 py-16">
            <div className="text-center">
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
                    <Icon name="lock" className="h-6 w-6" />
                </span>
                <p className="eyebrow">403</p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">You don&apos;t have access to this</h1>
                <p className="mt-1.5 text-sm text-slate-500">Ask the project owner or an administrator if you need it.</p>
                <Link href="/" className="btn-primary mt-6">
                    Back to dashboard
                </Link>
            </div>
        </div>
    );
}
