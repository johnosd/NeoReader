import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const buildGradlePath = join(
  process.cwd(),
  'node_modules',
  '@capacitor-community',
  'text-to-speech',
  'android',
  'build.gradle',
)

const legacyProguard = "getDefaultProguardFile('proguard-android.txt')"
const optimizedProguard = "getDefaultProguardFile('proguard-android-optimize.txt')"

try {
  const source = readFileSync(buildGradlePath, 'utf8')

  if (source.includes(optimizedProguard)) {
    console.log('Capacitor TTS Android proguard file already patched.')
  } else if (source.includes(legacyProguard)) {
    writeFileSync(buildGradlePath, source.replace(legacyProguard, optimizedProguard))
    console.log('Patched Capacitor TTS Android proguard file for AGP 9 compatibility.')
  } else {
    console.warn('Capacitor TTS Android proguard line was not found; no patch applied.')
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.warn(`Could not patch Capacitor TTS Android proguard file: ${reason}`)
}
