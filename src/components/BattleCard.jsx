import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../lib/theme'
import { muted, cash, accent } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useSettings } from '../lib/settings'
import { AnimatedHpBar, hpColor } from '../lib/AnimatedHpBar'
import { simulateBattle } from '../game/battle.js'
import { NODE_TYPES } from '../game/nodeMap.js'
import { BALANCE } from '../game/balance.js'
import { itemIconUrl } from '../game/items.js'
import { useBagTouchDrag } from '../lib/useBagTouchDrag.js'
import { nearestRectAt } from '../game/dragHit.js'
import MoveAnimation from './MoveAnimation.jsx'
import SeedCodeChip from './SeedCodeChip.jsx'
import { getBattleSkin } from './battleSkins/index.js'
import { playSound, playSoundUrl } from '../lib/sound.js'
import { getMoveSound } from '../game/moveSounds.js'
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
// 740, not 640: a full six-Pokémon roster needs it. Measured at 1x, the prep
// screen's content comes to 718px — 6 slots × 90 + 2px gaps + an 88px trainer
// header + the 80px prep bar — plus the column's 12px of padding. At 640 the
// sixth slot was clipped entirely on every phone size, so a full team could
// never be reviewed before committing to a battle, which is this screen's only
// job. The card is authored to fit its worst case and then scaled to the
// device, rather than authored to a size that happens to fit five.
const MOBILE_CARD_H = 740

// Natural (unscaled) size of the desktop battle card — a 16:9 stage. Like the
// mobile card it is authored at this fixed size and then transform-scaled to
// fill the window, so the pixel-positioned arenas, 213px sprites, and info
// plates keep their exact proportions at any window size. Reflowing to
// percentages instead would break the arena composition and soften the pixel
// art; scaling keeps it crisp.
const DESKTOP_CARD_W = 960
const DESKTOP_CARD_H = 540
// Breathing room left around the scaled card, per side.
const DESKTOP_CARD_GAP = 50

// 1px black outline for yellow "LV" text (8-direction text-shadow — crisper on
// pixel fonts than -webkit-text-stroke, which eats thin glyphs).
const LV_OUTLINE = '1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000'

