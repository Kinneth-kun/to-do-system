/*
 * Live notification bell.
 *
 * Polls notifications.recent so things that happen elsewhere — the 08:00 briefing, a task
 * assigned to you, a deadline slipping — show up without a reload. Polling stops while the tab
 * is hidden (no point burning requests on a background tab) and catches up on focus.
 */
const POLL_MS = 45000;

document.addEventListener('alpine:init', () => {
    Alpine.data('notificationBell', (initialUnread = 0) => ({
        open: false,
        loading: false,
        unread: initialUnread,
        items: [],
        timer: null,

        init() {
            this.schedule();

            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.stop();
                } else {
                    this.refresh();
                    this.schedule();
                }
            });

            this.$watch('open', (isOpen) => {
                if (isOpen) this.refresh();
            });
        },

        schedule() {
            this.stop();
            this.timer = setInterval(() => this.refresh(), POLL_MS);
        },

        stop() {
            if (this.timer) clearInterval(this.timer);
            this.timer = null;
        },

        toggle() {
            this.open = !this.open;
        },

        async refresh() {
            if (this.loading) return;
            this.loading = true;

            try {
                const data = await window.taskflowFetch('/notifications/recent');
                const previous = this.unread;

                this.items = data.data ?? [];
                this.unread = data.unread_count ?? 0;

                // Something arrived while the page was open — surface it once.
                if (this.unread > previous && previous !== null) {
                    const newest = this.items.find((item) => !item.read);
                    if (newest) {
                        window.dispatchEvent(new CustomEvent('toast', {
                            detail: { message: newest.title, type: 'success' },
                        }));
                    }
                }
            } catch (e) {
                // Offline or the session expired — leave the badge as it is and try again later.
            } finally {
                this.loading = false;
            }
        },

        async markAllRead() {
            try {
                await window.taskflowFetch('/notifications/read-all', { method: 'POST' });
                this.unread = 0;
                this.items = this.items.map((item) => ({ ...item, read: true }));
            } catch (e) {
                // ignore — the notifications page still works
            }
        },
    }));
});
