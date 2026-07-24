import { setupEventListeners } from './ui-interactions.js';
import { initEffects } from './init-effects.js';

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initEffects();
});