export default function BattleCard({ node, enemyTeam, trainerSprite, playerRoster, character, damageMultiplier = 2, onBattleEnd, onDefeat, onRestart, onMainMenu, seedCode, cashEarned = 0, speedCash = 0, badges = [], badgesEarned = 0 }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const { battleSpeed, autoClose } = useSettings()
  const isBoss = node.type === NODE_TYPES.BOSS
  const isMasterBall = node.type === NODE_TYPES.MASTER_BALL
  const levelsGained = node.type === NODE_TYPES.GRASS ? BALANCE.progression.levelsGained.grass : BALANCE.progression.levelsGained.default

  const borderStyle = dark ? '2px solid #333333' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-6px 8px 0 0 #121212' : '-6px 8px 0 0 #2e2e2e'
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)
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
      // No upper clamp. The old `Math.min(…, 1)` pinned the card to its
      // authored size, so a 932px-tall phone rendered it at 640px and left
      // ~280px of dead space above and below while still clipping the sixth
      // roster slot. The card is one fixed layout scaled to the device — on a
      // large phone that means scaling UP, which is the whole point.
      const s = Math.min(availW / MOBILE_CARD_W, availH / MOBILE_CARD_H)
      setNavH(h)
      setFitScale(s > 0 ? s : 1)
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [isDesktop])

  // Desktop: scale the 960×540 stage to fill the window, leaving DESKTOP_CARD_GAP
  // per side. Whichever axis is tighter decides, so the card grows to the
  // window's height OR width and never crops.
  //
  // The win state stacks a "Victory!" heading and seed chip ABOVE the card, so
  // their measured height is subtracted too — otherwise the card sizes to the
  // full window and those siblings push it off the bottom edge.
  const desktopHeaderRef = useRef(null)
  const [desktopScale, setDesktopScale] = useState(1)
  useEffect(() => {
    if (!isDesktop) return
    const compute = () => {
      const headerH = desktopHeaderRef.current?.getBoundingClientRect().height ?? 0
      const availW = window.innerWidth - DESKTOP_CARD_GAP * 2
      const availH = window.innerHeight - DESKTOP_CARD_GAP * 2 - headerH
      const s = Math.min(availW / DESKTOP_CARD_W, availH / DESKTOP_CARD_H)
      setDesktopScale(s > 0 ? s : 1)
    }
    compute()
    // The victory heading mounts in the same commit that sets battleResult, so
    // a second pass on the next frame measures it once it has real layout.
    const raf = requestAnimationFrame(compute)
    window.addEventListener('resize', compute)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', compute) }
    // battleResult is a dependency because the victory heading appears with it,
    // changing the header height the card has to fit under.
  }, [isDesktop, battleResult])

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

    // Move SFX fires at LAUNCH, alongside the projectile and the attacker's
    // animation — not at impact. Quieter than the level-up cue (0.6): attacks
    // fire many times per battle, the level-up fires once and sits on top.
    const moveSfx = getMoveSound(entry.moveName)
    if (moveSfx) playSoundUrl(moveSfx, { volume: 0.45 })

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
      // One cue for the whole roster, fired with the same flag that reveals the
      // "+N LVL" popups — every surviving Pokémon levels at once, so a sound per
      // Pokémon would just be the same clip stacked six times.
      //
      // Desktop only, because the popups are: `celebrate` is handed to
      // RosterColumn, which the mobile layout does not render. Playing it there
      // would be a sound with nothing on screen to explain it.
      if (isDesktop) playSound('levelup')
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

  // The active battle readout. Skins are interchangeable — see
  // components/battleSkins/index.js for the shared prop contract.
  const InfoCard = getBattleSkin()

  // Party state for a skin's ball tray: which slot is out, which have fainted,
  // which are still waiting. Team order, so the tray reads left-to-right as the
  // order they'll be sent out in.
  const partyState = (team, faintedArr, activeIndex) =>
    team.map((_, i) =>
      faintedArr[i] ? 'fainted' : i === activeIndex ? 'active' : 'alive'
    )
  const playerParty = partyState(battleRoster, playerFainted, activePlayer)
  const enemyParty = partyState(enemyTeam, enemyFainted, activeEnemy)

  // Defeat overlay — the final team (2×3) + Play Again. Shown on both layouts
  // in place of an in-card button.
  const defeatOverlay = battleResult === 'loss' ? (
    <DefeatScreen roster={battleRoster} dark={dark} onRestart={onRestart} onMainMenu={onMainMenu} seedCode={seedCode} cashEarned={cashEarned} speedCash={speedCash} badges={badges} badgesEarned={badgesEarned} />
  ) : null

  // Victory overlay — centered "Victory!" + Continue popup. Skipped entirely
  // when auto mode is on (the auto-close effect continues automatically), so no
  // popup flashes before the battle closes.
  const victoryOverlay = (battleResult === 'win' && !autoClose) ? (
    <VictoryScreen dark={dark} onContinue={handleContinue} seedCode={seedCode} />
  ) : null

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
        {defeatOverlay}
        {victoryOverlay}
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
              <BattleColumn {...playerColumnProps} spriteSize={52} spriteH={60} />
            </div>
            <div style={{ width: '50%', backgroundColor: innerBg, borderLeft: borderStyle, display: 'flex', flexDirection: 'column' }}>
              <BattleColumn {...enemyColumnProps} spriteSize={52} spriteH={60} />
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
          {/* Slim bar only during prep (Fight! for boss/legendary battles).
              During battle + result there's no bottom bar, so the roster fills
              the whole card; the result is shown as a centered popup instead. */}
          {phase === 'prep' && (
            <div style={{
              borderTop: borderStyle, padding: '8px 10px', flexShrink: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              backgroundColor: cardBg,
            }}>
              <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: textColor }}>
                {prepLabel}
              </span>
              <button
                onClick={startBattle}
                style={{
                  fontFamily: 'Upheaval', fontSize: '14px', color: '#fff',
                  border: borderStyle, backgroundColor: '#dc2626',
                  padding: '6px 24px', cursor: 'pointer',
                }}
              >
                Fight!
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── DESKTOP layout: cinematic 16:9 card ──
  return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
      {defeatOverlay}

      {/* Victory text above the card (defeat now shows the DefeatScreen
          overlay). Measured, so the scaled card below can fit under it.
          Rendered only when there IS a heading — an always-present empty
          wrapper still draws the column's 10px gap, which pushed the card
          off-centre by that much during every ordinary battle. */}
      {battleResult === 'win' && (
        <div ref={desktopHeaderRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <span style={{
            fontFamily: 'Upheaval', fontSize: '32px',
            color: '#22c55e',
            textShadow: '2px 2px 0 #000',
          }}>
            Victory!
          </span>
          <SeedCodeChip code={seedCode} dark={dark} />
        </div>
      )}

      {/* The 960×540 stage, scaled to fill the window. The wrapper takes the
          card's SCALED footprint so the flex column lays out against the size
          the card actually occupies — a bare transform leaves the original
          960×540 in flow and the centering goes wrong. */}
      <div style={{
        width: `${DESKTOP_CARD_W * desktopScale}px`,
        height: `${DESKTOP_CARD_H * desktopScale}px`,
        flexShrink: 0,
      }}>
      <div style={{
        width: `${DESKTOP_CARD_W}px`, height: `${DESKTOP_CARD_H}px`,
        transform: `scale(${desktopScale})`, transformOrigin: 'top left',
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

          {/* Enemy readout — upper LEFT, diagonally opposite its own sprite.
              Each plate sits across the arena from the mon it describes, so the
              two readouts occupy opposing corners instead of stacking over
              their sprites. */}
          {/* 196px clears the 188px roster rail, so the plate sits on the arena
              rather than over the team column. */}
          <div style={{ position: 'absolute', top: '6%', left: '196px', zIndex: 4 }}>
            <InfoCard
              name={enemyTeam[activeEnemy]?.name} level={enemyTeam[activeEnemy]?.level}
              hp={enemyHp[activeEnemy]} maxHp={enemyTeam[activeEnemy]?.stats.maxHp}
              fainted={enemyFainted[activeEnemy]}
              resetKey={activeEnemy}
              side="enemy"
              party={enemyParty}
            />
          </div>

          {/* Player readout — lower RIGHT, opposite its own sprite. */}
          <div style={{ position: 'absolute', bottom: '7%', right: '196px', zIndex: 4 }}>
            <InfoCard
              name={battleRoster[activePlayer]?.name} level={battleRoster[activePlayer]?.level}
              hp={playerHp[activePlayer]} maxHp={battleRoster[activePlayer]?.stats.maxHp}
              fainted={playerFainted[activePlayer]}
              resetKey={activePlayer}
              side="player"
              party={playerParty}
            />
          </div>

          {/* TOP-RIGHT: enemy arena */}
          <div style={{
            // translateY(-100%) makes this `top` the block's BOTTOM edge, so a
            // smaller number sits the enemy higher up the field. Pushed up from
            // 57% to widen the gap between the two combatants.
            position: 'absolute', top: '50%', right: '22%',
            transform: 'translateY(-100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{ position: 'relative', width: '265px', height: '185px' }}>
              <AnimatePresence>
                {flashText?.side === 'enemy' && (
                  <motion.span
                    key={flashText.text + 'e'}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ position: 'absolute', top: '-4px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontFamily: 'Orange Kid', fontSize: '12px', color: '#facc15', filter: 'drop-shadow(0 0 4px #facc15)', zIndex: 10, pointerEvents: 'none' }}
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
              <LaunchOrb projectile={projectile} side="enemy" battleSpeed={battleSpeed} />
              {activeAnimation?.defenderSide === 'enemy' && (
                <MoveAnimation
                  key={`${activeAnimation.id}-${activeAnimation.moveName}-enemy`}
                  moveName={activeAnimation.moveName} battleSpeed={battleSpeed}
                  onDone={() => setActiveAnimation(null)}
                />
              )}
            </div>
          </div>

          {/* BOTTOM-LEFT: player arena */}
          <div style={{
            // Player's block is top-anchored, so a larger number drops it down
            // the field. The two moves together open up the middle ground.
            position: 'absolute', top: '52%', left: '22%',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{ position: 'relative', width: '265px', height: '140px' }}>
              <AnimatePresence>
                {flashText?.side === 'player' && (
                  <motion.span
                    key={flashText.text + 'p'}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ position: 'absolute', top: '-4px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontFamily: 'Orange Kid', fontSize: '12px', color: '#facc15', filter: 'drop-shadow(0 0 4px #facc15)', zIndex: 10, pointerEvents: 'none' }}
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
              <LaunchOrb projectile={projectile} side="player" battleSpeed={battleSpeed} />
              {activeAnimation?.defenderSide === 'player' && (
                <MoveAnimation
                  key={`${activeAnimation.id}-${activeAnimation.moveName}-player`}
                  moveName={activeAnimation.moveName} battleSpeed={battleSpeed}
                  onDone={() => setActiveAnimation(null)}
                />
              )}
            </div>
          </div>

          {/* Diagonal attack projectile.

              Endpoints are the two sprites' actual centres, not the corners of
              the card: each arena is 265px wide, inset 22% from its own edge of
              the 960px stage, which puts the player's centre near 35% and the
              enemy's near 65%. The old 15%/75% pair started the orb out beside
              the attacker rather than on it.

              The orb is rendered TWICE — once here above the sprites for the
              flight, and once inside the attacking arena (see `launchOrb`)
              underneath its sprite for the launch. A single element cannot do
              both: the sprite sits at zIndex 2 INSIDE the arena's own stacking
              context, so no z-index on a sibling of that arena can ever slot
              between the arena's grass and its sprite. This pair is what makes
              the orb appear to emerge from behind the attacker and then travel
              over the field. */}
          <AnimatePresence>
            {projectile && (
              <motion.div
                key="orb"
                initial={projectile.fromSide === 'player'
                  ? { left: '35%', top: '72%', opacity: 0, scale: 1 }
                  : { left: '65%', top: '28%', opacity: 0, scale: 1 }
                }
                animate={projectile.fromSide === 'player'
                  ? { left: '65%', top: '28%', opacity: [0, 1, 0], scale: 0.4 }
                  : { left: '35%', top: '72%', opacity: [0, 1, 0], scale: 0.4 }
                }
                exit={{}}
                transition={{ duration: PROJECTILE_DURATION / battleSpeed, ease: 'easeIn', times: [0, 0.22, 1] }}
                style={{
                  position: 'absolute',
                  width: '10px', height: '10px', borderRadius: '50%',
                  backgroundColor: TYPE_COLORS[projectile.type] ?? '#fff',
                  boxShadow: `0 0 8px 3px ${TYPE_COLORS[projectile.type] ?? '#fff'}`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 3, pointerEvents: 'none',
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
              <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: '#fff', textShadow: '1px 1px 0 #000' }}>
                {prepLabel}
              </span>
              <button
                onClick={startBattle}
                style={{
                  fontFamily: 'Upheaval', fontSize: '14px', color: '#fff',
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
              <span style={{ fontFamily: 'Upheaval', fontSize: '16px', color: '#ef4444' }}>
                {currentEntry.defenderName} fainted!
              </span>
            </div>
          )}

          {/* Continue inside card at top (win only — defeat shows the
              DefeatScreen overlay instead). */}
          {battleResult === 'win' && (
            <div style={{
              position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)',
              zIndex: 20,
            }}>
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
            </div>
          )}

        </div>
      </div>
      </div>
    </div>
  )
}

// Shown when the player is defeated: the final team as a 2×3 card grid, with a
// Play Again button below. Replaces the in-card "Play Again" button so the
// battle card itself keeps all its space for the roster.
function DefeatScreen({ roster, dark, onRestart, onMainMenu, seedCode, cashEarned = 0, speedCash = 0, badges = [], badgesEarned = 0 }) {
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const cellBg = dark ? '#1a1a1a' : '#c8c8c8'
  // Light theme keeps DARK grey strokes/shadows — the lighter #666 wash out
  // against the light card fills.
  const borderStyle = dark ? '2px solid #121212' : '2px solid #444444'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #444444'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)

  // A one-word read on the leftover balance — the only thing on this screen
  // the player can act on next run. Deliberately silent in the normal case:
  // it speaks only when the number is actually telling you something.
  // Thresholds are absolute, not a fraction of earnings: $400 unspent is a
  // wasted Max Heal whether you earned $500 or $2000.
  const verdict = speedCash >= 300 ? 'hoarded'
    : speedCash < 50 ? 'spent well'
    : null

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        backgroundColor: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px', boxSizing: 'border-box',
      }}
    >
      <div style={{
        backgroundColor: cardBg, border: borderStyle, boxShadow: shadowStyle,
        padding: '18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
        width: '100%', maxWidth: '440px', maxHeight: '90dvh', overflowY: 'auto',
      }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '28px', color: '#ef4444', textShadow: '2px 2px 0 #000' }}>
          Defeated...
        </span>
        <SeedCodeChip code={seedCode} dark={dark} />

        {/* Run ledger — how far you got, and what the money did.
            One band rather than three stacked lines: badges answer "how far",
            and the earned/unspent pair answers "how well" as a single reading.
            The divider between the two figures is doing the work — you read
            them as one sentence (earned this, still holding this), which is
            the only way the leftover number means anything. */}
        <div style={{
          width: '100%', border: borderStyle, backgroundColor: cellBg,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ backgroundColor: '#3f9d4f', padding: '3px 10px', display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#fff' }}>Run Ledger</span>
          </div>

          {/* Badge row. Same colorize/black-out rule as the map's BadgeList, so
              this reads as the same object the player watched fill up. */}
          {badges.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '6px', padding: '10px 10px 8px',
            }}>
              {badges.map((badge, i) => (
                <img
                  key={badge.name} src={badge.icon} alt={badge.name} title={badge.name}
                  style={{
                    flex: '1 1 0', minWidth: 0, maxWidth: '30px', height: 'auto', aspectRatio: '1',
                    objectFit: 'contain', imageRendering: 'pixelated',
                    filter: i < badgesEarned ? 'none' : 'brightness(0) opacity(0.45)',
                  }}
                />
              ))}
              <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor, flexShrink: 0, marginLeft: '4px' }}>
                {badgesEarned}/{badges.length}
              </span>
            </div>
          )}

          {/* Earned vs. unspent, split by a rule. Unspent is deliberately the
              quieter of the two — it is the consequence, not the achievement. */}
          <div style={{ display: 'flex', alignItems: 'stretch', borderTop: borderStyle }}>
            <div style={{ flex: 1, padding: '10px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '22px', color: cash(dark), lineHeight: 1 }}>
                ${cashEarned.toLocaleString()}
              </span>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor }}>earned</span>
            </div>
            <div style={{ width: '2px', backgroundColor: dark ? '#121212' : '#444444', flexShrink: 0 }} />
            <div style={{ flex: 1, padding: '10px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '22px', color: textColor, lineHeight: 1 }}>
                ${speedCash.toLocaleString()}
              </span>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor }}>unspent</span>
              {verdict && (
                <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor, fontStyle: 'italic' }}>
                  {verdict}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 2 columns × 3 rows of the final team. */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', width: '100%',
        }}>
          {roster.map((p, i) => (
            <div key={i} style={{
              backgroundColor: cellBg, border: borderStyle,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '3px', padding: '8px 4px',
            }}>
              <img src={p.sprite} alt={p.name} style={{
                width: '52px', height: '52px', imageRendering: 'pixelated',
              }} />
              <span style={{
                fontFamily: 'Orange Kid', fontSize: '17px', color: textColor,
                textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden',
                textOverflow: 'ellipsis', maxWidth: '100%', textAlign: 'center',
              }}>
                {/* No LV_OUTLINE here: the sprite is a sibling above, so this
                    line sits on the flat cellBg and the ring has nothing to
                    separate from — it only thickens the glyphs. The outline is
                    kept where the level DOES overlap a sprite (the two
                    name plates below). */}
                {p.name} <span style={{ color: accent(dark), fontSize: '13px' }}>LV {p.level}</span>
              </span>
              {/* Type chips below the name/level. */}
              <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {(p.types ?? []).map(t => (
                  <span key={t} style={{
                    fontFamily: 'Mona Sans, sans-serif', fontWeight: 400, fontSize: '7px', color: '#1a1a1a',
                    backgroundColor: TYPE_COLORS[t] ?? '#888',
                    border: '1px solid #000', boxShadow: '2px 2px 0 #000',
                    padding: '2px 5px', textTransform: 'capitalize',
                  }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {(onRestart || onMainMenu) && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {onRestart && (
              <button
                onClick={onRestart}
                style={{
                  fontFamily: 'Upheaval', fontSize: '16px', color: '#1a1a1a',
                  border: '2px solid #000', backgroundColor: '#facc15',
                  padding: '10px 40px', cursor: 'pointer',
                }}
              >
                Play Again
              </button>
            )}
            {onMainMenu && (
              <button
                onClick={onMainMenu}
                style={{
                  fontFamily: 'Upheaval', fontSize: '16px', color: textColor,
                  border: borderStyle, backgroundColor: cellBg,
                  padding: '10px 40px', cursor: 'pointer',
                }}
              >
                Main Menu
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Shown on a win — a centered "Victory!" + Continue popup over the dimmed
// battle card (mirrors DefeatScreen). When auto mode is on the battle
// auto-continues and this never appears.
function VictoryScreen({ dark, onContinue, seedCode }) {
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const borderStyle = dark ? '2px solid #121212' : '2px solid #444444'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #444444'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px', boxSizing: 'border-box',
      }}
    >
      <div style={{
        backgroundColor: cardBg, border: borderStyle, boxShadow: shadowStyle,
        padding: '16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
      }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: '#22c55e', textShadow: '2px 2px 0 #000' }}>
          Victory!
        </span>
        <SeedCodeChip code={seedCode} dark={dark} />
        <button
          onClick={onContinue}
          style={{
            fontFamily: 'Upheaval', fontSize: '13px', color: textColor,
            border: borderStyle, backgroundColor: innerBg,
            padding: '7px 28px', cursor: 'pointer',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}

// The launch half of the attack projectile: a short bloom at the attacker's
// own centre, rendered INSIDE that arena at zIndex 1 — above the grass, below
// the sprite (zIndex 2). The travelling orb in the stage above handles the
// flight; this is what makes the shot look like it comes out from behind the
// attacker instead of appearing on top of it.
function LaunchOrb({ projectile, side, battleSpeed }) {
  const active = projectile?.fromSide === side
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="launch"
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: [0.9, 0], scale: [0.6, 1.9] }}
          exit={{ opacity: 0 }}
          transition={{ duration: (PROJECTILE_MS * 0.5) / 1000 / battleSpeed, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: '50%', bottom: '55px',
            width: '22px', height: '22px', borderRadius: '50%',
            backgroundColor: TYPE_COLORS[projectile.type] ?? '#fff',
            boxShadow: `0 0 12px 5px ${TYPE_COLORS[projectile.type] ?? '#fff'}`,
            transform: 'translate(-50%, 50%)',
            zIndex: 1, pointerEvents: 'none',
          }}
        />
      )}
    </AnimatePresence>
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

function TwoToneHpBar({ hp, maxHp, width = 140, resetKey, height = 10 }) {
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
  // Two-tone fill derived from the same green/yellow/red band the number uses,
  // so the bar and the HP figure always agree. The top half is the lit face,
  // the bottom half the shaded one — the tone split is what keeps a 6px bar
  // readable at a glance instead of reading as a flat stripe.
  const tone = hpColor(displayed, maxHp)
  return (
    // #3a3a3a track, not near-black: on the dark info plate an empty bar has to
    // still read as an empty gauge rather than a hole punched in the card.
    <div style={{ width, height: `${height}px`, border: '1px solid #000', borderRadius: '1px', overflow: 'hidden', backgroundColor: '#3a3a3a' }}>
      <div style={{
        height: '100%', width: `${pct}%`,
        transition: snap ? 'none' : 'width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), background-color 0.6s ease',
        backgroundColor: tone,
        backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.28) 50%, rgba(0,0,0,0.28) 50%)',
      }} />
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
      // Active slot: a lifted plate. That alone carries the state now that the
      // text keeps one palette — a yellow edge rule was tried here and cut, it
      // competed with the yellow level figure for the same glance.
      // Translucent, so it lifts off the frosted rail instead of punching an
      // opaque hole through it.
      backgroundColor: active ? 'rgba(255, 255, 255, 0.13)' : 'transparent',
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
                whiteSpace: 'nowrap', fontFamily: 'Upheaval', fontSize: '12px',
                color: '#facc15', filter: 'drop-shadow(0 0 4px #facc15)',
                textShadow: '1px 1px 0 #000', pointerEvents: 'none', zIndex: 10,
              }}
            >
              +{levelsGained} LVL
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {/* Name / level / HP. One color system for both states — the active row is
          marked by its lighter backing plate and left rule, not by inverting the
          text to a second palette. */}
      <div style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px',
        alignItems: mirrored ? 'flex-end' : 'flex-start',
      }}>
        <span style={{ fontFamily: 'Orange Kid', fontSize: '17px', color: '#f2f2f2', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', lineHeight: 1 }}>
          {pokemon.name}
        </span>
        {/* Level then HP, in that order in BOTH columns — mirroring the row
            flips sprite and text to the correct edges, but the level/HP pair
            must keep one reading order or the two columns disagree. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: '#facc15', lineHeight: 1, textShadow: LV_OUTLINE }}>
            Lv{pokemon.level}
          </span>
          {/* The roster used to show a bare bar with no figure, while the mobile
              slot showed both. Same reading on both layouts now. */}
          <span style={{
            fontFamily: 'Pokemon Classic', fontSize: '8px', lineHeight: 1,
            color: fainted ? '#ef4444' : hpColor(hp, pokemon.stats.maxHp),
            whiteSpace: 'nowrap', letterSpacing: '0.06em',
          }}>
            {fainted ? 'FNT' : `${hp}/${pokemon.stats.maxHp}`}
          </span>
        </div>
        <TwoToneHpBar hp={hp} maxHp={pokemon.stats.maxHp} width={92} height={7} />
      </div>
      {/* Held item (inner edge) */}
      {itemSlot}
    </div>
  )
}

// A vertical edge column: trainer/character card on top, roster panel below.
function RosterColumn({ side, trainerSprite, trainerName, roster, hpArr, faintedArr, activeIndex, phase, celebrate = false, levelsGained = 0, onSwap }) {
  const mirrored = side === 'right'
  // Frosted glass, not a solid panel: the battle background now runs edge to
  // edge beneath both rails, and the rails fog it rather than cover it.
  //
  // The wash is a vertical gradient, not one flat alpha, and that is a
  // legibility fix rather than a flourish. The background's bright mid-field
  // band sits right where the roster rows are densest; measured against the
  // rows' #f2f2f2 names, a uniform 0.72 wash left that band at 2.4:1 — under
  // the 4.5:1 floor — while the dark sky above sat near 9:1. Weighting the
  // wash heavier through the middle evens the panel out and holds every row
  // above the floor without flattening the glass back into a solid slab.
  const cardSurface = `linear-gradient(to bottom,
    rgba(24, 24, 24, 0.74) 0%,
    rgba(24, 24, 24, 0.86) 42%,
    rgba(24, 24, 24, 0.86) 72%,
    rgba(24, 24, 24, 0.78) 100%)`
  const frost = 'blur(7px) saturate(0.7)'
  // The trainer card is only 74px tall, so it takes the gradient's mid value as
  // a flat wash — a full-height ramp would render as just its top slice and
  // read lighter than the roster panel directly beneath it.
  const trainerSurface = 'rgba(24, 24, 24, 0.8)'
  // The player's roster can be drag-reordered during the prep phase.
  const reorderable = !!onSwap && phase === 'prep'
  const [dragFrom, setDragFrom] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  // Touch reorder, sharing its gesture with the bag drag and the map roster's
  // reorder: same 4px threshold, same rect hit testing over data-battle-slot,
  // same touchcancel cleanup. Three hand-rolled copies of this used to drift
  // independently; this is the one implementation.
  //
  // No ghost — the row's own isDragging styling shows what is being moved.
  const { bagTouchProps: reorderTouchProps } = useBagTouchDrag({
    slotAttr: 'data-battle-slot',
    onDragStart: (_pokemon, fromIndex) => setDragFrom(fromIndex),
    onDrop: (_pokemon, fromIndex, toIndex) => {
      if (fromIndex !== toIndex) onSwap(fromIndex, toIndex)
      setDragFrom(null)
      setDragOver(null)
    },
    onMissedDrop: () => { setDragFrom(null); setDragOver(null) },
    // OS interruption: no touchend ever arrives, so without this the row stays
    // visually picked up for the rest of the prep phase.
    onDragEnd: (settled) => {
      if (!settled) { setDragFrom(null); setDragOver(null) }
    },
  })

  // Highlight the row under the finger. State is written only when the target
  // changes, not per touchmove — see the same note in Roster.jsx.
  function handleReorderMove(e) {
    if (dragFrom === null) return
    const t = e.touches[0]
    if (!t) return
    const rects = Array.from(document.querySelectorAll('[data-battle-slot]')).map(el => ({
      index: parseInt(el.dataset.battleSlot, 10),
      rect: el.getBoundingClientRect(),
    }))
    const idx = nearestRectAt(t.clientX, t.clientY, rects)
    setDragOver(prev => (prev === idx ? prev : idx))
  }

  const dragProps = i => {
    if (!reorderable) return {}
    const touch = reorderTouchProps(roster[i], i)
    return {
      'data-battle-slot': i,
      draggable: true,
      onDragStart: () => setDragFrom(i),
      onDragEnter: () => setDragOver(i),
      onDragOver: e => e.preventDefault(),
      onDrop: () => { if (dragFrom !== null && dragFrom !== i) onSwap(dragFrom, i); setDragFrom(null); setDragOver(null) },
      onDragEnd: () => { setDragFrom(null); setDragOver(null) },
      ...touch,
      // Both move handlers run: the hook's first, so it can preventDefault and
      // promote the drag, then the highlight tracker.
      onTouchMove: (e) => { touch.onTouchMove(e); handleReorderMove(e) },
    }
  }

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
        background: trainerSurface,
        backdropFilter: frost, WebkitBackdropFilter: frost,
        borderBottom: '1px solid #000',
        [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid rgba(0, 0, 0, 0.55)',
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
        background: cardSurface,
        backdropFilter: frost, WebkitBackdropFilter: frost,
        [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid rgba(0, 0, 0, 0.55)',
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

  const { bagTouchProps: reorderTouchProps } = useBagTouchDrag({
    slotAttr: 'data-battle-slot',
    onDragStart: (_pokemon, fromIndex) => setDragFrom(fromIndex),
    onDrop: (_pokemon, fromIndex, toIndex) => {
      if (fromIndex !== toIndex) onSwap(fromIndex, toIndex)
      setDragFrom(null)
      setDragOver(null)
    },
    onMissedDrop: () => { setDragFrom(null); setDragOver(null) },
    onDragEnd: (settled) => {
      if (!settled) { setDragFrom(null); setDragOver(null) }
    },
  })

  function handleReorderMove(e) {
    if (dragFrom === null) return
    const t = e.touches[0]
    if (!t) return
    const rects = Array.from(document.querySelectorAll('[data-battle-slot]')).map(el => ({
      index: parseInt(el.dataset.battleSlot, 10),
      rect: el.getBoundingClientRect(),
    }))
    const idx = nearestRectAt(t.clientX, t.clientY, rects)
    setDragOver(prev => (prev === idx ? prev : idx))
  }

  const dragProps = i => {
    if (!reorderable) return {}
    const touch = reorderTouchProps(roster[i], i)
    return {
      'data-battle-slot': i,
      draggable: true,
      onDragStart: () => setDragFrom(i),
      onDragEnter: () => setDragOver(i),
      onDragOver: e => e.preventDefault(),
      onDrop: () => { if (dragFrom !== null && dragFrom !== i) onSwap(dragFrom, i); setDragFrom(null); setDragOver(null) },
      onDragEnd: () => { setDragFrom(null); setDragOver(null) },
      ...touch,
      onTouchMove: (e) => { touch.onTouchMove(e); handleReorderMove(e) },
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        width: '100%', borderBottom: borderStyle, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '4px 4px 2px', gap: '2px',
      }}>
        {characterSprite
          ? <img src={characterSprite} alt={characterName} style={{ width: `${spriteSize}px`, height: `${spriteH}px`, objectFit: 'contain', objectPosition: 'bottom', imageRendering: 'pixelated' }} />
          : <div style={{ width: `${spriteSize}px`, height: `${spriteH}px` }} />
        }
        <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: mutedColor }}>{label}</span>
      </div>
      {/* Slots flow top-down: slot 0 pins to the top regardless of roster
          size (was space-evenly, which centered small rosters vertically). */}
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: '2px', padding: '6px' }}>
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
        gap: '2px', padding: '2px 2px',
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
              style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontFamily: 'Orange Kid', fontSize: '12px', color: '#facc15', filter: 'drop-shadow(0 0 3px #facc15)', zIndex: 10, pointerEvents: 'none' }}>
              {flashText}
            </motion.span>
          )}
        </AnimatePresence>
        <img ref={spriteRef} src={pokemon.sprite} alt={pokemon.name} style={{
          width: '40px', height: '40px', imageRendering: 'pixelated',
          filter: fainted ? 'grayscale(1)' : 'none',
        }} />
      </div>
      <span style={{
        fontFamily: 'Orange Kid', fontSize: '16px', color: textColor,
        textTransform: 'capitalize', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', textAlign: 'center',
      }}>
        {pokemon.name} <span style={{ color: '#facc15', fontSize: '12px', fontFamily: 'Orange Kid', textShadow: LV_OUTLINE }}>LV {pokemon.level}</span>
      </span>
      {/* HP number LEFT of the bar (one row instead of two) — saves a line per
          slot so all six roster slots fit the mobile card without scrolling. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: mutedColor, flexShrink: 0 }}>
          {fainted ? 'FNT' : `${hp}/${pokemon.stats.maxHp}`}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AnimatedHpBar hp={hp} maxHp={pokemon.stats.maxHp} barWidth="100%" height="3px" />
        </div>
      </div>
    </motion.div>
  )
}
