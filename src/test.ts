import type { NS } from "@ns"

export async function main(ns: NS) {
  ns.tprint(ns.getPlayer().factions)
}
