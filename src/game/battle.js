import { getEffectiveness } from './typeChart.js'

const itemId = p => p?.heldItem?.id ?? null

// Big Root boosts all HP recovery the holder receives by 50%.
const healAmount = (mon, base) =>
  Math.floor(base * (itemId(mon) === 'big_root' ? 1.5 : 1))

// Effective speed for turn order (Choice Scarf +50%, Iron Ball −40%).
function effSpeed(p) {
  let s = p.stats.speed
  const id = itemId(p)
  if (id === 'choice_scarf') s *= 1.5
  if (id === 'iron_ball')    s *= 0.6
  return s
}

// Gen 5 damage formula with critical hits (1/16 chance, 1.5x, ignores defense drops).
// Held-item effects are applied here for whichever side holds them — see the
// per-item branches below. Attacker-side flags (`_wpActive`, `_cellActive`) are
// set elsewhere in the loop and read here as persistent damage bonuses.
export function calcDamage(attacker, defender, move, damageMultiplier = 2) {
  if (!move || !move.power) return { damage: 0, crit: false }
  const aItem = itemId(attacker)
  const dItem = itemId(defender)
  const isSpecial = move.damageClass === 'special'
  let atk = isSpecial ? attacker.stats.spAtk : attacker.stats.attack
  let def = isSpecial ? defender.stats.spDef : defender.stats.defense

  // Choice Band — +50% physical Attack
  if (!isSpecial && aItem === 'choice_band') atk *= 1.5

  // Defensive items — raise the defender's relevant defense stat.
  if (dItem === 'eviolite')                  def *= 1.5              // all moves
  if (dItem === 'assault_vest' && isSpecial) def *= 1.5             // special only
  if (dItem === 'light_clay' && !isSpecial)  def *= 1.25            // physical only

  const effectiveness = getEffectiveness(move.type, defender.types)

  // Scope Lens +30% / Razor Claw +60% crit rate
  let critChance = 1 / 16
  if (aItem === 'scope_lens') critChance *= 1.3
  if (aItem === 'razor_claw') critChance *= 1.6
  const crit = Math.random() < critChance

  const random = 0.85 + Math.random() * 0.15

  // Attacker damage multipliers (stack multiplicatively).
  let itemDmg = 1
  if (aItem === 'expert_belt')  itemDmg *= 1.2
  if (aItem === 'life_orb')     itemDmg *= 1.3
  if (aItem === 'iron_ball')    itemDmg *= 1.35
  if (aItem === 'muscle_band' && !isSpecial) itemDmg *= 1.2
  if (aItem === 'wise_glasses' && isSpecial) itemDmg *= 1.2
  // King's Rock — crits deal 100% more damage (a crit hits for ×2 total
  // instead of the usual ×1.5, i.e. an extra ×(2/1.5) on top of the crit).
  if (aItem === 'kings_rock' && crit) itemDmg *= 2 / 1.5
  // Type-boost plates — +50% damage when the move's type matches the plate.
  if (attacker.heldItem?.boostType && attacker.heldItem.boostType === move.type) itemDmg *= 1.5
  // Persistent bonuses granted after a trigger earlier in the battle.
  if (aItem === 'weakness_policy' && attacker._wpActive)  itemDmg *= 1.5
  if (aItem === 'cell_battery'   && attacker._cellActive) itemDmg *= 1.3

  // Bright Powder — 15% chance an incoming hit is halved.
  let defDmg = 1
  if (dItem === 'bright_powder' && Math.random() < 0.15) defDmg *= 0.5
  // Resist Charm — super-effective hits against the holder deal 50% less.
  if (dItem === 'resist_charm' && effectiveness > 1) defDmg *= 0.5

  const base = Math.floor(((2 * attacker.level / 5 + 2) * move.power * atk / def) / 50) + 2
  const damage = Math.max(1, Math.floor(base * effectiveness * random * damageMultiplier * itemDmg * defDmg * (crit ? 1.5 : 1)))
  return { damage, crit }
}

// Find the next living Pokémon in a team: prefer the first alive index after
// `from`, otherwise fall back to the first alive index anywhere, else -1.
// This guarantees the active pointer never lands on a fainted Pokémon while
// any survivor remains (which would otherwise stall the battle loop forever).
function nextAlive(team, from) {
  const forward = team.findIndex((p, i) => i > from && !p.fainted)
  if (forward !== -1) return forward
  return team.findIndex(p => !p.fainted)
}

