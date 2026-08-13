// Which of a dual-type Pokémon's two types it ATTACKS with.
//
// Every Pokémon gets exactly one move, and its type comes from here. Single-type
// species are absent — there is nothing to choose — and fall back to types[0].
//
// WHY THIS FILE EXISTS. The move type used to be types[0] unconditionally, which
// is the order PokéAPI happens to list them in. That made all 13 normal/flying
// birds attack as NORMAL, the only type in the game with zero super-effective
// matchups, when their Flying half hits three types hard. Pidgeot was swinging
// with the worst offensive type available to it.
//
// HOW THE DEFAULTS WERE PICKED. Each row starts from the canonical primary type
// — what the species is "about" — except where that primary is Normal, which is
// offensively dead weight. Charizard attacks as Fire, not Flying, because it is
// a fire Pokémon that happens to have wings. Comments mark the rows where the
// OTHER type has more super-effective matchups, so a deliberate re-pick is a
// one-word edit with the tradeoff written next to it.
//
// This is a hand-tuned table on purpose: scoring alone would make Blaziken
// attack as Fighting and Swampert as Ground, which is not what those Pokémon
// are. Add a row when you add a dual-type species; a missing row is not an
// error, it just falls back to types[0].
//
// Keyed by national dex id. Lookup is one hash hit at spawn — the same cost as
// the array access it replaced.
export const ATTACK_TYPE = {
  1:     'grass',      // bulbasaur — grass/poison
  2:     'grass',      // ivysaur — grass/poison
  3:     'grass',      // venusaur — grass/poison
  6:     'fire',       // charizard — fire/flying
  12:    'bug',        // butterfree — bug/flying
  13:    'bug',        // weedle — bug/poison
  14:    'bug',        // kakuna — bug/poison
  15:    'bug',        // beedrill — bug/poison
  16:    'flying',     // pidgey — normal/flying
  17:    'flying',     // pidgeotto — normal/flying
  18:    'flying',     // pidgeot — normal/flying
  21:    'flying',     // spearow — normal/flying
  22:    'flying',     // fearow — normal/flying
  31:    'poison',     // nidoqueen — poison/ground  // ground scores higher (5 vs 2)
  34:    'poison',     // nidoking — poison/ground  // ground scores higher (5 vs 2)
  39:    'fairy',      // jigglypuff — normal/fairy
  40:    'fairy',      // wigglytuff — normal/fairy
  41:    'poison',     // zubat — poison/flying  // flying scores higher (3 vs 2)
  42:    'poison',     // golbat — poison/flying  // flying scores higher (3 vs 2)
  43:    'grass',      // oddish — grass/poison
  44:    'grass',      // gloom — grass/poison
  45:    'grass',      // vileplume — grass/poison
  46:    'bug',        // paras — bug/grass
  47:    'bug',        // parasect — bug/grass
  48:    'bug',        // venonat — bug/poison
  49:    'bug',        // venomoth — bug/poison
  62:    'water',      // poliwrath — water/fighting  // fighting scores higher (5 vs 3)
  69:    'grass',      // bellsprout — grass/poison
  70:    'grass',      // weepinbell — grass/poison
  71:    'grass',      // victreebel — grass/poison
  72:    'water',      // tentacool — water/poison
  73:    'water',      // tentacruel — water/poison
  74:    'rock',       // geodude — rock/ground  // ground scores higher (5 vs 4)
  75:    'rock',       // graveler — rock/ground  // ground scores higher (5 vs 4)
  76:    'rock',       // golem — rock/ground  // ground scores higher (5 vs 4)
  79:    'water',      // slowpoke — water/psychic
  80:    'water',      // slowbro — water/psychic
  81:    'electric',   // magnemite — electric/steel  // steel scores higher (3 vs 2)
  82:    'electric',   // magneton — electric/steel  // steel scores higher (3 vs 2)
  83:    'flying',     // farfetchd — normal/flying
  84:    'flying',     // doduo — normal/flying
  85:    'flying',     // dodrio — normal/flying
  87:    'water',      // dewgong — water/ice  // ice scores higher (4 vs 3)
  91:    'water',      // cloyster — water/ice  // ice scores higher (4 vs 3)
  92:    'ghost',      // gastly — ghost/poison
  93:    'ghost',      // haunter — ghost/poison
  94:    'ghost',      // gengar — ghost/poison
  95:    'rock',       // onix — rock/ground  // ground scores higher (5 vs 4)
  102:   'grass',      // exeggcute — grass/psychic
  103:   'grass',      // exeggutor — grass/psychic
  111:   'ground',     // rhyhorn — ground/rock
  112:   'ground',     // rhydon — ground/rock
  121:   'water',      // starmie — water/psychic
  122:   'psychic',    // mr-mime — psychic/fairy  // fairy scores higher (3 vs 2)
  123:   'bug',        // scyther — bug/flying
  124:   'ice',        // jynx — ice/psychic
  130:   'water',      // gyarados — water/flying
  131:   'water',      // lapras — water/ice  // ice scores higher (4 vs 3)
  138:   'rock',       // omanyte — rock/water
  139:   'rock',       // omastar — rock/water
  140:   'rock',       // kabuto — rock/water
  141:   'rock',       // kabutops — rock/water
  142:   'rock',       // aerodactyl — rock/flying
  144:   'ice',        // articuno — ice/flying
  145:   'electric',   // zapdos — electric/flying  // flying scores higher (3 vs 2)
  146:   'fire',       // moltres — fire/flying
  149:   'dragon',     // dragonite — dragon/flying  // flying scores higher (3 vs 1)
  169:   'poison',     // crobat — poison/flying  // flying scores higher (3 vs 2)
  174:   'fairy',      // igglybuff — normal/fairy
  199:   'water',      // slowking — water/psychic
  208:   'steel',      // steelix — steel/ground  // ground scores higher (5 vs 3)
  212:   'bug',        // scizor — bug/steel
  230:   'water',      // kingdra — water/dragon
  238:   'ice',        // smoochum — ice/psychic
  256:   'fire',       // combusken — fire/fighting  // fighting scores higher (5 vs 4)
  257:   'fire',       // blaziken — fire/fighting  // fighting scores higher (5 vs 4)
  259:   'water',      // marshtomp — water/ground  // ground scores higher (5 vs 3)
  260:   'water',      // swampert — water/ground  // ground scores higher (5 vs 3)
  389:   'grass',      // torterra — grass/ground  // ground scores higher (5 vs 3)
  391:   'fire',       // monferno — fire/fighting  // fighting scores higher (5 vs 4)
  392:   'fire',       // infernape — fire/fighting  // fighting scores higher (5 vs 4)
  395:   'water',      // empoleon — water/steel
  439:   'psychic',    // mime-jr — psychic/fairy  // fairy scores higher (3 vs 2)
  462:   'electric',   // magnezone — electric/steel  // steel scores higher (3 vs 2)
  464:   'ground',     // rhyperior — ground/rock
  499:   'fire',       // pignite — fire/fighting  // fighting scores higher (5 vs 4)
  500:   'fire',       // emboar — fire/fighting  // fighting scores higher (5 vs 4)
  519:   'flying',     // pidove — normal/flying
  520:   'flying',     // tranquill — normal/flying
  521:   'flying',     // unfezant — normal/flying
  527:   'psychic',    // woobat — psychic/flying  // flying scores higher (3 vs 2)
  528:   'psychic',    // swoobat — psychic/flying  // flying scores higher (3 vs 2)
  530:   'ground',     // excadrill — ground/steel
  536:   'water',      // palpitoad — water/ground  // ground scores higher (5 vs 3)
  537:   'water',      // seismitoad — water/ground  // ground scores higher (5 vs 3)
  540:   'bug',        // sewaddle — bug/grass
  541:   'bug',        // swadloon — bug/grass
  542:   'bug',        // leavanny — bug/grass
  543:   'bug',        // venipede — bug/poison
  544:   'bug',        // whirlipede — bug/poison
  545:   'bug',        // scolipede — bug/poison
  546:   'grass',      // cottonee — grass/fairy
  547:   'grass',      // whimsicott — grass/fairy
  551:   'ground',     // sandile — ground/dark
  552:   'ground',     // krokorok — ground/dark
  553:   'ground',     // krookodile — ground/dark
  557:   'bug',        // dwebble — bug/rock  // rock scores higher (4 vs 3)
  558:   'bug',        // crustle — bug/rock  // rock scores higher (4 vs 3)
  559:   'dark',       // scraggy — dark/fighting  // fighting scores higher (5 vs 2)
  560:   'dark',       // scrafty — dark/fighting  // fighting scores higher (5 vs 2)
  561:   'psychic',    // sigilyph — psychic/flying  // flying scores higher (3 vs 2)
  564:   'water',      // tirtouga — water/rock  // rock scores higher (4 vs 3)
  565:   'water',      // carracosta — water/rock  // rock scores higher (4 vs 3)
  566:   'rock',       // archen — rock/flying
  567:   'rock',       // archeops — rock/flying
  580:   'water',      // ducklett — water/flying
  581:   'water',      // swanna — water/flying
  585:   'grass',      // deerling — normal/grass
  586:   'grass',      // sawsbuck — normal/grass
  587:   'electric',   // emolga — electric/flying  // flying scores higher (3 vs 2)
  589:   'bug',        // escavalier — bug/steel
  590:   'grass',      // foongus — grass/poison
  591:   'grass',      // amoonguss — grass/poison
  592:   'water',      // frillish-male — water/ghost
  593:   'water',      // jellicent-male — water/ghost
  595:   'bug',        // joltik — bug/electric
  596:   'bug',        // galvantula — bug/electric
  597:   'grass',      // ferroseed — grass/steel
  598:   'grass',      // ferrothorn — grass/steel
  607:   'ghost',      // litwick — ghost/fire  // fire scores higher (4 vs 2)
  608:   'ghost',      // lampent — ghost/fire  // fire scores higher (4 vs 2)
  609:   'ghost',      // chandelure — ghost/fire  // fire scores higher (4 vs 2)
  618:   'ground',     // stunfisk — ground/electric
  622:   'ground',     // golett — ground/ghost
  623:   'ground',     // golurk — ground/ghost
  624:   'dark',       // pawniard — dark/steel  // steel scores higher (3 vs 2)
  625:   'dark',       // bisharp — dark/steel  // steel scores higher (3 vs 2)
  627:   'flying',     // rufflet — normal/flying
  628:   'flying',     // braviary — normal/flying
  629:   'dark',       // vullaby — dark/flying  // flying scores higher (3 vs 2)
  630:   'dark',       // mandibuzz — dark/flying  // flying scores higher (3 vs 2)
  632:   'bug',        // durant — bug/steel
  633:   'dark',       // deino — dark/dragon
  634:   'dark',       // zweilous — dark/dragon
  635:   'dark',       // hydreigon — dark/dragon
  636:   'bug',        // larvesta — bug/fire  // fire scores higher (4 vs 3)
  637:   'bug',        // volcarona — bug/fire  // fire scores higher (4 vs 3)
  638:   'steel',      // cobalion — steel/fighting  // fighting scores higher (5 vs 3)
  639:   'rock',       // terrakion — rock/fighting  // fighting scores higher (5 vs 4)
  640:   'grass',      // virizion — grass/fighting  // fighting scores higher (5 vs 3)
  642:   'electric',   // thundurus-incarnate — electric/flying  // flying scores higher (3 vs 2)
  643:   'dragon',     // reshiram — dragon/fire  // fire scores higher (4 vs 1)
  644:   'dragon',     // zekrom — dragon/electric  // electric scores higher (2 vs 1)
  646:   'dragon',     // kyurem — dragon/ice  // ice scores higher (4 vs 1)
  647:   'water',      // keldeo-ordinary — water/fighting  // fighting scores higher (5 vs 3)
  649:   'bug',        // genesect — bug/steel
  866:   'ice',        // mr-rime — ice/psychic
  867:   'ground',     // runerigus — ground/ghost
  900:   'bug',        // kleavor — bug/rock  // rock scores higher (4 vs 3)
  902:   'water',      // basculegion-male — water/ghost
  979:   'fighting',   // annihilape — fighting/ghost
  983:   'dark',       // kingambit — dark/steel  // steel scores higher (3 vs 2)

  // ── Mega Evolution forms ──────────────────────────────────────────────
  // Keyed by the MEGA FORM's own PokéAPI id (10033+), not the base species
  // id — a mega'd instance keeps its base pokeId for lookups (vitamins,
  // Pokédex ownership) but its move-type pick must consult the form it's
  // actually wearing right now, since 9 forms change typing on mega. See
  // docs/superpowers/specs/2026-08-13-mega-evolution-design.md §2.
  10034: 'fire',       // charizard-mega-x — fire/dragon (was fire/flying)
  10041: 'water',      // gyarados-mega — water/dark (was water/flying)
  10043: 'psychic',    // mewtwo-mega-x — psychic/fighting
  10045: 'electric',   // ampharos-mega — electric/dragon
  10065: 'grass',      // sceptile-mega — grass/dragon
  10067: 'dragon',     // altaria-mega — dragon/fairy
  10040: 'bug',        // pinsir-mega — bug/flying (newly dual-type)
  10088: 'fighting',   // lopunny-mega — normal/fighting — fighting scores higher, normal is dead weight
  10069: 'fairy',      // audino-mega — normal/fairy — fairy scores higher, normal is dead weight
}

// The type a Pokémon attacks with: its authored choice, else its first type.
// `types` is the instance's own array, so a species missing from the table (a
// new region, a form not yet authored) still resolves.
export function attackTypeFor(pokeId, types) {
  // A Type Prism leaves the Pokémon single-typed, so there is nothing to
  // choose and the authored row no longer applies — consulting the table here
  // would drag a prismed Swampert back to Water on its next TM or evolution.
  if (types?.length === 1) return types[0]
  return ATTACK_TYPE[pokeId] ?? types?.[0] ?? 'normal'
}

// The OTHER type — the one `attackTypeFor` didn't pick. Null for a single-type
// Pokémon, which has no alternate.
//
// This is the primitive behind both retyping items: the Polarity Band swaps
// which type the MOVE uses, and the Type Prism collapses the Pokémon onto its
// alternate entirely. Both are no-ops when this returns null, and both are KEPT
// rather than consumed in that case — 209 of 371 species are single-type, so
// this is the common case, not an edge case.
export function alternateTypeFor(pokeId, types) {
  if (!types || types.length < 2) return null
  const primary = attackTypeFor(pokeId, types)
  return types.find(t => t !== primary) ?? null
}
