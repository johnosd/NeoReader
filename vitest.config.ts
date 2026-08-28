import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import os from 'node:os'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    // Sem globals: cada arquivo importa explicitamente de 'vitest'
    globals: false,
    exclude: ['**/node_modules/**', '**/dist/**', '**/android/**', '**/.claude/**'],
    // Metade dos cores lógicos: evita saturar a máquina quando a suíte
    // completa roda em paralelo, o que causava timeouts flaky em testes com
    // setup pesado (ver sdd/bugs/bookmarkdrivesyncintegration-*).
    poolOptions: {
      threads: {
        maxThreads: Math.max(2, Math.floor(os.cpus().length / 2)),
      },
    },
    hookTimeout: 20000,
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
