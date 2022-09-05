import { Context, EachStep, Execute } from "./decisionTree"
import type { NS } from "@ns"

const REGIONAL_FACTIONS: Record<string, boolean> = {
  "Sector-12": true,
  Chongqing: true,
  "New Tokyo": true,
  Ishima: true,
  Aevum: true,
  Volhaven: true,
}

export const FactionsSteps = [
  new EachStep({
    name: "JoinNonRegionFactions",
    gather: (ctx: Context) =>
      ctx.ns.singularity.checkFactionInvitations().filter((f) => !REGIONAL_FACTIONS[f]),
    log: (ctx: Context, faction: string) => `Joining non-region faction ${faction}`,
    action: (ctx: Context, faction: string) => {
      ctx.ns.singularity.joinFaction(faction)
    },
  }),
]

export async function main(ns: NS) {
  // Stub entrypoint to run only this chain.
  await Execute(ns, "Factions", FactionsSteps)
}
