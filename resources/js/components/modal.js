/*
 * Dialog behaviour for <x-modal>.
 *
 * Lives here rather than in an inline x-data expression: the focus-retention selector needs
 * quotes, and escaping those inside a Blade attribute produced invalid JS, which made Alpine
 * skip the whole component so nothing opened.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

document.addEventListener('alpine:init', () => {
    Alpine.data('modal', (name, initialShow = false) => ({
        name,
        show: false,

        init() {
            if (initialShow) this.open();
        },

        open() {
            this.show = true;
            document.body.style.overflow = 'hidden';
            this.$nextTick(() => {
                this.focusable()[0]?.focus();
            });
        },

        close() {
            if (!this.show) return;
            this.show = false;
            document.body.style.overflow = '';
        },

        onOpenEvent(event) {
            if (event.detail === this.name) this.open();
        },

        onCloseEvent(event) {
            if (event.detail === this.name) this.close();
        },

        focusable() {
            return [...(this.$refs.panel?.querySelectorAll(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null);
        },

        /** Keep Tab inside the dialog while it is open. */
        retain(event) {
            if (!this.show || event.key !== 'Tab') return;
            const items = this.focusable();
            if (!items.length) return;

            const first = items[0];
            const last = items[items.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        },
    }));
});
