import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import Layout from './Layout'
import Roster from './Roster'
import BattleCard from './BattleCard'
import { NODE_TYPES } from '../game/nodeMap.js'
import { getRegionConfig } from '../game/regionRegistry.js'
import { fetchPokemonBase, buildPokemonInstance, applyBattleVictory } from '../game/pokemon.js'
import { ELITE_FOUR_TEAMS, POKEMON_NAMES } from '../game/enemyTeams.js'
import { TYPE_COLORS } from '../game/types.js'

// Elite Four stage — a linear gauntlet after the 8th gym: four members then
// the Champion, fought in order. Between battles the roster is fully healed
// (applyBattleVictory fullHeal) and can be reordered on the next prep screen.
// Beating the Champion wins the run.
// TODO: no dedicated Pokémon League background asset exists yet — the stage
// uses a plain themed panel until one is authored.
export default function EliteFour({ region, character, roster, setRoster, onBack, onRestart, onMapCleared, onRunEnd, onSpeciesSeen, onSpeciesOwned, pokedexOpen, setPokedexOpen }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const config = getRegionConfig(region?.name)
  const members = config?.eliteFour ?? []

  const [defeated, setDefeated] = useState(0)
  const [pendingBattle, setPendingBattle] = useState(null)
  const [evolutionNotices, setEvolutionNotices] = useState([])
  const [loadingIndex, setLoadingIndex] = useState(null)
  const [won, setWon] = useState(false)

  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #666666'
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = dark ? '#888' : '#777'

  async function startBattle(index) {
    if (loadingIndex !== null || pendingBattle || won) return
    const member = members[index]
    setLoadingIndex(index)
    try {
      const specs = ELITE_FOUR_TEAMS[member.name] ?? []
      const enemyTeam = await Promise.all(
        specs.map(async s => buildPokemonInstance(await fetchPokemonBase(s.id), s.level))
      )
      enemyTeam.forEach(p => onSpeciesSeen?.(p.pokeId))
      // A synthetic BOSS node gives the battle the prep screen (with roster
      // reorder), the +2 level reward, and the "X wants to battle!" label.
      setPendingBattle({
        index,
        node: { id: `elite-four-${index}`, type: NODE_TYPES.BOSS, trainer: member.name },
        enemyTeam,
        trainerSprite: member.fullSprite,
      })
    } catch {
      // PokéAPI hiccup — leave the member clickable to retry.
    } finally {
      setLoadingIndex(null)
    }
  }

  async function handleBattleEnd({ won: battleWon, finalPlayerTeam }) {
    if (!pendingBattle) return
    const { index } = pendingBattle
    if (battleWon) {
      // Between-battles full heal + revive per the design doc; reorder happens
      // on the next member's prep screen.
      const { roster: updatedRoster, evolutionNotices: notices } =
        await applyBattleVictory(finalPlayerTeam, { levelsGained: 2, fullHeal: true })
      notices.forEach(n => onSpeciesOwned?.(n.pokeId))
      setRoster(updatedRoster)
      if (notices.length > 0) setEvolutionNotices(notices)
      setPendingBattle(null)
      onMapCleared?.()
      setDefeated(index + 1)
      if (members[index].champion) {
        setWon(true)
        onRunEnd?.('win')
      }
    } else {
      // Losses normally exit via BattleCard's Play Again (onRestart); adopt
      // the sim's final team if this path is ever reached.
      setRoster(finalPlayerTeam.map(fp => ({ ...fp })))
      setPendingBattle(null)
    }
  }

  const MemberRow = ({ member, index }) => {
    const beaten = index < defeated
    const isNext = index === defeated && !won
    const locked = index > defeated
    const specs = ELITE_FOUR_TEAMS[member.name] ?? []
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {index > 0 && (
          <div style={{ width: '3px', height: '18px', backgroundColor: dark ? '#555' : '#999' }} />
        )}
        <button
          onClick={isNext ? () => startBattle(index) : undefined}
          className={isNext ? 'active:scale-95' : ''}
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            width: isDesktop ? '340px' : '300px',
            padding: '8px 12px',
            backgroundColor: cardBg,
            border: isNext ? '2px solid #facc15' : borderStyle,
            boxShadow: isNext ? (dark ? '-4px 6px 0 0 #b89d0a' : '-4px 6px 0 0 #b89d0a') : shadowStyle,
            cursor: isNext ? 'pointer' : 'default',
            opacity: locked ? 0.45 : beaten ? 0.6 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          <img
            src={member.sprite}
            alt={member.name}
            style={{
              width: '56px', height: '56px', objectFit: 'contain', imageRendering: 'pixelated',
              filter: beaten ? 'grayscale(1)' : locked ? 'brightness(0.5)' : 'none', flexShrink: 0,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: textColor }}>
                {member.name}
              </span>
              <span style={{
                fontFamily: 'Upheaval', fontSize: '8px', color: '#fff',
                backgroundColor: member.champion ? '#b89d0a' : (TYPE_COLORS[member.type] || '#888'),
                padding: '2px 5px', textTransform: 'capitalize',
              }}>
                {member.champion ? 'Champion' : member.type}
              </span>
            </div>
            <span style={{ fontFamily: 'Orange Kid', fontSize: '10px', color: mutedColor, textAlign: 'left', textTransform: 'capitalize', lineHeight: 1.4 }}>
              {specs.map(s => `${POKEMON_NAMES[s.id] ?? '???'} Lv${s.level}`).join(' · ')}
            </span>
          </div>
          <span style={{ marginLeft: 'auto', fontFamily: 'Upheaval', fontSize: '10px', flexShrink: 0,
            color: beaten ? '#22c55e' : isNext ? '#facc15' : mutedColor }}>
            {beaten ? 'BEATEN' : isNext ? (loadingIndex === index ? '...' : 'FIGHT') : 'LOCKED'}
          </span>
        </button>
      </div>
    )
  }

  const memberColumn = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: '#ffffff', textShadow: '0 2px 6px rgba(0,0,0,0.8)', marginBottom: '4px' }}>
        Elite Four
      </span>
      <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: '#facc15', textShadow: '0 1px 4px rgba(0,0,0,0.8)', marginBottom: '12px', textAlign: 'center' }}>
        Defeat all four, then the Champion, to win the run
      </span>
      {members.map((member, index) => (
        <MemberRow key={member.name} member={member} index={index} />
      ))}
    </div>
  )

  const swapRoster = (a, b) => setRoster(prev => { const r = [...prev]; [r[a], r[b]] = [r[b], r[a]]; return r })

  return (
    <Layout onHome={onBack} onRestart={onRestart} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen}>
      {isDesktop ? (
        <div className="flex w-full py-4" style={{ alignItems: 'flex-start', justifyContent: 'center', gap: '16px', visibility: pendingBattle ? 'hidden' : 'visible', overflowY: 'auto', minHeight: 0 }}>
          <Roster roster={roster} onSwap={swapRoster} />
          {memberColumn}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 16px', visibility: pendingBattle ? 'hidden' : 'visible' }}>
          <div style={{ marginBottom: '10px' }}>
            <Roster roster={roster} horizontal onSwap={swapRoster} />
          </div>
          {memberColumn}
        </div>
      )}

      {pendingBattle && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BattleCard
            node={pendingBattle.node}
            enemyTeam={pendingBattle.enemyTeam}
            trainerSprite={pendingBattle.trainerSprite}
            playerRoster={roster}
            character={character}
            damageMultiplier={config?.damageMultiplier ?? 2}
            onBattleEnd={handleBattleEnd}
            onDefeat={() => onRunEnd?.('loss')}
            onRestart={onRestart}
          />
        </div>
      )}

      {evolutionNotices.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div style={{
            backgroundColor: cardBg, border: borderStyle, boxShadow: shadowStyle,
            padding: '24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
          }}>
            {evolutionNotices.map(({ from, to }, i) => (
              <span key={i} style={{ fontFamily: 'Orange Kid', fontSize: '16px', color: textColor, textTransform: 'capitalize', textAlign: 'center' }}>
                {from} evolved into {to}!
              </span>
            ))}
            <button
              onClick={() => setEvolutionNotices([])}
              style={{
                fontFamily: 'Upheaval', fontSize: '11px', color: textColor,
                border: borderStyle, backgroundColor: dark ? '#1a1a1a' : '#c8c8c8',
                padding: '6px 20px', cursor: 'pointer', marginTop: '4px',
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {won && evolutionNotices.length === 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div style={{
            backgroundColor: cardBg, border: borderStyle, boxShadow: shadowStyle,
            padding: '28px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
          }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '26px', color: '#22c55e' }}>
              Champion defeated!
            </span>
            <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: textColor, textAlign: 'center' }}>
              You conquered the {region?.name} region. The run is complete!
            </span>
            <button
              onClick={onBack}
              style={{
                fontFamily: 'Upheaval', fontSize: '13px', color: '#1a1a1a',
                border: 'none', backgroundColor: '#facc15',
                padding: '8px 28px', cursor: 'pointer',
                boxShadow: '-2px 3px 0 0 #b89d0a',
              }}
            >
              Home
            </button>
          </div>
        </div>
      )}
    </Layout>
  )
}
