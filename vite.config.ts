import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Alias @/ → src/ para imports mais curtos e independentes de profundidade de pasta.
    // Ex: import { useSyncRef } from '@/hooks/useSyncRef'
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})