import { useState, useMemo, useRef, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { cash, muted, accent } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useBagTouchDrag } from '../lib/useBagTouchDrag.js'
import Layout from './Layout'
import Roster from './Roster'
import BattleCard from './BattleCard'
import PokeballNode from './PokeballNode'
import ItemNode from './ItemNode'
import PokemartNode from './PokemartNode'
import PowerUpgradeNode from './PowerUpgradeNode'
import BadgeList from './BadgeList'
import ItemInfoCard from './ItemInfoCard'
import { NODE_TYPES, pick, resolveMysteryType } from '../game/nodeMap.js'
import { rivalTeamSpecs } from '../game/rivals.js'
import { filterPoolByMap } from '../game/trainerPools.js'
import { withRng, deriveSeed } from '../game/rng.js'
import { pickThreeItems, itemIconUrl, isRosterConsumable } from '../game/items.js'
import { getShopInventory } from '../game/shop.js'
import { getRegionConfig } from '../game/regionRegistry.js'
import { fetchPokemonBase, buildPokemonInstance, cachedType, cachedName, rollStageForLevel, currentMoveType, swapIntoRoster, GEN_MAX_ID } from '../game/pokemon.js'
import { useEvolutionFlow } from '../lib/useEvolutionFlow.jsx'
import { getRegionBalance } from '../lib/regionBalance'
import { getTypeMove } from '../game/typeMoves.js'
import { TYPE_COLORS } from '../game/types.js'
import { buildTrainerTeamSpec, pickTrainerCount, mapLevelRange, pickLevel } from '../game/battleTeams.js'
import { BALANCE } from '../game/balance.js'
import { getEffectiveBalance, getActiveExtras } from '../game/metaModifiers.js'
import { swapInRoster } from '../game/roster.js'
// The mystery-node icon. (Renamed from the original "?.png" — a literal "?" in
// a filename can't be imported, since "?" is the query separator in a specifier.)
import mysteryIcon from '../assets/Icons/mysteryIcon2.png'
import pokecenterIcon from '../assets/pokecenter.png'
import pokemartIcon from '../assets/pokemart.png'

let isTouchDevice = false
window.addEventListener('touchstart', () => { isTouchDevice = true }, { once: true, passive: true })

