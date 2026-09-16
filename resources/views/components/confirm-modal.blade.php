{{--
    Shared confirmation dialog. Rendered once per page by partials/modals.blade.php.
    Forms ask for it with the `confirmable` Alpine component — see resources/js/components/confirm.js.
--}}
<div x-data="confirmDialog">
    <x-modal name="confirm" max-width="sm">
        <div class="p-5">
            <div class="flex gap-4">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                      x-bind:class="danger ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'">
                    <x-icon name="alert" class="h-5 w-5" />
                </span>
                <div class="min-w-0 flex-1">
                    <h2 class="text-base font-semibold tracking-tight text-slate-900" x-text="title">Are you sure?</h2>
                    <p class="mt-1 text-sm leading-relaxed text-slate-500" x-text="message"></p>
                </div>
            </div>

            <div class="mt-6 flex justify-end gap-2">
                <button type="button" class="btn-secondary" x-on:click="cancel()">Cancel</button>
                <button type="button" x-bind:class="danger ? 'btn-danger' : 'btn-primary'" x-on:click="accept()" x-text="confirmLabel">Confirm</button>
            </div>
        </div>
    </x-modal>
</div>
