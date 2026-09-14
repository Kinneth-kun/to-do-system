/*
 * Core Alpine helpers shared by every page.
 */
document.addEventListener('alpine:init', () => {
    const Alpine = window.Alpine;

    /** Toast stack. Dispatch `window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }))`. */
    Alpine.data('toasts', (initial = []) => ({
        items: [],
        init() {
            initial.forEach((t) => this.push(t));
            window.addEventListener('toast', (e) => this.push(e.detail));
        },
        push({ message, type = 'success' }) {
            if (!message) return;
            const id = Date.now() + Math.random();
            this.items.push({ id, message, type });
            setTimeout(() => this.remove(id), 4500);
        },
        remove(id) {
            this.items = this.items.filter((t) => t.id !== id);
        },
    }));

    /**
     * Status ⇄ progress sync for quick-update forms (mirrors App\Services\TaskService rules):
     * 0% Pending, 1–99% In Progress, 100% Completed.
     */
    Alpine.data('statusProgress', (status = 'pending', progress = 0, locked = false) => ({
        status,
        progress: Number(progress),
        locked, // true when progress is calculated from subtasks
        onProgress() {
            this.progress = Number(this.progress);
            if (['pending', 'in_progress', 'completed'].includes(this.status) || this.progress === 100) {
                this.status = this.progress <= 0 ? 'pending' : this.progress >= 100 ? 'completed' : 'in_progress';
            }
        },
        onStatus() {
            if (this.locked) return;
            if (this.status === 'pending') this.progress = 0;
            else if (this.status === 'completed') this.progress = 100;
            else if (this.status === 'in_progress') this.progress = Math.min(99, Math.max(this.progress, 1));
        },
    }));
});

/** Tiny JSON fetch helper with CSRF, used by pickers and dropdowns. */
window.taskflowFetch = async (url, options = {}) => {
    const token = document.querySelector('meta[name="csrf-token"]')?.content;
    const res = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...(token ? { 'X-CSRF-TOKEN': token } : {}),
            ...(options.headers || {}),
        },
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
};
