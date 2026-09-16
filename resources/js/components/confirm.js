/*
 * In-app confirmation, replacing the browser's confirm() (which shows the raw origin —
 * "127.0.0.1:8001 says" — and cannot be styled).
 *
 * Usage on any form:
 *   <form ... x-data="confirmable({ title: '…', message: '…', confirm: 'Delete', danger: true })"
 *             x-on:submit.prevent="ask($event)">
 *
 * The form is submitted only after the shared dialog reports back.
 */
document.addEventListener('alpine:init', () => {
    Alpine.data('confirmable', (options = {}) => ({
        ask(event) {
            const form = event.target.closest('form');
            window.dispatchEvent(
                new CustomEvent('confirm:request', {
                    detail: {
                        title: options.title || 'Are you sure?',
                        message: options.message || 'This action cannot be undone.',
                        confirmLabel: options.confirm || 'Confirm',
                        danger: options.danger !== false,
                        // Bypass this handler on the real submit.
                        onConfirm: () => form.submit(),
                    },
                }),
            );
        },
    }));

    /** The single dialog instance, rendered once per page. */
    Alpine.data('confirmDialog', () => ({
        title: '',
        message: '',
        confirmLabel: 'Confirm',
        danger: true,
        pending: null,

        init() {
            window.addEventListener('confirm:request', (event) => {
                const { title, message, confirmLabel, danger, onConfirm } = event.detail;
                this.title = title;
                this.message = message;
                this.confirmLabel = confirmLabel;
                this.danger = danger;
                this.pending = onConfirm;
                this.$dispatch('open-modal', 'confirm');
            });
        },

        accept() {
            const run = this.pending;
            this.pending = null;
            this.$dispatch('close-modal', 'confirm');
            if (run) run();
        },

        cancel() {
            this.pending = null;
            this.$dispatch('close-modal', 'confirm');
        },
    }));
});
