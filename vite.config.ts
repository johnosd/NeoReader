import { cpSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

const foliatePdfjsDir = fileURLToPath(
  new URL('./node_modules/foliate-js/vendor/pdfjs', import.meta.url),
)
const foliatePdfjsEntry = fileURLToPath(
  new URL('./node_modules/foliate-js/vendor/pdfjs/pdf.mjs', import.meta.url),
)

const copyFoliatePdfjsAssets = () => {
  let outputPdfjsDir = ''

  return {
    name: 'copy-foliate-pdfjs-assets',
    apply: 'build' as const,
    configResolved(config: { root: string; build: { outDir: string } }) {
      outputPdfjsDir = resolvePath(config.root, config.build.outDir, 'vendor', 'pdfjs')
    },
    writeBundle() {
      mkdirSync(dirname(outputPdfjsDir), { recursive: true })
      cpSync(foliatePdfjsDir, outputPdfjsDir, { recursive: true, force: true })

      // foliate-js expects the ".min" filenames, but its vendored build ships
      // the same files without that suffix.
      for (const [sourceName, targetName] of [
        ['pdf.mjs', 'pdf.min.mjs'],
        ['pdf.mjs.map', 'pdf.min.mjs.map'],
        ['pdf.worker.mjs', 'pdf.worker.min.mjs'],
        ['pdf.worker.mjs.map', 'pdf.worker.min.mjs.map'],
      ] as const) {
        const sourceFile = resolvePath(outputPdfjsDir, sourceName)
        const targetFile = resolvePath(outputPdfjsDir, targetName)

        if (existsSync(sourceFile)) {
          copyFileSync(sourceFile, targetFile)
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyFoliatePdfjsAssets()],
  optimizeDeps: {
    // foliate-js is loaded lazily by the reader. Serving it as source in dev
    // avoids stale /node_modules/.vite/deps chunks after Vite re-optimizes deps.
    exclude: ['foliate-js'],
  },
  resolve: {
    // Alias @/ -> src/ para imports mais curtos e independentes de profundidade.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@pdfjs/pdf.min.mjs': foliatePdfjsEntry,
    },
  },
})