// Simulate a full battle between two teams.
// Returns a log array the UI replays frame by frame.
// Attack entries describe one attack (with any item `events`); 'leftovers'
// entries describe end-of-round passive heals.
export function simulateBattle(playerTeam, enemyTeam, damageMultiplier = 2) {
  // Deep-clone teams so original roster isn't mutated (carry heldItem reference)
  const player = playerTeam.map(p => ({ ...p, stats: { ...p.stats } }))
  const enemy  = enemyTeam.map(p => ({ ...p, stats: { ...p.stats } }))

  const log = []
  // Start on the first living Pokémon (the roster may carry fainted Pokémon
  // between battles, so index 0 isn't guaranteed to be alive).
  let pi = player.findIndex(p => !p.fainted)
  let ei = enemy.findIndex(p => !p.fainted)

  const alivePlayers = () => player.filter(p => !p.fainted)
  const aliveEnemies = () => enemy.filter(p => !p.fainted)

  // Hard cap on rounds — far beyond any real battle. Belt-and-suspenders so a
  // logic error can never hard-freeze the main thread again.
  const MAX_ROUNDS = 10000
  let rounds = 0

  // Tie-break order is decided ONCE per active pairing, not re-rolled every
  // round — otherwise a tied pair could flip order between rounds and the same
  // Pokémon would appear to attack twice in a row.
  let tieFirst = Math.random() < 0.5
  let tiePair = `${pi}-${ei}`

  while (alivePlayers().length > 0 && aliveEnemies().length > 0 && pi !== -1 && ei !== -1) {
    if (++rounds > MAX_ROUNDS) break
    const pPoke = player[pi]
    const ePoke = enemy[ei]

    // Re-roll the tie-break only when the active pairing changes (a faint/swap).
    if (`${pi}-${ei}` !== tiePair) {
      tiePair = `${pi}-${ei}`
      tieFirst = Math.random() < 0.5
    }

    // Determine order by effective speed (Choice Scarf applies here)
    const pSpd = effSpeed(pPoke), eSpd = effSpeed(ePoke)
    const playerFirst = pSpd === eSpd ? tieFirst : pSpd > eSpd

    const attacks = playerFirst
      ? [{ aSide: 'player', aIdx: pi, dSide: 'enemy', dIdx: ei }, { aSide: 'enemy', aIdx: ei, dSide: 'player', dIdx: pi }]
      : [{ aSide: 'enemy', aIdx: ei, dSide: 'player', dIdx: pi }, { aSide: 'player', aIdx: pi, dSide: 'enemy', dIdx: ei }]

    for (const { aSide, aIdx, dSide, dIdx } of attacks) {
      const aTeam = aSide === 'player' ? player : enemy
      const dTeam = dSide === 'player' ? player : enemy
      const attacker = aTeam[aIdx]
      const defender = dTeam[dIdx]
      if (attacker.fainted || defender.fainted) continue

      const { damage, crit } = calcDamage(attacker, defender, attacker.move, damageMultiplier)
      const effectiveness = getEffectiveness(attacker.move?.type ?? 'normal', defender.types)

      const events = []
      const defWasFull = defender.stats.hp >= defender.stats.maxHp
      defender.stats.hp = Math.max(0, defender.stats.hp - damage)

      // Focus Sash — survive a lethal hit from full HP at 1 HP (every time)
      if (defender.stats.hp === 0 && defWasFull && itemId(defender) === 'focus_sash') {
        defender.stats.hp = 1
        events.push({ kind: 'focus', side: dSide, index: dIdx, hpAfter: 1, label: 'Hung on!' })
      }
      if (defender.stats.hp === 0) defender.fainted = true

      // Cell Battery — the first time this Pokémon is hit, gain +30% damage
      // for the rest of the battle (consumed in calcDamage via _cellActive).
      if (itemId(defender) === 'cell_battery' && damage > 0 && !defender._cellActive) {
        defender._cellActive = true
      }
      // Weakness Policy — after taking a super-effective hit, gain +50% damage
      // for the rest of the battle.
      if (itemId(defender) === 'weakness_policy' && damage > 0 && effectiveness > 1 && !defender._wpActive) {
        defender._wpActive = true
      }

      // Sitrus Berry — once per battle, heal 25% max HP the first time the
      // holder drops below 50% (and survives).
      if (itemId(defender) === 'sitrus_berry' && !defender._sitrusUsed && !defender.fainted
          && defender.stats.hp > 0 && defender.stats.hp < defender.stats.maxHp * 0.5) {
        defender._sitrusUsed = true
        const heal = healAmount(defender, Math.floor(defender.stats.maxHp * 0.25))
        if (heal > 0) {
          defender.stats.hp = Math.min(defender.stats.maxHp, defender.stats.hp + heal)
          events.push({ kind: 'heal', side: dSide, index: dIdx, hpAfter: defender.stats.hp, label: `+${heal}` })
        }
      }

      // Shell Bell — attacker heals 20% of damage dealt
      if (damage > 0 && itemId(attacker) === 'shell_bell' && !attacker.fainted) {
        const heal = healAmount(attacker, Math.floor(damage * 0.2))
        if (heal > 0 && attacker.stats.hp < attacker.stats.maxHp) {
          attacker.stats.hp = Math.min(attacker.stats.maxHp, attacker.stats.hp + heal)
          events.push({ kind: 'heal', side: aSide, index: aIdx, hpAfter: attacker.stats.hp, label: `+${heal}` })
        }
      }

      // Rocky Helmet — attacker takes 1/3 of its max HP on contact
      if (itemId(defender) === 'rocky_helmet' && damage > 0 && !attacker.fainted) {
        const recoil = Math.floor(attacker.stats.maxHp / 3)
        if (recoil > 0) {
          attacker.stats.hp = Math.max(0, attacker.stats.hp - recoil)
          const attackerFainted = attacker.stats.hp === 0
          if (attackerFainted) attacker.fainted = true
          events.push({ kind: 'recoil', side: aSide, index: aIdx, hpAfter: attacker.stats.hp, label: `-${recoil}`, fainted: attackerFainted })
        }
      }

      log.push({
        type: 'attack',
        side: aSide,                 // legacy: the attacking side
        attackerSide: aSide,
        attackerIndex: aIdx,
        defenderSide: dSide,
        defenderIndex: dIdx,
        attackerName: attacker.name,
        defenderName: defender.name,
        moveName: attacker.move?.name ?? '(no move)',
        moveType: attacker.move?.type ?? 'normal',
        damage,
        crit,
        effectiveness,
        defenderHpAfter: defender.stats.hp,
        defenderMaxHp: defender.stats.maxHp,
        defenderFainted: defender.fainted,
        attackerHpAfter: attacker.stats.hp,
        attackerFainted: attacker.fainted,
        events,
        playerActiveHp: player[pi].stats.hp,
        enemyActiveHp:  enemy[ei].stats.hp,
      })

      // Advance active pointer if the defender fainted
      if (defender.fainted) {
        if (dSide === 'enemy') ei = nextAlive(enemy, ei)
        else pi = nextAlive(player, pi)
        break // end this round; restart with the new active Pokémon
      }
      // Advance if the ATTACKER fainted to Rocky Helmet recoil
      if (attacker.fainted) {
        if (aSide === 'enemy') ei = nextAlive(enemy, ei)
        else pi = nextAlive(player, pi)
        break
      }
    }

    // End of round — passive heal for the active holder(s).
    // Leftovers (10%) and Black Sludge (12%), each scaled by Big Root.
    if (pi !== -1 && ei !== -1) {
      const heals = []
      for (const [side, idx, team] of [['player', pi, player], ['enemy', ei, enemy]]) {
        const mon = team[idx]
        if (!mon || mon.fainted || mon.stats.hp >= mon.stats.maxHp) continue
        const pct = itemId(mon) === 'leftovers' ? 0.10 : itemId(mon) === 'black_sludge' ? 0.12 : 0
        if (pct === 0) continue
        const heal = healAmount(mon, Math.floor(mon.stats.maxHp * pct))
        if (heal > 0) {
          mon.stats.hp = Math.min(mon.stats.maxHp, mon.stats.hp + heal)
          heals.push({ side, index: idx, hpAfter: mon.stats.hp, label: `+${heal}` })
        }
      }
      if (heals.length > 0) {
        log.push({ type: 'leftovers', heals })
      }
    }
  }

  return {
    log,
    playerWon: aliveEnemies().length === 0,
    finalPlayerTeam: player,
    finalEnemyTeam: enemy,
  }
}
