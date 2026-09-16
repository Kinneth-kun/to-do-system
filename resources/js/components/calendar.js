document.addEventListener('alpine:init', () => {
    Alpine.data('calendarFilters', () => ({
        view: 'month',
        date: '',
        setView(view) {
            this.view = view;
        },
    }));
});
