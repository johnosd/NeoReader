import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// AGP 9+ removeu o arquivo legacy `proguard-android.txt`. Plugins Capacitor que ainda
// referenciam ele quebram o build. Aplicamos o substituto `proguard-android-optimize.txt`
// nos build.gradle dos plugins afetados.
const TARGETS = [
  { label: 'Capacitor TTS', path: ['@capacitor-community', 'text-to-speech', 'android', 'build.gradle'] },
  { label: 'RevenueCat Purchases', path: ['@revenuecat', 'purchases-capacitor', 'android', 'build.gradle'] },
  { label: 'Capacitor AdMob', path: ['@capacitor-community', 'admob', 'android', 'build.gradle'] },
]

const legacyProguard = "getDefaultProguardFile('proguard-android.txt')"
const optimizedProguard = "getDefaultProguardFile('proguard-android-optimize.txt')"

for (const target of TARGETS) {
  const buildGradlePath = join(process.cwd(), 'node_modules', ...target.path)
  try {
    const source = readFileSync(buildGradlePath, 'utf8')

    if (source.includes(optimizedProguard)) {
      console.log(`${target.label} Android proguard file already patched.`)
    } else if (source.includes(legacyProguard)) {
      writeFileSync(buildGradlePath, source.replace(legacyProguard, optimizedProguard))
      console.log(`Patched ${target.label} Android proguard file for AGP 9 compatibility.`)
    } else {
      console.warn(`${target.label} Android proguard line was not found; no patch applied.`)
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`Could not patch ${target.label} Android proguard file: ${reason}`)
  }
}
