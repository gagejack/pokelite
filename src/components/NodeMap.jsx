import { useState, useMemo, useRef, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import Layout from './Layout'
import Roster from './Roster'
import BattleCard from './BattleCard'
import PokeballNode from './PokeballNode'
import ItemNode from './ItemNode'
import PowerUpgradeNode from './PowerUpgradeNode'
import EvolutionNotice from './EvolutionNotice'
import BadgeList from './BadgeList'
import ItemInfoCard from './ItemInfoCard'
import { NODE_TYPES, pick, resolveMysteryType } from '../game/nodeMap.js'
import { pickThreeItems, itemIconUrl, BONUS_TIER_BUDGET } from '../game/items.js'
import { BONUS_CATCH_TIER_BUDGET } from '../game/catch.js'
import { getRegionConfig } from '../game/regionRegistry.js'
import { fetchPokemonBase, buildPokemonInstance, applyBattleVictory, cachedType, cachedName, resolveEvolutionLine } from '../game/pokemon.js'
import { getTypeMove } from '../game/typeMoves.js'
import { TYPE_COLORS } from '../game/types.js'
import { buildTrainerTeamSpec, pickTrainerCount, mapLevelRange, pickLevel } from '../game/battleTeams.js'
import { swapInRoster } from '../game/roster.js'
// The mystery-node icon. (Renamed from the original "?.png" — a literal "?" in
// a filename can't be imported, since "?" is the query separator in a specifier.)
import mysteryIcon from '../assets/Icons/mysteryIcon2.png'
import pokecenterIcon from '../assets/pokecenter.png'

let isTouchDevice = false
window.addEventListener('touchstart', () => { isTouchDevice = true }, { once: true, passive: true })

const ITEM_ICONS = {
  [NODE_TYPES.POKEBALL]:      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png',
  [NODE_TYPES.MASTER_BALL]:   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/master-ball.png',
  [NODE_TYPES.ITEM]:          'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/potion.png',
  [NODE_TYPES.POWER_UPGRADE]: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/tm-normal.png',
  [NODE_TYPES.POKECENTER]:    pokecenterIcon,
  [NODE_TYPES.BOSS]:          'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/master-ball.png',
  [NODE_TYPES.MYSTERY]:       mysteryIcon,
}

const NODE_SIZE = 100
// Multiplier for how big node icons render (1 = default). Bump this to make ALL
// nodes bigger without touching map spacing/layout — icons grow in place,
// centered on their node point. Grass, trainer, and the current-player icon all
// scale with it too.
const NODE_SCALE = 1.3
// Extra multiplier applied to gym-leader (boss) nodes so they stand out as
// bigger than regular nodes. Stacks on top of NODE_SCALE.
const BOSS_SCALE = 1.4
const ROW_HEIGHT = 200
const COL_WIDTH = 200
const PADDING_TOP = 150
// Per-row horizontal spread multipliers (keyed by row index from the top),
// applied symmetrically so the bottom mirrors the top. Rows not listed default
// to 1 (the plain grid). This loosens the strict angular grid a touch. The
// spread scales each node's offset from center by this factor, so a row's
// CENTER node (offset 0) stays put while the outer nodes move outward. The map
// has 9 rows (0..8): row 1 mirrors row 7, and row 2 (3 nodes) mirrors row 6.
const ROW_SPREAD = { 1: 1.6, 7: 1.6, 2: 1.35, 6: 1.35 }
// Top/bottom breathing room (px) around the desktop map card so it doesn't
// touch the nav bar or the window's bottom edge (matches the old py-4).
const MAP_PAD_Y = 16

function MapSvg({
  dark, borderStyle, shadowStyle,
  nodePositions, edges, svgWidth, svgHeight,
  clearedNodes, currentNode, loadingNode, hoveredNode,
  mapContainerRef, holdTimerRef, holdActivatedRef,
  setContainerSize, setHoveredNode,
  handleNodeClick, getIcon, getNodeLabel, isReachable, isLocked,
  mapScale, scaleX, scaleY, mapOffsetX, mapOffsetY, background,
}) {
  // The SVG stretches to fill the card on both axes (preserveAspectRatio none),
  // so node POSITIONS fill the card even when the card ratio differs from the
  // node layout. To keep node ICONS square despite that stretch, each node group
  // is counter-scaled so its icon renders at a uniform mapScale in pixels.
  const iconFixX = scaleX ? mapScale / scaleX : 1
  const iconFixY = scaleY ? mapScale / scaleY : 1
  useEffect(() => {
    if (!mapContainerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setContainerSize({ w: width, h: height })
    })
    ro.observe(mapContainerRef.current)
    return () => ro.disconnect()
  }, [])

  // Overlay hit-targets follow the stretched node POSITIONS (scaleX/scaleY) so
  // they line up with the SVG icons; the button SIZE stays square via mapScale.
  const toPixel = (svgX, svgY) => ({
    px: mapOffsetX + (svgX + svgWidth / 2) * scaleX,
    py: mapOffsetY + svgY * scaleY,
  })

  return (
    <div
      ref={mapContainerRef}
      className="relative overflow-hidden"
      style={{ flex: 1, minHeight: 0, border: borderStyle, boxShadow: shadowStyle }}
    >
      <img
        src={background}
        alt="map background"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'top center', imageRendering: 'pixelated' }}
      />
      <svg
        width="100%"
        height="100%"
        viewBox={`${-svgWidth / 2} 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        <defs>
          <clipPath id="trainer-clip">
            <rect x={0} y={0} width={NODE_SIZE} height={NODE_SIZE * 1.15} />
          </clipPath>
          <filter id="node-shadow" x="-60%" y="-60%" width="220%" height="220%">
            {/* Larger, softer, subtler shadow behind the tight one */}
            <feDropShadow dx="3" dy="7" stdDeviation="9" floodColor="rgba(0,0,0,0.35)" />
            <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.9)" />
          </filter>
          <filter id="trainer-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="3" dy="7" stdDeviation="9" floodColor="rgba(0,0,0,0.35)" />
            <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.9)" />
          </filter>
          <filter id="hover-outline" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="expanded" />
            <feFlood floodColor="#ffffff" result="white" />
            <feComposite in="white" in2="expanded" operator="in" result="outline" />
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#facc15" floodOpacity="0.9" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="outline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Resting white stroke for the immediately-available (reachable)
              nodes — a plain outline, no glow, so the player sees where they can
              go next. Hover upgrades to #hover-outline (white + yellow glow). */}
          <filter id="white-outline" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="expanded" />
            <feFlood floodColor="#ffffff" result="white" />
            <feComposite in="white" in2="expanded" operator="in" result="outline" />
            <feMerge>
              <feMergeNode in="outline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {edges.map(([fromId, toId], i) => {
          const from = nodePositions[fromId]
          const to = nodePositions[toId]
          if (!from || !to) return null
          const active = clearedNodes.has(fromId) && clearedNodes.has(toId)
          return (
            <line key={i}
              x1={from.x} y1={from.y + NODE_SIZE / 2}
              x2={to.x} y2={to.y + NODE_SIZE / 2}
              stroke={active ? '#15803d' : 'rgba(0,0,0,0.8)'}
              strokeWidth={active ? 2.5 : 1.5}
              strokeDasharray={active ? 'none' : '4 3'}
            />
          )
        })}

        {Object.values(nodePositions).map(({ x, y, node }) => {
          const isCurrentNode = node.id === currentNode
          const cleared = clearedNodes.has(node.id)
          const reachable = !cleared && isReachable(node.id)
          const locked = isLocked(node.id)
          const isHovered = hoveredNode?.id === node.id
          const icon = getIcon(node, isCurrentNode)
          const opacity = isCurrentNode ? 1 : cleared ? 0.8 : reachable ? 1 : locked ? 0.2 : .85
          const isTrainerNode = node.type === NODE_TYPES.TRAINER || node.type === NODE_TYPES.BOSS
          // Gym leaders (boss nodes) render larger than everything else.
          const nodeScale = NODE_SCALE * (node.type === NODE_TYPES.BOSS ? BOSS_SCALE : 1)
          return (
            <g key={node.id} transform={`translate(${x}, ${y}) scale(${iconFixX * nodeScale}, ${iconFixY * nodeScale}) translate(${-NODE_SIZE / 2}, 0)`}>
              {isCurrentNode ? (
                <image href={icon}
                  x={-NODE_SIZE * 0.2} y={-NODE_SIZE * 0.2}
                  width={NODE_SIZE * 1.4} height={NODE_SIZE * 1.4}
                  preserveAspectRatio="xMidYMid meet"
                  filter="url(#trainer-shadow)"
                  style={{ imageRendering: 'pixelated', opacity }}
                />
              ) : isTrainerNode ? (
                <g clipPath="url(#trainer-clip)" filter={isHovered ? 'url(#hover-outline)' : reachable ? 'url(#white-outline)' : 'url(#trainer-shadow)'}>
                  <image href={icon}
                    x={-NODE_SIZE * 0.083} y={-NODE_SIZE * 0.075}
                    width={NODE_SIZE * 3.5} height={NODE_SIZE * 4.5}
                    style={{ imageRendering: 'pixelated', opacity }}
                  />
                </g>
              ) : (() => {
                const isGrass = node.type === NODE_TYPES.GRASS
                const size = isGrass ? NODE_SIZE * 0.7 : NODE_SIZE
                const offset = isGrass ? (NODE_SIZE - size) / 2 : 0
                return (
                  <image href={icon} x={offset} y={offset}
                    width={size} height={size}
                    filter={isHovered ? 'url(#hover-outline)' : reachable ? 'url(#white-outline)' : 'url(#node-shadow)'}
                    style={{ imageRendering: 'pixelated', opacity }}
                  />
                )
              })()}
            </g>
          )
        })}
      </svg>

      {mapScale > 0 && Object.values(nodePositions).map(({ x, y, node }) => {
        const cleared = clearedNodes.has(node.id)
        const reachable = !cleared && isReachable(node.id)
        const { px, py } = toPixel(x, y)
        const size = NODE_SIZE * mapScale * NODE_SCALE * (node.type === NODE_TYPES.BOSS ? BOSS_SCALE : 1)
        const isHovered = hoveredNode?.id === node.id
        const { title, sub } = getNodeLabel(node)
        return (
          <button
            key={node.id}
            onClick={(e) => {
              if (holdActivatedRef.current) { holdActivatedRef.current = false; return }
              handleNodeClick(node)
            }}
            onMouseEnter={() => { if (!isTouchDevice) setHoveredNode(node) }}
            onMouseLeave={() => { if (!isTouchDevice) setHoveredNode(null) }}
            onTouchStart={() => {
              holdTimerRef.current = setTimeout(() => {
                holdActivatedRef.current = true
                setHoveredNode(node)
              }, 400)
            }}
            onTouchEnd={() => { clearTimeout(holdTimerRef.current); setHoveredNode(null) }}
            onTouchMove={() => clearTimeout(holdTimerRef.current)}
            style={{
              position: 'absolute',
              left: px - size / 2,
              top: py,
              width: size,
              height: size,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: loadingNode === node.id ? 'wait' : reachable ? 'pointer' : 'default',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {isHovered && (
              <div style={{
                position: 'absolute',
                bottom: '110%',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: dark ? 'rgba(30,30,30,0.92)' : 'rgba(220,220,220,0.95)',
                border: dark ? '1px solid #444' : '1px solid #999',
                padding: '4px 8px',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 10,
              }}>
                <div style={{ fontFamily: 'Orange Kid', fontSize: '18px', color: dark ? '#DBDBDB' : '#333', textTransform: 'capitalize' }}>{title}</div>
                {Array.isArray(sub)
                  ? sub.map((line, i) => typeof line === 'object'
                    // Boss Pokémon: type chip to the left of the name + level.
                    ? (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', lineHeight: '1.5' }}>
                        {line.type && (
                          <span style={{
                            fontFamily: 'Upheaval', fontSize: '10px', color: '#fff',
                            backgroundColor: TYPE_COLORS[line.type] ?? '#888',
                            padding: '2px 6px', textTransform: 'capitalize', flexShrink: 0,
                          }}>
                            {line.type}
                          </span>
                        )}
                        <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: '#facc15', textTransform: 'capitalize' }}>
                          {line.name} lv.{line.level}
                        </span>
                      </div>
                    )
                    : <div key={i} style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: '#facc15', lineHeight: '1.5' }}>{line}</div>
                  )
                  : <div style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: '#facc15', marginTop: '2px' }}>{sub}</div>
                }
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default function NodeMap({ region, starter, character, roster, setRoster, bag, onItemAssign, onItemKeepInBag, onMoveItem, mapIndex = 0, onBack, onRestart, onAdvanceMap, onEnterEliteFour, onPokemonCaught, onCatchRecorded, onSpeciesOwned, onSpeciesSeen, caughtSet, onMapCleared, onBadgeEarned, onRunEnd, onProgressChange, initialMapData, initialClearedNodes, initialCurrentNode, pokedexOpen, setPokedexOpen }) {
  const { dark } = useTheme()
  // Item currently being placed via bag-drag or the stat-card "move" picker.
  // { item, from: {kind:'bag',index} | {kind:'pokemon',pokeIndex} } or null.
  const [movingItem, setMovingItem] = useState(null)
  // An item clicked to view its info popup (from the bag or a Pokémon's held
  // slot). { item, from: {kind:'bag',index} | {kind:'pokemon',pokeIndex} } | null.
  const [infoItem, setInfoItem] = useState(null)
  const isDesktop = useIsDesktop()
  const config = getRegionConfig(region.name)
  const mapConfig = config.maps[mapIndex]

  // Use the restored layout when resuming a saved run (its generate() is random,
  // so re-generating would give a DIFFERENT map). Only reuse it if it's for this
  // same map index, otherwise generate fresh.
  const mapData = useMemo(
    () => (initialMapData && initialMapData.mapIndex === mapIndex)
      ? initialMapData
      : mapConfig.generate(starter),
    [mapConfig] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const edges = mapConfig.edges

  // Seed node progress from a resumed run when it matches this map (else fresh).
  const resumeMatches = initialMapData && initialMapData.mapIndex === mapIndex
  const [clearedNodes, setClearedNodes] = useState(
    () => resumeMatches && initialClearedNodes ? new Set(initialClearedNodes) : new Set([0])
  )
  const [currentNode, setCurrentNode] = useState(
    () => resumeMatches && initialCurrentNode != null ? initialCurrentNode : 0
  )
  const [pendingBattle, setPendingBattle] = useState(null)
  const [pendingPokeball, setPendingPokeball] = useState(null)
  const [pendingLegendary, setPendingLegendary] = useState(null)
  const [pendingItem, setPendingItem] = useState(null)
  const [pendingPower, setPendingPower] = useState(null)

  // Keep the parent's snapshot of this map's progress current, so hitting Home
  // can save exactly where the player is (layout + cleared nodes + position).
  useEffect(() => {
    onProgressChange?.({
      mapData,
      clearedNodes: [...clearedNodes],
      currentNode,
    })
  }, [mapData, clearedNodes, currentNode]) // eslint-disable-line react-hooks/exhaustive-deps
  const [loadingNode, setLoadingNode] = useState(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [evolutionNotices, setEvolutionNotices] = useState([])
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  // Aspect ratio (w/h) of the current map's background image. The card sizes
  // itself to this so the whole image shows and the nodes sit on it. Null until
  // the image loads → fall back to the map's node-layout ratio.
  const [bgRatio, setBgRatio] = useState(null)
  // Mobile: size of the slot the map card lives in, so we can fit the card to
  // it on whichever axis binds (portrait maps can be width- OR height-bound
  // depending on the map's ratio and how much height the Roster/Bag rows leave).
  const [mobileSlot, setMobileSlot] = useState({ w: 0, h: 0 })
  const mobileSlotRef = useRef(null)
  const mapContainerRef = useRef(null)
  const holdTimerRef = useRef(null)
  const holdActivatedRef = useRef(false)

  // Measure the background image's natural aspect ratio so the card can size
  // itself to show the whole image. Re-runs whenever the map's background
  // changes (advancing maps).
  useEffect(() => {
    let cancelled = false
    setBgRatio(null)
    const img = new Image()
    img.onload = () => {
      if (!cancelled && img.naturalWidth > 0 && img.naturalHeight > 0) {
        setBgRatio(img.naturalWidth / img.naturalHeight)
      }
    }
    img.src = mapConfig.background
    return () => { cancelled = true }
  }, [mapConfig.background])

  // Measure the mobile map slot so the card can be fit to it on the binding axis.
  useEffect(() => {
    const el = mobileSlotRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setMobileSlot({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [isDesktop])

  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #666666'

  const nodePositions = {}
  mapData.rows.forEach((row, rowIndex) => {
    const totalCols = row.length
    const spread = ROW_SPREAD[rowIndex] ?? 1
    row.forEach((node, colIndex) => {
      const x = (colIndex - (totalCols - 1) / 2) * COL_WIDTH * spread
      const y = rowIndex * ROW_HEIGHT + PADDING_TOP
      nodePositions[node.id] = { x, y, node }
    })
  })

  const totalRows = mapData.rows.length
  const svgHeight = totalRows * ROW_HEIGHT + NODE_SIZE + PADDING_TOP - 60
  const svgWidth = 4 * COL_WIDTH + NODE_SIZE * 2

  const isReachable = (nodeId) =>
    edges.some(([from, to]) => to === nodeId && from === currentNode)

  const getReachableFromCurrent = () => {
    const reachable = new Set(clearedNodes)
    let frontier = [currentNode]
    while (frontier.length) {
      const next = []
      for (const id of frontier) {
        for (const [from, to] of edges) {
          if (from === id && !reachable.has(to)) {
            reachable.add(to)
            next.push(to)
          }
        }
      }
      frontier = next
    }
    return reachable
  }

  const forwardReachable = getReachableFromCurrent()

  const isLocked = (nodeId) => {
    if (clearedNodes.has(nodeId)) return false
    if (isReachable(nodeId)) return false
    return !forwardReachable.has(nodeId)
  }

  async function fetchEnemyTeam(node) {
    const isBoss = node.type === NODE_TYPES.BOSS
    const isTrainer = node.type === NODE_TYPES.TRAINER
    const isMasterBall = node.type === NODE_TYPES.MASTER_BALL
    const totalNodes = Object.keys(nodePositions).length
    const positionWeight = node.id / totalNodes

    let specs
    if (isBoss) {
      specs = config.bossTeams?.[node.trainer] ?? []
    } else if (isMasterBall) {
      // Master Ball: a single legendary from this map's pool, at its fixed level
      // (not position-scaled). Empty pool → no legendary (caller clears the node).
      const pool = config.legendaryPools?.[mapIndex] ?? []
      specs = pool.length > 0 ? [pick(pool)] : []
    } else if (isTrainer) {
      const count = pickTrainerCount(mapIndex)
      const pool = config.trainerSpeciesPools?.[Math.min(mapIndex, (config.trainerSpeciesPools?.length ?? 1) - 1)] ?? []
      const band = mapLevelRange(config.mapLevelRanges, mapIndex)
      specs = buildTrainerTeamSpec(pool, band, count, positionWeight)
    } else {
      // Grass: one wild Pokémon from this map's catch pool, a few levels below
      // the map's trainers, scaled by node position. Grass ignores rarity —
      // it's a forced fight, not a reward — so pick a species uniformly.
      const pool = config.catchPools?.[mapIndex] ?? []
      const id = pool.length > 0 ? pick(pool).id : (config.fallbackSpeciesId ?? 504)
      const [min, max] = mapLevelRange(config.mapLevelRanges, mapIndex)
      const grassRange = [Math.max(1, min - 3), Math.max(1, max - 3)]
      specs = [{ id, level: pickLevel(grassRange, positionWeight) }]
    }

    const team = await Promise.all(specs.map(async ({ id, level }) => {
      const base = await fetchPokemonBase(id)
      return buildPokemonInstance(base, level)
    }))
    // Every enemy Pokémon fought counts as "seen" in the Pokédex.
    team.forEach(p => onSpeciesSeen?.(p.pokeId))

    const trainerSprite = config.trainerFullSprites?.[node.trainer]
      ?? config.characters?.find(c => c.name === node.trainer)?.sprite
      ?? null

    return { team, trainerSprite }
  }

  // Given a pool species id and a catch-node level, return the id of the
  // evolution stage to actually offer. Resolves the full line, keeps stages
  // whose evolution level is ≤ catchLevel, and picks one weighted toward the
  // most-evolved (weight = stage index + 1). Falls back to the original id if
  // the line can't be resolved. See fetchOfferedPokemon for the design.
  async function rollCatchStage(id, catchLevel) {
    let stages
    try {
      stages = await resolveEvolutionLine(id)
    } catch {
      return id
    }
    if (!stages || stages.length === 0) return id
    const eligible = stages.filter(s => s.minLevel <= catchLevel)
    if (eligible.length === 0) return stages[0].id
    // Favor most-evolved: later eligible stages get proportionally more weight.
    const total = eligible.reduce((s, _, i) => s + (i + 1), 0)
    let roll = Math.random() * total
    for (let i = 0; i < eligible.length; i++) {
      roll -= i + 1
      if (roll <= 0) return eligible[i].id
    }
    return eligible[eligible.length - 1].id
  }

  async function fetchOfferedPokemon(node) {
    const pool = config.catchPools?.[mapIndex] ?? []
    if (pool.length === 0) return []

    const totalNodes = Object.keys(nodePositions).length
    const positionWeight = node.id / totalNodes
    // Catch levels scale per map (same range as that map's trainers), weighted
    // by node position.
    const level = pickLevel(mapLevelRange(config.mapLevelRanges, mapIndex), positionWeight)

    // Draw distinct species weighted by rarity tier. A mystery-node catch gives
    // a bonus offer: one extra species (4 not 3) and boosted higher-rarity odds.
    const count = node.fromMystery ? 4 : 3
    const tierBudget = node.fromMystery ? BONUS_CATCH_TIER_BUDGET : config.catchTierBudget
    const chosen = config.pickCatchOffer(pool, count, tierBudget)

    const offered = await Promise.all(chosen.map(async ({ id, rarity }) => {
      // Roll which evolution stage of this line to offer. The pool entry names a
      // stage, but catch nodes present a random stage of its whole line: only
      // stages whose evolution level is at/below this node's catch level are
      // eligible (early maps → base forms only; late maps → any stage). Odds
      // favor the most-evolved eligible stage. Rarity stays the pool's. Grass
      // and trainers don't call this, so they're unaffected.
      const speciesId = await rollCatchStage(id, level)
      const base = await fetchPokemonBase(speciesId)
      const instance = buildPokemonInstance(base, level)
      return { ...instance, level, rarity }
    }))
    // Wild Pokémon offered at a Pokéball node count as "seen".
    offered.forEach(p => onSpeciesSeen?.(p.pokeId))
    return offered
  }

  // A Mystery ("?") node reveals a random encounter/reward on click. Resolve it
  // to a concrete node (grass / trainer / pokeball / item / legendary), equally
  // weighted, then run the normal click flow for that type. If it becomes a
  // trainer, borrow a trainer name from another trainer node on this map (which
  // was drawn from the region's route pool) so the sprite + species pool
  // resolve correctly — never a gym leader.
  const resolveMysteryNode = (node) => {
    const type = resolveMysteryType()
    // Tag the resolved node so the item / catch flows give a "bonus" offer:
    // one extra choice and boosted rarity odds.
    if (type === NODE_TYPES.TRAINER) {
      const trainerNode = mapData.rows.flat().find(
        n => n.type === NODE_TYPES.TRAINER && n.trainer
      )
      const trainer = trainerNode?.trainer
        ?? Object.keys(config.trainerSprites ?? {})[0]
      return { ...node, type, trainer, fromMystery: true }
    }
    return { ...node, type, fromMystery: true }
  }

  const handleNodeClick = async (rawNode) => {
    if (clearedNodes.has(rawNode.id) || !isReachable(rawNode.id)) return

    // Reveal a Mystery node before dispatching (keeps the same id, so
    // reachability/clearing still work).
    const node = rawNode.type === NODE_TYPES.MYSTERY
      ? resolveMysteryNode(rawNode)
      : rawNode

    const isBattle = node.type === NODE_TYPES.TRAINER
      || node.type === NODE_TYPES.BOSS
      || node.type === NODE_TYPES.GRASS
      || node.type === NODE_TYPES.MASTER_BALL

    if (isBattle) {
      setLoadingNode(node.id)
      const { team, trainerSprite } = await fetchEnemyTeam(node)
      setLoadingNode(null)
      // Master Ball with an empty pool (shouldn't happen given the spawn ramp,
      // but guard anyway) — just clear the node.
      if (team.length === 0) {
        setClearedNodes(prev => new Set([...prev, node.id]))
        setCurrentNode(node.id)
      } else {
        setPendingBattle({ node, enemyTeam: team, trainerSprite })
      }
    } else if (node.type === NODE_TYPES.POKEBALL) {
      setLoadingNode(node.id)
      const offered = await fetchOfferedPokemon(node)
      setLoadingNode(null)
      if (offered.length > 0) {
        setPendingPokeball({ node, offered })
      } else {
        setClearedNodes(prev => new Set([...prev, node.id]))
        setCurrentNode(node.id)
      }
    } else if (node.type === NODE_TYPES.ITEM) {
      // A mystery-node item gives a bonus offer: one extra item (4 not 3) and
      // boosted higher-rarity odds.
      const offered = node.fromMystery
        ? pickThreeItems(4, BONUS_TIER_BUDGET)
        : pickThreeItems()
      setPendingItem({ node, offered })
    } else if (node.type === NODE_TYPES.POKECENTER) {
      setRoster(prev => prev.map(p => ({ ...p, fainted: false, stats: { ...p.stats, hp: p.stats.maxHp } })))
      setClearedNodes(prev => new Set([...prev, node.id]))
      setCurrentNode(node.id)
    } else if (node.type === NODE_TYPES.POWER_UPGRADE) {
      setPendingPower({ node })
    } else {
      setClearedNodes(prev => new Set([...prev, node.id]))
      setCurrentNode(node.id)
    }
  }

  async function handleBattleEnd({ won, finalPlayerTeam }) {
    if (!pendingBattle) return
    const node = pendingBattle.node
    const isBoss = node.type === NODE_TYPES.BOSS
    const isMasterBall = node.type === NODE_TYPES.MASTER_BALL
    const legendary = pendingBattle.enemyTeam[0]
    const levelsGained = node.type === NODE_TYPES.GRASS ? 1 : 2

    if (won) {
      const { roster: updatedRoster, evolutionNotices: notices } =
        await applyBattleVictory(finalPlayerTeam, { levelsGained, fullHeal: isBoss })
      // Each evolved form is a new owned species for the Pokédex.
      notices.forEach(n => onSpeciesOwned?.(n.pokeId))

      setRoster(updatedRoster)
      if (notices.length > 0) setEvolutionNotices(notices)
      setPendingBattle(null)

      if (isMasterBall) {
        // Beat the legendary → offer the catch (reuses the Pokéball catch UI).
        // The node is cleared by the catch screen (pick or decline). Tag it
        // legendary so the catch card shows the legendary-tier glow.
        setPendingLegendary({ node, offered: [{ ...legendary, rarity: 'legendary' }] })
      } else if (isBoss && config.maps[mapIndex + 1]) {
        onMapCleared?.()
        onBadgeEarned?.(mapIndex)
        onAdvanceMap()
      } else if (isBoss && config.eliteFour) {
        // Final gym beaten — the run continues into the Elite Four stage
        // (roster is already full-healed by the boss win above).
        onMapCleared?.()
        onBadgeEarned?.(mapIndex)
        onEnterEliteFour?.()
      } else if (isBoss) {
        onMapCleared?.()
        onBadgeEarned?.(mapIndex)
        onRunEnd?.('win')
        setClearedNodes(prev => new Set([...prev, node.id]))
        setCurrentNode(node.id)
      } else {
        setClearedNodes(prev => new Set([...prev, node.id]))
        setCurrentNode(node.id)
      }
    } else {
      // Adopt the sim's final team wholesale — it's in battle order, which may
      // have been reordered on the prep screen; merging by index against the
      // old order would put HP/fainted on the wrong Pokémon.
      setRoster(finalPlayerTeam.map(fp => ({ ...fp })))
      onRunEnd?.('loss')
      setPendingBattle(null)
    }
  }

  function handlePokeballPick({ pokemon, swapIndex }) {
    if (!pendingPokeball) return
    const node = pendingPokeball.node
    if (swapIndex !== null) {
      setRoster(prev => prev.map((p, i) => i === swapIndex ? pokemon : p))
    } else {
      setRoster(prev => prev.length < 6 ? [...prev, pokemon] : prev)
    }
    onPokemonCaught?.(pokemon.pokeId)
    onCatchRecorded?.(pokemon)
    setClearedNodes(prev => new Set([...prev, node.id]))
    setCurrentNode(node.id)
    setPendingPokeball(null)
  }

  // Catch a defeated legendary — mirrors handlePokeballPick but for the
  // pendingLegendary offer (single Pokémon, roster-full swap supported).
  function handleLegendaryCatch({ pokemon, swapIndex }) {
    if (!pendingLegendary) return
    const node = pendingLegendary.node
    if (swapIndex !== null) {
      setRoster(prev => prev.map((p, i) => i === swapIndex ? pokemon : p))
    } else {
      setRoster(prev => prev.length < 6 ? [...prev, pokemon] : prev)
    }
    onPokemonCaught?.(pokemon.pokeId)
    onCatchRecorded?.(pokemon)
    setClearedNodes(prev => new Set([...prev, node.id]))
    setCurrentNode(node.id)
    setPendingLegendary(null)
  }

  function getIcon(node, isCurrentNode) {
    if (isCurrentNode && character) return character.sprite
    if (node.type === NODE_TYPES.TRAINER || node.type === NODE_TYPES.BOSS) {
      return config.trainerSprites[node.trainer] || ITEM_ICONS[NODE_TYPES.POKEBALL]
    }
    if (node.type === NODE_TYPES.GRASS) return mapConfig.grassIcon
    return ITEM_ICONS[node.type]
  }

  function getNodeLabel(node) {
    if (node.type === NODE_TYPES.TRAINER) {
      // Trainer teams are drawn from the map's species pool at battle time, so
      // the exact team isn't known here — show the route's typical variety.
      // Types come from the prewarmed base cache (see prewarmCache/cachedType).
      const pools = config.trainerSpeciesPools ?? []
      const pool = pools[Math.min(mapIndex, pools.length - 1)] ?? []
      const types = [...new Set(pool.map(id => cachedType(id)).filter(Boolean))]
      const typeLine = types.length === 1 ? `${types[0]} type` : types.length > 1 ? 'various types' : null
      // Types line (if known), then the level-reward line.
      const sub = [...(typeLine ? [typeLine] : []), '+2 levels to all mon']
      return { title: node.trainer ?? 'Trainer', sub }
    }
    if (node.type === NODE_TYPES.BOSS) {
      const team = config.bossTeams?.[node.trainer] ?? []
      // Object lines carry the type so the tooltip can show a colored type chip
      // to the left of each Pokémon's name (type/name from the base cache).
      const sub = team.map(p => ({
        type: cachedType(p.id),
        name: cachedName(p.id) ?? '???',
        level: p.level,
      }))
      return { title: node.trainer ?? 'Gym Leader', sub }
    }
    if (node.type === NODE_TYPES.MASTER_BALL) {
      // The exact legendary is rolled at battle time, so hide its identity (???)
      // but show the level (or range) drawn from this map's legendary pool.
      const pool = config.legendaryPools?.[mapIndex] ?? []
      const levels = pool.map(l => l.level)
      const lo = levels.length ? Math.min(...levels) : null
      const hi = levels.length ? Math.max(...levels) : null
      const lvl = lo == null ? '?' : lo === hi ? `${lo}` : `${lo}–${hi}`
      // Object line reuses the boss tooltip's { type, name, level } row format.
      return { title: 'Master Ball', sub: [{ type: null, name: '???', level: lvl }] }
    }
    switch (node.type) {
      case NODE_TYPES.GRASS:         return { title: 'Tall Grass', sub: '+1 LVL' }
      case NODE_TYPES.POKEBALL:      return { title: 'Poké Ball', sub: 'Catch a Pokémon' }
      case NODE_TYPES.ITEM:          return { title: 'Item', sub: 'Select an item' }
      case NODE_TYPES.POWER_UPGRADE: return { title: 'TM', sub: 'Upgrade a move' }
      case NODE_TYPES.POKECENTER:    return { title: 'Pokémon Center', sub: 'Full heal' }
      case NODE_TYPES.MYSTERY:       return { title: 'Mystery', sub: '???' }
      default:                       return { title: node.type, sub: '' }
    }
  }

  // The card now matches the background image's aspect ratio, which may differ
  // from the node layout's (svgWidth:svgHeight). So we stretch node POSITIONS
  // independently on each axis to fill the card (scaleX/scaleY), while node
  // ICONS stay square by sizing to the smaller axis scale (mapScale) so sprites
  // never distort.
  const scaleX = containerSize.w ? containerSize.w / svgWidth : 0
  const scaleY = containerSize.h ? containerSize.h / svgHeight : 0
  const mapScale = Math.min(scaleX, scaleY) || scaleX
  const mapOffsetX = 0
  const mapOffsetY = 0

  // Mobile: fit an (image-aspect-ratio) card inside the measured slot, bound by
  // whichever axis is tighter — width for wide maps, height for tall maps — so
  // the whole map shows centered with no distortion (desktop gets this via the
  // aspect-locked card whose width can grow freely).
  const mobileCard = (() => {
    const ratio = bgRatio || svgWidth / svgHeight
    const { w, h } = mobileSlot
    if (!w || !h) return null
    const width = Math.min(w, h * ratio)
    return { width, height: width / ratio }
  })()

  const mapSvgProps = {
    dark, borderStyle, shadowStyle,
    nodePositions, edges, svgWidth, svgHeight,
    clearedNodes, currentNode, loadingNode, hoveredNode,
    mapContainerRef, holdTimerRef, holdActivatedRef,
    setContainerSize, setHoveredNode,
    handleNodeClick, getIcon, getNodeLabel, isReachable, isLocked,
    mapScale, scaleX, scaleY, mapOffsetX, mapOffsetY,
    background: mapConfig.background,
  }

  const swapRoster = swapInRoster(setRoster)

  // --- Held-item movement (bag drag + stat-card picker) ---
  const isMovingItem = !!movingItem
  // Resolve a pending move onto a target (a roster Pokémon or the bag).
  function resolveItemMove(to) {
    if (!movingItem) return
    onMoveItem?.({ item: movingItem.item, from: movingItem.from, to })
    setMovingItem(null)
  }
  const cancelItemMove = () => setMovingItem(null)

  // Skip directly to the next map (mirrors the boss-clear advance). On the
  // last map, skip into the Elite Four stage when the region has one.
  const handleSkipMap = config.maps[mapIndex + 1]
    ? () => { onMapCleared?.(); onAdvanceMap() }
    : config.eliteFour
      ? () => { onMapCleared?.(); onEnterEliteFour?.() }
      : null

  return (
    <Layout onHome={onBack} onRestart={onRestart} onSkipMap={handleSkipMap} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen}>
      {isDesktop ? (
        <div className="flex flex-col items-center gap-2 w-full" style={{ flex: 1, minHeight: 0, visibility: pendingBattle ? 'hidden' : 'visible' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '12px', flex: 1, minHeight: 0, padding: `${MAP_PAD_Y}px 0` }}>
            {/* Left column: roster on top, bag directly below it. */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <Roster
                roster={roster}
                onSwap={swapRoster}
                itemTargeting={isMovingItem}
                onPickTarget={pokeIndex => resolveItemMove({ kind: 'pokemon', pokeIndex })}
                onShowItemInfo={(item, pokeIndex) => setInfoItem({ item, from: { kind: 'pokemon', pokeIndex } })}
              />
              {/* Bag — drag an item onto a Pokémon to equip it. During an item
                  move, the whole panel is a drop target for stowing back to bag. */}
              <div
                onClick={() => { if (isMovingItem) resolveItemMove({ kind: 'bag' }) }}
                onDragOver={e => { if (isMovingItem) e.preventDefault() }}
                onDrop={e => { if (isMovingItem) { e.preventDefault(); resolveItemMove({ kind: 'bag' }) } }}
                style={{
                  width: '90px',
                  border: isMovingItem ? '2px solid #facc15' : (dark ? '2px solid #121212' : '2px solid #666666'),
                  boxShadow: isMovingItem ? '0 0 8px 2px rgba(250,204,21,0.5)' : (dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #666666'),
                  backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', flexShrink: 0,
                  cursor: isMovingItem ? 'pointer' : 'default',
                }}
              >
                <div style={{ backgroundColor: '#facc15', padding: '3px 10px', width: '100%', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#1a1a1a' }}>BAG</span>
                </div>
                {bag && bag.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '4px' }}>
                    {bag.map((item, i) => {
                      const picked = movingItem?.from?.kind === 'bag' && movingItem.from.index === i
                      return (
                        <div
                          key={i}
                          draggable
                          onDragStart={() => setMovingItem({ item, from: { kind: 'bag', index: i } })}
                          onDragEnd={() => setMovingItem(null)}
                          // Click opens the item's info popup (with an Equip action);
                          // dragging still equips directly onto a Pokémon.
                          onClick={e => { e.stopPropagation(); setInfoItem({ item, from: { kind: 'bag', index: i } }) }}
                          title={`${item.name} — drag onto a Pokémon or click for info`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 2px',
                            cursor: 'grab', borderRadius: '2px',
                            outline: picked ? '2px solid #facc15' : 'none',
                            opacity: picked ? 0.6 : 1,
                          }}
                        >
                          <img src={itemIconUrl(item)} alt={item.name} style={{ width: '20px', height: '20px', imageRendering: 'pixelated', flexShrink: 0, pointerEvents: 'none' }} />
                          <span style={{ fontFamily: 'Upheaval', fontSize: '7px', color: dark ? '#DBDBDB' : '#333', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
                            {item.name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: dark ? '#555' : '#aaa', padding: '6px 4px', textAlign: 'center' }}>— empty —</span>
                )}
              </div>
            </div>
            {/* Map card — height fills the content row; width follows the
                background image's aspect ratio (so the whole image shows and
                nodes sit on it), falling back to the node-layout ratio until the
                image's size is known. The card + nodes scale with browser height. */}
            <div style={{
              height: '100%',
              aspectRatio: bgRatio ? `${bgRatio}` : `${svgWidth} / ${svgHeight}`,
              alignSelf: 'stretch',
              display: 'flex', flexDirection: 'column',
              flexShrink: 0,
            }}>
              <MapSvg {...mapSvgProps} />
            </div>
            {/* Right column: gym badges earned this run. */}
            <BadgeList badges={config.badges ?? []} earned={mapIndex} layout="vertical" />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, backgroundColor: dark ? '#1a1a1a' : '#c8c8c8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '8px 0 8px' }}>
          {/* Map slot — fills the height above the Bag + Roster rows and centers
              the card. The card is sized (in JS) to the image's aspect ratio, fit
              to whichever slot axis binds, so the whole map shows centered with no
              distortion (mirrors desktop). */}
          <div ref={mobileSlotRef} style={{ flex: 1, minHeight: 0, marginBottom: '6px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{
              width: mobileCard ? `${mobileCard.width}px` : '100%',
              height: mobileCard ? `${mobileCard.height}px` : '100%',
              display: 'flex', flexDirection: 'column',
            }}>
              <MapSvg {...mapSvgProps} />
            </div>
          </div>
          {/* Bottom bars (constrained to the map width): roster, then bag, then a
              horizontal gym-badge bar — all full-width, stacked. */}
          <div style={{
            width: mobileCard ? `${mobileCard.width}px` : '100%', maxWidth: '100%',
            display: 'flex', flexDirection: 'column', gap: '6px',
          }}>
            <Roster
              roster={roster}
              horizontal
              fullWidth
              onSwap={(a, b) => setRoster(prev => { const r = [...prev]; [r[a], r[b]] = [r[b], r[a]]; return r })}
              itemTargeting={isMovingItem}
              onPickTarget={pokeIndex => resolveItemMove({ kind: 'pokemon', pokeIndex })}
              onShowItemInfo={(item, pokeIndex) => setInfoItem({ item, from: { kind: 'pokemon', pokeIndex } })}
            />
            {/* Bag — drag an item onto a Pokémon to equip (as on desktop), or tap
                to pick it up then tap a Pokémon. Drop here to stow back. */}
            <div
              onClick={() => { if (isMovingItem) resolveItemMove({ kind: 'bag' }) }}
              onDragOver={e => { if (isMovingItem) e.preventDefault() }}
              onDrop={e => { if (isMovingItem) { e.preventDefault(); resolveItemMove({ kind: 'bag' }) } }}
              style={{
                flexShrink: 0,
                border: isMovingItem ? '2px solid #facc15' : borderStyle,
                boxShadow: isMovingItem ? '0 0 8px 2px rgba(250,204,21,0.5)' : (dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666666'),
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
                    // Tap opens the item's info popup (which has an Equip action);
                    // dragging still equips directly onto a Pokémon.
                    onClick={e => { e.stopPropagation(); setInfoItem({ item, from: { kind: 'bag', index: i } }) }}
                    style={{
                      width: '22px', height: '22px', imageRendering: 'pixelated', flexShrink: 0, cursor: 'grab',
                      outline: picked ? '2px solid #facc15' : 'none', opacity: picked ? 0.6 : 1,
                    }}
                  />
                )
              }) : (
                <span style={{ fontFamily: 'Upheaval', fontSize: '8px', color: dark ? '#555' : '#aaa' }}>— empty —</span>
              )}
            </div>
            {/* Gym badges earned this run — horizontal bar. */}
            <BadgeList badges={config.badges ?? []} earned={mapIndex} layout="horizontal" />
          </div>
        </div>
      )}

      {/* Item-move targeting banner — shown while placing an item. */}
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
            onClick={cancelItemMove}
            style={{ fontFamily: 'Upheaval', fontSize: '10px', color: '#1a1a1a', backgroundColor: '#facc15', border: 'none', padding: '4px 10px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Item info popup — opened by clicking a bag item or a Pokémon's held
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

      {pendingBattle && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BattleCard
            node={pendingBattle.node}
            enemyTeam={pendingBattle.enemyTeam}
            trainerSprite={pendingBattle.trainerSprite}
            playerRoster={roster}
            character={character}
            damageMultiplier={config.damageMultiplier ?? 2}
            onBattleEnd={handleBattleEnd}
            onDefeat={() => onRunEnd?.('loss')}
            onRestart={onRestart}
          />
        </div>
      )}

      <EvolutionNotice notices={evolutionNotices} onDismiss={() => setEvolutionNotices([])} />


      {pendingPokeball && (
        <PokeballNode
          offered={pendingPokeball.offered}
          roster={roster}
          caughtSet={caughtSet}
          onPick={handlePokeballPick}
          onClose={() => {
            setClearedNodes(prev => new Set([...prev, pendingPokeball.node.id]))
            setCurrentNode(pendingPokeball.node.id)
            setPendingPokeball(null)
          }}
        />
      )}

      {pendingLegendary && (
        <PokeballNode
          offered={pendingLegendary.offered}
          roster={roster}
          caughtSet={caughtSet}
          onPick={handleLegendaryCatch}
          onClose={() => {
            setClearedNodes(prev => new Set([...prev, pendingLegendary.node.id]))
            setCurrentNode(pendingLegendary.node.id)
            setPendingLegendary(null)
          }}
        />
      )}

      {pendingItem && (
        <ItemNode
          offered={pendingItem.offered}
          roster={roster}
          onAssign={(item, pokemonIndex, swapBackItem) => {
            onItemAssign(item, pokemonIndex, swapBackItem)
            setClearedNodes(prev => new Set([...prev, pendingItem.node.id]))
            setCurrentNode(pendingItem.node.id)
            setPendingItem(null)
          }}
          onKeepInBag={(item) => {
            onItemKeepInBag(item)
            setClearedNodes(prev => new Set([...prev, pendingItem.node.id]))
            setCurrentNode(pendingItem.node.id)
            setPendingItem(null)
          }}
          onClose={() => {
            setClearedNodes(prev => new Set([...prev, pendingItem.node.id]))
            setCurrentNode(pendingItem.node.id)
            setPendingItem(null)
          }}
        />
      )}

      {pendingPower && (
        <PowerUpgradeNode
          roster={roster}
          onUpgrade={(pokemonIndex) => {
            setRoster(prev => prev.map((p, i) => {
              if (i !== pokemonIndex) return p
              const nextTier = Math.min(4, (p.move?.tier ?? 1) + 1)
              return { ...p, move: getTypeMove(p.types[0], nextTier) }
            }))
            setClearedNodes(prev => new Set([...prev, pendingPower.node.id]))
            setCurrentNode(pendingPower.node.id)
            setPendingPower(null)
          }}
          onClose={() => {
            setClearedNodes(prev => new Set([...prev, pendingPower.node.id]))
            setCurrentNode(pendingPower.node.id)
            setPendingPower(null)
          }}
        />
      )}
    </Layout>
  )
}
