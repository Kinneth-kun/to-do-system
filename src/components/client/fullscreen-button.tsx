'use client';

import { Icon } from '../icon';

export function FullscreenButton() {
    return (
        <button
            type="button"
            className="btn btn-sm border border-white/15 text-slate-200 hover:bg-white/10"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
        >
            <Icon name="expand" className="h-4 w-4" /> Fullscreen
        </button>
    );
}
