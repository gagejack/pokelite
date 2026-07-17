import { useState } from 'react'
import { applyBattleVictory, evolveInto, GEN_MAX_ID } from '../game/pokemon.js'
import EvolutionNotice from '../components/EvolutionNotice'
import EvolutionChoice from '../components/EvolutionChoice'

// Shared post-battle victory + evolution flow for the two screens that resolve
// battles (NodeMap, EliteFour). It owns the evolution-notice and
// evolution-choice queues, applies a victory (level-ups, heal, auto-evolutions,
// and multi-branch choice detection), and renders the two popups.
//
// The caller keeps its own screen-specific branching (map advance, run end,
// champion check…) — applyVictory returns the updated roster so the caller can
// continue. Multi-branch lines (Eevee, Tyrogue…) queue an EvolutionChoice
// popup; the Pokémon stays un-evolved until the player picks.
//
// Usage:
//   const evo = useEvolutionFlow({ config, roster, setRoster, onSpeciesOwned })
//   const updatedRoster = await evo.applyVictory(finalPlayerTeam, { levelsGained, fullHeal })
//   ...
//   {evo.render()}
export function useEvolutionFlow({ config, roster, setRoster, onSpeciesOwned }) {
  const [evolutionNotices, setEvolutionNotices] = useState([])
  // Pending multi-branch evolution picks (Eevee, Tyrogue…) — the popup shows
  // one at a time; the Pokémon stays un-evolved until the player chooses.
  const [evolutionChoices, setEvolutionChoices] = useState([])

  // Apply a battle victory: level-ups, heal, auto-evolutions, and multi-branch
  // choice detection. Records auto-evolved species as owned, updates the roster,
  // and queues notices/choices. Returns the updated roster so the caller can
  // run its own post-victory branching.
  async function applyVictory(finalPlayerTeam, { levelsGained = 2, fullHeal = false } = {}) {
    // Evolution options are gated to species that exist in this region's gen.
    const maxSpeciesId = GEN_MAX_ID[config?.generation] ?? Infinity
    const { roster: updatedRoster, evolutionNotices: notices, evolutionChoices: choices } =
      await applyBattleVictory(finalPlayerTeam, { levelsGained, fullHeal, maxSpeciesId })
    // Each evolved form is a new owned species for the Pokédex.
    notices.forEach(n => onSpeciesOwned?.(n.pokeId))
    setRoster(updatedRoster)
    if (notices.length > 0) setEvolutionNotices(notices)
    if (choices.length > 0) setEvolutionChoices(choices)
    return updatedRoster
  }

  // Player picked an evolution target in the EvolutionChoice popup. Evolve the
  // pending Pokémon in place, record the new species, queue the notice, and
  // advance to the next pending choice (if any).
  async function handleEvolutionChoose(speciesId) {
    const choice = evolutionChoices[0]
    if (!choice) return
    const current = roster[choice.index]
    const evolved = current ? await evolveInto(current, speciesId) : null
    if (evolved) {
      setRoster(prev => prev.map((p, i) => i === choice.index && p.pokeId === choice.fromId ? evolved : p))
      onSpeciesOwned?.(evolved.pokeId)
      setEvolutionNotices(prev => [...prev, { from: choice.fromName, to: evolved.name, pokeId: evolved.pokeId }])
    }
    setEvolutionChoices(prev => prev.slice(1))
  }

  // The two popups. Choices take priority; notices wait until all pending
  // choices are resolved so the picker and the "X evolved into Y!" toast never
  // overlap.
  function render() {
    if (evolutionChoices.length > 0) {
      const choice = evolutionChoices[0]
      return (
        <EvolutionChoice
          fromName={choice.fromName}
          fromSprite={choice.sprite}
          options={choice.options}
          onChoose={handleEvolutionChoose}
        />
      )
    }
    return <EvolutionNotice notices={evolutionNotices} onDismiss={() => setEvolutionNotices([])} />
  }

  return { applyVictory, render, evolutionNotices, evolutionChoices }
}
