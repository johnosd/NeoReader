import { describe, expect, it } from 'vitest'

import { runExclusiveImport, waitForImportIdle } from '@/services/ImportCoordinator'

describe('waitForImportIdle', () => {
  it('resolve na hora quando não há importação em andamento', async () => {
    await expect(waitForImportIdle()).resolves.toBeUndefined()
  })

  it('espera a importação em andamento terminar', async () => {
    let finishImport: () => void = () => undefined
    const running = runExclusiveImport('native-single', 'outro.pdf', () => new Promise<void>((resolve) => { finishImport = resolve }))

    let idle = false
    const waiting = waitForImportIdle().then(() => { idle = true })
    await Promise.resolve()
    expect(idle).toBe(false)

    finishImport()
    await running
    await waiting
    expect(idle).toBe(true)
  })
})
