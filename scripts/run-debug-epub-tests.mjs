import { spawnSync } from 'node:child_process'

const vitestCommand = process.platform === 'win32'
  ? 'node_modules\\.bin\\vitest.cmd'
  : 'node_modules/.bin/vitest'
const args = process.argv.slice(2)
const fullFragmentCheck = args.includes('--full')
const vitestArgs = args.filter((arg) => arg !== '--full')

const result = spawnSync(
  vitestCommand,
  ['run', 'src/__tests__/debug/realEpubCorpus.test.ts', ...vitestArgs],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NEOREADER_RUN_DEBUG_EPUBS: '1',
      ...(fullFragmentCheck ? { NEOREADER_DEBUG_EPUB_FULL_FRAGMENTS: '1' } : {}),
    },
  },
)

if (result.error) {
  console.error(result.error)
}

process.exit(result.status ?? 1)
