import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import Layout from './Layout'
import Roster from './Roster'
import BattleCard from './BattleCard'
import { NODE_TYPES } from '../game/nodeMap.js'
import { getRegionConfig } from '../game/regionRegistry.js'
import { fetchPokemonBase, buildPokemonInstance, cachedName } from '../game/pokemon.js'
import { BALANCE } from '../game/balance.js'
import { useEvolutionFlow } from '../lib/useEvolutionFlow.jsx'
import { getRegionBalance } from '../lib/regionBalance'
import { swapInRoster } from '../game/roster.js'
import { itemIconUrl } from '../game/items.js'
import { TYPE_COLORS } from '../game/types.js'

// Elite Four stage — a linear gauntlet after the 8th gym: four members then
// the Champion, fought in order. Beating the Champion wins the run.
// TODO: no dedicated Pokémon League background asset exists yet — the stage
// uses a plain themed panel until one is authored.
export default function EliteFour({ region, character, starter, roster, setRoster, onMoveItem, onBack, onRestart, onMapCleared, onRunEnd, onSpeciesSeen, onSpeciesOwned, pokedexOpen, setPokedexOpen, seedCode }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const config = getRegionConfig(region?.name)
  const members = config?.eliteFour ?? []

  const [defeated, setDefeated] = useState(0)
  const [pendingBattle, setPendingBattle] = useState(null)
  const evo = useEvolutionFlow({ config, roster, setRoster, onSpeciesOwned })
  const [loadingIndex, setLoadingIndex] = useState(null)
  const [won, setWon] = useState(false)

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = dark ? '#888' : '#777'

  // A member's full team. Blue (the champion) gets a 6th ace appended: the
  // fully-evolved starter that counters the player's pick, falling back to the
  // config's first entry if the starter is unknown. Shared by the preview row
  // (MemberRow) and the actual battle (startBattle) so they never disagree.
  function teamSpecs(member) {
    const specs = config?.eliteFourTeams?.[member.name] ?? []
    const counter = config?.blueStarterCounter
    if (member.champion && counter) {
      const ace = counter[starter?.id] ?? Object.values(counter)[0]
      if (ace) return [...specs, ace]
    }
    return specs
  }

  async function startBattle(index) {
    if (loadingIndex !== null || pendingBattle || won) return
    const member = members[index]
    setLoadingIndex(index)
    try {
      const specs = teamSpecs(member)
      const enemyTeam = await Promise.all(
        specs.map(async s => buildPokemonInstance(await fetchPokemonBase(s.id), s.level))
      )
      enemyTeam.forEach(p => onSpeciesSeen?.(p.pokeId, !!p.shiny))
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
      const updatedRoster = await evo.applyVictory(finalPlayerTeam, { levelsGained: BALANCE.progression.levelsGained.eliteFour, fullHeal: false })
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

  const MemberRow = ({ member, index }) => {
    const beaten = index < defeated
    const isNext = index === defeated && !won
    const locked = index > defeated
    const specs = teamSpecs(member)
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

  // Held-item moving: clicking a held item in a Pokémon's stat popup starts a
  // move; the next roster slot clicked receives it. Mirrors NodeMap's flow but
  // there's no bag here, so the only source/target is a roster Pokémon.
  const [movingItem, setMovingItem] = useState(null)
  const isMovingItem = !!movingItem
  async function resolveItemMove(to) {
    if (!movingItem) return
    const { item, from } = movingItem
    setMovingItem(null)
    // Evolve Stone on a Pokémon: evolve + consume rather than equip (kept if the
    // target can't evolve, so it isn't wasted).
    if (item?.consumable === 'evolve' && to.kind === 'pokemon') {
      const used = await evo.evolveWithStone(to.pokeIndex)
      if (used) onMoveItem?.({ item, from, to: { kind: 'consumed' } })
      return
    }
    onMoveItem?.({ item, from, to })
  }
  const rosterItemProps = {
    itemTargeting: isMovingItem,
    onPickTarget: pokeIndex => resolveItemMove({ kind: 'pokemon', pokeIndex }),
    onStartHeldItemDrag: (pokeIndex, item) => setMovingItem(item ? { item, from: { kind: 'pokemon', pokeIndex } } : null),
  }

  return (
    <Layout onHome={onBack} onRestart={onRestart} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen}>
      {isDesktop ? (
        <div className="flex w-full py-4" style={{ alignItems: 'flex-start', justifyContent: 'center', gap: '16px', visibility: pendingBattle ? 'hidden' : 'visible', overflowY: 'auto', minHeight: 0 }}>
          <Roster roster={roster} onSwap={swapRoster} {...rosterItemProps} />
          {memberColumn}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 16px', visibility: pendingBattle ? 'hidden' : 'visible' }}>
          <div style={{ marginBottom: '10px' }}>
            <Roster roster={roster} horizontal onSwap={swapRoster} {...rosterItemProps} />
          </div>
          {memberColumn}
        </div>
      )}

      {pendingBattle && (
        // zIndex 160: must clear FloatingNav's 150. BattleCard's own root is a
        // positioned zIndex:100 element, which creates a fresh stacking context —
        // its DefeatScreen/VictoryScreen children (zIndex 120) are confined
        // inside that context and can never escape it to outrank a root-level
        // sibling like FloatingNav, no matter how high their own z-index goes.
        // Raising this outer wrapper is what actually lifts the whole subtree.
        <div style={{ position: 'fixed', inset: 0, zIndex: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BattleCard
            node={pendingBattle.node}
            enemyTeam={pendingBattle.enemyTeam}
            trainerSprite={pendingBattle.trainerSprite}
            playerRoster={roster}
            character={character}
            damageMultiplier={getRegionBalance(region?.name)}
            onBattleEnd={handleBattleEnd}
            onDefeat={() => onRunEnd?.('loss')}
            onRestart={onRestart}
            onMainMenu={onBack}
            seedCode={seedCode}
          />
        </div>
      )}

      {evo.render()}

      {won && evo.evolutionNotices.length === 0 && evo.evolutionChoices.length === 0 && (
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

      {/* Item-move banner — shown after a held item is clicked, until a target
          Pokémon is picked (or the move is cancelled). */}
      {isMovingItem && (
        <div style={{
          position: 'fixed', top: '48px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 90, display: 'flex', alignItems: 'center', gap: '10px',
          backgroundColor: 'rgba(0,0,0,0.82)', border: '2px solid #facc15',
          padding: '8px 14px',
        }}>
          <img src={itemIconUrl(movingItem.item)} alt="" style={{ width: '22px', height: '22px', imageRendering: 'pixelated' }} />
          <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: '#fff' }}>
            Choose a Pokémon for {movingItem.item.name}
          </span>
          <button
            onClick={() => setMovingItem(null)}
            style={{ fontFamily: 'Upheaval', fontSize: '10px', color: '#1a1a1a', backgroundColor: '#facc15', border: 'none', padding: '4px 10px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}
    </Layout>
  )
}
