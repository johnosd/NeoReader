# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NeoReader — an EPUB reader app targeting Android (Capacitor). Currently in early scaffold stage; most of the planned stack has not been wired up yet.

## Commands

```bash
npm run dev          # dev server (web)
npm run build        # tsc -b && vite build
npm run lint         # eslint
npm run preview      # preview production build

# Not yet added to package.json — add when setting up:
npm run typecheck    # tsc --noEmit (standalone type check)
npm run test         # vitest

# Android (once capacitor.config.ts is created):
npx cap sync android
npx cap run android
```

> `typecheck` and `test` scripts are **not yet in package.json**. Add them before using.

## Planned Stack (not all installed yet)

| Package | Purpose |
|---|---|
| React 19 + TypeScript + Vite | UI framework |
| Capacitor 8 (Android only for MVP) | Native bridge |
| Tailwind CSS | Styling |
| Dexie.js | IndexedDB wrapper for local book storage |
| foliate-js or epub.js | EPUB parsing (TBD) |

## Conventions

- **Components**: PascalCase files — `BookList.tsx`
- **Hooks**: `use` prefix — `useReader.ts`
- **Services**: classes — `TranslationService.ts`
- One file = one responsibility

## Architecture Notes

The app is designed as a mobile-first EPUB reader. Key data flow to keep in mind when building:

- **Book storage**: EPUB files land in IndexedDB via Dexie.js. Books are never re-uploaded; the DB is the source of truth on device.
- **Rendering**: The EPUB parser (foliate-js or epub.js — decide before implementing) runs in the browser/WebView and renders content into a controlled viewport. This is the performance-critical path.
- **Native layer**: Capacitor wraps the web app for Android. Keep native plugins minimal — use Capacitor's Filesystem and possibly Share plugins rather than writing custom native code.
- **No backend**: MVP is fully offline. No API calls, no sync, no auth.

## TypeScript Config Notes

- `noUnusedLocals` and `noUnusedParameters` are **enforced** — unused imports will fail the build.
- `verbatimModuleSyntax` is on — use `import type` for type-only imports.
- `erasableSyntaxOnly` is on — avoid TypeScript-only runtime constructs (enums, namespaces).

## Developer Profile

- Background: Python/SQL data engineer, learning JS/TS/React while building this.
- Prefer explicit code over clever abstractions.
- Add a short inline comment when using a JS/TS feature that has no Python equivalent.
- Ask before expanding scope when requirements are ambiguous.
