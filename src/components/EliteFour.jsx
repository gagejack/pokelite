import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import Layout from './Layout'
import Roster from './Roster'
import BattleCard from './BattleCard'
import EvolutionNotice from './EvolutionNotice'
import EvolutionChoice from './EvolutionChoice'
import { NODE_TYPES } from '../game/nodeMap.js'
import { getRegionConfig } from '../game/regionRegistry.js'
import { fetchPokemonBase, buildPokemonInstance, applyBattleVictory, cachedName, evolveInto, GEN_MAX_ID } from '../game/pokemon.js'
import { swapInRoster } from '../game/roster.js'
import { TYPE_COLORS } from '../game/types.js'

// Elite Four stage — a linear gauntlet after the 8th gym: four members then
// the Champion, fought in order. Beating the Champion wins the run.
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
  // Pending multi-branch evolution picks (Eevee, Tyrogue…) — see NodeMap.
  const [evolutionChoices, setEvolutionChoices] = useState([])
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
      const specs = config?.eliteFourTeams?.[member.name] ?? []
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
      // Levels gained per battle; reorder happens on the next member's prep screen.
      const maxSpeciesId = GEN_MAX_ID[config?.generation] ?? Infinity
      const { roster: updatedRoster, evolutionNotices: notices, evolutionChoices: choices } =
        await applyBattleVictory(finalPlayerTeam, { levelsGained: 2, fullHeal: false, maxSpeciesId })
      notices.forEach(n => onSpeciesOwned?.(n.pokeId))
      setRoster(updatedRoster)
      if (notices.length > 0) setEvolutionNotices(notices)
      if (choices.length > 0) setEvolutionChoices(choices)
      setPendingBattle(null)
        onMapCleared?.()
        setDefeated(index + 1)
        if (members[index].champion) {
          setWon(true)
          onRunEnd?.('win', updatedRoster)
        }
    } else {
      // Losses normally exit via BattleCard's Play Again (onRestart); adopt
      // the sim's final team if this path is ever reached.
      setRoster(finalPlayerTeam.map(fp => ({ ...fp })))
      setPendingBattle(null)
    }
  }

  // Player picked an evolution target in the EvolutionChoice popup — mirrors
  // the same handler in NodeMap.
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

  const MemberRow = ({ member, index }) => {
    const beaten = index < defeated
    const isNext = index === defeated && !won
    const locked = index > defeated
    const specs = config?.eliteFourTeams?.[member.name] ?? []
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
          {/* Overworld sprites are 3-col × 4-row walk sheets of 32×32 frames —
              crop to the top-left (front-facing, first frame). The box stays
              square so the frame keeps its native aspect ratio. */}
          <div
            role="img"
            aria-label={member.name}
            style={{
              width: '56px', height: '56px', flexShrink: 0,
              backgroundImage: `url(${member.sprite})`,
              backgroundSize: '300% 400%',
              backgroundPosition: 'top left',
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
              filter: beaten ? 'grayscale(1)' : locked ? 'brightness(0.5)' : 'none',
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
              {specs.map(s => `${cachedName(s.id) ?? '???'} Lv${s.level}`).join(' · ')}
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

  const swapRoster = swapInRoster(setRoster)

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

      {evolutionChoices.length > 0 && (
        <EvolutionChoice
          fromName={evolutionChoices[0].fromName}
          fromSprite={evolutionChoices[0].sprite}
          options={evolutionChoices[0].options}
          onChoose={handleEvolutionChoose}
        />
      )}

      {/* Notices wait until all pending evolution choices are resolved. */}
      {evolutionChoices.length === 0 && (
        <EvolutionNotice notices={evolutionNotices} onDismiss={() => setEvolutionNotices([])} />
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
