import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Served from https://akulliaa.github.io/noita-kirja/
export default defineConfig({
  base: '/noita-kirja/',
  plugins: [svelte()],
});
