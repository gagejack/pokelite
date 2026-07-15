import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useSettings } from '../lib/settings'
import { AnimatedHpBar, hpColor } from '../lib/AnimatedHpBar'
import { simulateBattle } from '../game/battle.js'
import { NODE_TYPES } from '../game/nodeMap.js'
import { itemIconUrl } from '../game/items.js'
import MoveAnimation from './MoveAnimation.jsx'
import battleGrass from '../assets/battleGrass.png'
import DayBattleBackground from '../assets/DayBattleBackground.png'
import { TYPE_COLORS } from '../game/types.js'

const PROJECTILE_MS = 400
const PAUSE_AFTER_HIT = 350
const PROJECTILE_DURATION = PROJECTILE_MS / 1000
// When a Pokémon faints, let its HP bar visibly drain to 0 before swapping in
// the next Pokémon. Matches the AnimatedHpBar 0.6s width transition.
const FAINT_DRAIN_MS = 650

// Natural (unscaled) size of the mobile battle card. The card is rendered at
// this fixed size then transform-scaled to fit the viewport below the navbar.
const MOBILE_CARD_W = 380
const MOBILE_CARD_H = 640

export default function BattleCard({ node, enemyTeam, trainerSprite, playerRoster, character, damageMultiplier = 2, onBattleEnd, onDefeat, onRestart }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const { battleSpeed, autoClose } = useSettings()
  const isBoss = node.type === NODE_TYPES.BOSS
  const isMasterBall = node.type === NODE_TYPES.MASTER_BALL
  const levelsGained = node.type === NODE_TYPES.GRASS ? 1 : 2

  const borderStyle = dark ? '2px solid #333333' : '2px solid #666666'
  const shadowStyle = dark ? '-6px 8px 0 0 #121212' : '-6px 8px 0 0 #666666'
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = dark ? '#888' : '#777'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'

  // Prep-screen intro line. Legendaries are wild, so they announce the species
  // ("A wild Kyurem appeared!") rather than a trainer name.
  const legendaryName = enemyTeam[0]?.name
    ? enemyTeam[0].name.charAt(0).toUpperCase() + enemyTeam[0].name.slice(1)
    : 'Legendary'
  const prepLabel = isMasterBall
    ? `A wild ${legendaryName} appeared!`
    : `${node.trainer} wants to battle!`

  const [phase, setPhase] = useState(isBoss || isMasterBall ? 'prep' : 'battle')
  // Local copy of the roster so the prep screen can drag-reorder it before
  // Fight. Regular battles skip prep, so there it stays identical to the prop.
  const [battleRoster, setBattleRoster] = useState(playerRoster)
  const [logIndex, setLogIndex] = useState(-1)
  const [battleResult, setBattleResult] = useState(null)
  const [projectile, setProjectile] = useState(null)
  const [attackingSide, setAttackingSide] = useState(null)
  const [hurtSide, setHurtSide] = useState(null)
  const [flashText, setFlashText] = useState(null)
  const [activeAnimation, setActiveAnimation] = useState(null) // { moveName, defenderSide }
  const [celebrate, setCelebrate] = useState(false) // victory: heal + level popup on player roster
  const [itemFx, setItemFx] = useState(null) // { side, label, color } — held-item heal/recoil popup

  const [playerHp, setPlayerHp] = useState(() => battleRoster.map(p => p.stats.hp))
  const [enemyHp, setEnemyHp] = useState(() => enemyTeam.map(p => p.stats.hp))
  const [playerFainted, setPlayerFainted] = useState(() => battleRoster.map(p => !!p.fainted))
  const [enemyFainted, setEnemyFainted] = useState(() => enemyTeam.map(p => !!p.fainted))
  // Start the active pointer on the first living Pokémon, not slot 0 — the
  // roster can carry Pokémon that fainted in a previous battle. The sim
  // (simulateBattle) starts on the first non-fainted index, so the display must
  // match, otherwise a fainted lead shows on-screen while a different slot's HP
  // actually changes.
  const firstAlive = arr => { const i = arr.findIndex(p => !p.fainted); return i === -1 ? 0 : i }
  const [activePlayer, setActivePlayer] = useState(() => firstAlive(battleRoster))

  // Prep-screen reorder: swap the roster and its parallel battle-state arrays
  // together so HP bars stay aligned with the Pokémon they belong to.
  function swapRosterSlots(a, b) {
    const swap = arr => { const n = [...arr]; [n[a], n[b]] = [n[b], n[a]]; return n }
    setBattleRoster(swap)
    setPlayerHp(swap)
    setPlayerFainted(swap)
  }

  // The playerHp/playerFainted/activePlayer initializers captured the
  // mount-time order, so re-seed them from the (possibly reordered) roster
  // before the sim runs.
  function startBattle() {
    setPlayerHp(battleRoster.map(p => p.stats.hp))
    setPlayerFainted(battleRoster.map(p => !!p.fainted))
    setActivePlayer(firstAlive(battleRoster))
    setPhase('battle')
  }
  const [activeEnemy, setActiveEnemy] = useState(() => firstAlive(enemyTeam))

  const timerRef = useRef(null)
  const battleLogRef = useRef(null)
  const autoCloseFiredRef = useRef(false)
  const defeatFiredRef = useRef(false)

  // Mobile: refs to the active Pokémon sprites + arena container, used to
  // anchor the projectile and move animation to the actual on-screen sprites.
  const arenaRef = useRef(null)
  const playerActiveRef = useRef(null)
  const enemyActiveRef = useRef(null)
  const [mobileFx, setMobileFx] = useState(null) // { orbFrom, orbTo, animAt } in arena-local px

  // Mobile: proportionally scale the fixed-size card so it fits entirely in the
  // area below the navbar and above the bottom (like the node-map scaling).
  const [fitScale, setFitScale] = useState(1)
  const [navH, setNavH] = useState(0)
  useEffect(() => {
    if (isDesktop) return
    const compute = () => {
      const h = document.querySelector('[data-navbar]')?.getBoundingClientRect().height ?? 0
      const pad = 12 // breathing room around the card
      const availW = window.innerWidth - pad * 2
      const availH = window.innerHeight - h - pad * 2
      const s = Math.min(availW / MOBILE_CARD_W, availH / MOBILE_CARD_H, 1)
      setNavH(h)
      setFitScale(s > 0 ? s : 1)
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [isDesktop])

  useEffect(() => {
    if (phase !== 'battle') return
    const result = simulateBattle(battleRoster, enemyTeam, damageMultiplier)
    battleLogRef.current = result
    setLogIndex(0)
  }, [phase])

  // Apply an HP value to a specific roster slot by side + index.
  const setSlotHp = (side, index, hp) => {
    if (side === 'player') setPlayerHp(prev => { const n = [...prev]; n[index] = hp; return n })
    else setEnemyHp(prev => { const n = [...prev]; n[index] = hp; return n })
  }

  useEffect(() => {
    if (logIndex < 0 || !battleLogRef.current) return
    const { log } = battleLogRef.current

    if (logIndex >= log.length) {
      setBattleResult(battleLogRef.current.playerWon ? 'win' : 'loss')
      return
    }

    const entry = log[logIndex]

    // Leftovers (and other non-attack passive entries): tick HP, show a green
    // popup, no projectile.
    if (entry.type === 'leftovers') {
      entry.heals.forEach(h => setSlotHp(h.side, h.index, h.hpAfter))
      const first = entry.heals[0]
      setItemFx({ side: first.side, label: first.label, color: '#4ade80' })
      timerRef.current = setTimeout(() => {
        setItemFx(null)
        setLogIndex(i => i + 1)
      }, PAUSE_AFTER_HIT / battleSpeed)
      return () => clearTimeout(timerRef.current)
    }

    setProjectile({ fromSide: entry.side, type: entry.moveType })
    setAttackingSide(entry.side)

    // Measure the active sprites so the orb travels attacker → defender and the
    // animation lands on the defender (mobile only; refs are null on desktop).
    const arena = arenaRef.current
    const attackerEl = entry.side === 'player' ? playerActiveRef.current : enemyActiveRef.current
    const defenderEl = entry.side === 'player' ? enemyActiveRef.current : playerActiveRef.current
    if (arena && attackerEl && defenderEl) {
      const a = arena.getBoundingClientRect()
      const centerOf = el => {
        const r = el.getBoundingClientRect()
        return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 }
      }
      const orbFrom = centerOf(attackerEl)
      const animAt = centerOf(defenderEl)
      setMobileFx({ orbFrom, orbTo: animAt, animAt })
    } else {
      setMobileFx(null)
    }

    timerRef.current = setTimeout(() => {
      setProjectile(null)
      setAttackingSide(null)
      const hurtSideNow = entry.side === 'player' ? 'enemy' : 'player'
      setHurtSide(hurtSideNow)
      setTimeout(() => setHurtSide(null), (PAUSE_AFTER_HIT - 50) / battleSpeed)

      const text = entry.crit ? 'Critical hit!'
        : entry.effectiveness > 1 ? 'Super effective!'
        : entry.effectiveness < 1 ? 'Not very effective...'
        : null
      if (text) {
        setFlashText({ side: hurtSideNow, text })
        setTimeout(() => setFlashText(null), (PAUSE_AFTER_HIT + 500) / battleSpeed)
      }

      // Show move animation on the defending side
      setActiveAnimation({ id: logIndex, moveName: entry.moveName, defenderSide: hurtSideNow })

      // Apply the defender HP change immediately so the bar starts draining.
      setSlotHp(entry.defenderSide, entry.defenderIndex, entry.defenderHpAfter)

      // Held-item events on the attacker (Shell Bell heal / Rocky Helmet recoil /
      // Focus Sash survive). Apply HP + show a popup near the affected side.
      const events = entry.events ?? []
      events.forEach(ev => {
        if (ev.kind === 'heal' || ev.kind === 'recoil') {
          setSlotHp(ev.side, ev.index, ev.hpAfter)
        }
        const color = ev.kind === 'recoil' ? '#ef4444' : ev.kind === 'focus' ? '#facc15' : '#4ade80'
        setItemFx({ side: ev.side, label: ev.label, color })
        setTimeout(() => setItemFx(null), (PAUSE_AFTER_HIT + 400) / battleSpeed)
      })

      const attackerFaintedNow = events.some(ev => ev.kind === 'recoil' && ev.fainted)

      if (entry.defenderFainted || attackerFaintedNow) {
        // Let the HP bar visibly drain, THEN flag fainted + swap in the next
        // Pokémon on whichever side(s) fainted, THEN advance the log.
        timerRef.current = setTimeout(() => {
          if (entry.defenderFainted) faintAndAdvance(entry.defenderSide, entry.defenderIndex)
          if (attackerFaintedNow) faintAndAdvance(entry.attackerSide, entry.attackerIndex)
          timerRef.current = setTimeout(() => setLogIndex(i => i + 1), PAUSE_AFTER_HIT / battleSpeed)
        }, FAINT_DRAIN_MS / battleSpeed)
      } else {
        timerRef.current = setTimeout(() => setLogIndex(i => i + 1), PAUSE_AFTER_HIT / battleSpeed)
      }
    }, PROJECTILE_MS / battleSpeed)

    return () => clearTimeout(timerRef.current)
  }, [logIndex])

  // Mark a slot fainted and advance that side's active pointer to the next living
  // Pokémon (mirrors the battle sim's nextAlive logic).
  function faintAndAdvance(side, index) {
    if (side === 'enemy') {
      setEnemyFainted(prev => { const n = [...prev]; n[index] = true; return n })
      setActiveEnemy(prev => {
        const fwd = enemyTeam.findIndex((_, i) => i > index && !enemyFainted[i])
        if (fwd !== -1) return fwd
        const any = enemyTeam.findIndex((_, i) => !enemyFainted[i] && i !== index)
        return any !== -1 ? any : prev
      })
    } else {
      setPlayerFainted(prev => { const n = [...prev]; n[index] = true; return n })
      setActivePlayer(prev => {
        const fwd = battleRoster.findIndex((_, i) => i > index && !playerFainted[i])
        if (fwd !== -1) return fwd
        const any = battleRoster.findIndex((_, i) => !playerFainted[i] && i !== index)
        return any !== -1 ? any : prev
      })
    }
  }

  function handleContinue() {
    const { playerWon, finalPlayerTeam } = battleLogRef.current
    onBattleEnd({ won: playerWon, finalPlayerTeam })
  }

  // On victory: play the celebration (sprite pop + level popup) and tick each
  // surviving player Pokémon's HP up 5% (mirrors the persisted heal in NodeMap).
  // Auto-close the battle when the setting is on.
  useEffect(() => {
    if (!battleResult) return
    if (battleResult === 'win') {
      setCelebrate(true)
      setPlayerHp(prev => prev.map((hp, i) =>
        playerFainted[i] ? hp
          : Math.min(battleRoster[i].stats.maxHp, hp + Math.round(battleRoster[i].stats.maxHp * 0.05))
      ))
    }
    // On a loss (all player Pokémon fainted), record the run end immediately —
    // not when the player later clicks "Play Again". Fire once.
    if (battleResult === 'loss' && !defeatFiredRef.current) {
      defeatFiredRef.current = true
      onDefeat?.()
    }
    // Auto-close only on a win — on a loss the player must see the result and
    // choose Play Again.
    if (battleResult === 'win' && autoClose && !autoCloseFiredRef.current) {
      autoCloseFiredRef.current = true
      const t = setTimeout(() => handleContinue(), 550 / battleSpeed)
      return () => clearTimeout(t)
    }
  }, [battleResult])

  const currentEntry = battleLogRef.current?.log[logIndex - 1] ?? null

  const BattleLog = ({ style = {} }) => (
    <div style={{
      borderTop: borderStyle,
      padding: '8px 10px',
      minHeight: '64px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: '4px',
      backgroundColor: cardBg,
      ...style,
    }}>
      {phase === 'prep' && (
        <>
          <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: textColor }}>
            {prepLabel}
          </span>
          <button
            onClick={startBattle}
            style={{
              fontFamily: 'Upheaval', fontSize: '11px', color: '#fff',
              border: borderStyle, backgroundColor: '#dc2626',
              padding: '6px', cursor: 'pointer', marginTop: '4px',
            }}
          >
            Fight!
          </button>
        </>
      )}
      {phase === 'battle' && !battleResult && currentEntry && (
        <>
          {currentEntry.defenderFainted && (
            <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: '#ef4444' }}>
              {currentEntry.defenderName} fainted!
            </span>
          )}
        </>
      )}
      {phase === 'battle' && !battleResult && !currentEntry && (
        <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: mutedColor }}>
          Battle starting...
        </span>
      )}
      {battleResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '20px', color: battleResult === 'win' ? '#22c55e' : '#ef4444' }}>
            {battleResult === 'win' ? 'Victory!' : 'Defeated...'}
          </span>
          {battleResult === 'loss' && onRestart ? (
            <button
              onClick={onRestart}
              style={{
                fontFamily: 'Upheaval', fontSize: '12px', color: '#1a1a1a',
                border: 'none', backgroundColor: '#facc15',
                padding: '6px 20px', cursor: 'pointer',
                boxShadow: '-2px 3px 0 0 #b89d0a',
              }}
            >
              Play Again
            </button>
          ) : (
            <button
              onClick={handleContinue}
              style={{
                fontFamily: 'Upheaval', fontSize: '12px', color: textColor,
                border: borderStyle, backgroundColor: innerBg,
                padding: '6px 20px', cursor: 'pointer',
              }}
            >
              Continue
            </button>
          )}
        </div>
      )}
    </div>
  )

  const playerColumnProps = {
    characterSprite: character?.sprite, characterName: character?.name,
    roster: battleRoster, hpArr: playerHp, faintedArr: playerFainted,
    activeIndex: activePlayer, hurtActive: hurtSide === 'player',
    phase, dark, textColor, mutedColor, mobile: !isDesktop,
    borderStyle, label: 'You',
    flashText: flashText?.side === 'player' ? flashText.text : null,
    activeSpriteRef: playerActiveRef,
    onSwap: swapRosterSlots,
  }
  const enemyColumnProps = {
    characterSprite: trainerSprite, characterName: node.trainer,
    roster: enemyTeam, hpArr: enemyHp, faintedArr: enemyFainted,
    activeIndex: activeEnemy, hurtActive: hurtSide === 'enemy',
    phase, dark, textColor, mutedColor, mobile: !isDesktop,
    borderStyle, label: node.trainer ?? 'Wild',
    flashText: flashText?.side === 'enemy' ? flashText.text : null,
    activeSpriteRef: enemyActiveRef,
  }

  // ── MOBILE layout ──
  if (!isDesktop) {
    return (
      <div onClick={e => e.stopPropagation()} style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // Reserve the navbar so the card centers in the area below it.
        paddingTop: `${navH}px`, boxSizing: 'border-box',
        backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 100,
      }}>
        <div style={{
          // Rendered at natural size, then proportionally scaled to fit the
          // area below the navbar and above the bottom — the whole card, sprites
          // and text included, shrinks together.
          width: `${MOBILE_CARD_W}px`, height: `${MOBILE_CARD_H}px`,
          transform: `scale(${fitScale})`, transformOrigin: 'center center',
          flexShrink: 0,
          border: borderStyle, boxShadow: shadowStyle, backgroundColor: cardBg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div ref={arenaRef} style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
            <div style={{ width: '50%', backgroundColor: innerBg, borderRight: borderStyle, display: 'flex', flexDirection: 'column' }}>
              <BattleColumn {...playerColumnProps} spriteSize={72} spriteH={100} />
            </div>
            <div style={{ width: '50%', backgroundColor: innerBg, borderLeft: borderStyle, display: 'flex', flexDirection: 'column' }}>
              <BattleColumn {...enemyColumnProps} spriteSize={72} spriteH={100} />
            </div>

            {/* Projectile orb — travels from the attacking sprite to the defending sprite */}
            <AnimatePresence>
              {projectile && mobileFx && (
                <motion.div
                  key="orb"
                  initial={{ left: mobileFx.orbFrom.x, top: mobileFx.orbFrom.y, opacity: 1, scale: 1 }}
                  animate={{ left: mobileFx.orbTo.x, top: mobileFx.orbTo.y, opacity: 0, scale: 0.4 }}
                  exit={{}}
                  transition={{ duration: PROJECTILE_DURATION / battleSpeed, ease: 'easeIn' }}
                  style={{
                    position: 'absolute',
                    width: '10px', height: '10px', borderRadius: '50%',
                    backgroundColor: TYPE_COLORS[projectile.type] ?? '#fff',
                    boxShadow: `0 0 6px 2px ${TYPE_COLORS[projectile.type] ?? '#fff'}`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 10, pointerEvents: 'none',
                  }}
                />
              )}
            </AnimatePresence>

            {/* Move animation — centered on the defending Pokémon's sprite */}
            {activeAnimation && mobileFx && (
              <div style={{
                position: 'absolute', zIndex: 6, pointerEvents: 'none',
                left: mobileFx.animAt.x, top: mobileFx.animAt.y,
                width: '120px', height: '120px',
                transform: 'translate(-50%, -50%)',
              }}>
                <MoveAnimation
                  key={`${activeAnimation.id}-${activeAnimation.moveName}-${activeAnimation.defenderSide}`}
                  moveName={activeAnimation.moveName}
                  battleSpeed={battleSpeed}
                  size={120}
                  onDone={() => setActiveAnimation(null)}
                />
              </div>
            )}

            {/* Held-item effect popup — over the player (left) or enemy (right) half */}
            <AnimatePresence>
              {itemFx && (
                <motion.span
                  key={`mfx-${itemFx.label}-${itemFx.color}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: -6 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  style={{
                    position: 'absolute', top: '40px', zIndex: 11, pointerEvents: 'none',
                    left: itemFx.side === 'player' ? '25%' : '75%', transform: 'translateX(-50%)',
                    whiteSpace: 'nowrap', fontFamily: 'Upheaval', fontSize: '13px',
                    color: itemFx.color, filter: `drop-shadow(0 0 4px ${itemFx.color})`,
                    textShadow: '1px 1px 0 #000',
                  }}
                >
                  {itemFx.label}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <BattleLog />
        </div>
      </div>
    )
  }

  // ── DESKTOP layout: cinematic 16:9 card ──
  return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', flexShrink: 0 }}>

      {/* Victory / Defeat text above the card */}
      {battleResult && (
        <span style={{
          fontFamily: 'Upheaval', fontSize: '32px',
          color: battleResult === 'win' ? '#22c55e' : '#ef4444',
          textShadow: '2px 2px 0 #000',
        }}>
          {battleResult === 'win' ? 'Victory!' : 'Defeated...'}
        </span>
      )}

      {/* 960×540 battle card */}
      <div style={{
        width: '960px', height: '540px',
        position: 'relative',
        border: borderStyle, boxShadow: shadowStyle,
        overflow: 'hidden', flexShrink: 0,
      }}>
        {/* Background */}
        <img
          src={DayBattleBackground} alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
        />

        {/* All content over background */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>

          {/* LEFT EDGE: player character card + roster panel.
              Rows are drag-reorderable during the prep phase. */}
          <RosterColumn
            side="left"
            trainerSprite={character?.sprite}
            trainerName={character?.name}
            roster={battleRoster}
            hpArr={playerHp}
            faintedArr={playerFainted}
            activeIndex={activePlayer}
            phase={phase}
            celebrate={celebrate}
            levelsGained={levelsGained}
            onSwap={swapRosterSlots}
          />

          {/* RIGHT EDGE: enemy trainer card + roster panel */}
          <RosterColumn
            side="right"
            trainerSprite={trainerSprite}
            trainerName={node.trainer}
            roster={enemyTeam}
            hpArr={enemyHp}
            faintedArr={enemyFainted}
            activeIndex={activeEnemy}
            phase={phase}
          />

          {/* TOP-RIGHT: enemy arena */}
          <div style={{
            position: 'absolute', top: '57%', right: '22%',
            transform: 'translateY(-100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{ position: 'relative', width: '265px', height: '185px' }}>
              <AnimatePresence>
                {flashText?.side === 'enemy' && (
                  <motion.span
                    key={flashText.text + 'e'}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ position: 'absolute', top: '-4px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontFamily: 'Orange Kid', fontSize: '11px', color: '#facc15', filter: 'drop-shadow(0 0 4px #facc15)', zIndex: 10, pointerEvents: 'none' }}
                  >
                    {flashText.text}
                  </motion.span>
                )}
              </AnimatePresence>
              <ItemFxPopup fx={itemFx} side="enemy" />
              <motion.div
                animate={hurtSide === 'enemy'
                  ? { scaleX: [1, 0.82, 1], scaleY: [1, 1.08, 1], x: '-50%' }
                  : { scaleX: 1, scaleY: 1, x: '-50%' }}
                initial={false}
                transition={{ duration: 0.25 / battleSpeed, ease: 'easeOut' }}
                style={{
                  width: '213px', height: '213px',
                  position: 'absolute', bottom: '-25px', left: '50%', transformOrigin: 'bottom center', zIndex: 2,
                }}
              >
                <img
                  src={enemyTeam[activeEnemy]?.sprite} alt={enemyTeam[activeEnemy]?.name}
                  style={{
                    width: '213px', height: '213px', imageRendering: 'pixelated', display: 'block',
                    filter: enemyFainted[activeEnemy] ? 'grayscale(1) opacity(0.3)' : 'none',
                    transition: 'filter 0.3s',
                  }}
                />
                {/* Red hit flash — red silhouette overlay of the same sprite */}
                <motion.img
                  src={enemyTeam[activeEnemy]?.sprite} alt=""
                  initial={false}
                  animate={{ opacity: hurtSide === 'enemy' ? [0, 0.55, 0] : 0 }}
                  transition={{ duration: 0.3 / battleSpeed, ease: 'easeOut' }}
                  style={{
                    width: '213px', height: '213px', imageRendering: 'pixelated',
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    filter: 'brightness(0) saturate(100%) invert(27%) sepia(96%) saturate(7000%) hue-rotate(0deg)',
                  }}
                />
              </motion.div>
              <img src={battleGrass} alt="" style={{ width: '265px', imageRendering: 'pixelated', position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 1 }} />
              {activeAnimation?.defenderSide === 'enemy' && (
                <MoveAnimation
                  key={`${activeAnimation.id}-${activeAnimation.moveName}-enemy`}
                  moveName={activeAnimation.moveName} battleSpeed={battleSpeed}
                  onDone={() => setActiveAnimation(null)}
                />
              )}
            </div>
            <DesktopInfoCard
              name={enemyTeam[activeEnemy]?.name} level={enemyTeam[activeEnemy]?.level}
              hp={enemyHp[activeEnemy]} maxHp={enemyTeam[activeEnemy]?.stats.maxHp}
              fainted={enemyFainted[activeEnemy]}
              resetKey={activeEnemy}
            />
          </div>

          {/* BOTTOM-LEFT: player arena */}
          <div style={{
            position: 'absolute', top: '43%', left: '22%',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <DesktopInfoCard
              name={battleRoster[activePlayer]?.name} level={battleRoster[activePlayer]?.level}
              hp={playerHp[activePlayer]} maxHp={battleRoster[activePlayer]?.stats.maxHp}
              fainted={playerFainted[activePlayer]}
              resetKey={activePlayer}
            />
            <div style={{ position: 'relative', width: '265px', height: '140px' }}>
              <AnimatePresence>
                {flashText?.side === 'player' && (
                  <motion.span
                    key={flashText.text + 'p'}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ position: 'absolute', top: '-4px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontFamily: 'Orange Kid', fontSize: '11px', color: '#facc15', filter: 'drop-shadow(0 0 4px #facc15)', zIndex: 10, pointerEvents: 'none' }}
                  >
                    {flashText.text}
                  </motion.span>
                )}
              </AnimatePresence>
              <ItemFxPopup fx={itemFx} side="player" />
              <motion.div
                animate={hurtSide === 'player'
                  ? { scaleX: [1, 0.82, 1], scaleY: [1, 1.08, 1], x: '-50%' }
                  : { scaleX: 1, scaleY: 1, x: '-50%' }}
                initial={false}
                transition={{ duration: 0.25 / battleSpeed, ease: 'easeOut' }}
                style={{
                  width: '213px', height: '213px',
                  position: 'absolute', bottom: '-35px', left: '50%', transformOrigin: 'bottom center', zIndex: 2,
                }}
              >
                <img
                  src={battleRoster[activePlayer]?.spriteBack ?? battleRoster[activePlayer]?.sprite}
                  alt={battleRoster[activePlayer]?.name}
                  style={{
                    width: '213px', height: '213px', imageRendering: 'pixelated', display: 'block',
                    filter: playerFainted[activePlayer] ? 'grayscale(1) opacity(0.3)' : 'none',
                    transition: 'filter 0.3s',
                  }}
                />
                {/* Red hit flash — red silhouette overlay of the same sprite */}
                <motion.img
                  src={battleRoster[activePlayer]?.spriteBack ?? battleRoster[activePlayer]?.sprite}
                  alt=""
                  initial={false}
                  animate={{ opacity: hurtSide === 'player' ? [0, 0.55, 0] : 0 }}
                  transition={{ duration: 0.3 / battleSpeed, ease: 'easeOut' }}
                  style={{
                    width: '213px', height: '213px', imageRendering: 'pixelated',
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    filter: 'brightness(0) saturate(100%) invert(27%) sepia(96%) saturate(7000%) hue-rotate(0deg)',
                  }}
                />
              </motion.div>
              <img src={battleGrass} alt="" style={{ width: '265px', imageRendering: 'pixelated', position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 1 }} />
              {activeAnimation?.defenderSide === 'player' && (
                <MoveAnimation
                  key={`${activeAnimation.id}-${activeAnimation.moveName}-player`}
                  moveName={activeAnimation.moveName} battleSpeed={battleSpeed}
                  onDone={() => setActiveAnimation(null)}
                />
              )}
            </div>
          </div>

          {/* Diagonal attack projectile */}
          <AnimatePresence>
            {projectile && (
              <motion.div
                key="orb"
                initial={projectile.fromSide === 'player'
                  ? { left: '15%', top: '75%', opacity: 1, scale: 1 }
                  : { left: '75%', top: '15%', opacity: 1, scale: 1 }
                }
                animate={projectile.fromSide === 'player'
                  ? { left: '75%', top: '15%', opacity: 0, scale: 0.4 }
                  : { left: '15%', top: '75%', opacity: 0, scale: 0.4 }
                }
                exit={{}}
                transition={{ duration: PROJECTILE_DURATION / battleSpeed, ease: 'easeIn' }}
                style={{
                  position: 'absolute',
                  width: '10px', height: '10px', borderRadius: '50%',
                  backgroundColor: TYPE_COLORS[projectile.type] ?? '#fff',
                  boxShadow: `0 0 8px 3px ${TYPE_COLORS[projectile.type] ?? '#fff'}`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10, pointerEvents: 'none',
                }}
              />
            )}
          </AnimatePresence>

          {/* Prep overlay — just the Fight button; the player's roster on the
              left edge is drag-reorderable during this phase. */}
          {phase === 'prep' && (
            <div style={{
              position: 'absolute', bottom: '5%', left: '50%', transform: 'translateX(-50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
            }}>
              <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: '#fff', textShadow: '1px 1px 0 #000' }}>
                {prepLabel}
              </span>
              <button
                onClick={startBattle}
                style={{
                  fontFamily: 'Upheaval', fontSize: '13px', color: '#fff',
                  border: '2px solid #fff', backgroundColor: '#dc2626',
                  padding: '6px 24px', cursor: 'pointer',
                }}
              >
                Fight!
              </button>
            </div>
          )}

          {/* Fainted notice */}
          {phase === 'battle' && !battleResult && currentEntry?.defenderFainted && (
            <div style={{
              position: 'absolute', bottom: '5%', left: '50%', transform: 'translateX(-50%)',
              backgroundColor: 'rgba(0,0,0,0.55)', padding: '6px 16px',
            }}>
              <span style={{ fontFamily: 'Upheaval', fontSize: '10px', color: '#ef4444' }}>
                {currentEntry.defenderName} fainted!
              </span>
            </div>
          )}

          {/* Continue / Play Again inside card at top */}
          {battleResult && (
            <div style={{
              position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)',
              zIndex: 20,
            }}>
              {battleResult === 'loss' && onRestart ? (
                <button
                  onClick={onRestart}
                  style={{
                    fontFamily: 'Upheaval', fontSize: '14px', color: '#1a1a1a',
                    border: 'none', backgroundColor: '#facc15',
                    padding: '8px 28px', cursor: 'pointer',
                    boxShadow: '-2px 3px 0 0 #b89d0a',
                  }}
                >
                  Play Again
                </button>
              ) : (
                <button
                  onClick={handleContinue}
                  style={{
                    fontFamily: 'Upheaval', fontSize: '14px', color: '#fff',
                    border: '2px solid #fff', backgroundColor: 'rgba(0,0,0,0.6)',
                    padding: '8px 28px', cursor: 'pointer',
                  }}
                >
                  Continue
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// Floating held-item effect popup (heal/recoil/survive) over an arena sprite.
function ItemFxPopup({ fx, side }) {
  return (
    <AnimatePresence>
      {fx?.side === side && (
        <motion.span
          key={`${fx.label}-${fx.color}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            position: 'absolute', top: '14px', left: '50%', transform: 'translateX(-50%)',
            whiteSpace: 'nowrap', fontFamily: 'Upheaval', fontSize: '13px',
            color: fx.color, filter: `drop-shadow(0 0 4px ${fx.color})`,
            textShadow: '1px 1px 0 #000', zIndex: 11, pointerEvents: 'none',
          }}
        >
          {fx.label}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

function TwoToneHpBar({ hp, maxHp, width = 140, resetKey }) {
  const [displayed, setDisplayed] = useState(hp)
  const prevHp = useRef(hp)
  const prevMaxHp = useRef(maxHp)
  const prevResetKey = useRef(resetKey)
  // When a different Pokémon is shown — detected by a changed resetKey (its id)
  // or a changed maxHp — snap instantly instead of animating up from the
  // previous Pokémon's HP.
  const snap = maxHp !== prevMaxHp.current || resetKey !== prevResetKey.current

  if (snap) {
    prevMaxHp.current = maxHp
    prevResetKey.current = resetKey
    prevHp.current = hp
    if (displayed !== hp) setDisplayed(hp)
  }

  useEffect(() => {
    if (hp === prevHp.current) return
    prevHp.current = hp
    let id1, id2
    id1 = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setDisplayed(hp)) })
    return () => { cancelAnimationFrame(id1); cancelAnimationFrame(id2) }
  }, [hp])

  const pct = Math.max(0, (displayed / maxHp) * 100)
  return (
    <div style={{ width, height: '10px', border: '1px solid #000', borderRadius: '1px', overflow: 'hidden', backgroundColor: '#1a1a1a' }}>
      <div style={{
        height: '100%', width: `${pct}%`,
        transition: snap ? 'none' : 'width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        background: 'linear-gradient(to bottom, #4ade80 50%, #16a34a 50%)',
      }} />
    </div>
  )
}

function DesktopInfoCard({ name, level, hp, maxHp, fainted, resetKey }) {
  return (
    <div style={{
      backgroundColor: '#d4d4d4',
      border: '1px solid #000',
      padding: '5px 8px 2px',
      width: '150px',
      display: 'flex', flexDirection: 'column', gap: '2px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
        <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#1a1a1a', textTransform: 'capitalize', fontWeight: 'bold', lineHeight: 1 }}>
          {name}
        </span>
        <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: '#444', lineHeight: 1 }}>
          Lv{level} 
        </span>
      </div>
      <TwoToneHpBar hp={hp} maxHp={maxHp} width={134} resetKey={resetKey} />
      <span style={{ fontFamily: 'Upheaval', fontSize: '15px', color: '#333', textAlign: 'center', lineHeight: 1 }}>
        {fainted ? 'FNT' : `${hp} / ${maxHp}`}
      </span>
    </div>
  )
}

// A single roster row: sprite + (name / level / HP) + held item.
// `mirrored` flips the row so sprites hug the right edge (enemy column).
function RosterRow({ pokemon, hp, fainted, active, mirrored, celebrate = false, levelsGained = 0 }) {
  const itemSlot = (
    <div style={{ width: '18px', height: '18px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {pokemon.heldItem && (
        <img
          src={itemIconUrl(pokemon.heldItem)}
          alt={pokemon.heldItem.name}
          title={pokemon.heldItem.name}
          style={{ width: '18px', height: '18px', imageRendering: 'pixelated' }}
        />
      )}
    </div>
  )

  return (
    <div style={{
      display: 'flex', flexDirection: mirrored ? 'row-reverse' : 'row',
      alignItems: 'center', gap: '6px',
      padding: '3px 5px',
      backgroundColor: active ? '#d8d8d8' : 'transparent',
      opacity: fainted ? 0.45 : 1,
    }}>
      {/* Sprite (outer edge) — pops + shows a level popup on victory */}
      <div style={{ position: 'relative', flexShrink: 0, width: '58px', height: '58px' }}>
        <motion.img
          src={pokemon.sprite}
          alt={pokemon.name}
          initial={false}
          animate={celebrate ? { scale: [1, 1.35, 1] } : { scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            width: '58px', height: '58px', imageRendering: 'pixelated', display: 'block',
            filter: fainted ? 'grayscale(1)' : 'none',
          }}
        />
        <AnimatePresence>
          {celebrate && (
            <motion.span
              key="lvlup"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: -10 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{
                position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                whiteSpace: 'nowrap', fontFamily: 'Upheaval', fontSize: '11px',
                color: '#facc15', filter: 'drop-shadow(0 0 4px #facc15)',
                textShadow: '1px 1px 0 #000', pointerEvents: 'none', zIndex: 10,
              }}
            >
              +{levelsGained} LVL
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {/* Name / level / HP */}
      <div style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px',
        alignItems: mirrored ? 'flex-end' : 'flex-start',
      }}>
        <span style={{ fontFamily: 'Orange Kid', fontSize: '16px', color: active ? '#1a1a1a' : '#fff', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', lineHeight: 1 }}>
          {pokemon.name}
        </span>
        <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: active ? '#444' : '#aaa', lineHeight: 1 }}>
          Lv {pokemon.level}
        </span>
        <TwoToneHpBar hp={hp} maxHp={pokemon.stats.maxHp} width={90} />
      </div>
      {/* Held item (inner edge) */}
      {itemSlot}
    </div>
  )
}