const ITEM_ICONS = {
  [NODE_TYPES.POKEBALL]:      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png',
  [NODE_TYPES.MASTER_BALL]:   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/master-ball.png',
  [NODE_TYPES.ITEM]:          'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/potion.png',
  [NODE_TYPES.POWER_UPGRADE]: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/tm-normal.png',
  [NODE_TYPES.POKECENTER]:    pokecenterIcon,
  [NODE_TYPES.POKEMART]:      pokemartIcon,
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
// bigger than regular nodes. Stacks on top of NODE_SCALE. Rivals render at the
// same size — both are major fights.
const BOSS_SCALE = 1.4
const isBossSized = type => type === NODE_TYPES.BOSS || type === NODE_TYPES.RIVAL
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
  mapScale, scaleX, scaleY, mapOffsetX, mapOffsetY, background, bgKnown,
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

  // The first reachable node, in render order — carries the tutorial marker so
  // the first-run coachmark can spotlight a node the player can actually click.
  const firstReachableNodeId = Object.values(nodePositions)
    .find(({ node }) => !clearedNodes.has(node.id) && isReachable(node.id))?.node.id

  // The first Pokémart on the map, for the tutorial's "spend it here" step.
  // Not filtered by reachability: the step explains what the shop IS, and a
  // mart three rows up is still the thing being pointed at. Undefined when the
  // map rolled no mart, which TutorialOverlay treats as a skipped step.
  const firstMartNodeId = Object.values(nodePositions)
    .find(({ node }) => node.type === NODE_TYPES.POKEMART)?.node.id

  return (
    <div
      ref={mapContainerRef}
      className="relative overflow-hidden"
      style={{ flex: 1, minHeight: 0, border: borderStyle, boxShadow: shadowStyle }}
    >
      <style>{`@keyframes nodeSpin { to { transform: rotate(360deg); } }`}</style>
      {/* `cover` once the card is sized to THIS image's ratio, `contain` until
          then.

          The card is sized from bgRatio, so cover and contain agree on how the
          art should look — but they disagree about rounding. Card height is
          `width / ratio`, a float that layout rounds, and contain answers a
          sub-pixel mismatch by letterboxing; with objectPosition 'top center'
          the whole remainder collected at the BOTTOM, as a hairline strip
          between the art and the card's stroke. cover answers the same mismatch
          by overflowing, which the parent's overflow-hidden clips, so the art
          reaches the stroke on all four sides. The overflow is the rounding
          error itself — well under a pixel — so nothing real is cropped.

          That argument only holds while the card actually has the image's
          ratio. bgRatio resets to null on every map change (not just first
          load), and the card falls back to the NODE layout's ratio, which
          genuinely differs — cover there would crop real art. So the fallback
          keeps contain and accepts the letterbox for the frame or two before
          the image reports its size. */}
      <img
        src={background}
        alt="map background"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: bgKnown ? 'cover' : 'contain', objectPosition: 'top center', imageRendering: 'pixelated', filter: 'brightness(0.9)' }}
      />
      <svg
        width="100%"
        height="100%"
        viewBox={`${-svgWidth / 2} 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        <defs>
          {/* The overworld sprites are 3×4 walk-cycle sheets; we show only the
              top-left (down-facing, standing) frame. The image below is scaled
              so one frame ≈ one node, offset to origin, then clipped to exactly
              that frame — otherwise the top of the next row bleeds in under the
              sprite's feet. The drop shadow lives on the outer <g> (unclipped),
              so it still extends past this tight frame box. */}
          <clipPath id="trainer-clip">
            <rect
              x={-NODE_SIZE * 0.083} y={-NODE_SIZE * 0.075}
              width={(NODE_SIZE * 3.5) / 3} height={(NODE_SIZE * 4.5) / 4}
            />
          </clipPath>
          {/* Item/pokéball/grass nodes. These draw at NODE_SIZE (or 0.7x for
              grass) — roughly a THIRD the box the trainer sheet uses — and
              filter primitives are in user-space units, so reusing the trainer
              values here produced a shadow far too small and diffuse to read
              against the map. Scaled up to match the trainers' apparent weight. */}
          <filter id="node-shadow" x="-80%" y="-80%" width="260%" height="260%">
            {/* Larger, softer, subtler shadow behind the tight one */}
            <feDropShadow dx="2" dy="5" stdDeviation="5" floodColor="rgba(0,0,0,0.4)" />
            <feDropShadow dx="1" dy="2" stdDeviation="1.5" floodColor="rgba(0,0,0,0.95)" />
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
          {/* Resting outline for the immediately-available (reachable) nodes —
              white stroke plus a soft gold glow, so the player sees where they
              can go next. Hover upgrades to #hover-outline (stronger glow). */}
          <filter id="white-outline" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="expanded" />
            <feFlood floodColor="#ffffff" result="white" />
            <feComposite in="white" in2="expanded" operator="in" result="outline" />
            {/* Soft gold glow — a single gentle bloom, clearly visible but not
                overpowering, to signal the node is reachable. */}
            <feDropShadow dx="0" dy="0" stdDeviation="4.5" floodColor="#facc15" floodOpacity="0.85" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="outline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Small-node (item/pokéball/grass) variants of the two outline
              filters. Same look as the trainer ones, but the filter region is
              widened so the yellow glow isn't clipped on these much smaller
              boxes, and the shadow is merged in — the outline filters replace
              #node-shadow when a node is reachable/hovered, so without this the
              drop shadow would vanish exactly on the nodes the player can reach. */}
          <filter id="hover-outline-sm" x="-80%" y="-80%" width="260%" height="260%" colorInterpolationFilters="sRGB">
            <feDropShadow in="SourceGraphic" dx="2" dy="5" stdDeviation="5" floodColor="rgba(0,0,0,0.4)" result="shadowed" />
            <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="expanded" />
            <feFlood floodColor="#ffffff" result="white" />
            <feComposite in="white" in2="expanded" operator="in" result="outline" />
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#facc15" floodOpacity="0.9" result="glow" />
            <feMerge>
              <feMergeNode in="shadowed" />
              <feMergeNode in="glow" />
              <feMergeNode in="outline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="white-outline-sm" x="-80%" y="-80%" width="260%" height="260%" colorInterpolationFilters="sRGB">
            <feDropShadow in="SourceGraphic" dx="2" dy="5" stdDeviation="5" floodColor="rgba(0,0,0,0.4)" result="shadowed" />
            <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="expanded" />
            <feFlood floodColor="#ffffff" result="white" />
            <feComposite in="white" in2="expanded" operator="in" result="outline" />
            {/* Soft gold glow — see #white-outline. */}
            <feDropShadow dx="0" dy="0" stdDeviation="4.5" floodColor="#facc15" floodOpacity="0.85" result="glow" />
            <feMerge>
              <feMergeNode in="shadowed" />
              <feMergeNode in="glow" />
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
          const isTrainerNode = node.type === NODE_TYPES.TRAINER || node.type === NODE_TYPES.BOSS || node.type === NODE_TYPES.RIVAL
          // Gym leaders + rivals render larger than everything else.
          const nodeScale = NODE_SCALE * (isBossSized(node.type) ? BOSS_SCALE : 1)
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
                <g filter={isHovered ? 'url(#hover-outline)' : reachable ? 'url(#white-outline)' : 'url(#trainer-shadow)'}>
                  <image href={icon}
                    clipPath="url(#trainer-clip)"
                    x={-NODE_SIZE * 0.083} y={-NODE_SIZE * 0.075}
                    width={NODE_SIZE * 3.5} height={NODE_SIZE * 4.5}
                    style={{ imageRendering: 'pixelated', opacity }}
                  />
                </g>
              ) : (() => {
                // Per-type icon scale. Grass has always run small; the mart is
                // trimmed to 0.9 because its source art fills more of its
                // canvas than pokecenter.png does (453x441 of drawn building
                // vs 256x256 with margin), so at an equal box it rendered
                // visibly larger than the Pokécenter sharing its row. Row 7 is
                // a fork between those two, and one looking bigger reads as
                // one being more important.
                const ICON_SCALE = { [NODE_TYPES.GRASS]: 0.7, [NODE_TYPES.POKEMART]: 0.9 }
                const scale = ICON_SCALE[node.type] ?? 1
                const size = NODE_SIZE * scale
                // Shrunk icons stay centered on the node point rather than
                // hanging off its top-left corner.
                const offset = (NODE_SIZE - size) / 2
                return (
                  <image href={icon} x={offset} y={offset}
                    width={size} height={size}
                    filter={isHovered ? 'url(#hover-outline-sm)' : reachable ? 'url(#white-outline-sm)' : 'url(#node-shadow)'}
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
        // Tag the first reachable node so the first-run tutorial can spotlight it
        // ("click here to begin"). Only one node carries the marker.
        const isTutorialTarget = reachable && node.id === firstReachableNodeId
        // Likewise for the first Pokémart anywhere on the map, so the tutorial
        // can point at where Speed Cash gets spent. Unlike firstNode this one
        // need not be reachable — the player has to SEE the shop, not walk to
        // it — and a map may have no mart at all, which TutorialOverlay handles
        // by skipping the step.
        const isMartTutorialTarget = node.id === firstMartNodeId
        const { px, py } = toPixel(x, y)
        const size = NODE_SIZE * mapScale * NODE_SCALE * (isBossSized(node.type) ? BOSS_SCALE : 1)
        const isHovered = hoveredNode?.id === node.id
        // Only the hovered node shows a tooltip, so only it needs the label
        // (which does boss-team cachedType/cachedName lookups). Skip the work
        // for every other node on every render.
        const { title, sub } = isHovered ? getNodeLabel(node) : { title: null, sub: null }
        return (
          <button
            key={node.id}
            data-tutorial={isTutorialTarget ? 'firstNode' : isMartTutorialTarget ? 'mart' : undefined}
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
            {loadingNode === node.id && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none', zIndex: 12,
              }}>
                <div style={{
                  width: size * 0.42, height: size * 0.42,
                  border: `${Math.max(2, size * 0.06)}px solid rgba(0,0,0,0.25)`,
                  borderTopColor: '#facc15',
                  borderRadius: '50%',
                  animation: 'nodeSpin 0.7s linear infinite',
                }} />
              </div>
            )}
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
                            fontFamily: 'Mona Sans, sans-serif', fontWeight: 400, fontSize: '10px', color: '#1a1a1a',
                            backgroundColor: TYPE_COLORS[line.type] ?? '#888',
                            border: '1px solid #000', boxShadow: '2px 2px 0 #000',
                            padding: '2px 6px', textTransform: 'capitalize', flexShrink: 0,
                          }}>
                            {line.type}
                          </span>
                        )}
                        <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: accent(dark), textTransform: 'capitalize' }}>
                          {line.name} lv.{line.level}
                        </span>
                      </div>
                    )
                    : <div key={i} style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: accent(dark), lineHeight: '1.5' }}>{line}</div>
                  )
                  : <div style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: accent(dark), marginTop: '2px' }}>{sub}</div>
                }
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default function NodeMap({ region, starter, character, roster, setRoster, bag, onItemAssign, onItemKeepInBag, onMoveItem, onApplyConsumable, speedCash = 0, cashEarned = 0, metacashEarned = 0, keysEarned = 0, payoutSaved = true, mapsCleared = 0, onEarnCash, onSpendCash, mapIndex = 0, onBack, onRestart, runItBackAvailable = false, onRunItBack, onAdvanceMap, onEnterEliteFour, onPokemonCaught, onCatchRecorded, onSpeciesOwned, onSpeciesSeen, caughtSet, onMapCleared, onBadgeEarned, onRunEnd, onProgressChange, initialMapData, initialClearedNodes, initialCurrentNode, pokedexOpen, setPokedexOpen, seedCode, seed }) {
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
  // Species ceiling for this region's generation — keeps catch offers and
  // themed trainer teams from rolling into a later-gen regional form (e.g.
  // Kanto Meowth → Perrserker). Same gate useEvolutionFlow applies post-battle.
  const maxSpeciesId = GEN_MAX_ID[config?.generation] ?? Infinity

  // Use the restored layout when resuming a saved run (its generate() is random,
  // so re-generating would give a DIFFERENT map). Only reuse it if it's for this
  // same map index, otherwise generate fresh.
  //
  // For a SEEDED run, generate the map from a per-map derived seed so it is
  // reproducible regardless of how many shared-stream rng() calls happened
  // before (the starter's async shiny roll, prior battles, etc.). Unseeded runs
  // generate straight off the shared Math.random stream as before.
  const mapData = useMemo(
    () => {
      if (initialMapData && initialMapData.mapIndex === mapIndex) return initialMapData
      if (seed != null) return withRng(deriveSeed(seed, mapIndex), () => mapConfig.generate(starter))
      return mapConfig.generate(starter)
    },
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
  const [pendingMart, setPendingMart] = useState(null)
  // Remaining shop stock per mart node id, so a shelf survives Leave and
  // re-entry. Lives here rather than in PokemartNode because that component
  // unmounts on close, and a shop the player can return to has to remember
  // what they already bought. { [nodeId]: number[] }
  const [martStock, setMartStock] = useState({})
  const [rerolling, setRerolling] = useState(false)

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
  const evo = useEvolutionFlow({ config, roster, setRoster, onSpeciesOwned })
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
  // Height of the Roster/Bag/badge stack. The map ruler stops short of it, so
  // the card is fitted to the space that is genuinely available rather than to
  // the whole column. Starts at 0: the first paint over-reports by the stack's
  // height, the ResizeObserver corrects it on the next frame.
  const [mobileBarsHeight, setMobileBarsHeight] = useState(0)
  const mobileBarsRef = useRef(null)
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

  // Measure the Roster/Bag/badge stack so the ruler above can stop short of it.
  // Separate observer from the slot's: this one watches a real, in-flow element
  // whose height changes when the bag scrolls or badges are earned.
  useEffect(() => {
    const el = mobileBarsRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setMobileBarsHeight(entry.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [isDesktop])

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'

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
    const isRival = node.type === NODE_TYPES.RIVAL
    const totalNodes = Object.keys(nodePositions).length
    const positionWeight = node.id / totalNodes

    let specs
    if (isBoss) {
      specs = config.bossTeams?.[node.trainer] ?? []
    } else if (isRival) {
      // Rival: a fixed authored team selected by the node's rivalTeam variant,
      // plus the rival's own starter (counters the player's pick) as the ace.
      specs = rivalTeamSpecs(config, node, starter)
    } else if (isMasterBall) {
      // Master Ball: a single legendary from this map's pool, at its fixed level
      // (not position-scaled). Empty pool → no legendary (caller clears the node).
      const pool = config.legendaryPools?.[mapIndex] ?? []
      specs = pool.length > 0 ? [pick(pool)] : []
    } else if (isTrainer) {
      const count = pickTrainerCount(mapIndex)
      const band = mapLevelRange(config.mapLevelRanges, mapIndex)
      // Prefer a pool themed to this trainer's class (e.g. Fisherman → Water);
      // themed pools are authored as base forms, so we roll each mon's evolution
      // stage by its level (same gating as catch nodes). Classes with no themed
      // pool fall back to the map's shared species pool (uniform, no roll).
      // Themed pools are gated by the region's speciesMinMap so a specialist
      // only sends out species the run has reached (no Alomomola on map 1).
      // Regions without the table pass through unchanged.
      const themedAll = config.trainerTypePools?.[node.trainer]
      const themed = themedAll?.length
        ? filterPoolByMap(themedAll, config.speciesMinMap, mapIndex)
        : themedAll
      const pool = themed?.length
        ? themed
        : config.trainerSpeciesPools?.[Math.min(mapIndex, (config.trainerSpeciesPools?.length ?? 1) - 1)] ?? []
      specs = buildTrainerTeamSpec(pool, band, count, positionWeight)
      if (themed?.length) {
        specs = await Promise.all(
          specs.map(async s => ({ ...s, id: await rollStageForLevel(s.id, s.level, maxSpeciesId) }))
        )
      }
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
    team.forEach(p => onSpeciesSeen?.(p.pokeId, !!p.shiny))

    const isGrass = node.type === NODE_TYPES.GRASS
    const trainerSprite = isGrass && team.length > 0
      ? team[0].sprite
      : config.trainerFullSprites?.[node.trainer]
        ?? config.characters?.find(c => c.name === node.trainer)?.sprite
        ?? null

    return { team, trainerSprite }
  }

  async function fetchOfferedPokemon(node) {
    const pool = config.catchPools?.[mapIndex] ?? []
    if (pool.length === 0) return []

    const totalNodes = Object.keys(nodePositions).length
    const positionWeight = node.id / totalNodes
    // Catch levels scale per map, weighted by node position. They read the
    // region's OWN catch bands (config.catchLevelRanges), NOT the trainer/grass
    // bands: tuning a map's difficulty must not change what the player catches
    // there. Regions that omit the table fall back to the trainer bands.
    // Note this level also gates the evolution-stage roll below.
    const catchBands = config.catchLevelRanges ?? config.mapLevelRanges
    const level = pickLevel(mapLevelRange(catchBands, mapIndex), positionWeight)

    // Draw distinct species weighted by rarity tier. Collector's Eye (meta
    // upgrade) raises the offer count from 3 to 4 — see metaModifiers.js.
    const chosen = config.pickCatchOffer(pool, getActiveExtras().catchOfferCount, config.catchTierBudget)

    const offered = await Promise.all(chosen.map(async ({ id, rarity }) => {
      // Roll which evolution stage of this line to offer. The pool entry names a
      // stage, but catch nodes present a random stage of its whole line: only
      // stages whose evolution level is at/below this node's catch level are
      // eligible (early maps → base forms only; late maps → any stage). Odds
      // favor the most-evolved eligible stage. Rarity stays the pool's. Grass
      // and trainers don't call this, so they're unaffected.
      const speciesId = await rollStageForLevel(id, level, maxSpeciesId)
      const base = await fetchPokemonBase(speciesId)
      const instance = buildPokemonInstance(base, level)
      return { ...instance, level, rarity }
    }))
    // Wild Pokémon offered at a Pokéball node count as "seen".
    offered.forEach(p => onSpeciesSeen?.(p.pokeId, !!p.shiny))
    return offered
  }

  // A Mystery ("?") node reveals a random encounter/reward on click. Resolve it
  // to a concrete node (grass / trainer / pokeball / item / legendary), equally
  // weighted, then run the normal click flow for that type. If it becomes a
  // trainer, borrow a trainer name from another trainer node on this map (which
  // was drawn from the region's route pool) so the sprite + species pool
  // resolve correctly — never a gym leader.
  const resolveMysteryNode = (node) => {
    // Only allow a legendary (Master Ball) outcome where this map actually has a
    // legendary pool — otherwise it would resolve to an empty battle and the
    // node would appear to do nothing.
    const hasLegendary = (config.legendaryPools?.[mapIndex]?.length ?? 0) > 0
    const type = resolveMysteryType({ allowLegendary: hasLegendary })
    // Tag the resolved node so the item / catch offer screens enable the
    // reroll button (MYSTERY_REROLLS uses) — the mystery bonus.
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
    // Re-entering a shop you are standing on. Leaving the mart advances
    // currentNode onto it (so row 7's Pokécenter is locked out — the row is a
    // fork), which normally makes a node unclickable: it is both cleared and
    // no longer "reachable", since reachability means an edge FROM the current
    // node. A mart is the one node with nothing irreversible behind it, so
    // stepping out to check a held item shouldn't cost you the shelf.
    if (rawNode.type === NODE_TYPES.POKEMART && rawNode.id === currentNode) {
      setPendingMart({
        node: rawNode,
        inventory: getShopInventory(config, mapIndex),
        stock: martStock[rawNode.id] ?? null,
      })
      return
    }
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
      || node.type === NODE_TYPES.RIVAL

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
      // The floor payout — paid for taking the node, whether or not the player
      // keeps anything. See BALANCE.economy.payouts.node. Reads the effective
      // balance so Side Hustle's +$10 applies (metaModifiers.js).
      onEarnCash?.(getEffectiveBalance().economy.payouts.node)
      if (offered.length > 0) {
        setPendingPokeball({ node, offered })
      } else {
        setClearedNodes(prev => new Set([...prev, node.id]))
        setCurrentNode(node.id)
      }
    } else if (node.type === NODE_TYPES.ITEM) {
      onEarnCash?.(getEffectiveBalance().economy.payouts.node)
      // Treasure Map (meta upgrade): item nodes roll +1 extra option.
      setPendingItem({ node, offered: pickThreeItems(3 + getActiveExtras().itemNodeExtraOptions) })
    } else if (node.type === NODE_TYPES.POKECENTER) {
      setRoster(prev => prev.map(p => ({ ...p, fainted: false, stats: { ...p.stats, hp: p.stats.maxHp } })))
      setClearedNodes(prev => new Set([...prev, node.id]))
      setCurrentNode(node.id)
    } else if (node.type === NODE_TYPES.POKEMART) {
      // The node is NOT cleared here — the shop's onClose clears it, matching
      // how pendingItem / pendingPower work. Clearing on open would let the
      // player walk on with the shop still up.
      // Stock is remembered per node id, because Leave no longer clears the
      // mart: without this, buying both Max Heals, leaving, and re-entering
      // would restore a full shelf and make stock limits meaningless.
      // Seeded from the inventory on first visit, then carried.
      setPendingMart({
        node,
        inventory: getShopInventory(config, mapIndex),
        stock: martStock[node.id] ?? null,
      })
    } else if (node.type === NODE_TYPES.POWER_UPGRADE) {
      onEarnCash?.(getEffectiveBalance().economy.payouts.node)
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
    const isRival = node.type === NODE_TYPES.RIVAL
    const legendary = pendingBattle.enemyTeam[0]
    // Rival grants a full heal + the most levels; grass the fewest. See BALANCE.
    const lv = BALANCE.progression.levelsGained
    const levelsGained = isRival ? lv.rival : node.type === NODE_TYPES.GRASS ? lv.grass : lv.default

    if (won) {
      // Bonded (meta upgrade): boss-fight survivors gain a bonus level, that
      // run only. Boss-only per spec — not rival, not grass/trainer.
      const bonusLevelsForSurvivors = isBoss ? getActiveExtras().bossSurvivorLevelBonus : 0
      const updatedRoster = await evo.applyVictory(finalPlayerTeam, { levelsGained, fullHeal: isBoss || isRival, bonusLevelsForSurvivors })

      // Speed Cash payout. Mirrors the levelsGained ladder above but inverted:
      // the fights that pay the fewest levels pay the most cash. See
      // BALANCE.economy.payouts for why.
      //
      // CRITICAL — the legendary payout lives HERE, in the `won` branch, and
      // never in handleLegendaryCatch: a Master Ball win leads to a catch offer
      // the player may DECLINE, and declining must not torch $250. The money is
      // for beating it, not for keeping it.
      const pay = BALANCE.economy.payouts
      onEarnCash?.(
        isRival ? pay.rival
        : isMasterBall ? pay.legendary
        : isBoss ? pay.boss
        : node.type === NODE_TYPES.GRASS ? pay.grass
        : pay.trainer
      )

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
        onRunEnd?.('win', updatedRoster)
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

  // Reroll a Mystery-node offer (the mystery bonus — MYSTERY_REROLLS uses per
  // offer, enforced by the offer components). The catch reroll re-runs the
  // full offer pipeline (fresh species draw, level, and evolution-stage
  // rolls); the item reroll simply redraws three items.
  async function rerollPokeballOffer() {
    if (!pendingPokeball || rerolling) return
    setRerolling(true)
    const offered = await fetchOfferedPokemon(pendingPokeball.node)
    setRerolling(false)
    // Keep the old offer if the redraw somehow came up empty (empty pool).
    if (offered.length > 0) setPendingPokeball(prev => ({ ...prev, offered }))
  }

  function rerollItemOffer() {
    // Mirrors the option count the original offer used (Treasure Map applies
    // here too) so a reroll can't silently shrink the choice back to 3.
    setPendingItem(prev => prev ? { ...prev, offered: pickThreeItems(3 + getActiveExtras().itemNodeExtraOptions) } : prev)
  }

  function handlePokeballPick({ pokemon, swapIndex }) {
    if (!pendingPokeball) return
    const node = pendingPokeball.node
    if (swapIndex !== null) {
      // swapIntoRoster, not a bare replace: the outgoing Pokémon's held item
      // transfers to the newcomer (and its move is rebuilt if that item is a
      // Polarity Band, whose retype depends on the holder's species).
      setRoster(prev => swapIntoRoster(prev, swapIndex, pokemon))
    } else {
      setRoster(prev => prev.length < getActiveExtras().partySize ? [...prev, pokemon] : prev)
    }
    onPokemonCaught?.(pokemon.pokeId, !!pokemon.shiny)
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
      // Same item transfer as handlePokeballPick — see the note there.
      setRoster(prev => swapIntoRoster(prev, swapIndex, pokemon))
    } else {
      setRoster(prev => prev.length < getActiveExtras().partySize ? [...prev, pokemon] : prev)
    }
    onPokemonCaught?.(pokemon.pokeId, !!pokemon.shiny)
    onCatchRecorded?.(pokemon)
    setClearedNodes(prev => new Set([...prev, node.id]))
    setCurrentNode(node.id)
    setPendingLegendary(null)
  }

  function getIcon(node, isCurrentNode) {
    if (isCurrentNode && character) return character.sprite
    if (node.type === NODE_TYPES.TRAINER || node.type === NODE_TYPES.BOSS || node.type === NODE_TYPES.RIVAL) {
      return config.trainerSprites[node.trainer] || ITEM_ICONS[NODE_TYPES.POKEBALL]
    }
    if (node.type === NODE_TYPES.GRASS) return mapConfig.grassIcon
    return ITEM_ICONS[node.type]
  }

  function getNodeLabel(node) {
    if (node.type === NODE_TYPES.TRAINER) {
      // Trainer teams are drawn at battle time, so the exact team isn't known
      // here — show the class's typical variety. A themed class shows its own
      // pool's types (usually one clean chip); others show the map pool's mix.
      // Types come from the prewarmed base cache (see prewarmCache/cachedType).
      const themed = config.trainerTypePools?.[node.trainer]
      const pools = config.trainerSpeciesPools ?? []
      const pool = themed?.length ? themed : (pools[Math.min(mapIndex, pools.length - 1)] ?? [])
      const types = [...new Set(pool.map(id => cachedType(id)).filter(Boolean))]
      const typeLine = types.length === 1 ? `${types[0]} type` : types.length > 1 ? 'various types' : null
      // Types line (if known), then the level-reward line.
      const sub = [...(typeLine ? [typeLine] : []), '+2 levels to all mon', `$${BALANCE.economy.payouts.trainer}`]
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
      return { title: node.trainer ?? 'Gym Leader', sub: [...sub, `$${BALANCE.economy.payouts.boss}`] }
    }
    if (node.type === NODE_TYPES.RIVAL) {
      // Same team-row format as a boss, plus the rival's reward line. Uses the
      // same resolver as the battle so the preview can't disagree with it.
      const team = rivalTeamSpecs(config, node, starter)
      const sub = team.map(p => ({
        type: cachedType(p.id),
        name: cachedName(p.id) ?? '???',
        level: p.level,
      }))
      return { title: node.trainer ?? 'Rival', sub: [...sub, `+4 levels + full heal · $${BALANCE.economy.payouts.rival}`] }
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
      return { title: 'Master Ball', sub: [{ type: null, name: '???', level: lvl }, `$${BALANCE.economy.payouts.legendary}`] }
    }
    const nodePay = getEffectiveBalance().economy.payouts.node
    switch (node.type) {
      case NODE_TYPES.GRASS:         return { title: 'Tall Grass', sub: `+1 LVL · $${BALANCE.economy.payouts.grass}` }
      case NODE_TYPES.POKEBALL:      return { title: 'Poké Ball', sub: `Catch a Pokémon · $${nodePay}` }
      case NODE_TYPES.ITEM:          return { title: 'Item', sub: `Select an item · $${nodePay}` }
      case NODE_TYPES.POWER_UPGRADE: return { title: 'TM', sub: `Upgrade a move · $${nodePay}` }
      case NODE_TYPES.POKECENTER:    return { title: 'Pokémon Center', sub: 'Full heal' }
      case NODE_TYPES.POKEMART:      return { title: 'Pokémart', sub: 'Spend Speed Cash' }
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
    dark, borderStyle,
    // Mobile drops the offset drop shadow: at near-full width it pushes the
    // card visually left and eats the 5px gutter. The border stays.
    shadowStyle: isDesktop ? shadowStyle : 'none',
    nodePositions, edges, svgWidth, svgHeight,
    clearedNodes, currentNode, loadingNode, hoveredNode,
    mapContainerRef, holdTimerRef, holdActivatedRef,
    setContainerSize, setHoveredNode,
    handleNodeClick, getIcon, getNodeLabel, isReachable, isLocked,
    mapScale, scaleX, scaleY, mapOffsetX, mapOffsetY,
    background: mapConfig.background,
    // Whether the card is sized to the image's own ratio yet — gates cover vs
    // contain on the background (see MapSvg).
    bgKnown: !!bgRatio,
  }

  const swapRoster = swapInRoster(setRoster)

  // --- Held-item movement (bag drag + stat-card picker) ---
  const isMovingItem = !!movingItem

  // Drop an item onto roster slot `pokeIndex`. Consumables are USED (and spent
  // only if they did something); everything else is equipped.
  //
  // Both drop paths route through here — the mouse/click path via
  // resolveItemMove, and the touch path via useBagTouchDrag's onDrop, which
  // bypasses resolveItemMove entirely. Keeping the decision in one function is
  // what stops the two from drifting: the touch path used to equip consumables as
  // dead held items because it only knew how to call onMoveItem.
  async function applyConsumableTo(item, from, pokeIndex) {
    // Healing consumables. A no-op (target already at full HP) KEEPS the item
    // rather than wasting it. Mega Revive ignores the target and heals all.
    if (isRosterConsumable(item)) {
      const used = onApplyConsumable?.(item, pokeIndex)
      if (used) onMoveItem?.({ item, from, to: { kind: 'consumed' } })
      // Kept, not consumed — say why, or the tap looks broken.
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
    // Evolve Stone: evolve and consume rather than equip. Kept if the target
    // has no evolution at all, so it isn't wasted.
    if (item?.consumable === 'evolve') {
      const used = await evo.evolveWithStone(pokeIndex)
      if (used) onMoveItem?.({ item, from, to: { kind: 'consumed' } })
      return
    }
    // Rare Candy: levels the target and may evolve it. Kept only if the target
    // is already at MAX_LEVEL, where the candy would do nothing.
    if (item?.consumable === 'level') {
      const used = await evo.useRareCandy(pokeIndex)
      if (used) onMoveItem?.({ item, from, to: { kind: 'consumed' } })
      else setNotice(`${roster[pokeIndex]?.name ?? 'That Pokémon'} is already max level`)
      return
    }
    onMoveItem?.({ item, from, to: { kind: 'pokemon', pokeIndex } })
  }

  // Resolve a pending move onto a target (a roster Pokémon or the bag).
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
  const cancelItemMove = () => setMovingItem(null)

  // Short message when an action does nothing (e.g. Max Heal on a fainted
  // Pokémon). Without it a kept item reads as a broken tap.
  const [notice, setNotice] = useState(null)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2200)
    return () => clearTimeout(t)
  }, [notice])

  // Touch drag-and-drop for bag items (HTML5 draggable doesn't fire on touch).
  // The gesture itself lives in the hook; this screen only says what a drop
  // MEANS. EliteFour wires the same hook the same way.
  const { bagTouchProps, ghostRef, ghostItem } = useBagTouchDrag({
    // Enter item-placing mode so the roster highlights as drop targets.
    onDragStart: (item, from) => setMovingItem({ item, from }),
    // Consumables must be USED, not equipped — applyConsumableTo makes that
    // call, the same one resolveItemMove makes on the tap path. Without it,
    // touch-dragging a Max Revive onto a Pokémon would silently equip it as a
    // dead held item and displace whatever it was holding.
    onDrop: (item, from, slotIndex) => {
      applyConsumableTo(item, from, slotIndex)
      setMovingItem(null)
    },
    // A missed drop STAYS in placing mode, so the drag degrades into
    // tap-to-place instead of silently dying. `movingItem` is deliberately left
    // set — the banner already on screen tells the player what to do next.
    onMissedDrop: () => setNotice('Dropped nowhere — tap a Pokémon to give it'),
    // A cancel is the only unsettled ending: the OS interrupted the gesture,
    // so placing mode must not be left up. A settled ending already decided
    // what happens to movingItem — a landed drop cleared it, a miss keeps it
    // so the drag can degrade into tap-to-place.
    onDragEnd: (settled) => {
      if (!settled) setMovingItem(null)
    },
  })

  // Skip directly to the next map (mirrors the boss-clear advance). On the
  // last map, skip into the Elite Four stage when the region has one.
  const handleSkipMap = config.maps[mapIndex + 1]
    ? () => { onMapCleared?.(); onAdvanceMap() }
    : config.eliteFour
      ? () => { onMapCleared?.(); onEnterEliteFour?.() }
      : null

  return (
    <Layout onHome={onBack} onRestart={onRestart} onSkipMap={handleSkipMap} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen} showTutorial>
      {/* Desktop's Speed Cash balance lives under the badges column (see the
          right column below), not in a fixed corner pill. The pill sat at
          top-left at zIndex 50, under the nav bar's 150 — it was never actually
          visible on desktop. Mobile keeps its balance at the right end of the
          bag bar, which is already full-width and costs the map nothing. */}
      {isDesktop ? (
        <div className="flex flex-col items-center gap-2 w-full" style={{ flex: 1, minHeight: 0, visibility: pendingBattle ? 'hidden' : 'visible' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '12px', flex: 1, minHeight: 0, padding: `${MAP_PAD_Y}px 0` }}>
            {/* Left rail: the team you fight with, and nothing else. The Bag
                moved to the right rail, which now collects everything the run
                has EARNED — badges, cash, items. */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0, alignSelf: 'flex-start' }}>
              <Roster
                roster={roster}
                onSwap={swapRoster}
                itemTargeting={isMovingItem}
                onPickTarget={pokeIndex => resolveItemMove({ kind: 'pokemon', pokeIndex })}
                onStartHeldItemDrag={(pokeIndex, item) => {
                  if (item) setMovingItem({ item, from: { kind: 'pokemon', pokeIndex } })
                  else setMovingItem(null)
                }}
              />
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
            {/* Right column: gym badges earned this run, with the Speed Cash
                balance beneath them.

                The balance used to be a fixed pill at top-left, which put it
                under the desktop nav bar (zIndex 150 vs the pill's 50) — it was
                invisible on every desktop run, and the tutorial's spotlight
                measured its hidden rect and appeared to point at Home. Here it
                is in the flow, in the one column that already exists to report
                run progress. */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0, width: '132px', alignSelf: 'flex-start' }}>
              <BadgeList badges={config.badges ?? []} earned={mapIndex} layout="vertical" />
              <div
                data-tutorial="cash"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                  padding: '8px 10px',
                  backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
                  border: borderStyle,
                  boxShadow: dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e',
                }}
              >
                {/* 12px, not the 9px the old nav-adjacent labels used: Upheaval
                    stops resolving below ~12px (docs/UI_TOUCHUPS.md). */}
                <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: muted(dark), letterSpacing: '0.5px' }}>
                  CASH
                </span>
                {/* The one number the player makes decisions on — every shop
                    choice is measured against it, so it gets to be the biggest
                    figure on the rail. */}
                <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: cash(dark), lineHeight: 1 }}>
                  ${speedCash}
                </span>
              </div>
              {/* Bag — drag an item onto a Pokémon to equip it. During an item
                  move, the whole panel is a drop target for stowing back to bag. */}
              <div
                onClick={() => { if (isMovingItem) resolveItemMove({ kind: 'bag' }) }}
                onDragOver={e => { if (isMovingItem) e.preventDefault() }}
                onDrop={e => { if (isMovingItem) { e.preventDefault(); resolveItemMove({ kind: 'bag' }) } }}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: isMovingItem ? '2px solid #facc15' : (dark ? '2px solid #121212' : '2px solid #2e2e2e'),
                  boxShadow: isMovingItem ? '0 0 8px 2px rgba(250,204,21,0.5)' : (dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'),
                  backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', flexShrink: 0,
                  cursor: isMovingItem ? 'pointer' : 'default',
                }}
              >
                <div style={{ backgroundColor: '#facc15', padding: '3px 10px', width: '100%', display: 'flex', justifyContent: 'center', flexShrink: 0, boxSizing: 'border-box' }}>
                  <span style={{ fontFamily: 'Upheaval', fontSize: '15px', color: '#1a1a1a', letterSpacing: '0.5px' }}>BAG</span>
                </div>
                {bag && bag.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '5px 4px', gap: '2px', boxSizing: 'border-box' }}>
                    {bag.map((item, i) => {
                      const picked = movingItem?.from?.kind === 'bag' && movingItem.from.index === i
                      return (
                        <div
                          key={i}
                          draggable
                          onDragStart={() => setMovingItem({ item, from: { kind: 'bag', index: i } })}
                          onDragEnd={() => setMovingItem(null)}
                          // Click opens the item's info popup (with an Equip action);
                          // dragging (mouse OR touch) equips directly onto a Pokémon.
                          onClick={e => { e.stopPropagation(); setInfoItem({ item, from: { kind: 'bag', index: i } }) }}
                          {...bagTouchProps(item, { kind: 'bag', index: i })}
                          title={`${item.name} — drag onto a Pokémon or click for info`}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                            padding: '4px 2px',
                            cursor: 'grab', borderRadius: '2px',
                            outline: picked ? '2px solid #facc15' : 'none',
                            opacity: picked ? 0.6 : 1,
                            touchAction: 'none',
                          }}
                        >
                          <img src={itemIconUrl(item)} alt={item.name} style={{ width: '28px', height: '28px', imageRendering: 'pixelated', flexShrink: 0, pointerEvents: 'none' }} />
                          {/* Item names are long ("Mega Revive", "Bright Powder")
                              and the rail is narrow, so the name sits UNDER its
                              icon on two lines rather than being ellipsed to a
                              word-and-a-half beside it. */}
                          <span style={{
                            fontFamily: 'Pokemon Classic', fontSize: '8px', lineHeight: 1.35,
                            color: dark ? '#DBDBDB' : '#333', textAlign: 'center',
                            width: '100%', pointerEvents: 'none',
                          }}>
                            {item.name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <span style={{ fontFamily: 'Pokemon Classic', fontSize: '9px', color: dark ? '#666' : '#999', padding: '10px 4px', textAlign: 'center' }}>empty</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          position: 'relative',
          flex: 1, minHeight: 0,
          backgroundColor: dark ? '#1a1a1a' : '#c8c8c8',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'flex-start',
          // No TOP padding: the map card butts against the nav row. The 8px
          // that used to sit here read as a gap, since the nav is top-aligned
          // and the card starts immediately below it. Bottom padding stays.
          padding: '0 5px 8px',
        }}>
          {/* The ruler. Invisible and out of flow, so it contributes NO height,
              but stretched to the column's full content box — which is exactly
              the space a map may occupy once the bars below are accounted for.
              mobileCard is computed from this, and the map card is then sized
              to hug its own content so the bars sit right beneath it.

              It must be a separate element from the map: a single element
              cannot both report the full available height and occupy only the
              card's height. Previous passes tried a maxHeight (fed the
              ResizeObserver its own output, collapsing toward zero) and a
              negative margin (no effect — margin does not shrink a `flex: 1`
              item; the flex algorithm hands back the freed space).

              `bottom` leaves room for the bars so the ruler never over-reports:
              it spans the column minus the stack's measured height. */}
          <div
            ref={mobileSlotRef}
            aria-hidden="true"
            style={{
              position: 'absolute', left: 0, right: 0, top: 0,
              bottom: `${mobileBarsHeight}px`,
              pointerEvents: 'none', visibility: 'hidden',
            }}
          />
          {/* The map card. Sized to mobileCard, NOT flex:1 — it hugs its own
              height so the bars below sit 2px beneath it instead of after a
              column's worth of leftover space. */}
          <div style={{
            width: '100%',
            flexShrink: 0, marginBottom: '2px',
            height: mobileCard ? `${mobileCard.height}px` : '100%',
            display: 'flex', justifyContent: 'center',
          }}>
            <div style={{
              width: mobileCard ? `${mobileCard.width}px` : '100%',
              height: '100%',
              display: 'flex', flexDirection: 'column',
            }}>
              <MapSvg {...mapSvgProps} />
            </div>
          </div>
          {/* Bottom bars (constrained to the map width): roster, then bag, then a
              horizontal gym-badge bar — all full-width, stacked. */}
          {/* Measured so the map ruler above can reserve exactly this much
              height and no more. */}
          <div ref={mobileBarsRef} style={{
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
              onStartHeldItemDrag={(pokeIndex, item) => {
                if (item) setMovingItem({ item, from: { kind: 'pokemon', pokeIndex } })
                else setMovingItem(null)
              }}
            />
            {/* Bag — drag an item onto a Pokémon to equip (as on desktop), or tap
                it for the info popup, which has an Equip action. A drag released
                on no Pokémon KEEPS placing mode active, so the recovery is to tap
                a Pokémon; tapping the item itself does not pick it up. Drop
                here to stow back. */}
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
                    // Tap opens the item's info popup (which has an Equip action);
                    // dragging (mouse OR touch) equips directly onto a Pokémon.
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
              {/* Speed Cash, pinned to the right end of the bag bar. It lives
                  here rather than in a floating overlay so it costs the map no
                  horizontal space — this bar is already full-width.
                  `position: sticky` keeps it visible when a full bag scrolls
                  this row; without it the balance would scroll out of reach.
                  marginLeft:auto pushes it right when the bag is short. */}
              <span
                // Mobile half of the tutorial's cash marker — see the desktop
                // pill above. Exactly one of the two renders.
                data-tutorial="cash"
                style={{
                  marginLeft: 'auto', flexShrink: 0,
                  position: 'sticky', right: 0,
                  paddingLeft: '8px',
                  backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
                  fontFamily: 'Upheaval', fontSize: '12px', color: cash(dark),
                }}
              >
                ${speedCash}
              </span>
            </div>
            {/* Gym badges earned this run — horizontal bar. */}
            <BadgeList badges={config.badges ?? []} earned={mapIndex} layout="horizontal" />
          </div>
        </div>
      )}

      {/* Finger-following icon while touch-dragging a bag item. */}
      {ghostItem && (
        <img
          ref={ghostRef}
          src={itemIconUrl(ghostItem)}
          alt=""
          style={{
            // left/top stay at 0 and the transform does all the moving, so the
            // hook can update position with one style write and no React
            // render. See useBagTouchDrag.
            position: 'fixed', left: 0, top: 0,
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
            damageMultiplier={getRegionBalance(region.name)}
            onBattleEnd={handleBattleEnd}
            onDefeat={() => onRunEnd?.('loss')}
            onRestart={onRestart}
            runItBackAvailable={runItBackAvailable}
            onRunItBack={onRunItBack}
            onMainMenu={onBack}
            seedCode={seedCode}
            cashEarned={cashEarned}
            speedCash={speedCash}
            metacashEarned={metacashEarned}
            keysEarned={keysEarned}
            payoutSaved={payoutSaved}
            mapsCleared={mapsCleared}
            badges={config.badges ?? []}
            badgesEarned={mapIndex}
          />
        </div>
      )}

      {evo.render()}


      {pendingPokeball && (
        <PokeballNode
          offered={pendingPokeball.offered}
          roster={roster}
          caughtSet={caughtSet}
          onReroll={pendingPokeball.node.fromMystery ? rerollPokeballOffer : null}
          rerolling={rerolling}
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
          isLegendary
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
          onReroll={pendingItem.node.fromMystery ? rerollItemOffer : null}
          onAssign={async (item, pokemonIndex, swapBackItem) => {
            // The Evolve Stone is a consumable, not a held item: it evolves the
            // target on the spot and is used up, so it never gets equipped.
            if (item?.consumable === 'evolve') {
              await evo.evolveWithStone(pokemonIndex)
            } else if (item?.consumable === 'level') {
              await evo.useRareCandy(pokemonIndex)
            } else if (isRosterConsumable(item)) {
              // Used straight from the offer. A no-op (full-HP target) still
              // clears the node — the player picked it from three; it simply
              // had no effect. The keep-on-no-op rule applies to the bag path,
              // where the player spends something they already own.
              onApplyConsumable?.(item, pokemonIndex)
            } else {
              onItemAssign(item, pokemonIndex, swapBackItem)
            }
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
              // A TM raises the move's tier; it does not re-type the Pokémon.
              // currentMoveType, not attackTypeFor: this is a REBUILD, and a
              // rebuild that ignores the held item reverts an equipped Polarity
              // Band while the band stays on and keeps granting its ×1.25.
              return { ...p, move: getTypeMove(currentMoveType(p), nextTier) }
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

      {pendingMart && (
        <PokemartNode
          inventory={pendingMart.inventory}
          initialStock={pendingMart.stock}
          onStockChange={next => setMartStock(prev => ({ ...prev, [pendingMart.node.id]: next }))}
          speedCash={speedCash}
          onBuy={entry => {
            // The App owns the balance, so IT decides whether the purchase is
            // affordable; the shop only reflects the answer. Bought items go
            // straight to the bag, exactly like an item node's "Keep in Bag".
            const paid = onSpendCash?.(entry.price)
            if (paid) onItemKeepInBag?.(entry.item)
            return !!paid
          }}
          // Leaving marks the node visited AND moves the player onto it, the
          // same as every other node — which is what makes row 7 a fork: the
          // Pokécenter beside the mart is reachable only from row 6, so
          // standing here locks it out. Heal or shop, never both.
          //
          // Re-entering is handled in handleNodeClick, which lets you click
          // the mart you're standing on. Doing it that way rather than by
          // skipping this advance is the difference between a shop you can
          // revisit and a row you never actually spend.
          onClose={() => {
            setClearedNodes(prev => new Set([...prev, pendingMart.node.id]))
            // Advance onto the mart, exactly like every other node. This is
            // what CONSUMES row 7: the Pokécenter beside it is only reachable
            // from row 6, so standing here locks it out and keeps the row a
            // real fork — heal or shop, never both.
            //
            // An earlier pass skipped this to keep the shop re-openable, which
            // silently let the player take the mart AND then the Pokécenter.
            // Re-opening is handled the right way instead: handleNodeClick
            // lets you click the node you are standing on when it is a mart.
            setCurrentNode(pendingMart.node.id)
            setPendingMart(null)
          }}
        />
      )}
    </Layout>
  )
}
