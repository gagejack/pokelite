import { getEffectiveness } from './typeChart.js'

const itemId = p => p?.heldItem?.id ?? null

// Effective speed for turn order (Choice Scarf gives +50%).
function effSpeed(p) {
  const s = p.stats.speed
  return itemId(p) === 'choice_scarf' ? s * 1.5 : s
}

// Gen 5 damage formula with critical hits (1/16 chance, 1.5x, ignores defense drops).
// Held-item effects: Choice Band (+50% physical Attack), Scope Lens (+30% crit rate),
// Expert Belt (+20% dmg), Life Orb (+30% dmg).
export function calcDamage(attacker, defender, move, damageMultiplier = 2) {
  if (!move || !move.power) return { damage: 0, crit: false }
  const aItem = itemId(attacker)
  const isSpecial = move.damageClass === 'special'
  let atk = isSpecial ? attacker.stats.spAtk : attacker.stats.attack
  const def = isSpecial ? defender.stats.spDef : defender.stats.defense

  // Choice Band — +50% physical Attack
  if (!isSpecial && aItem === 'choice_band') atk *= 1.5

  const effectiveness = getEffectiveness(move.type, defender.types)

  // Scope Lens — crit rate +30%
  const critChance = aItem === 'scope_lens' ? (1 / 16) * 1.3 : (1 / 16)
  const crit = Math.random() < critChance

  const random = 0.85 + Math.random() * 0.15

  // Expert Belt / Life Orb — damage multipliers (stack multiplicatively)
  let itemDmg = 1
  if (aItem === 'expert_belt') itemDmg *= 1.2
  if (aItem === 'life_orb')    itemDmg *= 1.3

  const base = Math.floor(((2 * attacker.level / 5 + 2) * move.power * atk / def) / 50) + 2
  const damage = Math.max(1, Math.floor(base * effectiveness * random * damageMultiplier * itemDmg * (crit ? 1.5 : 1)))
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

  while (alivePlayers().length > 0 && aliveEnemies().length > 0 && pi !== -1 && ei !== -1) {
    if (++rounds > MAX_ROUNDS) break
    const pPoke = player[pi]
    const ePoke = enemy[ei]

    // Determine order by effective speed (Choice Scarf applies here)
    const pSpd = effSpeed(pPoke), eSpd = effSpeed(ePoke)
    const playerFirst = pSpd >= eSpd
      ? (pSpd > eSpd ? true : Math.random() < 0.5)
      : false

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

      // Shell Bell — attacker heals 20% of damage dealt
      if (damage > 0 && itemId(attacker) === 'shell_bell' && !attacker.fainted) {
        const heal = Math.floor(damage * 0.2)
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

    // End of round — Leftovers heals the active holder(s) by 10% max HP
    if (pi !== -1 && ei !== -1) {
      const heals = []
      for (const [side, idx, team] of [['player', pi, player], ['enemy', ei, enemy]]) {
        const mon = team[idx]
        if (!mon || mon.fainted) continue
        if (itemId(mon) === 'leftovers' && mon.stats.hp < mon.stats.maxHp) {
          const heal = Math.floor(mon.stats.maxHp * 0.10)
          if (heal > 0) {
            mon.stats.hp = Math.min(mon.stats.maxHp, mon.stats.hp + heal)
            heals.push({ side, index: idx, hpAfter: mon.stats.hp, label: `+${heal}` })
          }
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
