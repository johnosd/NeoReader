import { cpSync, copyFileSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, extname, resolve as resolvePath, sep } from 'node:path'
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

// copyFoliatePdfjsAssets só roda no build; no `npm run dev` o worker/cmaps do
// pdf.js em /vendor/pdfjs davam 404. Este plugin (apply: 'serve') serve a mesma
// pasta direto do node_modules — não afeta o build nem o caminho EPUB (R-006).
const PDFJS_CONTENT_TYPES: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.json': 'application/json',
}

const serveFoliatePdfjsAssets = () => ({
  name: 'serve-foliate-pdfjs-assets',
  apply: 'serve' as const,
  configureServer(server: {
    middlewares: {
      use: (
        path: string,
        handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void,
      ) => void
    }
  }) {
    // `use(path, fn)` do Connect remove o prefixo da URL: req.url chega como "/pdf.worker.min.mjs?x".
    server.middlewares.use('/vendor/pdfjs', (req, res, next) => {
      const pathname = decodeURIComponent((req.url ?? '').split('?')[0])
      let file = resolvePath(foliatePdfjsDir, `.${pathname}`)

      // Impede sair da pasta do pdf.js com "../".
      if (!file.startsWith(foliatePdfjsDir + sep)) return next()

      // Mesmo aliasing do build: o foliate pede "*.min.*", o pacote só traz sem ".min".
      if (!existsSync(file)) file = file.replace(/\.min(\.mjs(?:\.map)?)$/, '$1')
      if (!existsSync(file) || !statSync(file).isFile()) return next()

      res.setHeader('Content-Type', PDFJS_CONTENT_TYPES[extname(file)] ?? 'application/octet-stream')
      createReadStream(file).pipe(res)
    })
  },
})

// Hooks na forma clássica `transform(code, id)`: a forma `{ filter, handler }` só era aplicada no build — no
// `npm run dev` os iframes do foliate saíam com allow-scripts e os testes rodavam com sandbox mais frouxo que
// o APK (feature 022, R-029). A regex aceita a query `?v=` que o dev server põe nos módulos do node_modules.
const FOLIATE_RENDERER_ID = /[\\/]node_modules[\\/]foliate-js[\\/](?:paginator|fixed-layout)\.js(?:\?.*)?$/
const FOLIATE_FIXED_LAYOUT_ID = /[\\/]node_modules[\\/]foliate-js[\\/]fixed-layout\.js(?:\?.*)?$/

const hardenFoliateIframeSandbox = () => ({
  name: 'harden-foliate-iframe-sandbox',
  transform(code: string, id: string) {
    if (!FOLIATE_RENDERER_ID.test(id)) return null
    const nextCode = code.replaceAll('allow-same-origin allow-scripts', 'allow-same-origin')
    return nextCode === code ? null : { code: nextCode, map: null }
  },
})

// foliate-fxl em modo scroll (PDF em página fiel, feature 022 — R-027): o descarte das páginas longe da tela
// (#evictScrollPages, teto de 8) só roda no callback do IntersectionObserver. Numa rolagem rápida, as páginas
// cujo carregamento começou terminam DEPOIS desse callback e ficam vivas (16–28 iframes com canvas) até a
// próxima mudança de interseção. Este patch roda o mesmo descarte também ao fim de cada carregamento.
// Âncora: o fim do try de #loadScrollPage. Se o foliate mudar e a âncora sumir, o build falha (não some calado).
const SCROLL_LOAD_END_ANCHOR = /\n[ \t]*\}\s*catch\s*\(e\)\s*\{\s*console\.warn\('Failed to load scroll page'/

const evictFoliateScrollPagesAfterLoad = () => ({
  name: 'evict-foliate-scroll-pages-after-load',
  transform(code: string, id: string) {
    if (!FOLIATE_FIXED_LAYOUT_ID.test(id)) return null
    if (!SCROLL_LOAD_END_ANCHOR.test(code)) {
      throw new Error('[evict-foliate-scroll-pages-after-load] âncora não encontrada em foliate-js/fixed-layout.js — revisar o patch (R-027).')
    }
    return { code: code.replace(SCROLL_LOAD_END_ANCHOR, (anchor) => `\n            this.#evictScrollPages()${anchor}`), map: null }
  },
})

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    hardenFoliateIframeSandbox(),
    evictFoliateScrollPagesAfterLoad(),
    copyFoliatePdfjsAssets(),
    serveFoliatePdfjsAssets(),
  ],
  server: {
    proxy: {
      '/fish-audio-api': {
        target: 'https://api.fish.audio',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fish-audio-api/, ''),
      },
    },
  },
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