// A vertical edge column: trainer/character card on top, roster panel below.
function RosterColumn({ side, trainerSprite, trainerName, roster, hpArr, faintedArr, activeIndex, phase, celebrate = false, levelsGained = 0, onSwap }) {
  const mirrored = side === 'right'
  const cardSurface = '#212121'
  // The player's roster can be drag-reordered during the prep phase.
  const reorderable = !!onSwap && phase === 'prep'
  const [dragFrom, setDragFrom] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const touchFrom = useRef(null)

  const slotFromPoint = (clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY)?.closest('[data-battle-slot]')
    return el ? parseInt(el.dataset.battleSlot, 10) : null
  }
  const dragProps = i => reorderable ? {
    'data-battle-slot': i,
    draggable: true,
    onDragStart: () => setDragFrom(i),
    onDragEnter: () => setDragOver(i),
    onDragOver: e => e.preventDefault(),
    onDrop: () => { if (dragFrom !== null && dragFrom !== i) onSwap(dragFrom, i); setDragFrom(null); setDragOver(null) },
    onDragEnd: () => { setDragFrom(null); setDragOver(null) },
    onTouchStart: () => { touchFrom.current = i; setDragFrom(i) },
    onTouchMove: e => { e.preventDefault(); const t = e.touches[0]; setDragOver(slotFromPoint(t.clientX, t.clientY)) },
    onTouchEnd: e => {
      const t = e.changedTouches[0]; const to = slotFromPoint(t.clientX, t.clientY)
      if (touchFrom.current !== null && to !== null && touchFrom.current !== to) onSwap(touchFrom.current, to)
      touchFrom.current = null; setDragFrom(null); setDragOver(null)
    },
  } : {}

  return (
    <div style={{
      position: 'absolute', top: 0, bottom: 0,
      [side]: 0,
      width: '188px',
      display: 'flex', flexDirection: 'column',
      zIndex: 3,
    }}>
      {/* Trainer card */}
      <div style={{
        backgroundColor: cardSurface,
        borderBottom: '1px solid #000',
        [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid #000',
        height: '74px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {trainerSprite && (
          <img
            src={trainerSprite} alt={trainerName}
            style={{ height: '64px', width: 'auto', objectFit: 'contain', objectPosition: 'bottom', imageRendering: 'pixelated' }}
          />
        )}
      </div>
      {/* Roster panel — one bordered box, rows stacked */}
      <div style={{
        backgroundColor: cardSurface,
        [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid #000',
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: '4px',
        padding: '4px',
      }}>
        {roster.map((p, i) => (
          <div
            key={i}
            {...dragProps(i)}
            style={reorderable ? {
              cursor: 'grab',
              opacity: dragFrom === i ? 0.4 : 1,
              outline: dragOver === i && dragFrom !== i ? '2px dashed #facc15' : 'none',
              borderRadius: '2px',
            } : undefined}
          >
            <RosterRow
              pokemon={p}
              hp={hpArr[i]}
              fainted={faintedArr[i]}
              active={i === activeIndex && phase === 'battle'}
              mirrored={mirrored}
              celebrate={celebrate && !faintedArr[i]}
              levelsGained={levelsGained}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function BattleColumn({ characterSprite, characterName, roster, hpArr, faintedArr, activeIndex, hurtActive, phase, dark, textColor, mutedColor, mobile, borderStyle, label, spriteSize = 60, spriteH = 84, flashText, activeSpriteRef, onSwap }) {
  // The player's roster can be drag-reordered during the prep phase.
  const reorderable = !!onSwap && phase === 'prep'
  const [dragFrom, setDragFrom] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const touchFrom = useRef(null)

  const slotFromPoint = (clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY)?.closest('[data-battle-slot]')
    return el ? parseInt(el.dataset.battleSlot, 10) : null
  }
  const dragProps = i => reorderable ? {
    'data-battle-slot': i,
    draggable: true,
    onDragStart: () => setDragFrom(i),
    onDragEnter: () => setDragOver(i),
    onDragOver: e => e.preventDefault(),
    onDrop: () => { if (dragFrom !== null && dragFrom !== i) onSwap(dragFrom, i); setDragFrom(null); setDragOver(null) },
    onDragEnd: () => { setDragFrom(null); setDragOver(null) },
    onTouchStart: () => { touchFrom.current = i; setDragFrom(i) },
    onTouchMove: e => { e.preventDefault(); const t = e.touches[0]; setDragOver(slotFromPoint(t.clientX, t.clientY)) },
    onTouchEnd: e => {
      const t = e.changedTouches[0]; const to = slotFromPoint(t.clientX, t.clientY)
      if (touchFrom.current !== null && to !== null && touchFrom.current !== to) onSwap(touchFrom.current, to)
      touchFrom.current = null; setDragFrom(null); setDragOver(null)
    },
  } : {}

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        width: '100%', borderBottom: borderStyle, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '6px 4px 3px', gap: '2px',
      }}>
        {characterSprite
          ? <img src={characterSprite} alt={characterName} style={{ width: `${spriteSize}px`, height: `${spriteH}px`, objectFit: 'contain', objectPosition: 'bottom', imageRendering: 'pixelated' }} />
          : <div style={{ width: `${spriteSize}px`, height: `${spriteH}px` }} />
        }
        <span style={{ fontFamily: 'Upheaval', fontSize: '8px', color: mutedColor }}>{label}</span>
      </div>
      <div style={{ flex: 1, width: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', padding: '6px' }}>
        {roster.map((p, i) => (
          <div
            key={i}
            {...dragProps(i)}
            style={reorderable ? {
              cursor: 'grab',
              opacity: dragFrom === i ? 0.4 : 1,
              outline: dragOver === i && dragFrom !== i ? '2px dashed #facc15' : 'none',
              borderRadius: '2px',
            } : undefined}
          >
            <RosterSlot pokemon={p} hp={hpArr[i]} fainted={faintedArr[i]}
              active={i === activeIndex && phase === 'battle'}
              attacking={i === activeIndex && hurtActive}
              dark={dark} textColor={textColor} mutedColor={mutedColor} mobile={mobile}
              flashText={i === activeIndex ? flashText : null}
              spriteRef={i === activeIndex ? activeSpriteRef : null} />
          </div>
        ))}
      </div>
    </div>
  )
}

function RosterSlot({ pokemon, hp, fainted, active, attacking, dark, textColor, mutedColor, mobile, flashText, spriteRef }) {
  return (
    <motion.div
      animate={mobile && attacking
        ? { scaleX: 0.88, scaleY: 1.04, y: -2, zIndex: 10 }
        : { scaleX: 1, scaleY: 1, y: 0, zIndex: 1 }
      }
      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '2px', padding: '3px 2px',
        opacity: fainted ? 0.35 : 1,
        outline: active ? '1px solid #888888' : 'none',
        borderRadius: '1px',
        position: 'relative',
      }}
    >
      {/* Translucent red flash over the whole slot box when this active Pokémon
          is hit — same box the move animation lands on. */}
      {mobile && (
        <motion.div
          initial={false}
          animate={{ opacity: attacking ? [0, 0.4, 0] : 0 }}
          transition={{ duration: 0.45 }}
          style={{
            position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
            backgroundColor: '#ef4444', borderRadius: '1px',
          }}
        />
      )}
      <div style={{ position: 'relative' }}>
        <AnimatePresence>
          {flashText && (
            <motion.span key={flashText} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontFamily: 'Orange Kid', fontSize: '10px', color: '#facc15', filter: 'drop-shadow(0 0 3px #facc15)', zIndex: 10, pointerEvents: 'none' }}>
              {flashText}
            </motion.span>
          )}
        </AnimatePresence>
        <img ref={spriteRef} src={pokemon.sprite} alt={pokemon.name} style={{
          width: '44px', height: '44px', imageRendering: 'pixelated',
          filter: fainted ? 'grayscale(1)' : 'none',
        }} />
      </div>
      <span style={{
        fontFamily: 'Orange Kid', fontSize: '16px', color: textColor,
        textTransform: 'capitalize', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', textAlign: 'center',
      }}>
        {pokemon.name} <span style={{ color: '#facc15', fontSize: '12px', fontFamily: 'Orange Kid' }}>LV {pokemon.level}</span>
      </span>
      <AnimatedHpBar hp={hp} maxHp={pokemon.stats.maxHp} barWidth="80%" height="3px" />
      <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: mutedColor, textAlign: 'center' }}>
        {fainted ? 'FNT' : `${hp}/${pokemon.stats.maxHp}`}
      </span>
    </motion.div>
  )
}
