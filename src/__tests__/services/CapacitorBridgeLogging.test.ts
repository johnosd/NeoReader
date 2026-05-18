import { beforeEach, describe, expect, it } from 'vitest'
import { disableCapacitorBridgePayloadLogging } from '@/services/CapacitorBridgeLogging'

type WindowWithCapacitorBridge = Window & {
  Capacitor?: {
    isLoggingEnabled?: boolean
  }
}

describe('CapacitorBridgeLogging', () => {
  beforeEach(() => {
    delete (window as WindowWithCapacitorBridge).Capacitor
  })

  it('desliga log de payload do bridge nativo sem depender do Capacitor estar presente', () => {
    expect(() => disableCapacitorBridgePayloadLogging()).not.toThrow()
  })

  it('mantem console do WebView disponivel mas bloqueia log detalhado do bridge', () => {
    const bridgeWindow = window as WindowWithCapacitorBridge
    bridgeWindow.Capacitor = { isLoggingEnabled: true }

    disableCapacitorBridgePayloadLogging()

    expect(bridgeWindow.Capacitor.isLoggingEnabled).toBe(false)
  })
})
