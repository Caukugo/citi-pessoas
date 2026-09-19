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
    // A suíte roda SEMPRE com dados fictícios, mesmo para quem deixou
    // `VITE_DATA_SOURCE=supabase` no `.env.local` para usar o banco de teste
    // no navegador. Sem isto, os testes de tela tentam autenticar de verdade e
    // falham por ambiente, não por código. O `.env.test` diz a mesma coisa e é
    // o que documenta a decisão; isto aqui garante que nenhum `.env.*.local`
    // ou variável exportada no terminal passe por cima.
    env: {
      VITE_DATA_SOURCE: 'mock',
    },
    // Metade dos núcleos, não todos. Os testes de fluxo montam a aplicação
    // inteira em jsdom e esperam a latência simulada do adapter mock; com um
    // worker por núcleo a máquina satura, o relógio continua correndo, e testes
    // que passam sozinhos falham em conjunto — flutuação de máquina disfarçada
    // de bug de código. Percentual, e não número fixo, para valer tanto no
    // notebook de quem desenvolve quanto na CI.
    maxWorkers: '50%',
    minWorkers: 1,
  },
});
