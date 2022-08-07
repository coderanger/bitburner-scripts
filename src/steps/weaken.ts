import type { NS } from "@ns"

export async function main(ns: NS) {
  await ns.weaken(ns.args[0].toString())
}
