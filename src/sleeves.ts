import { Context, EachStep, Execute, RunChainStep, Step } from "./decisionTree"
import type { AugmentPair, NS } from "@ns"

function SleeveSteps(num: number) {
  return [
    // Upgrades and other non-terminating stuff at the top. Can split this
    // into its own chain later if needed.
    new EachStep({
      name: "BuyAugmentations",
      gather: (ctx: Context) =>
        ctx.ns.sleeve
          .getSleevePurchasableAugs(num)
          .filter((aug) => aug.cost < ctx.player.money * 0.05),
      log: (ctx: Context, aug: AugmentPair) => `Purchasing ${aug.name} for Sleeve ${num}`,
      action: (ctx: Context, aug: AugmentPair) => {
        ctx.ns.sleeve.purchaseSleeveAug(num, aug.name)
      },
    }),

    // Tasking this sleeve.
    new Step({
      name: "InitialShock",
      gather: () => undefined,
      predicate: (ctx: Context) => ctx.ns.sleeve.getSleeveStats(num).shock > 95,
      action: (ctx: Context) => {
        ctx.ns.sleeve.setToShockRecovery(num)
        return true
      },
    }),

    new Step({
      name: "InitialSync",
      gather: () => undefined,
      predicate: (ctx: Context) => ctx.ns.sleeve.getSleeveStats(num).sync < 50,
      action: (ctx: Context) => {
        // This should never really happen since I max out memory on them always but just in case ...
        ctx.ns.sleeve.setToSynchronize(num)
        return true
      },
    }),

    new Step({
      name: "JoinGang",
      gather: () => undefined,
      predicate: (ctx: Context) => !ctx.ns.gang.inGang(),
      action: (ctx: Context) => {
        ctx.ns.sleeve.setToCommitCrime(num, "Homicide")
        return true
      },
    }),

    new Step({
      name: "Shock",
      gather: () => undefined,
      predicate: (ctx: Context) => ctx.ns.sleeve.getSleeveStats(num).shock > 0,
      action: (ctx: Context) => {
        ctx.ns.sleeve.setToShockRecovery(num)
        return true
      },
    }),

    new Step({
      name: "BackupTask",
      gather: () => undefined,
      action: (ctx: Context) => {
        // Gets some money and XP.
        ctx.ns.sleeve.setToCommitCrime(num, "Heist")
      },
    }),
  ]
}

export const SleevesSteps = [
  new RunChainStep({
    name: "Sleeves",
    chain: (ctx: Context) => {
      const numSleeves = ctx.ns.sleeve.getNumSleeves()
      const steps = []
      for (let num = 0; num < numSleeves; num++) {
        steps.push(
          new RunChainStep({
            name: `Sleeve-${num}`,
            chain: SleeveSteps(num),
          })
        )
      }
      return steps
    },
  }),
]

export async function main(ns: NS) {
  // Stub entrypoint to run only the gang chain.
  await Execute(ns, "Sleeves", SleevesSteps)
}
