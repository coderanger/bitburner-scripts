import { Context, EachStep, Execute, RunChainStep, StatefulStep, Step } from "./decisionTree"
import type { AugmentPair, NS } from "@ns"

interface GeneralTask {
  type: string
}

interface BladeburnerTask {
  actionType: string
  actionName: string
}

type SleeveTask = null | GeneralTask | BladeburnerTask

function SetBladeburnerActionSteps(
  num: number,
  action: string,
  actionType: string | undefined,
  actionName: string | undefined,
  type: string | undefined = undefined,
  contract: string | undefined = undefined
) {
  return [
    new Step({
      name: "SetBladeburnerAction",
      gather: (ctx: Context) => ctx.ns.sleeve.getTask(num) as SleeveTask,
      predicate: (ctx: Context, task: SleeveTask) =>
        task !== null && "type" in task
          ? task.type !== type
          : task?.actionType !== actionType || task?.actionName !== actionName,
      log: () => `Setting Sleeve ${num} to Bladeburner ${action}`,
      action: (ctx: Context) => {
        const ok = ctx.ns.sleeve.setToBladeburnerAction(num, action, contract)
        if (!ok) throw `Unable to ${action}`
        return true
      },
    }),

    // So we always bail on the parent chain.
    new Step({
      name: "TerminateChain",
      gather: () => undefined,
      action: () => true,
    }),
  ]
}

function SleeveSteps(num: number) {
  return [
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

    // For the first sleeve, try to do field work if possible so something is feeding the other bodies XP.
    new Step({
      name: "FieldWork",
      gather: () => undefined,
      predicate: () => num === 0,
      log: () => `Setting Sleeve 0 to field work (if possible)`,
      action: (ctx: Context) => {
        const task = ctx.ns.sleeve.getTask(num)
        if (task?.type === "FACTION" && task?.factionWorkType === "FIELD") return true
        for (const faction of ctx.player.factions) {
          try {
            const ok = ctx.ns.sleeve.setToFactionWork(num, faction, "FIELD")
            if (ok) {
              return true
            }
          } catch {
            continue
          }
        }
        return false
      },
    }),

    // If we have too much Bladeburner chaos, everyone does diplomacy.
    new StatefulStep({
      name: "BladeburnerDiplomacy",
      gather: (ctx: Context) => ctx.bladeburner.data?.chaos || 0,
      enter: (ctx: Context, chaos: number) => chaos >= 25,
      exit: (ctx: Context, chaos: number) => chaos <= 1,
      action: () => SetBladeburnerActionSteps(num, "Diplomacy", "General", "Diplomacy"),
    }),

    new StatefulStep({
      name: "BladeburnerFieldAnalysis",
      gather: (ctx: Context) => {
        if (ctx.bladeburner.data === undefined) return undefined
        return ctx.bladeburner.data.contracts
          .concat(ctx.bladeburner.data.operations)
          .concat(ctx.bladeburner.data.blackOps)
          .map((m) => ({ ...m, spread: m.successChance[1] - m.successChance[0] }))
          .reduce((p, c) => (p.spread >= c.spread ? p : c)).spread
      },
      enter: (ctx: Context, worstSpread: number | undefined) =>
        worstSpread !== undefined && worstSpread >= 0.1,
      exit: (ctx: Context, worstSpread: number | undefined) =>
        worstSpread === undefined || worstSpread <= 0.05,
      action: () => SetBladeburnerActionSteps(num, "Field analysis", "General", "Field Analysis"),
    }),

    new StatefulStep({
      name: "BladeburnerInfiltration",
      gather: (ctx: Context) => {
        if (ctx.bladeburner.data === undefined) return undefined
        return ctx.bladeburner.data.contracts
          .concat(ctx.bladeburner.data.operations)
          .reduce((p, c) => (p.remaining <= c.remaining ? p : c)).remaining
      },
      enter: (ctx: Context, worstAvailable: number | undefined) =>
        worstAvailable !== undefined && worstAvailable <= 10,
      exit: (ctx: Context, worstAvailable: number | undefined) =>
        worstAvailable === undefined || worstAvailable >= 50,
      action: () =>
        SetBladeburnerActionSteps(num, "Infiltrate synthoids", undefined, undefined, "INFILTRATE"),
    }),

    new Step({
      name: "BladeburnerContracts",
      gather: (ctx: Context) => {
        if (ctx.bladeburner.data === undefined) return undefined
        const inProgress: Record<string, boolean> = {}
        for (let i = 0; i < ctx.ns.sleeve.getNumSleeves(); i++) {
          if (i === num) continue
          const task = ctx.ns.sleeve.getTask(i)
          if (task?.actionType === "Contracts") {
            inProgress[task.actionName] = true
          }
        }
        return ctx.bladeburner.data.contracts
          .slice()
          .reverse()
          .find((c) => c.remaining > 10 && c.successChance[0] >= 0.85 && !inProgress[c.name])?.name
      },
      predicate: (ctx: Context, name: string | undefined) => {
        if (name === undefined) return false
        const hp = ctx.ns.sleeve.getInformation(num).hp
        return hp.current >= hp.max * 0.5
      },
      action: (ctx: Context, name: string | undefined) => {
        if (name === undefined) throw "Invalid name"
        return SetBladeburnerActionSteps(
          num,
          "Take on contracts",
          "Contracts",
          name,
          undefined,
          name
        )
      },
    }),

    // TODO Work for any factions with unpurchased augs.

    new Step({
      name: "LevelUpMainBody",
      gather: (ctx: Context) =>
        ctx.ns.sleeve.getSleeveStats(num).strength < 100 ? "MUG" : "HOMICIDE",
      predicate: (ctx: Context) => ctx.player.skills.strength < 100,
      action: (ctx: Context, crime: string) => {
        const task = ctx.ns.sleeve.getTask(num)
        if (task?.type === "CRIME" && task?.crimeType === crime) return true
        ctx.ns.sleeve.setToCommitCrime(num, crime)
        return true
      },
    }),

    new Step({
      name: "BackupTask",
      gather: () => undefined,
      predicate: (ctx: Context) => {
        const task = ctx.ns.sleeve.getTask(num)
        return task === null || task.type !== "FACTION"
      },
      action: (ctx: Context) => {
        const task = ctx.ns.sleeve.getTask(num)
        if (task?.type === "CRIME" && task?.crimeType === "HEIST") return true
        // Gets some money and XP.
        ctx.ns.sleeve.setToCommitCrime(num, "Heist")
        return true
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
  // Stub entrypoint to run only this chain.
  await Execute(ns, "Sleeves", SleevesSteps)
}
