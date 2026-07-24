// Node harness for the pure scoring reducers in src/game/dailyScore.js.
import { bestOfFirst3, rankLeaderboard, SCORED_ATTEMPTS } from '../src/game/dailyScore.js'

let failed = 0
const check = (n, c) => { if (!c) { console.error('FAIL:', n); failed++ } else console.log('ok:', n) }

const row = (attempt_no, maps_cleared, elapsed_ms, user_id = 'u1', username = 'A', starter = null) =>
  ({ attempt_no, maps_cleared, elapsed_ms, user_id, username, starter })

// Attempts are unlimited, but only the first SCORED_ATTEMPTS (10) are ranked.
check('SCORED_ATTEMPTS is 10', SCORED_ATTEMPTS === 10)

// bestOfFirst3: best of attempts 1..SCORED_ATTEMPTS (maps DESC, elapsed ASC).
check('null when no rows', bestOfFirst3([]) === null)
{
  const best = bestOfFirst3([row(1, 2, 5000), row(2, 4, 9000), row(3, 3, 4000)])
  check('best of scored attempts = 4 maps', best.maps_cleared === 4 && best.elapsed_ms === 9000)
}
{
  // Attempt 11 with 6 maps must NOT replace the best of the first 10.
  const best = bestOfFirst3([row(1, 2, 5000), row(2, 4, 9000), row(11, 6, 1000)])
  check('attempts beyond 10 excluded', best.maps_cleared === 4)
}
{
  // Attempt 10 is still scored (boundary).
  const best = bestOfFirst3([row(1, 2, 5000), row(10, 7, 3000)])
  check('attempt 10 is scored', best.maps_cleared === 7)
}
{
  // Tie on maps → fewer elapsed_ms wins.
  const best = bestOfFirst3([row(1, 3, 8000), row(2, 3, 6000)])
  check('tiebreak by time', best.elapsed_ms === 6000)
}
{
  // The scoring attempt's starter is carried through.
  const best = bestOfFirst3([row(1, 2, 5000, 'u1', 'A', 4), row(2, 5, 3000, 'u1', 'A', 7)])
  check('carries scoring attempt starter', best.maps_cleared === 5 && best.starter === 7)
}

// rankLeaderboard: one best-of-scored row per user, sorted (maps DESC, time ASC).
{
  const rows = [
    row(1, 3, 5000, 'u1', 'Alice', 1), row(2, 5, 7000, 'u1', 'Alice', 4),
    row(1, 5, 6000, 'u2', 'Bob', 7),
    row(1, 5, 7000, 'u3', 'Cara', 152), row(11, 9, 100, 'u3', 'Cara', 155), // attempt 11 ignored
  ]
  const board = rankLeaderboard(rows)
  check('one entry per user', board.length === 3)
  check('sorted maps desc then time asc', board[0].user_id === 'u2' && board[1].user_id === 'u1' && board[2].user_id === 'u3')
  // u1 best = attempt 2 (5 maps, 7000ms, starter 4); u2 = 5 maps 6000ms (wins tie); u3 = 5 maps 7000ms (attempt-11's 9 ignored)
  check('u3 uses scored best not attempt 11', board[2].maps_cleared === 5)
  check('leaderboard carries scoring starter', board[1].starter === 4 && board[2].starter === 152)
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
