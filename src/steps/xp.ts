import type { NS } from "@ns"

export async function main(ns: NS) {
  const n = parseInt(ns.args[1].toString(), 10)
  for (let i = 0; i < n; i++) {
    await ns.weaken(ns.args[0].toString())
  }
}
