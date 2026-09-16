document.addEventListener('alpine:init', () => {
    Alpine.data('globalSearch', () => ({
        query: '',
        groups: [],
        open: false,
        loading: false,
        async suggest() {
            if (this.query.trim().length < 2) {
                this.groups = [];
                this.open = false;
                return;
            }
            this.loading = true;
            try {
                // taskflowFetch resolves to the parsed JSON body.
                const data = await window.taskflowFetch(`/search/suggest?q=${encodeURIComponent(this.query)}`);
                this.groups = data.groups || [];
                this.open = true;
            } catch (e) {
                this.groups = [];
                this.open = false;
            } finally {
                this.loading = false;
            }
        },
    }));
});
