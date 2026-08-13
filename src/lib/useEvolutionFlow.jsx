import { useState } from 'react'
import { applyBattleVictory, evolveInto, checkEvolution, applyRareCandy, GEN_MAX_ID } from '../game/pokemon.js'
import { BALANCE } from '../game/balance.js'
import EvolutionAnimation from '../components/EvolutionAnimation'
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
  async function applyVictory(finalPlayerTeam, { levelsGained = 2, fullHeal = false, bonusLevelsForSurvivors = 0 } = {}) {
    // Evolution options are gated to species that exist in this region's gen.
    const maxSpeciesId = GEN_MAX_ID[config?.generation] ?? Infinity
    const { roster: updatedRoster, evolutionNotices: notices, evolutionChoices: choices } =
      await applyBattleVictory(finalPlayerTeam, { levelsGained, fullHeal, maxSpeciesId, bonusLevelsForSurvivors })
    // Each evolved form is a new owned species for the Pokédex.
    notices.forEach(n => onSpeciesOwned?.(n.pokeId, !!n.shiny))
    setRoster(updatedRoster)
    if (notices.length > 0) setEvolutionNotices(prev => [...prev, ...notices])
    if (choices.length > 0) setEvolutionChoices(choices)
    return updatedRoster
  }

  // Evolve Stone: evolve the roster slot on the spot, ignoring level entirely
  // (so stone/friendship evolutions like Pikachu→Raichu work, and a Lv5
  // Caterpie can become Metapod). Multi-branch lines (Eevee) queue the same
  // EvolutionChoice popup used post-battle. Returns true if the stone was
  // consumed — i.e. the Pokémon either evolved or has a pending choice — and
  // false if it has no evolution at all, so the caller can keep the item.
  // Rare Candy — level one Pokémon and run the same evolution pass a battle
  // win runs, so a candy that pushes a Pokémon over its evolution level shows
  // the same notice (or choice popup) the win would have. Returns true if the
  // candy did something; false means KEEP it (already at MAX_LEVEL), matching
  // the Evolve Stone's contract on a Pokémon that cannot evolve.
  async function useRareCandy(pokeIndex) {
    const maxSpeciesId = GEN_MAX_ID[config?.generation] ?? Infinity
    const { roster: next, used, evolutionNotices: notices, evolutionChoices: choices } =
      await applyRareCandy(roster, pokeIndex, BALANCE.pokemon.rareCandyLevels, { maxSpeciesId })
    if (!used) return false
    notices.forEach(n => onSpeciesOwned?.(n.pokeId, !!n.shiny))
    setRoster(next)
    if (notices.length > 0) setEvolutionNotices(prev => [...prev, ...notices])
    if (choices.length > 0) setEvolutionChoices(prev => [...prev, ...choices])
    return true
  }

  async function evolveWithStone(pokeIndex) {
    const target = roster[pokeIndex]
    if (!target) return false
    const maxSpeciesId = GEN_MAX_ID[config?.generation] ?? Infinity
    const result = await checkEvolution(target, target.level, { maxSpeciesId, ignoreLevel: true })
    if (result?.options) {
      setEvolutionChoices(prev => [...prev, {
        index: pokeIndex, fromId: target.pokeId, fromName: target.name,
        sprite: target.sprite, options: result.options,
      }])
      return true
    }
    if (result?.evolved) {
      setRoster(prev => prev.map((p, i) => i === pokeIndex && p.pokeId === target.pokeId ? result.evolved : p))
      onSpeciesOwned?.(result.evolved.pokeId, !!result.evolved.shiny)
      setEvolutionNotices(prev => [...prev, {
        from: target.name, to: result.evolved.name,
        fromSprite: target.sprite, toSprite: result.evolved.sprite,
        pokeId: result.evolved.pokeId,
      }])
      return true
    }
    return false
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
      onSpeciesOwned?.(evolved.pokeId, !!evolved.shiny)
      setEvolutionNotices(prev => [...prev, {
        from: choice.fromName, to: evolved.name,
        // The choice popup already carries the pre-evolution sprite, so the
        // notice reuses it rather than re-deriving the old form.
        fromSprite: choice.sprite, toSprite: evolved.sprite,
        pokeId: evolved.pokeId,
      }])
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
    if (evolutionNotices.length === 0) return null
    const notice = evolutionNotices[0]
    return (
      <EvolutionAnimation
        key={`${notice.pokeId}-${notice.from}-${notice.to}`}
        fromSprite={notice.fromSprite}
        toSprite={notice.toSprite}
        fromName={notice.from}
        toName={notice.to}
        mode="evolve"
        onDismiss={() => setEvolutionNotices(prev => prev.slice(1))}
      />
    )
  }

  return { applyVictory, evolveWithStone, useRareCandy, render, evolutionNotices, evolutionChoices }
}
