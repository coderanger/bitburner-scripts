import { Chain, Context, ExecuteChain, RunChainStep, Step } from "./descisionTree"
import type { NS } from "@ns"

const CRIME_GANG_FACTIONS = ["Slum Snakes", "Tetrads", "The Syndicate"]

type AscensionStats = Record<string, { current: number; next: number }>

function UpgradeGangMemberSteps(gangMember: string) {
  return () => [
    new Step({
      name: `AscendGangMember-${gangMember}`,
      gather: (ctx: Context) => {
        const results = ctx.ns.gang.getAscensionResult(gangMember)
        if (results === undefined) {
          // Can't ascend.
          return undefined
        }
        // Figure out the stat multiplier increases.
        const info = ctx.ns.gang.getMemberInformation(gangMember)
        const stats: AscensionStats = {}
        for (const stat of ["agi", "cha", "def", "dex", "hack", "str"] as const) {
          const current = info[`${stat}_asc_mult`]
          const next = current * results[stat]
          stats[stat] = { current, next }
        }
        return stats
      },
      predicate: (ctx: Context, stats: AscensionStats | undefined) => {
        if (stats === undefined) {
          // Can't ascend.
          return false
        }
        // Check if the jump is enough to care.
        const readyStats: Record<string, boolean> = {}
        for (const statName in stats) {
          const stat = stats[statName]
          let ready
          if (stat.current < 30) {
            const threshold = stat.current < 10 ? 2 : 5
            ready = stat.current - (stat.current % threshold) + threshold >= stat.next
          } else {
            // Just don't care past 30.
            ready = false
          }
          readyStats[statName] = ready
        }
        return (
          readyStats.hack || readyStats.chr || (readyStats.str && readyStats.def && readyStats.dex)
        )
      },
      log: (ctx: Context, stats: AscensionStats | undefined) => {
        const increases: { statName: string; increase: number }[] = []
        for (const statName in stats) {
          const stat = stats[statName]
          const increase = stat.next - stat.current
          if (increase >= 2) {
            increases.push({ statName, increase })
          }
        }
        increases.sort((a, b) => b.increase - a.increase)
        ctx.log.info(
          `Ascending ${gangMember}: ${increases
            .map(
              (i) =>
                `${i.statName} +${i.increase.toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}`
            )
            .join(" ")}`
        )
      },
      action: (ctx: Context) => {
        ctx.ns.gang.ascendMember(gangMember)
      },
    }),

    new Step({
      name: `EquipGangMember-${gangMember}`,
      gather: (ctx: Context) => {
        const toPurchase: string[] = []
        let money = ctx.ns.getPlayer().money
        const info = ctx.ns.gang.getMemberInformation(gangMember)
        for (const equip of ctx.ns.gang.getEquipmentNames()) {
          if (info.upgrades.includes(equip) || info.augmentations.includes(equip)) {
            continue
          }
          const stats = ctx.ns.gang.getEquipmentStats(equip)
          if (stats.hack !== undefined) {
            // Ignore hacking gear.
            continue
          }
          const cost = ctx.ns.gang.getEquipmentCost(equip)
          // Buy anything costs less than 1% of total money.
          if (cost <= money * 0.01) {
            toPurchase.push(equip)
            money -= cost
          }
        }
        return toPurchase
      },
      predicate: (ctx: Context, toPurchase: string[]) => {
        return toPurchase.length !== 0
      },
      log: (ctx: Context, toPurchase: string[]) => {
        ctx.log.info(`Buying equipment ${toPurchase.join(", ")} for ${gangMember}`)
      },
      action: (ctx: Context, toPurchase: string[]) => {
        for (const equip of toPurchase) {
          ctx.ns.gang.purchaseEquipment(gangMember, equip)
        }
      },
    }),
  ]
}

export function GangChain() {
  return new Chain("Gang", [
    new Step({
      name: "CreateGang",
      gather: (ctx: Context) => {
        // Check if we're in a crime gang faction. If not don't bother with the rest.
        const player = ctx.ns.getPlayer()
        return CRIME_GANG_FACTIONS.find((faction) => player.factions.includes(faction))
      },
      predicate: (ctx: Context, gangFaction: string | undefined) => {
        return gangFaction !== undefined
      },
      action: (ctx: Context, gangFaction: string | undefined) => {
        if (gangFaction === undefined) {
          throw `Invalid faction to join`
        }
        if (!ctx.ns.gang.inGang()) {
          return !ctx.ns.gang.createGang(gangFaction)
        } else {
          // No-op when already in a gang.
          ctx.log.debug("Already in a gang")
          return false
        }
      },
    }),

    new RunChainStep({
      name: "UpgradeGangMembers",
      chain: (ctx: Context) =>
        ctx.ns.gang.getMemberNames().map(
          (member) =>
            new RunChainStep({
              name: `UpgradeGangMember-${member}`,
              chain: UpgradeGangMemberSteps(member),
            })
        ),
    }),
  ])
}

export async function main(ns: NS) {
  // Stub entrypoint to run only the gang chain.
  await ExecuteChain(ns, GangChain())
}
