/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Padrão do Vitest é 5s — curto para um teste que renderiza a aplicação
    // inteira e passa pela latência simulada do adapter mock (login, busca de
    // membros, navegação). Testes de fluxo mais longos continuam declarando
    // seu próprio limite maior (ex.: 15_000/30_000) por cima deste padrão.
    testTimeout: 15_000,
  },
});
