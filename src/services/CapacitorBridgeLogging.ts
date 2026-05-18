type CapacitorBridgeGlobal = {
  isLoggingEnabled?: boolean
}

type WindowWithCapacitorBridge = Window & {
  Capacitor?: CapacitorBridgeGlobal
}

export function disableCapacitorBridgePayloadLogging(): void {
  if (typeof window === 'undefined') return

  const capacitor = (window as WindowWithCapacitorBridge).Capacitor
  if (!capacitor) return

  // Mantem console.info/warn/error no logcat, mas evita que o bridge do
  // Capacitor despeje payloads nativos grandes, como chunks base64 de EPUB.
  capacitor.isLoggingEnabled = false
}
