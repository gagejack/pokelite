// Type effectiveness multipliers: TYPE_CHART[attackType][defenderType]
// 2 = super effective, 0.5 = not very effective, 0 = immune, 1 = normal (omitted)
const SE = 2, NV = 0.5, IM = 0

export const TYPE_CHART = {
  normal:   { rock: NV, steel: NV, ghost: IM },
  fighting: { normal: SE, rock: SE, steel: SE, ice: SE, dark: SE, flying: NV, psychic: NV, fairy: NV, ghost: IM, poison: NV, bug: NV },
  flying:   { fighting: SE, bug: SE, grass: SE, rock: NV, steel: NV, electric: NV, ground: IM },
  poison:   { grass: SE, fairy: SE, ground: NV, psychic: NV, rock: NV, ghost: NV, poison: NV, steel: IM },
  ground:   { poison: SE, rock: SE, steel: SE, fire: SE, electric: SE, water: NV, grass: NV, bug: NV, flying: IM },
  rock:     { flying: SE, bug: SE, fire: SE, ice: SE, fighting: NV, ground: NV, steel: NV, water: NV, grass: NV },
  bug:      { grass: SE, psychic: SE, dark: SE, flying: NV, rock: NV, fire: NV, fighting: NV, ghost: NV, steel: NV, fairy: NV },
  ghost:    { ghost: SE, psychic: SE, dark: NV, normal: IM, fighting: IM },
  steel:    { rock: SE, ice: SE, fairy: SE, steel: NV, fire: NV, water: NV, electric: NV, poison: IM },
  fire:     { bug: SE, steel: SE, grass: SE, ice: SE, rock: NV, water: NV, fire: NV, dragon: NV },
  water:    { ground: SE, rock: SE, fire: SE, grass: NV, water: NV, dragon: NV },
  grass:    { ground: SE, rock: SE, water: SE, flying: NV, poison: NV, bug: NV, fire: NV, grass: NV, steel: NV, dragon: NV },
  electric: { flying: SE, water: SE, grass: NV, electric: NV, dragon: NV, ground: IM },
  psychic:  { fighting: SE, poison: SE, psychic: NV, steel: NV, dark: IM },
  ice:      { flying: SE, ground: SE, grass: SE, dragon: SE, fighting: NV, rock: NV, steel: NV, fire: NV, water: NV, ice: NV },
  dragon:   { dragon: SE, steel: NV, fairy: IM },
  dark:     { ghost: SE, psychic: SE, fighting: NV, dark: NV, fairy: NV },
  fairy:    { fighting: SE, dragon: SE, dark: SE, poison: NV, steel: NV, fire: NV },
}

export function getEffectiveness(attackType, defenderTypes) {
  let multiplier = 1
  for (const defType of defenderTypes) {
    multiplier *= TYPE_CHART[attackType]?.[defType] ?? 1
  }
  return Math.max(0.25, multiplier)
}
