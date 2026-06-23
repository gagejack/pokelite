import { unovaConfig } from './regions/unova.js'
import { kantoConfig } from './regions/kanto.js'
import { hoennConfig } from './regions/hoenn.js'
import { sinnohConfig } from './regions/sinnoh.js'

const REGION_CONFIGS = {
  Kanto:  kantoConfig,
  Hoenn:  hoennConfig,
  Sinnoh: sinnohConfig,
  Unova:  unovaConfig,
}

export function getRegionConfig(regionName) {
  return REGION_CONFIGS[regionName] ?? null
}
