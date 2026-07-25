// Shared region metadata. Lives here rather than inside RegionSelect because
// the desktop main menu's RegionBar renders the same five regions — two copies
// would drift the first time a region is added.
//
// Card-background thumbnails (800px JPEG) — the full-res source PNGs were
// 0.8–8.3 MB each and only ever render blurred/darkened, so they were
// downscaled + recompressed (~14 MB → ~1 MB total).
import KantoMap from '../../assets/regions/KantoMap.jpg'
import JohtoMap from '../../assets/regions/JohtoMap.jpg'
import HoennMap from '../../assets/regions/HoennMap.jpg'
import SinnohMap from '../../assets/regions/SinnohMap.jpg'
import UnovaMap from '../../assets/regions/UnovaMap.jpg'

// PokéAPI sprite CDN. Matches the existing region screen's behavior.
export const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

export const REGIONS = [
  { name: 'Kanto',  gen: 'Gen 1', map: KantoMap,  legendaries: [150, 151] }, // Mewtwo, Mew
  { name: 'Johto',  gen: 'Gen 2', map: JohtoMap,  legendaries: [249, 250] }, // Lugia, Ho-Oh
  { name: 'Hoenn',  gen: 'Gen 3', map: HoennMap,  legendaries: [382, 383] }, // Kyogre, Groudon
  { name: 'Sinnoh', gen: 'Gen 4', map: SinnohMap, legendaries: [483, 484] }, // Dialga, Palkia
  { name: 'Unova',  gen: 'Gen 5', map: UnovaMap,  legendaries: [643, 644] }, // Reshiram, Zekrom
]
