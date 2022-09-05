import { Server, moneyStr, scanNetwork } from "./utils"

const SORT_FUNCTIONS: Record<string, (a: Server, b: Server) => number> = {
  money: (a, b) => b.info.moneyMax - a.info.moneyMax,
}

export async function main(ns: NS) {
  const opts = ns.flags([
    ["sort", "money"],
    ["verbose", false],
  ])
  const sortFn = SORT_FUNCTIONS[opts.sort as string]
  if (sortFn === undefined) {
    ns.tprint(`Unknown sort mode ${opts.sort}`)
  }

  let servers = Object.values(scanNetwork(ns)).sort(sortFn)

  const args = opts["_"] as unknown as string[] | undefined
  if (args && args.length !== 0) {
    servers = servers.filter((s) => args.includes(s.hostname))
  }

  for (const s of servers) {
    const segments = [
      `S${s.info.hackDifficulty.toLocaleString(undefined, {
        maximumFractionDigits: opts.verbose ? 5 : 1,
      })}/${s.info.minDifficulty.toLocaleString(undefined, {
        maximumFractionDigits: opts.verbose ? 5 : 1,
      })}`,
      `${moneyStr(s.info.moneyAvailable)}/${moneyStr(s.info.moneyMax)}`,
    ]
    ns.tprint(`${s.hostname}: ${segments.filter((val) => val).join(" | ")}`)
  }
}
