export const ITEMS = [
  { id: 'leftovers',    name: 'Leftovers',    description: 'Restores 10% max HP each turn',     weight: 200, icon: 'leftovers' },
  { id: 'shell_bell',   name: 'Shell Bell',   description: 'Restores HP = 20% of damage dealt', weight: 180, icon: 'shell-bell' },
  { id: 'expert_belt',  name: 'Expert Belt',  description: '+20% damage on all moves',           weight: 160, icon: 'expert-belt' },
  { id: 'choice_band',  name: 'Choice Band',  description: '+50% Attack',                        weight: 120, icon: 'choice-band' },
  { id: 'choice_scarf', name: 'Choice Scarf', description: '+50% Speed',                         weight: 120, icon: 'choice-scarf' },
  { id: 'scope_lens',   name: 'Scope Lens',   description: '+30% crit rate',                     weight: 100, icon: 'scope-lens' },
  { id: 'rocky_helmet', name: 'Rocky Helmet', description: 'Deals 1/3 HP damage to attackers',  weight: 80,  icon: 'rocky-helmet' },
  { id: 'life_orb',     name: 'Life Orb',     description: '+30% damage on all moves',           weight: 30,  icon: 'life-orb' },
  { id: 'focus_sash',   name: 'Focus Sash',   description: 'Survive any KO hit at full HP',      weight: 10,  icon: 'focus-sash' },
]

export function itemIconUrl(item) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${item.icon}.png`
}

export function pickThreeItems() {
  const totalWeight = ITEMS.reduce((sum, item) => sum + item.weight, 0)
  const result = []
  const remaining = [...ITEMS]

  while (result.length < 3 && remaining.length > 0) {
    const pool = remaining.reduce((sum, item) => sum + item.weight, 0)
    let roll = Math.random() * pool
    for (let i = 0; i < remaining.length; i++) {
      roll -= remaining[i].weight
      if (roll <= 0) {
        result.push(remaining[i])
        remaining.splice(i, 1)
        break
      }
    }
  }

  return result
}
