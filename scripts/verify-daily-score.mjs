// Node harness for the pure scoring reducers in src/game/dailyScore.js.
import { bestOfFirst3, rankLeaderboard } from '../src/game/dailyScore.js'

let failed = 0
const check = (n, c) => { if (!c) { console.error('FAIL:', n); failed++ } else console.log('ok:', n) }

const row = (attempt_no, maps_cleared, elapsed_ms, user_id = 'u1', username = 'A') =>
  ({ attempt_no, maps_cleared, elapsed_ms, user_id, username })

// bestOfFirst3: best of attempts 1-3 (maps DESC, elapsed ASC); ignores 4-10.
check('null when no rows', bestOfFirst3([]) === null)
{
  const best = bestOfFirst3([row(1, 2, 5000), row(2, 4, 9000), row(3, 3, 4000)])
  check('best of first 3 = 4 maps', best.maps_cleared === 4 && best.elapsed_ms === 9000)
}
{
  // Attempt 4 with 6 maps must NOT replace the best-of-first-3 (which is 4).
  const best = bestOfFirst3([row(1, 2, 5000), row(2, 4, 9000), row(3, 3, 4000), row(4, 6, 1000)])
  check('attempts 4-10 excluded', best.maps_cleared === 4)
}
{
  // Tie on maps → fewer elapsed_ms wins.
  const best = bestOfFirst3([row(1, 3, 8000), row(2, 3, 6000)])
  check('tiebreak by time', best.elapsed_ms === 6000)
}

// rankLeaderboard: one best-of-first-3 row per user, sorted (maps DESC, time ASC).
{
  const rows = [
    row(1, 3, 5000, 'u1', 'Alice'), row(2, 5, 7000, 'u1', 'Alice'),
    row(1, 5, 6000, 'u2', 'Bob'),
    row(1, 5, 7000, 'u3', 'Cara'), row(4, 9, 100, 'u3', 'Cara'), // attempt 4 ignored
  ]
  const board = rankLeaderboard(rows)
  check('one entry per user', board.length === 3)
  check('sorted maps desc then time asc', board[0].user_id === 'u2' && board[1].user_id === 'u1' && board[2].user_id === 'u3')
  // u1 best-of-3 = attempt 2 (5 maps, 7000ms); u2 = 5 maps 6000ms (wins tie); u3 = 5 maps 7000ms (attempt-4's 9 ignored)
  check('u3 uses first-3 best not attempt 4', board[2].maps_cleared === 5)
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
