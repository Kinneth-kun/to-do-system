import './bootstrap';
import Alpine from 'alpinejs';
import focus from '@alpinejs/focus';
import collapse from '@alpinejs/collapse';

window.Alpine = Alpine;
Alpine.plugin(focus);
Alpine.plugin(collapse);

/*
 * Feature modules live in resources/js/components/*.js. Each file registers its
 * Alpine components inside `document.addEventListener('alpine:init', () => { Alpine.data(...) })`.
 * They are loaded automatically — no need to edit this file.
 */
import.meta.glob('./components/*.js', { eager: true });

Alpine.start();
