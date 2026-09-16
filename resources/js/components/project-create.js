/*
 * Create a project from inside the task forms.
 *
 * `newProjectForm` posts the modal to projects.store as JSON and announces the result with a
 * `project-created` window event. `projectPicker` listens for that event, adds the project to
 * its <select> and selects it, so the half-filled task form is never lost.
 *
 * If JavaScript fails the modal form still submits normally (return_to brings the browser back
 * with ?project_id= set), so the flow degrades rather than breaking.
 */
document.addEventListener('alpine:init', () => {
    Alpine.data('newProjectForm', (modalName = 'new-project') => ({
        saving: false,
        errors: {},

        async submit(event) {
            event.preventDefault();
            if (this.saving) return;

            this.saving = true;
            this.errors = {};

            const form = event.target;
            const payload = new FormData(form);

            try {
                const token = document.querySelector('meta[name="csrf-token"]')?.content;
                const response = await fetch(form.action, {
                    method: 'POST',
                    body: payload,
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        ...(token ? { 'X-CSRF-TOKEN': token } : {}),
                    },
                });

                if (response.status === 422) {
                    const body = await response.json();
                    this.errors = Object.fromEntries(
                        Object.entries(body.errors || {}).map(([field, messages]) => [field, messages[0]]),
                    );
                    return;
                }

                if (!response.ok) throw new Error(`Request failed: ${response.status}`);

                const { project } = await response.json();

                window.dispatchEvent(new CustomEvent('project-created', { detail: project }));
                window.dispatchEvent(
                    new CustomEvent('toast', { detail: { message: `Project “${project.name}” created.`, type: 'success' } }),
                );

                form.reset();
                this.$dispatch('close-modal', modalName);
            } catch (e) {
                // Network or server error: fall back to a normal form post so the user is not stuck.
                form.submit();
            } finally {
                this.saving = false;
            }
        },
    }));

    /** A project <select> that can absorb a newly created project. */
    Alpine.data('projectPicker', (selectedId = null) => ({
        selected: selectedId ? String(selectedId) : '',

        init() {
            window.addEventListener('project-created', (event) => this.add(event.detail));
        },

        add(project) {
            const select = this.$refs.select;
            if (!select || !project) return;

            if (!select.querySelector(`option[value="${project.id}"]`)) {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                select.appendChild(option);
            }

            // Order matters: write the DOM value first, then the reactive property, and only
            // then fire `change`. Dispatching first lets x-model read the stale empty value
            // and clobber the selection.
            select.value = String(project.id);
            this.selected = String(project.id);
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.focus();
        },
    }));
});
