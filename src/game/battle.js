import { getEffectiveness } from './typeChart.js'

// Gen 5 damage formula with critical hits (1/16 chance, 1.5x, ignores defense drops)
export function calcDamage(attacker, defender, move, damageMultiplier = 2) {
  if (!move || !move.power) return { damage: 0, crit: false }
  const isSpecial = move.damageClass === 'special'
  const atk = isSpecial ? attacker.stats.spAtk : attacker.stats.attack
  const def = isSpecial ? defender.stats.spDef : defender.stats.defense
  const effectiveness = getEffectiveness(move.type, defender.types)
  const crit = Math.random() < (1 / 16)
  const random = 0.85 + Math.random() * 0.15
  const base = Math.floor(((2 * attacker.level / 5 + 2) * move.power * atk / def) / 50) + 2
  const damage = Math.max(1, Math.floor(base * effectiveness * random * damageMultiplier * (crit ? 1.5 : 1)))
  return { damage, crit }
}

// Simulate a full battle between two teams.
// Returns a log array the UI replays frame by frame.
// Each entry describes one attack within a round.
export function simulateBattle(playerTeam, enemyTeam, damageMultiplier = 2) {
  // Deep-clone teams so original roster isn't mutated
  const player = playerTeam.map(p => ({ ...p, stats: { ...p.stats } }))
  const enemy  = enemyTeam.map(p => ({ ...p, stats: { ...p.stats } }))

  const log = []
  let pi = 0 // active player index
  let ei = 0 // active enemy index

  const alivePlayers = () => player.filter(p => !p.fainted)
  const aliveEnemies = () => enemy.filter(p => !p.fainted)

  while (alivePlayers().length > 0 && aliveEnemies().length > 0) {
    const pPoke = player[pi]
    const ePoke = enemy[ei]

    // Determine order by speed
    const playerFirst = pPoke.stats.speed >= ePoke.stats.speed
      ? (pPoke.stats.speed > ePoke.stats.speed ? true : Math.random() < 0.5)
      : false

    const attacks = playerFirst
      ? [{ attacker: pPoke, defender: ePoke, side: 'player' }, { attacker: ePoke, defender: pPoke, side: 'enemy' }]
      : [{ attacker: ePoke, defender: pPoke, side: 'enemy' }, { attacker: pPoke, defender: ePoke, side: 'player' }]

    for (const { attacker, defender, side } of attacks) {
      if (attacker.fainted || defender.fainted) continue

      const { damage, crit } = calcDamage(attacker, defender, attacker.move, damageMultiplier)
      defender.stats.hp = Math.max(0, defender.stats.hp - damage)
      const effectiveness = getEffectiveness(attacker.move?.type ?? 'normal', defender.types)

      if (defender.stats.hp === 0) defender.fainted = true

      log.push({
        side,
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
        playerActiveHp: player[pi].stats.hp,
        enemyActiveHp:  enemy[ei].stats.hp,
      })

      // Advance to next living Pokémon if active one fainted
      if (defender.fainted) {
        if (side === 'player') {
          // enemy fainted — advance enemy index
          const next = enemy.findIndex((p, i) => i > ei && !p.fainted)
          if (next !== -1) ei = next
        } else {
          // player Pokémon fainted — advance player index
          const next = player.findIndex((p, i) => i > pi && !p.fainted)
          if (next !== -1) pi = next
        }
        break // end this round, start next with new active Pokémon
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
