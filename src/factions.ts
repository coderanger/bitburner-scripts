import { Context, EachStep, Execute, Step } from "./decisionTree"
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
    name: "JoinFactions",
    gather: (ctx: Context) => {
      // Check if we're already in a regional faction.
      const inRegional = ctx.player.factions.some((f) => REGIONAL_FACTIONS[f])
      let invites = ctx.ns.singularity.checkFactionInvitations()
      if (!inRegional) {
        // If not already in a regional block, don't auto-join those.
        invites = invites.filter((f) => !REGIONAL_FACTIONS[f])
      }
      return invites
    },
    log: (ctx: Context, faction: string) => `Joining faction ${faction}`,
    action: (ctx: Context, faction: string) => {
      ctx.ns.singularity.joinFaction(faction)
    },
  }),

  // Being in Chongqing triggers a bunch of faction invites.
  new Step({
    name: "GoToChongqing",
    gather: () => undefined,
    predicate: (ctx: Context) => {
      if (ctx.player.money <= 10_000_000) return false
      const tdhAvailable =
        ctx.player.skills.hacking >= 50 && !ctx.player.factions.includes("Tian Di Hui")
      const tetradsAvailable =
        ctx.player.skills.strength >= 75 &&
        ctx.player.skills.defense >= 75 &&
        ctx.player.skills.dexterity >= 75 &&
        ctx.player.skills.agility >= 75 &&
        ctx.ns.heart.break() <= -18 &&
        !ctx.player.factions.includes("Tetrads")
      return ctx.player.location !== "Chongqing" && (tdhAvailable || tetradsAvailable)
    },
    log: () => `Flying to Chongqing for faction invites`,
    action: (ctx: Context) => {
      ctx.ns.singularity.travelToCity("Chongqing")
    },
  }),
]

export async function main(ns: NS) {
  // Stub entrypoint to run only this chain.
  await Execute(ns, "Factions", FactionsSteps)
}
