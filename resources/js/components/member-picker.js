/*
 * Member picker: filter box + live selected count over a list of real checkboxes.
 * The checkboxes work on their own, so the field still functions without JavaScript.
 *
 * The component root is captured in init(): `this.$el` inside a method called from a child's
 * x-on handler resolves to that child, not to the root, which silently breaks the queries.
 */
document.addEventListener('alpine:init', () => {
    Alpine.data('memberPicker', (selected = []) => ({
        query: '',
        count: selected.length,
        root: null,

        init() {
            this.root = this.$el;
            this.recount();
        },

        boxes() {
            return [...(this.root?.querySelectorAll('input[type="checkbox"]') ?? [])];
        },

        recount() {
            this.count = this.boxes().filter((box) => box.checked).length;
        },

        clear() {
            this.boxes().forEach((box) => {
                box.checked = false;
            });
            this.recount();
        },

        /** Show a row when it matches the filter, or when it is already selected. */
        matches(row) {
            const term = this.query.trim().toLowerCase();
            if (!term) return true;
            if (row.querySelector('input[type="checkbox"]')?.checked) return true;
            return (row.dataset.search || '').includes(term);
        },

        get noMatches() {
            if (!this.query.trim()) return false;
            const rows = [...(this.root?.querySelectorAll('label[data-search]') ?? [])];
            return rows.length > 0 && rows.every((row) => !this.matches(row));
        },
    }));
});
