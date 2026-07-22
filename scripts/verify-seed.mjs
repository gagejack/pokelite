import { encodeSeed, decodeSeed } from '../src/game/seed.js'

let failed = 0
const check = (name, cond) => { if (!cond) { console.error('FAIL:', name); failed++ } else console.log('ok:', name) }

// Round-trip across a spread of seeds and regions.
const seeds = [0, 1, 42, 12345, 0xdeadbeef, 4294967295]
const regions = ['Kanto', 'Unova', 'Hoenn']
for (const r of regions) {
  for (const s of seeds) {
    const code = encodeSeed(r, s)
    const back = decodeSeed(code)
    check(`round-trip ${r}/${s} → ${code}`, back && back.region === r.toUpperCase() && back.seed === (s >>> 0))
  }
}

// Format: REGION-XXXX, uppercase.
check('format has dash + uppercase', /^KANTO-[0-9A-Z]+$/.test(encodeSeed('Kanto', 999)))

// The most confusable letters (I L O U) never appear in the encoded seed part.
const codePart = encodeSeed('Kanto', 0xdeadbeef).split('-')[1]
check('no confusable letters', !/[ILOU]/.test(codePart))

// Case-insensitive + whitespace-tolerant decode.
check('lowercase decodes', decodeSeed('kanto-' + encodeSeed('Kanto', 42).split('-')[1].toLowerCase())?.seed === 42)
check('whitespace trimmed', decodeSeed('  ' + encodeSeed('Kanto', 42) + '  ')?.seed === 42)

// Garbage → null.
check('empty → null', decodeSeed('') === null)
check('no dash → null', decodeSeed('KANTO7Q2') === null)
check('bad char → null', decodeSeed('KANTO-!!!') === null)
check('null input → null', decodeSeed(null) === null)
check('I/O/L/U rejected', decodeSeed('KANTO-IOLU') === null)

// Out-of-uint32-range codes rejected, not silently truncated.
check('overflow → null', decodeSeed('KANTO-ZZZZZZZ') === null) // 34359738367 > 2^32-1
check('max uint32 accepted', decodeSeed(encodeSeed('Kanto', 4294967295))?.seed === 4294967295)

// decode returns the normalized canonical code (uppercase, matches encodeSeed).
check('normalized code returned', decodeSeed('kanto-1b')?.code === encodeSeed('Kanto', decodeSeed('kanto-1b').seed))

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
