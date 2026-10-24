import { defineConfig } from 'vite';

// Relative output works at both a domain root and GitHub Pages' /repository/ URL.
export default defineConfig({ base: './' });
