import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { muted, cash } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import Layout from './Layout'
import Roster from './Roster'
import BadgeList from './BadgeList'
import ItemInfoCard from './ItemInfoCard'
import BattleCard from './BattleCard'
import { NODE_TYPES } from '../game/nodeMap.js'
import { getRegionConfig } from '../game/regionRegistry.js'
import { fetchPokemonBase, buildPokemonInstance, cachedName } from '../game/pokemon.js'
import { BALANCE } from '../game/balance.js'
import { useEvolutionFlow } from '../lib/useEvolutionFlow.jsx'
import { getRegionBalance } from '../lib/regionBalance'
import { swapInRoster } from '../game/roster.js'
import { itemIconUrl, isRosterConsumable } from '../game/items.js'
import { TYPE_COLORS } from '../game/types.js'

// Elite Four stage — a linear gauntlet after the 8th gym: four members then
// the Champion, fought in order. Beating the Champion wins the run.
// TODO: no dedicated Pokémon League background asset exists yet — the stage
// uses a plain themed panel until one is authored.
export default function EliteFour({ region, character, starter, roster, setRoster, bag = [], onMoveItem, onApplyConsumable, speedCash = 0, cashEarned = 0, onEarnCash, onBack, onRestart, onMapCleared, onRunEnd, onSpeciesSeen, onSpeciesOwned, pokedexOpen, setPokedexOpen, seedCode }) {
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
  const mutedColor = muted(dark)

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
      onEarnCash?.(BALANCE.economy.payouts.eliteFour)
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

  // Held-item moving. The bag bar, the touch-drag flow, and the item-info popup
  // below are ported from NodeMap so the two screens behave identically — the
  // Elite Four is still a place where you re-equip between fights, and the
  // player should not have to learn a second set of gestures for it.
  const [movingItem, setMovingItem] = useState(null)
  const [infoItem, setInfoItem] = useState(null)
  const isMovingItem = !!movingItem

  // Short message when an action does nothing (e.g. Max Heal at full HP).
  // Without it a kept item reads as a broken tap.
  const [notice, setNotice] = useState(null)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2200)
    return () => clearTimeout(t)
  }, [notice])

  // Drop an item onto roster slot `pokeIndex`. Consumables are USED (and spent
  // only if they did something); everything else is equipped.
  //
  // Both drop paths route through here — the click path via resolveItemMove and
  // the touch path via bagTouchEnd. Keeping the decision in one function is what
  // stops them drifting, exactly as in NodeMap.
  async function applyConsumableTo(item, from, pokeIndex) {
    if (isRosterConsumable(item)) {
      const used = onApplyConsumable?.(item, pokeIndex)
      if (used) onMoveItem?.({ item, from, to: { kind: 'consumed' } })
      else {
        const target = roster[pokeIndex]
        setNotice(
          item.consumable === 'heal' && target?.fainted
            ? `${target.name} has fainted — use a revive`
            : `${item.name} would do nothing here`
        )
      }
      return
    }
    // Evolve Stone: evolve + consume rather than equip (kept if the target has
    // no evolution at all, so it isn't wasted).
    if (item?.consumable === 'evolve') {
      const used = await evo.evolveWithStone(pokeIndex)
      if (used) onMoveItem?.({ item, from, to: { kind: 'consumed' } })
      return
    }
    // Rare Candy: levels the target and may evolve it. Kept only at MAX_LEVEL.
    if (item?.consumable === 'level') {
      const used = await evo.useRareCandy(pokeIndex)
      if (used) onMoveItem?.({ item, from, to: { kind: 'consumed' } })
      else setNotice(`${roster[pokeIndex]?.name ?? 'That Pokémon'} is already max level`)
      return
    }
    onMoveItem?.({ item, from, to: { kind: 'pokemon', pokeIndex } })
  }

  async function resolveItemMove(to) {
    if (!movingItem) return
    const { item, from } = movingItem
    setMovingItem(null)
    if (to.kind === 'pokemon') {
      await applyConsumableTo(item, from, to.pokeIndex)
      return
    }
    onMoveItem?.({ item, from, to })
  }

  // Touch drag-and-drop for bag items (HTML5 draggable doesn't fire on touch).
  // A tap opens the info popup; movement past the threshold promotes to a drag,
  // and on release the roster slot under the finger (data-slot-index) receives
  // the item.
  const bagTouch = useRef(null) // { item, from, startX, startY, dragging }
  const [dragGhost, setDragGhost] = useState(null) // { x, y, item } | null
  const DRAG_THRESHOLD = 8

  function slotIndexAt(x, y) {
    const el = document.elementFromPoint(x, y)
    const slotEl = el?.closest('[data-slot-index]')
    return slotEl ? parseInt(slotEl.dataset.slotIndex, 10) : null
  }

  function bagTouchStart(item, from) {
    return (e) => {
      const t = e.touches[0]
      bagTouch.current = { item, from, startX: t.clientX, startY: t.clientY, dragging: false }
    }
  }
  function bagTouchMove(e) {
    const st = bagTouch.current
    if (!st) return
    const t = e.touches[0]
    if (!st.dragging) {
      if (Math.hypot(t.clientX - st.startX, t.clientY - st.startY) < DRAG_THRESHOLD) return
      st.dragging = true
      setMovingItem({ item: st.item, from: st.from })
    }
    e.preventDefault() // stop the page scrolling while dragging
    setDragGhost({ x: t.clientX, y: t.clientY, item: st.item })
  }
  function bagTouchEnd(e) {
    const st = bagTouch.current
    bagTouch.current = null
    setDragGhost(null)
    if (!st?.dragging) return // a plain tap — let onClick open the info popup
    const t = e.changedTouches[0]
    const idx = slotIndexAt(t.clientX, t.clientY)
    if (idx != null) applyConsumableTo(st.item, st.from, idx)
    setMovingItem(null)
  }
  const bagTouchProps = (item, from) => ({
    onTouchStart: bagTouchStart(item, from),
    onTouchMove: bagTouchMove,
    onTouchEnd: bagTouchEnd,
  })

  const rosterItemProps = {
    itemTargeting: isMovingItem,
    onPickTarget: pokeIndex => resolveItemMove({ kind: 'pokemon', pokeIndex }),
    onStartHeldItemDrag: (pokeIndex, item) => setMovingItem(item ? { item, from: { kind: 'pokemon', pokeIndex } } : null),
  }

  return (
    <Layout onHome={onBack} onRestart={onRestart} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen}>
      {/* Speed Cash — DESKTOP ONLY, as a floating readout. Mobile now carries
          the balance at the right end of the bag bar, exactly as the maps do,
          so the pill would state it twice. Sits opposite the mobile
          FloatingNav (top-left, zIndex 150); zIndex 50 keeps it under the
          battle overlay (100) so a fight covers it. */}
      {isDesktop && (
        <div style={{
          position: 'fixed', top: '8px', right: '8px', zIndex: 50,
          display: 'flex', alignItems: 'center', gap: '4px',
          backgroundColor: 'rgba(0,0,0,0.55)', padding: '4px 8px',
          pointerEvents: 'none',
        }}>
          {/* cash(true) unconditionally — this pill's backdrop is a fixed
              rgba(0,0,0,0.55) in both themes. See NodeMap's matching HUD. */}
          <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: cash(true) }}>
            ${speedCash}
          </span>
        </div>
      )}
      {isDesktop ? (
        <div className="flex w-full py-4" style={{ alignItems: 'flex-start', justifyContent: 'center', gap: '16px', visibility: pendingBattle ? 'hidden' : 'visible', overflowY: 'auto', minHeight: 0 }}>
          <Roster roster={roster} onSwap={swapRoster} {...rosterItemProps} />
          {memberColumn}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 8px 16px', visibility: pendingBattle ? 'hidden' : 'visible' }}>
          {/* Roster / Bag / badges — the same three stacked full-width bars, in
              the same order and with the same 6px rhythm, as NodeMap's mobile
              bottom stack. The gauntlet is still a place you re-equip between
              fights, so it should not ask the player to relearn the controls.
              The only difference is position: the maps pin these under the map
              art, and here they lead the screen because the member list below
              scrolls. */}
          {/* marginLeft clears the FloatingNav — a fixed ~48px column pinned to
              the top-left (zIndex 170). NodeMap's bars never need it because
              they sit at the BOTTOM of the map, below the pill; these lead the
              screen and would otherwise run underneath it. It's on the bars
              alone, not the whole column, so the member list below stays
              centred on the screen rather than shunted right. */}
          <div style={{ width: 'calc(100% - 48px)', maxWidth: '420px', marginLeft: '48px', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
            <Roster roster={roster} horizontal fullWidth onSwap={swapRoster} {...rosterItemProps} />
            {/* Bag — drag an item onto a Pokémon to equip, or tap to open its
                card. Drop here to stow it back. */}
            <div
              onClick={() => { if (isMovingItem) resolveItemMove({ kind: 'bag' }) }}
              onDragOver={e => { if (isMovingItem) e.preventDefault() }}
              onDrop={e => { if (isMovingItem) { e.preventDefault(); resolveItemMove({ kind: 'bag' }) } }}
              style={{
                flexShrink: 0,
                border: isMovingItem ? '2px solid #facc15' : borderStyle,
                boxShadow: isMovingItem ? '0 0 8px 2px rgba(250,204,21,0.5)' : (dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e'),
                backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
                display: 'flex', flexDirection: 'row', alignItems: 'center',
                padding: '4px 8px', gap: '6px', overflowX: 'auto',
                cursor: isMovingItem ? 'pointer' : 'default',
              }}
            >
              <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: '#1a1a1a', backgroundColor: '#facc15', padding: '2px 6px', flexShrink: 0 }}>BAG</span>
              {bag && bag.length > 0 ? bag.map((item, i) => {
                const picked = movingItem?.from?.kind === 'bag' && movingItem.from.index === i
                return (
                  <img
                    key={i}
                    src={itemIconUrl(item)}
                    alt={item.name}
                    title={item.name}
                    draggable
                    onDragStart={() => setMovingItem({ item, from: { kind: 'bag', index: i } })}
                    onDragEnd={() => setMovingItem(null)}
                    onClick={e => { e.stopPropagation(); setInfoItem({ item, from: { kind: 'bag', index: i } }) }}
                    {...bagTouchProps(item, { kind: 'bag', index: i })}
                    style={{
                      width: '22px', height: '22px', imageRendering: 'pixelated', flexShrink: 0, cursor: 'grab',
                      outline: picked ? '2px solid #facc15' : 'none', opacity: picked ? 0.6 : 1,
                      // Override the global `img { pointer-events: none }` so this
                      // bag item receives taps + touch-drag.
                      touchAction: 'none', pointerEvents: 'auto',
                    }}
                  />
                )
              }) : (
                <span style={{ fontFamily: 'Upheaval', fontSize: '8px', color: dark ? '#555' : '#aaa' }}>— empty —</span>
              )}
              {/* Speed Cash rides the right end of the bag bar, as on the maps.
                  `position: sticky` keeps it visible when a full bag scrolls. */}
              <span style={{
                marginLeft: 'auto', flexShrink: 0,
                position: 'sticky', right: 0,
                paddingLeft: '8px',
                backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
                fontFamily: 'Upheaval', fontSize: '12px', color: cash(dark),
              }}>
                ${speedCash}
              </span>
            </div>
            {/* Gym badges. Reaching the gauntlet means every gym is cleared, so
                all of them show earned — `config.badges.length`, where the maps
                pass the running `mapIndex`. */}
            <BadgeList badges={config?.badges ?? []} earned={(config?.badges ?? []).length} layout="horizontal" />
          </div>
          {memberColumn}
        </div>
      )}

      {pendingBattle && (
        // zIndex 160 clears the map and its node overlays. It does NOT clear
        // FloatingNav (170) — the mobile nav deliberately floats over battle so
        // Home and Settings stay reachable mid-fight.
        //
        // This wrapper exists because BattleCard's own root is a positioned
        // zIndex:100 element, which creates a fresh stacking context: its
        // DefeatScreen/VictoryScreen children (zIndex 120) are confined inside
        // that context and can never outrank a root-level sibling on their own.
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
            cashEarned={cashEarned}
            speedCash={speedCash}
            // Reaching the gauntlet means every gym is cleared, so all badges
            // show earned — there is no mapIndex here to count from.
            badges={config?.badges ?? []}
            badgesEarned={config?.badges?.length ?? 0}
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

      {/* Finger-following icon while touch-dragging a bag item. */}
      {dragGhost && (
        <img
          src={itemIconUrl(dragGhost.item)}
          alt=""
          style={{
            position: 'fixed', left: dragGhost.x, top: dragGhost.y,
            transform: 'translate(-50%, -50%)',
            width: '34px', height: '34px', imageRendering: 'pixelated',
            pointerEvents: 'none', zIndex: 300,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
          }}
        />
      )}

      {/* No-op notice — an item that couldn't be used is KEPT, and this says
          why. Same placement as the targeting banner below. */}
      {notice && (
        <div style={{
          position: 'fixed', top: '48px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 95, backgroundColor: 'rgba(0,0,0,0.85)', border: '2px solid #ef4444',
          padding: '8px 14px', pointerEvents: 'none', maxWidth: '90vw',
        }}>
          <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: '#fff' }}>
            {notice}
          </span>
        </div>
      )}

      {/* Item-move banner — shown after a held item is clicked, until a target
          is picked (or the move is cancelled). The Bag is a target here now, so
          the copy names it, matching NodeMap's wording exactly. */}
      {isMovingItem && (
        <div style={{
          position: 'fixed', top: '48px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 90, display: 'flex', alignItems: 'center', gap: '10px',
          backgroundColor: 'rgba(0,0,0,0.82)', border: '2px solid #facc15',
          padding: '8px 14px',
        }}>
          <img src={itemIconUrl(movingItem.item)} alt="" style={{ width: '22px', height: '22px', imageRendering: 'pixelated' }} />
          <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: '#fff' }}>
            Choose a Pokémon or the Bag for {movingItem.item.name}
          </span>
          <button
            onClick={() => setMovingItem(null)}
            style={{ fontFamily: 'Upheaval', fontSize: '10px', color: '#1a1a1a', backgroundColor: '#facc15', border: 'none', padding: '4px 10px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Item info popup — opened by tapping a bag item or a Pokémon's held
          item. Equip enters the move-targeting flow from that same source. */}
      {infoItem && (
        <ItemInfoCard
          item={infoItem.item}
          onEquip={() => {
            setMovingItem({ item: infoItem.item, from: infoItem.from })
            setInfoItem(null)
          }}
          onClose={() => setInfoItem(null)}
        />
      )}
    </Layout>
  )
}
