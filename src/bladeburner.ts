import { Context, Execute, StatefulStep, Step } from "./decisionTree"
import type { NS } from "@ns"

const CITIES = ["Sector-12", "Chongqing", "New Tokyo", "Ishima", "Aevum", "Volhaven"]

const SKILL_COST_MULTIPLIERS: Record<string, number> = {
  "Blade's Intuition": 1, // +success all
  Cloak: 1.5, // +success stealth
  "Short-Circuit": 1.5, // +success retirement
  "Digital Observer": 1.5, // +success ops/black ops
  Tracer: 1, // +success contracts
  Overclock: 1, // -time (max level: 90)
  Reaper: 2, // +stats
  "Evasive System": 2, // +dex & agi
  Datamancer: 5, // improve field analysis
  "Cyber's Edge": 2, // +max stamina
  "Hands of Midas": 2, // +contract money
  Hyperdrive: 5, // +xp
}

function SetBladeburnerActionSteps(type: string, name: string) {
  return [
    new Step({
      name: "StopNonBladeburnerAction",
      gather: () => undefined,
      predicate: (ctx: Context) =>
        ctx.ns.singularity.getCurrentWork() !== null &&
        !ctx.ns.singularity.getOwnedAugmentations().includes("The Blade's Simulacrum"),
      log: () => "Stopping non-Bladeburner work",
      action: (ctx: Context) => {
        ctx.ns.singularity.stopAction()
      },
    }),

    new Step({
      name: "StartAction",
      gather: () => undefined,
      predicate: (ctx: Context) => {
        const curAction = ctx.ns.bladeburner.getCurrentAction()
        return curAction.type !== type || curAction.name !== name
      },
      log: () => `Starting Bladeburner action ${type} ${name}`,
      action: (ctx: Context) => {
        const ok = ctx.ns.bladeburner.startAction(type, name)
        if (!ok) throw `Unable to start Bladeburner action ${type} ${name}`
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

export const BladeburnerSteps = [
  new Step({
    name: "JoinBladeburner",
    gather: () => undefined,
    predicate: (ctx: Context) =>
      ctx.player.skills.strength >= 100 &&
      ctx.player.skills.defense >= 100 &&
      ctx.player.skills.dexterity >= 100 &&
      ctx.player.skills.agility >= 100 &&
      !ctx.player.inBladeburner,
    log: () => "Joining Bladeburner",
    action: (ctx: Context) => {
      const ok = ctx.ns.bladeburner.joinBladeburnerDivision()
      if (!ok) throw "Unable to join Bladeburner"

      ctx.player.inBladeburner = true
    },
  }),

  // Just so every further step doesn't need to check.
  new Step({
    name: "CheckInBladeBurner",
    gather: () => undefined,
    predicate: (ctx: Context) => ctx.player.inBladeburner,
    final: true,
    action: () => false,
  }),

  new Step({
    name: "JoinFaction",
    gather: () => undefined,
    predicate: (ctx: Context) =>
      ctx.ns.bladeburner.getRank() >= 25 && !ctx.player.factions.includes("Bladeburners"),
    log: () => "Joining Bladeburner faction",
    action: (ctx: Context) => {
      const ok = ctx.ns.bladeburner.joinBladeburnerFaction()
      if (!ok) throw "Unable to join Bladeburner faction"
    },
  }),

  // Write out a JSON file with current Bladeburner state for use in other subsystems.
  new Step({
    name: "WriteData",
    gather: () => undefined,
    action: async (ctx: Context) => {
      const rank = ctx.ns.bladeburner.getRank()
      const data = {
        rank: ctx.ns.bladeburner.getRank(),
        chaos: ctx.ns.bladeburner.getCityChaos(ctx.ns.bladeburner.getCity()),
        contracts: ctx.ns.bladeburner.getContractNames().map((name) => ({
          name,
          remaining: ctx.ns.bladeburner.getActionCountRemaining("Contract", name),
          successChance: ctx.ns.bladeburner.getActionEstimatedSuccessChance("Contract", name),
        })),
        operations: ctx.ns.bladeburner.getOperationNames().map((name) => ({
          name,
          remaining: ctx.ns.bladeburner.getActionCountRemaining("Operation", name),
          successChance: ctx.ns.bladeburner.getActionEstimatedSuccessChance("Operation", name),
        })),
        blackOps: ctx.ns.bladeburner
          .getBlackOpNames()
          .filter((name) => ctx.ns.bladeburner.getBlackOpRank(name) <= rank)
          .map((name) => ({
            name,
            remaining: ctx.ns.bladeburner.getActionCountRemaining("BlackOp", name),
            successChance: ctx.ns.bladeburner.getActionEstimatedSuccessChance("BlackOp", name),
          })),
      }
      await ctx.bladeburner.update(data)
    },
  }),

  new Step({
    name: "UpgradeSkills",
    gather: (ctx: Context) => {
      const points = ctx.ns.bladeburner.getSkillPoints()
      const skills = ctx.ns.bladeburner.getSkillNames()
      const overclockLevel = ctx.ns.bladeburner.getSkillLevel("Overclock")
      const toBuy: Record<string, number> = {}
      let toBuyCost = 0
      while (true) {
        // First look for the cheapest skill to upgrade (given multipliers).
        const upgradeCosts = skills.map((skill) => {
          const curCount = toBuy[skill] || 0
          const nextCount = curCount + 1
          const curCost =
            curCount === 0 ? 0 : ctx.ns.bladeburner.getSkillUpgradeCost(skill, curCount)
          const nextCost =
            skill === "Overclock" && overclockLevel + curCount >= 90
              ? Number.MAX_SAFE_INTEGER
              : ctx.ns.bladeburner.getSkillUpgradeCost(skill, nextCount)
          const cost = nextCost - curCost
          return { skill, cost, rank: cost * SKILL_COST_MULTIPLIERS[skill] }
        })
        const cheapestUpgrade = upgradeCosts.reduce((p, c) => (p.rank <= c.rank ? p : c))
        if (toBuyCost + cheapestUpgrade.cost > points) {
          // Can't afford this, we're done.
          break
        }
        // Update the state with this new purchase and try again.
        toBuy[cheapestUpgrade.skill] = (toBuy[cheapestUpgrade.skill] || 0) + 1
        toBuyCost += cheapestUpgrade.cost
      }
      return toBuy
    },
    predicate: (ctx: Context, toBuy: Record<string, number>) =>
      Object.values(toBuy).some((l) => l > 0),
    log: (ctx: Context, toBuy: Record<string, number>) =>
      `Purchasing Bladeburner skills ${Object.entries(toBuy)
        .map(([skill, count]) => `${skill} x${count}`)
        .join(", ")}`,
    action: (ctx: Context, toBuy: Record<string, number>) => {
      for (const skill in toBuy) {
        const ok = ctx.ns.bladeburner.upgradeSkill(skill, toBuy[skill])
        if (!ok) throw `Unable to upgrade skill ${skill} by x${toBuy[skill]}`
      }
    },
  }),

  // If we aren't already in gang, don't try to run Bladeburner actions yet, need
  // to do crimes and whatnot first. In theory we could check for the Simulacrum
  // aug but if we aren't in a gang, then no way we have that yet.
  new Step({
    name: "CheckInGang",
    gather: () => undefined,
    predicate: (ctx: Context) => !ctx.ns.gang.inGang(),
    action: () => true,
  }),

  // TODO a way to disable this for doing non-bladeburner activities.

  // If we have no synthoid communities, try flying somewhere which does.
  new Step({
    name: "GetMoreSynthoids",
    gather: (ctx: Context) =>
      CITIES.map((city) => ({
        city,
        communities: ctx.ns.bladeburner.getCityCommunities(city),
      })).reduce((p, c) => (p.communities >= c.communities ? p : c)),
    predicate: (ctx: Context, { city, communities }: { city: string; communities: number }) => {
      const curCity = ctx.ns.bladeburner.getCity()
      const curCommunities = ctx.ns.bladeburner.getCityCommunities(curCity)
      return curCommunities === 0 && communities > 0 && city !== curCity
    },
    log: (ctx: Context, { city }: { city: string }) =>
      `Moving Bladeburner to ${city} to find more synthoids`,
    action: (ctx: Context, { city }: { city: string }) => {
      const ok = ctx.ns.bladeburner.switchCity(city)
      if (!ok) throw `Unable to switch Bladeburner to ${city}`
    },
  }),

  // Pick a task.
  new StatefulStep({
    dryRunSafe: true,
    name: "LowHealthOrStamina",
    gather: (ctx: Context) => ctx.ns.bladeburner.getStamina(),
    enter: (ctx: Context, [curStamina, maxStamina]: [number, number]) =>
      ctx.player.hp.current <= ctx.player.hp.max * 0.5 || curStamina <= maxStamina * 0.6,
    exit: (ctx: Context, [curStamina, maxStamina]: [number, number]) =>
      ctx.player.hp.current >= ctx.player.hp.max * 0.9 && curStamina >= maxStamina * 0.9,
    action: () => SetBladeburnerActionSteps("General", "Hyperbolic Regeneration Chamber"),
  }),

  new StatefulStep({
    dryRunSafe: true,
    name: "HighChaos",
    gather: (ctx: Context) => ctx.ns.bladeburner.getCityChaos(ctx.ns.bladeburner.getCity()),
    enter: (ctx: Context, chaos: number) => chaos >= 25,
    exit: (ctx: Context, chaos: number) => chaos <= 1,
    action: () => SetBladeburnerActionSteps("General", "Diplomacy"),
  }),

  new Step({
    name: "BlackOps",
    dryRunSafe: true,
    gather: (ctx: Context) =>
      ctx.ns.bladeburner
        .getBlackOpNames()
        .find((name) => ctx.ns.bladeburner.getActionCountRemaining("BlackOp", name) > 0),
    predicate: (ctx: Context, name: string | undefined) =>
      name !== undefined &&
      ctx.ns.bladeburner.getBlackOpRank(name) <= ctx.ns.bladeburner.getRank() &&
      ctx.ns.bladeburner.getActionEstimatedSuccessChance("BlackOp", name)[0] >=
        (ctx.ns.bladeburner.getRank() >= 500_00 ? 0.25 : 0.95),
    action: (ctx: Context, name: string | undefined) => {
      if (name === undefined) throw "Invalid name"
      return SetBladeburnerActionSteps("BlackOp", name)
    },
  }),

  new Step({
    name: "Operations",
    dryRunSafe: true,
    gather: (ctx: Context) =>
      ctx.ns.bladeburner
        .getOperationNames()
        .reverse()
        .find(
          (name) =>
            ctx.ns.bladeburner.getActionCountRemaining("Operation", name) > 0 &&
            ctx.ns.bladeburner.getActionEstimatedSuccessChance("Operation", name)[0] >= 0.9
        ),
    predicate: (ctx: Context, name: string | undefined) => name !== undefined,
    action: (ctx: Context, name: string | undefined) => {
      if (name === undefined) throw "Invalid name"
      return SetBladeburnerActionSteps("Operation", name)
    },
  }),

  new Step({
    name: "Contracts",
    dryRunSafe: true,
    gather: (ctx: Context) =>
      ctx.ns.bladeburner
        .getContractNames()
        .reverse()
        .find(
          (name) =>
            ctx.ns.bladeburner.getActionCountRemaining("Contract", name) > 0 &&
            ctx.ns.bladeburner.getActionEstimatedSuccessChance("Contract", name)[0] >= 0.85
        ),
    predicate: (ctx: Context, name: string | undefined) => name !== undefined,
    action: (ctx: Context, name: string | undefined) => {
      if (name === undefined) throw "Invalid name"
      return SetBladeburnerActionSteps("Contract", name)
    },
  }),

  // If we got this far, something is wrong.
  new Step({
    name: "Stop",
    gather: () => undefined,
    log: () => "Stopping Bladeburner action",
    action: (ctx: Context) => {
      ctx.ns.bladeburner.stopBladeburnerAction()
    },
  }),
]

export async function main(ns: NS) {
  // Stub entrypoint to run only this chain.
  await Execute(ns, "Bladeburner", BladeburnerSteps)
}
