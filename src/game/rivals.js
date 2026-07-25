// Rival team resolution.
//
// A RIVAL node's roster is mostly a fixed authored list (config.rivalTeams),
// but the rival's own starter depends on the player's pick, so it can't live in
// static data. This module splices it in.
//
// Both the battle path and the map's hover tooltip must show the SAME team, so
// they both call rivalTeamSpecs rather than reading config.rivalTeams directly.

// The rival's full team for a RIVAL node: the authored specs plus, when the
// variant declares a starterCounter, the countering starter appended as the ace
// at the roster's highest level (so it's always the last and strongest mon).
// Falls back to the first counter entry when the player's starter is unknown.
export function rivalTeamSpecs(config, node, starter) {
  const specs = config?.rivalTeams?.[node?.rivalTeam] ?? []
  const counter = config?.rivalStarterCounters?.[node?.rivalTeam]
  if (!counter || specs.length === 0) return specs

  const ace = counter[starter?.id] ?? Object.values(counter)[0]
  if (!ace) return specs

  const topLevel = Math.max(...specs.map(s => s.level))
  return [...specs, { ...ace, level: ace.level ?? topLevel }]
}
