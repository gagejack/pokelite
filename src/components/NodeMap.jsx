import { useState, useMemo, useRef, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import Layout from './Layout'
import Roster from './Roster'
import BattleCard from './BattleCard'
import PokeballNode from './PokeballNode'
import ItemNode from './ItemNode'
import { NODE_TYPES, pick } from '../game/nodeMap.js'
import { pickThreeItems, itemIconUrl } from '../game/items.js'
import { getRegionConfig } from '../game/regionRegistry.js'
import { fetchPokemonBase, buildPokemonInstance, buildMoveCache, levelUp, checkEvolution } from '../game/pokemon.js'
import { buildTrainerTeamSpec, pickTrainerCount, BOSS_TEAMS, TRAINER_POKEMON_POOLS, POKEMON_TYPES, POKEMON_NAMES } from '../game/enemyTeams.js'

let isTouchDevice = false
window.addEventListener('touchstart', () => { isTouchDevice = true }, { once: true, passive: true })

const ITEM_ICONS = {
  [NODE_TYPES.POKEBALL]:      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png',
  [NODE_TYPES.ITEM]:          'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/potion.png',
  [NODE_TYPES.POWER_UPGRADE]: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/tm-normal.png',
  [NODE_TYPES.POKECENTER]:    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/max-revive.png',
  [NODE_TYPES.BOSS]:          'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/master-ball.png',
}

const NODE_SIZE = 100
const ROW_HEIGHT = 200
const COL_WIDTH = 200
const PADDING_TOP = 40

function MapSvg({
  dark, borderStyle, shadowStyle,
  nodePositions, edges, svgWidth, svgHeight,
  clearedNodes, currentNode, loadingNode, hoveredNode,
  mapContainerRef, holdTimerRef, holdActivatedRef,
  setContainerSize, setHoveredNode,
  handleNodeClick, getIcon, getNodeLabel, isReachable, isLocked,
  mapScale, mapOffsetX, mapOffsetY, background,
}) {
  useEffect(() => {
    if (!mapContainerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setContainerSize({ w: width, h: height })
    })
    ro.observe(mapContainerRef.current)
    return () => ro.disconnect()
  }, [])

  const toPixel = (svgX, svgY) => ({
    px: mapOffsetX + (svgX + svgWidth / 2) * mapScale,
    py: mapOffsetY + svgY * mapScale,
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
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(2)', transformOrigin: '0% 100%' }}
      />
      <svg
        width="100%"
        height="100%"
        viewBox={`${-svgWidth / 2} 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        <defs>
          <clipPath id="trainer-clip">
            <rect x={0} y={0} width={NODE_SIZE} height={NODE_SIZE * 1.15} />
          </clipPath>
          <filter id="node-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.9)" />
          </filter>
          <filter id="trainer-shadow" x="-30%" y="-30%" width="160%" height="160%">
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
              stroke={active ? '#22c55e' : 'rgba(0,0,0,0.5)'}
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
          return (
            <g key={node.id} transform={`translate(${x - NODE_SIZE / 2}, ${y})`}>
              {isCurrentNode ? (
                <image href={icon}
                  x={-NODE_SIZE * 0.2} y={-NODE_SIZE * 0.2}
                  width={NODE_SIZE * 1.4} height={NODE_SIZE * 1.4}
                  preserveAspectRatio="xMidYMid meet"
                  filter="url(#trainer-shadow)"
                  style={{ imageRendering: 'pixelated', opacity }}
                />
              ) : isTrainerNode ? (
                <g clipPath="url(#trainer-clip)" filter={isHovered ? 'url(#hover-outline)' : 'url(#trainer-shadow)'}>
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
                    filter={isHovered ? 'url(#hover-outline)' : 'url(#node-shadow)'}
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
        const size = NODE_SIZE * mapScale
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
                <div style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: dark ? '#DBDBDB' : '#333', textTransform: 'capitalize' }}>{title}</div>
                {Array.isArray(sub)
                  ? sub.map((line, i) => <div key={i} style={{ fontFamily: 'Orange Kid', fontSize: '11px', color: '#facc15', lineHeight: '1.4' }}>{line}</div>)
                  : <div style={{ fontFamily: 'Orange Kid', fontSize: '11px', color: '#facc15', marginTop: '1px' }}>{sub}</div>
                }
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default function NodeMap({ region, starter, character, roster, setRoster, bag, onItemAssign, onItemKeepInBag, mapIndex = 0, onBack, onRestart, onAdvanceMap, onPokemonCaught, onMapCleared, onRunEnd, pokedexOpen, setPokedexOpen }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const config = getRegionConfig(region.name)
  const mapConfig = config.maps[mapIndex]

  const mapData = useMemo(() => mapConfig.generate(starter), [mapConfig])
  const edges = mapConfig.edges

  const [clearedNodes, setClearedNodes] = useState(new Set([0]))
  const [currentNode, setCurrentNode] = useState(0)
  const [pendingBattle, setPendingBattle] = useState(null)
  const [pendingPokeball, setPendingPokeball] = useState(null)
  const [pendingItem, setPendingItem] = useState(null)
  const [loadingNode, setLoadingNode] = useState(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [evolutionNotices, setEvolutionNotices] = useState([])
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const mapContainerRef = useRef(null)
  const holdTimerRef = useRef(null)
  const holdActivatedRef = useRef(false)

  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #666666'

  const nodePositions = {}
  mapData.rows.forEach((row, rowIndex) => {
    const totalCols = row.length
    row.forEach((node, colIndex) => {
      const x = (colIndex - (totalCols - 1) / 2) * COL_WIDTH
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
    const totalNodes = Object.keys(nodePositions).length
    const positionWeight = node.id / totalNodes

    let specs
    if (isBoss) {
      specs = BOSS_TEAMS[node.trainer] ?? []
    } else if (isTrainer) {
      const count = pickTrainerCount(mapIndex)
      specs = buildTrainerTeamSpec(node.trainer, count, positionWeight)
    } else {
      specs = [{ id: 504, level: 4 }]
    }

    console.log('[fetchEnemyTeam] type:', node.type, '| trainer:', node.trainer, '| specs:', specs)

    const team = await Promise.all(specs.map(async ({ id, level }) => {
      const base = await fetchPokemonBase(id)
      const moveCache = await buildMoveCache(base)
      return buildPokemonInstance(base, level, moveCache)
    }))

    const trainerSprite = config.trainerFullSprites?.[node.trainer]
      ?? config.characters?.find(c => c.name === node.trainer)?.sprite
      ?? null

    return { team, trainerSprite }
  }

  async function fetchOfferedPokemon(node) {
    const pool = config.catchPools?.[mapIndex] ?? []
    console.log('[PokeballNode] pool length:', pool.length, '| mapIndex:', mapIndex)
    if (pool.length === 0) return []

    const totalNodes = Object.keys(nodePositions).length
    const positionWeight = node.id / totalNodes
    console.log('[PokeballNode] totalNodes:', totalNodes, '| nodeId:', node.id, '| positionWeight:', positionWeight.toFixed(3))
    const baseLevel = Math.round(5 + positionWeight * 10)
    const variance = Math.floor(Math.random() * 10) - 2
    const level = Math.max(5, baseLevel + variance)

    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    const chosen = shuffled.slice(0, 3)

    return Promise.all(chosen.map(async (id) => {
      const base = await fetchPokemonBase(id)
      const moveCache = await buildMoveCache(base)
      const instance = buildPokemonInstance(base, level, moveCache)
      return { ...instance, level }
    }))
  }

  const handleNodeClick = async (node) => {
    if (clearedNodes.has(node.id) || !isReachable(node.id)) return

    const isBattle = node.type === NODE_TYPES.TRAINER
      || node.type === NODE_TYPES.BOSS
      || node.type === NODE_TYPES.GRASS

    if (isBattle) {
      setLoadingNode(node.id)
      const { team, trainerSprite } = await fetchEnemyTeam(node)
      setLoadingNode(null)
      setPendingBattle({ node, enemyTeam: team, trainerSprite })
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
      const offered = pickThreeItems()
      setPendingItem({ node, offered })
    } else if (node.type === NODE_TYPES.POKECENTER) {
      setRoster(prev => prev.map(p => ({ ...p, fainted: false, stats: { ...p.stats, hp: p.stats.maxHp } })))
      setClearedNodes(prev => new Set([...prev, node.id]))
      setCurrentNode(node.id)
    } else {
      setClearedNodes(prev => new Set([...prev, node.id]))
      setCurrentNode(node.id)
    }
  }

  async function handleBattleEnd({ won, finalPlayerTeam }) {
    if (!pendingBattle) return
    const node = pendingBattle.node
    const isBoss = node.type === NODE_TYPES.BOSS
    const levelsGained = node.type === NODE_TYPES.GRASS ? 1 : 2

    if (won) {
      let updatedRoster = roster.map((p, i) => {
        const fp = finalPlayerTeam[i]
        if (!fp._base || !fp._moveCache) return fp
        return levelUp(fp, fp._base, levelsGained, fp._moveCache)
      })
      if (isBoss) {
        updatedRoster = updatedRoster.map(p => ({ ...p, fainted: false, stats: { ...p.stats, hp: p.stats.maxHp } }))
      }

      const notices = []
      updatedRoster = await Promise.all(updatedRoster.map(async p => {
        const evolved = await checkEvolution(p, p.level)
        if (evolved) {
          notices.push({ from: p.name, to: evolved.name })
          return evolved
        }
        return p
      }))

      setRoster(updatedRoster)
      if (notices.length > 0) setEvolutionNotices(notices)
      setPendingBattle(null)

      if (isBoss && config.maps[mapIndex + 1]) {
        onMapCleared?.()
        onAdvanceMap()
      } else if (isBoss) {
        onMapCleared?.()
        onRunEnd?.('win')
        setClearedNodes(prev => new Set([...prev, node.id]))
        setCurrentNode(node.id)
      } else {
        setClearedNodes(prev => new Set([...prev, node.id]))
        setCurrentNode(node.id)
      }
    } else {
      setRoster(prev => prev.map((p, i) => ({ ...p, ...finalPlayerTeam[i] })))
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
    setClearedNodes(prev => new Set([...prev, node.id]))
    setCurrentNode(node.id)
    setPendingPokeball(null)
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
      const pool = TRAINER_POKEMON_POOLS[node.trainer] ?? []
      const types = [...new Set(pool.map(p => POKEMON_TYPES[p.id]).filter(Boolean))]
      const sub = types.length === 1 ? `${types[0]} type` : types.length > 1 ? 'various types' : '+2 LVL'
      return { title: node.trainer ?? 'Trainer', sub }
    }
    if (node.type === NODE_TYPES.BOSS) {
      const team = BOSS_TEAMS[node.trainer] ?? []
      const sub = team.map(p => `${POKEMON_NAMES[p.id] ?? '???'} lv.${p.level}`)
      return { title: node.trainer ?? 'Gym Leader', sub }
    }
    switch (node.type) {
      case NODE_TYPES.GRASS:         return { title: 'Tall Grass', sub: '+1 LVL' }
      case NODE_TYPES.POKEBALL:      return { title: 'Poké Ball', sub: 'Catch a Pokémon' }
      case NODE_TYPES.ITEM:          return { title: 'Item', sub: 'Select an item' }
      case NODE_TYPES.POWER_UPGRADE: return { title: 'TM', sub: 'Upgrade a move' }
      case NODE_TYPES.POKECENTER:    return { title: 'Pokémon Center', sub: 'Full heal' }
      default:                       return { title: node.type, sub: '' }
    }
  }

  const mapScale = containerSize.w && containerSize.h
    ? Math.min(containerSize.w / svgWidth, containerSize.h / svgHeight)
    : 0
  const mapOffsetX = containerSize.w ? (containerSize.w - svgWidth * mapScale) / 2 : 0
  const mapOffsetY = containerSize.h ? (containerSize.h - svgHeight * mapScale) / 2 : 0

  const mapSvgProps = {
    dark, borderStyle, shadowStyle,
    nodePositions, edges, svgWidth, svgHeight,
    clearedNodes, currentNode, loadingNode, hoveredNode,
    mapContainerRef, holdTimerRef, holdActivatedRef,
    setContainerSize, setHoveredNode,
    handleNodeClick, getIcon, getNodeLabel, isReachable, isLocked,
    mapScale, mapOffsetX, mapOffsetY,
    background: mapConfig.background,
  }

  return (
    <Layout onHome={onBack} onRestart={onRestart} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen}>
      {isDesktop ? (
        <div className="flex flex-col items-center gap-2 w-full py-4">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '12px' }}>
            <Roster roster={roster} onSwap={(a, b) => setRoster(prev => { const r = [...prev]; [r[a], r[b]] = [r[b], r[a]]; return r })} />
            <div style={{ width: '400px', height: '91vh', display: 'flex', flexDirection: 'column' }}>
              <MapSvg {...mapSvgProps} />
            </div>
            <div style={{
              width: '90px',
              border: dark ? '2px solid #121212' : '2px solid #666666',
              boxShadow: dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #666666',
              backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', flexShrink: 0,
            }}>
              <div style={{ backgroundColor: '#facc15', padding: '3px 10px', width: '100%', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#1a1a1a' }}>BAG</span>
              </div>
              {bag && bag.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '4px' }}>
                  {bag.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 2px' }}>
                      <img src={itemIconUrl(item)} alt={item.name} style={{ width: '20px', height: '20px', imageRendering: 'pixelated', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'Upheaval', fontSize: '7px', color: dark ? '#DBDBDB' : '#333', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: dark ? '#555' : '#aaa', padding: '6px 4px', textAlign: 'center' }}>— empty —</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, backgroundColor: dark ? '#1a1a1a' : '#c8c8c8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '8px 0 8px' }}>
          <Roster roster={roster} horizontal onSwap={(a, b) => setRoster(prev => { const r = [...prev]; [r[a], r[b]] = [r[b], r[a]]; return r })} />
          <div style={{
            width: '360px', flexShrink: 0,
            border: borderStyle,
            boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666666',
            backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
            display: 'flex', flexDirection: 'row', alignItems: 'center',
            padding: '4px 8px', gap: '8px', marginTop: '6px',
          }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: '#1a1a1a', backgroundColor: '#facc15', padding: '2px 6px', flexShrink: 0 }}>BAG</span>
          </div>
          <div style={{ width: '360px', flex: 1, minHeight: 0, marginTop: '6px', display: 'flex', flexDirection: 'column' }}>
            <MapSvg {...mapSvgProps} />
          </div>
        </div>
      )}

      {pendingBattle && (
        <BattleCard
          node={pendingBattle.node}
          enemyTeam={pendingBattle.enemyTeam}
          trainerSprite={pendingBattle.trainerSprite}
          playerRoster={roster}
          character={character}
          damageMultiplier={config.damageMultiplier ?? 2}
          onBattleEnd={handleBattleEnd}
          onRestart={onRestart}
        />
      )}

      {evolutionNotices.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div style={{
            backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
            border: dark ? '2px solid #121212' : '2px solid #666666',
            boxShadow: dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #666666',
            padding: '24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
          }}>
            {evolutionNotices.map(({ from, to }, i) => (
              <span key={i} style={{ fontFamily: 'Orange Kid', fontSize: '16px', color: dark ? '#DBDBDB' : '#333', textTransform: 'capitalize', textAlign: 'center' }}>
                {from} evolved into {to}!
              </span>
            ))}
            <button
              onClick={() => setEvolutionNotices([])}
              style={{
                fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333',
                border: dark ? '2px solid #121212' : '2px solid #666666',
                backgroundColor: dark ? '#1a1a1a' : '#c8c8c8',
                padding: '6px 20px', cursor: 'pointer', marginTop: '4px',
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {pendingPokeball && (
        <PokeballNode
          offered={pendingPokeball.offered}
          roster={roster}
          onPick={handlePokeballPick}
          onClose={() => {
            setClearedNodes(prev => new Set([...prev, pendingPokeball.node.id]))
            setCurrentNode(pendingPokeball.node.id)
            setPendingPokeball(null)
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
    </Layout>
  )
}
