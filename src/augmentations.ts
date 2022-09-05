import { AugDB, AvailableAugmentation } from "./augDb"
import { Context, Execute, Step } from "./decisionTree"
import type { NS } from "@ns"

export const AugmentationsSteps = [
  new Step({
    name: "LoadAugDB",
    gather: () => undefined,
    predicate: (ctx: Context) => ctx.onceData["augDb"] === undefined,
    action: (ctx: Context) => {
      ctx.onceData["augDb"] = new AugDB(ctx.ns)
    },
  }),

  // If we can buy an aug in the first 60 seconds, do it.
  new Step({
    name: "GetFast",
    gather: (ctx: Context) => (ctx.onceData["augDb"] as AugDB).getAvailable(ctx.ns),
    predicate: (ctx: Context, available: AvailableAugmentation[]) =>
      ctx.player.playtimeSinceLastAug < 60_000 && available.length !== 0,
    log: (ctx: Context, available: AvailableAugmentation[]) =>
      `Buying ${available[0].aug.name} from ${available[0].faction}`,
    action: (ctx: Context, available: AvailableAugmentation[]) => {
      const ok = ctx.ns.singularity.purchaseAugmentation(
        available[0].faction,
        available[0].aug.name
      )
      if (ok) {
        ctx.ns.singularity.installAugmentations("main.js")
      }
    },
  }),
]

export async function main(ns: NS) {
  // Stub entrypoint to run only this chain.
  await Execute(ns, "Augmentations", AugmentationsSteps)
}
