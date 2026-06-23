import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useSettings } from '../lib/settings'
import { AnimatedHpBar, hpColor } from '../lib/AnimatedHpBar'
import { simulateBattle } from '../game/battle.js'
import { NODE_TYPES } from '../game/nodeMap.js'
import battleGrass from '../assets/battleGrass.png'

const TYPE_COLORS = {
  fire: '#F08030', water: '#6890F0', grass: '#78C850', normal: '#A8A878',
  fighting: '#C03028', flying: '#98D8D8', poison: '#A040A0', ground: '#E0C068',
  rock: '#B8A038', bug: '#A8B820', ghost: '#705898', steel: '#B8B8D0',
  electric: '#F8D030', psychic: '#F85888', ice: '#98D8D8', dragon: '#7038F8',
  dark: '#705848', fairy: '#EE99AC',
}

const PROJECTILE_MS = 400
const PAUSE_AFTER_HIT = 350
const PROJECTILE_DURATION = PROJECTILE_MS / 1000

export default function BattleCard({ node, enemyTeam, trainerSprite, playerRoster, character, damageMultiplier = 2, onBattleEnd }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const { battleSpeed } = useSettings()
  const isBoss = node.type === NODE_TYPES.BOSS

  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-6px 8px 0 0 #121212' : '-6px 8px 0 0 #666666'
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = dark ? '#888' : '#777'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const arenaBg = dark ? '#111' : '#888'

  const [phase, setPhase] = useState(isBoss ? 'prep' : 'battle')
  const [logIndex, setLogIndex] = useState(-1)
  const [battleResult, setBattleResult] = useState(null)
  const [projectile, setProjectile] = useState(null)
  const [attackingSide, setAttackingSide] = useState(null)
  const [hurtSide, setHurtSide] = useState(null)
  const [flashText, setFlashText] = useState(null) // { side: 'player'|'enemy', text: string }

  const [playerHp, setPlayerHp] = useState(() => playerRoster.map(p => p.stats.hp))
  const [enemyHp, setEnemyHp] = useState(() => enemyTeam.map(p => p.stats.hp))
  const [playerFainted, setPlayerFainted] = useState(() => playerRoster.map(() => false))
  const [enemyFainted, setEnemyFainted] = useState(() => enemyTeam.map(() => false))
  const [activePlayer, setActivePlayer] = useState(0)
  const [activeEnemy, setActiveEnemy] = useState(0)

  const timerRef = useRef(null)
  const battleLogRef = useRef(null)

  useEffect(() => {
    if (phase !== 'battle') return
    const result = simulateBattle(playerRoster, enemyTeam, damageMultiplier)
    battleLogRef.current = result
    setLogIndex(0)
  }, [phase])

  useEffect(() => {
    if (logIndex < 0 || !battleLogRef.current) return
    const { log } = battleLogRef.current

    if (logIndex >= log.length) {
      setBattleResult(battleLogRef.current.playerWon ? 'win' : 'loss')
      return
    }

    const entry = log[logIndex]
    setProjectile({ fromSide: entry.side, type: entry.moveType })
    setAttackingSide(entry.side)

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

      if (entry.side === 'player') {
        setEnemyHp(prev => { const n = [...prev]; n[activeEnemy] = entry.defenderHpAfter; return n })
        if (entry.defenderFainted) {
          setEnemyFainted(prev => { const n = [...prev]; n[activeEnemy] = true; return n })
          setActiveEnemy(prev => {
            const next = enemyTeam.findIndex((_, i) => i > prev && !enemyFainted[i])
            return next !== -1 ? next : prev
          })
        }
      } else {
        setPlayerHp(prev => { const n = [...prev]; n[activePlayer] = entry.defenderHpAfter; return n })
        if (entry.defenderFainted) {
          setPlayerFainted(prev => { const n = [...prev]; n[activePlayer] = true; return n })
          setActivePlayer(prev => {
            const next = playerRoster.findIndex((_, i) => i > prev && !playerFainted[i])
            return next !== -1 ? next : prev
          })
        }
      }

      timerRef.current = setTimeout(() => setLogIndex(i => i + 1), PAUSE_AFTER_HIT / battleSpeed)
    }, PROJECTILE_MS / battleSpeed)

    return () => clearTimeout(timerRef.current)
  }, [logIndex])

  function handleContinue() {
    const { playerWon, finalPlayerTeam } = battleLogRef.current
    onBattleEnd({ won: playerWon, finalPlayerTeam })
  }

  const currentEntry = battleLogRef.current?.log[logIndex - 1] ?? null

  // Shared sub-components (used in both layouts)
  const BattleLog = () => (
    <div style={{
      borderTop: borderStyle,
      padding: '8px 10px',
      minHeight: '64px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: '4px',
      backgroundColor: cardBg,
    }}>
      {phase === 'prep' && (
        <>
          <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: textColor }}>
            {node.trainer} wants to battle!
          </span>
          <button
            onClick={() => setPhase('battle')}
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
        </div>
      )}
    </div>
  )

  const playerColumnProps = {
    characterSprite: character?.sprite, characterName: character?.name,
    roster: playerRoster, hpArr: playerHp, faintedArr: playerFainted,
    activeIndex: activePlayer, hurtActive: hurtSide === 'player',
    phase, dark, textColor, mutedColor, mobile: !isDesktop,
    borderStyle, label: 'You',
    flashText: flashText?.side === 'player' ? flashText.text : null,
  }
  const enemyColumnProps = {
    characterSprite: trainerSprite, characterName: node.trainer,
    roster: enemyTeam, hpArr: enemyHp, faintedArr: enemyFainted,
    activeIndex: activeEnemy, hurtActive: hurtSide === 'enemy',
    phase, dark, textColor, mutedColor, mobile: !isDesktop,
    borderStyle, label: node.trainer ?? 'Wild',
    flashText: flashText?.side === 'enemy' ? flashText.text : null,
  }

  // ── MOBILE layout: two roster columns + horizontal projectile, no center arena ──
  if (!isDesktop) {
    return (
      <div onClick={e => e.stopPropagation()} style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 100,
      }}>
        <div style={{
          width: '380px', height: '640px', maxHeight: '94vh',
          border: borderStyle, boxShadow: shadowStyle, backgroundColor: cardBg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Two columns + horizontal projectile */}
          <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
            {/* Player column */}
            <div style={{ width: '50%', backgroundColor: innerBg, borderRight: borderStyle, display: 'flex', flexDirection: 'column' }}>
              <BattleColumn {...playerColumnProps} spriteSize={72} spriteH={100} />
            </div>

            {/* Horizontal projectile overlay */}
            <AnimatePresence>
              {projectile && (
                <motion.div
                  key="orb"
                  initial={{ x: projectile.fromSide === 'player' ? -60 : 60, opacity: 1, scale: 1 }}
                  animate={{ x: projectile.fromSide === 'player' ? 60 : -60, opacity: 0, scale: 0.4 }}
                  exit={{}}
                  transition={{ duration: PROJECTILE_DURATION / battleSpeed, ease: 'easeIn' }}
                  style={{
                    position: 'absolute', left: '50%', top: '50%',
                    width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: TYPE_COLORS[projectile.type] ?? '#fff',
                    boxShadow: `0 0 6px 2px ${TYPE_COLORS[projectile.type] ?? '#fff'}`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 10, pointerEvents: 'none',
                  }}
                />
              )}
            </AnimatePresence>

            {/* Enemy column */}
            <div style={{ width: '50%', backgroundColor: innerBg, borderLeft: borderStyle, display: 'flex', flexDirection: 'column' }}>
              <BattleColumn {...enemyColumnProps} spriteSize={72} spriteH={100} />
            </div>
          </div>
          <BattleLog />
        </div>
      </div>
    )
  }

  // ── DESKTOP layout: three columns with center arena ──
  const SIDE_W = 165
  const ARENA_W = 260

  return (
    <div onClick={e => e.stopPropagation()} style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 100,
    }}>
      <div style={{
        width: `${SIDE_W + ARENA_W + SIDE_W}px`,
        height: '680px', maxHeight: '94vh',
        border: borderStyle, boxShadow: shadowStyle, backgroundColor: cardBg,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* Left column */}
          <div style={{ width: `${SIDE_W}px`, flexShrink: 0, backgroundColor: innerBg, borderRight: borderStyle, display: 'flex', flexDirection: 'column' }}>
            <BattleColumn {...playerColumnProps} spriteSize={96} spriteH={130} />
          </div>

          {/* Center arena */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{
              flex: 1, backgroundColor: arenaBg, position: 'relative',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'space-around', padding: '12px 8px', minHeight: '200px',
            }}>
              {/* Vertical projectile */}
              <AnimatePresence>
                {projectile && (
                  <motion.div
                    key="orb"
                    initial={{ y: projectile.fromSide === 'player' ? 60 : -60, opacity: 1, scale: 1 }}
                    animate={{ y: projectile.fromSide === 'player' ? -60 : 60, opacity: 0, scale: 0.4 }}
                    exit={{}}
                    transition={{ duration: PROJECTILE_DURATION / battleSpeed, ease: 'easeIn' }}
                    style={{
                      position: 'absolute', left: '50%', top: '50%',
                      width: '8px', height: '8px', borderRadius: '50%',
                      backgroundColor: TYPE_COLORS[projectile.type] ?? '#fff',
                      boxShadow: `0 0 6px 2px ${TYPE_COLORS[projectile.type] ?? '#fff'}`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: 10, pointerEvents: 'none',
                    }}
                  />
                )}
              </AnimatePresence>

              {/* Enemy sprite + grass */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px' }}>
                <span style={{ fontFamily: 'Orange Kid', fontSize: '18px', color: '#ccc', textTransform: 'capitalize', marginBottom: '2px' }}>
                  {enemyTeam[activeEnemy]?.name} <span style={{ color: '#facc15', fontSize: '8px' }}>LV {enemyTeam[activeEnemy]?.level}</span>
                </span>
                <AnimatedHpBar hp={enemyHp[activeEnemy]} maxHp={enemyTeam[activeEnemy]?.stats.maxHp} width={96} />
                <div style={{ position: 'relative', width: '120px', height: '110px' }}>
                  <AnimatePresence>
                    {flashText?.side === 'enemy' && (
                      <motion.span key={flashText.text + 'e'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ position: 'absolute', top: '-4px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontFamily: 'Orange Kid', fontSize: '11px', color: '#facc15', filter: 'drop-shadow(0 0 4px #facc15)', zIndex: 10, pointerEvents: 'none' }}>
                        {flashText.text}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <img src={enemyTeam[activeEnemy]?.sprite} alt={enemyTeam[activeEnemy]?.name} style={{
                    width: '96px', height: '96px', imageRendering: 'pixelated',
                    filter: enemyFainted[activeEnemy] ? 'grayscale(1) opacity(0.3)' : 'none',
                    transition: 'filter 0.3s',
                    position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 2,
                  }} />
                  <img src={battleGrass} alt="" style={{ width: '120px', imageRendering: 'pixelated', position: 'absolute', bottom: 0, left: 0, zIndex: 1 }} />
                </div>
              </div>

              {/* Player sprite + grass */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px' }}>
                <div style={{ position: 'relative', width: '120px', height: '110px' }}>
                  <AnimatePresence>
                    {flashText?.side === 'player' && (
                      <motion.span key={flashText.text + 'p'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ position: 'absolute', top: '-4px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontFamily: 'Orange Kid', fontSize: '11px', color: '#facc15', filter: 'drop-shadow(0 0 4px #facc15)', zIndex: 10, pointerEvents: 'none' }}>
                        {flashText.text}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <img src={playerRoster[activePlayer]?.spriteBack ?? playerRoster[activePlayer]?.sprite} alt={playerRoster[activePlayer]?.name} style={{
                    width: '96px', height: '96px', imageRendering: 'pixelated',
                    filter: playerFainted[activePlayer] ? 'grayscale(1) opacity(0.3)' : 'none',
                    transition: 'filter 0.3s',
                    position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 2,
                  }} />
                  <img src={battleGrass} alt="" style={{ width: '120px', imageRendering: 'pixelated', position: 'absolute', bottom: 0, left: 0 }} />
                </div>
                <AnimatedHpBar hp={playerHp[activePlayer]} maxHp={playerRoster[activePlayer]?.stats.maxHp} width="96px" />
                <span style={{ fontFamily: 'Orange Kid', fontSize: '18px', color: '#ccc', textTransform: 'capitalize', marginTop: '2px' }}>
                  {playerRoster[activePlayer]?.name} <span style={{ color: '#facc15', fontSize: '8px' }}>LV {playerRoster[activePlayer]?.level}</span>
                </span>
              </div>
            </div>
            <BattleLog />
          </div>

          {/* Right column */}
          <div style={{ width: `${SIDE_W}px`, flexShrink: 0, backgroundColor: innerBg, borderLeft: borderStyle, display: 'flex', flexDirection: 'column' }}>
            <BattleColumn {...enemyColumnProps} spriteSize={96} spriteH={130} />
          </div>

        </div>
      </div>
    </div>
  )
}

function BattleColumn({ characterSprite, characterName, roster, hpArr, faintedArr, activeIndex, hurtActive, phase, dark, textColor, mutedColor, mobile, borderStyle, label, spriteSize = 60, spriteH = 84, flashText }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        width: '100%', borderBottom: borderStyle,
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
          <RosterSlot key={i} pokemon={p} hp={hpArr[i]} fainted={faintedArr[i]}
            active={i === activeIndex && phase === 'battle'}
            attacking={i === activeIndex && hurtActive}
            dark={dark} textColor={textColor} mutedColor={mutedColor} mobile={mobile}
            flashText={i === activeIndex ? flashText : null} />
        ))}
      </div>
    </div>
  )
}

function RosterSlot({ pokemon, hp, fainted, active, attacking, dark, textColor, mutedColor, mobile, flashText }) {
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
      <div style={{ position: 'relative' }}>
        <AnimatePresence>
          {flashText && (
            <motion.span key={flashText} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontFamily: 'Orange Kid', fontSize: '10px', color: '#facc15', filter: 'drop-shadow(0 0 3px #facc15)', zIndex: 10, pointerEvents: 'none' }}>
              {flashText}
            </motion.span>
          )}
        </AnimatePresence>
        <img src={pokemon.sprite} alt={pokemon.name} style={{
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

