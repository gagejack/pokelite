// Display colors for each Pokémon type — used by type chips, move chips, etc.
// Shared across the card, roster, battle, and pokedex UIs.
export const TYPE_COLORS = {
  fire: '#F08030', water: '#6890F0', grass: '#78C850',
  normal: '#A8A878', fighting: '#C03028', flying: '#98D8D8',
  poison: '#A040A0', ground: '#E0C068', rock: '#B8A038',
  bug: '#A8B820', ghost: '#705898', steel: '#B8B8D0',
  electric: '#F8D030', psychic: '#F85888', ice: '#98D8D8',
  dragon: '#7038F8', dark: '#705848', fairy: '#EE99AC',
}

// Legible label color for a type chip's background — white on the darker
// type colors, black on the lighter ones (ice, electric, flying, etc). Per
// WCAG relative luminance, not a plain RGB average, so mid-tones like grass
// and rock land on the side they actually read best against.
export function typeTextColor(bgHex) {
  const hex = (bgHex || '#888888').replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const toLinear = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return luminance > 0.5 ? '#000' : '#fff'
}
