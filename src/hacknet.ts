import { Context, Execute, RepeatingStep, Step } from "./decisionTree"
import type { Server } from "./utils"
import type { NS, Player } from "@ns"

type UpgradeType = "level" | "ram" | "core" | "newNode" | "cache"

interface UpgradeScenario {
  index: number
  type: UpgradeType
  cost: number
  production: number
  baseProduction: number
}

class HacknetServer {
  index: number
  level: number
  ram: number
  cores: number
  production: number

  constructor(ns: NS, player: Player, index: number) {
    this.index = index
    const stats = ns.hacknet.getNodeStats(index)
    this.level = stats.level
    this.ram = stats.ram
    this.cores = stats.cores
    this.production = ns.formulas.hacknetServers.hashGainRate(
      this.level,
      0,
      this.ram,
      this.cores,
      player.mults.hacknet_node_money
    )
  }

  levelUpgrade(ns: NS, player: Player): UpgradeScenario {
    const cost = ns.formulas.hacknetServers.levelUpgradeCost(
      this.level,
      1,
      player.mults.hacknet_node_level_cost
    )
    const production = ns.formulas.hacknetServers.hashGainRate(
      this.level + 1,
      0,
      this.ram,
      this.cores,
      player.mults.hacknet_node_money
    )
    return {
      index: this.index,
      type: "level",
      cost,
      production,
      baseProduction: this.production,
    }
  }

  ramUpgrade(ns: NS, player: Player): UpgradeScenario {
    const cost = ns.formulas.hacknetServers.ramUpgradeCost(
      this.ram,
      1,
      player.mults.hacknet_node_ram_cost
    )
    const production = ns.formulas.hacknetServers.hashGainRate(
      this.level,
      0,
      this.ram * 2,
      this.cores,
      player.mults.hacknet_node_money
    )
    return {
      index: this.index,
      type: "ram",
      cost,
      production,
      baseProduction: this.production,
    }
  }

  coreUpgrade(ns: NS, player: Player): UpgradeScenario {
    const cost = ns.formulas.hacknetServers.coreUpgradeCost(
      this.cores,
      1,
      player.mults.hacknet_node_core_cost
    )
    const production = ns.formulas.hacknetServers.hashGainRate(
      this.level,
      0,
      this.ram,
      this.cores + 1,
      player.mults.hacknet_node_money
    )
    return {
      index: this.index,
      type: "core",
      cost,
      production,
      baseProduction: this.production,
    }
  }

  // A synthetic upgrade to see if buying a node and upgrading it to this level would be better.
  newNodeUpgrade(ns: NS, player: Player): UpgradeScenario {
    const levelCost = ns.formulas.hacknetServers.levelUpgradeCost(
      1,
      this.level - 1,
      player.mults.hacknet_node_level_cost
    )
    const ramCost = ns.formulas.hacknetServers.ramUpgradeCost(
      1,
      Math.log2(this.ram),
      player.mults.hacknet_node_ram_cost
    )
    const coreCost = ns.formulas.hacknetServers.coreUpgradeCost(
      1,
      this.cores - 1,
      player.mults.hacknet_node_core_cost
    )
    return {
      index: this.index,
      type: "newNode",
      cost: levelCost + ramCost + coreCost + ns.hacknet.getPurchaseNodeCost(),
      production: this.production,
      baseProduction: 0,
    }
  }

  upgrades(ns: NS, player: Player): UpgradeScenario[] {
    return [
      this.levelUpgrade(ns, player),
      this.ramUpgrade(ns, player),
      this.coreUpgrade(ns, player),
      this.newNodeUpgrade(ns, player),
    ]
  }
}

function allUpgrades(ns: NS) {
  const upgrades: UpgradeScenario[] = []
  const numNodes = ns.hacknet.numNodes()
  const player = ns.getPlayer()
  for (let i = 0; i < numNodes; i++) {
    const server = new HacknetServer(ns, player, i)
    upgrades.push(...server.upgrades(ns, player))
  }
  return upgrades
}

function upgradeValue(upgrade: UpgradeScenario) {
  const productionGain = upgrade.production - upgrade.baseProduction
  return productionGain / upgrade.cost
}

function bestUpgrade(ns: NS) {
  const upgrades = allUpgrades(ns).map((u) => [u, upgradeValue(u)] as const)
  if (upgrades.length === 0) {
    return undefined
  }
  const best = upgrades.reduce((prev, cur) => (prev[1] >= cur[1] ? prev : cur))
  return best[0]
}

interface SpendHashesOn {
  action: string
  cost: number
  target?: Server
  count: number
}

export function HacknetSteps() {
  return [
    new Step({
      name: "SpendHashes",
      gather: (ctx: Context) => {
        const available: SpendHashesOn[] = []
        // Hacking upgrade actions.
        // Reduce sec.
        const minSecTarget = Object.values(ctx.servers)
          .filter((s) => s.info.minDifficulty > 1)
          .reduce((prev, cur) => (prev.info.moneyMax >= cur.info.moneyMax ? prev : cur))
        if (ctx.player.skills.hacking >= minSecTarget.info.requiredHackingSkill) {
          available.push({
            action: "Reduce Minimum Security",
            cost: ctx.ns.hacknet.hashCost("Reduce Minimum Security"),
            target: minSecTarget,
            count: 1,
          })
        }
        // Increase money.
        const maxMoneyTarget = Object.values(ctx.servers)
          .filter((s) => s.info.moneyMax < 10_000_000_000_000)
          .reduce((prev, cur) => (prev.info.moneyMax >= cur.info.moneyMax ? prev : cur))
        if (ctx.player.skills.hacking >= minSecTarget.info.requiredHackingSkill) {
          available.push({
            action: "Increase Maximum Money",
            cost: ctx.ns.hacknet.hashCost("Increase Maximum Money"),
            target: maxMoneyTarget,
            count: 1,
          })
        }

        // Bladeburner actions.
        if (ctx.player.inBladeburner) {
          available.push({
            action: "Exchange for Bladeburner Rank",
            cost: ctx.ns.hacknet.hashCost("Exchange for Bladeburner Rank"),
            count: 1,
          })
          available.push({
            action: "Exchange for Bladeburner SP",
            cost: ctx.ns.hacknet.hashCost("Exchange for Bladeburner SP"),
            count: 1,
          })
        }

        // Corporation actions.
        if (ctx.player.hasCorporation) {
          available.push({
            action: "Sell for Corporation Funds",
            cost: ctx.ns.hacknet.hashCost("Sell for Corporation Funds"),
            count: 1,
          })
          // TODO when to do research?
        }

        const current = ctx.ns.hacknet.numHashes()
        const max = ctx.ns.hacknet.hashCapacity()
        // Check if we're still early in the run, if so just sell them off as we can. Otherwise
        // keep 50% of capacity so we can use them for other things.
        const toKeepPct = max <= 10_000 || current >= max * 0.9 ? 0 : 0.5
        const toKeep = Math.min(Math.ceil(max * toKeepPct), 50_000)
        const effectiveCurrent = current - toKeep
        const affordable = available.filter((a) => a.cost <= max)

        // Do we have no actions?
        if (affordable.length === 0) {
          // As many Sell for Money as we can.
          const costPer = ctx.ns.hacknet.hashCost("Sell for Money")
          const count = Math.floor(effectiveCurrent / costPer)
          return {
            action: "Sell for Money",
            cost: costPer * count,
            count,
          }
        }

        // Find the cheapest.
        const cheapestAction = affordable.reduce((p, c) => (p.cost <= c.cost ? p : c))
        // And check if we can afford it.
        if (cheapestAction.cost > effectiveCurrent) {
          cheapestAction.cost = 0
          cheapestAction.count = 0
        }
        return cheapestAction
      },
      predicate: (ctx: Context, data: SpendHashesOn) => data.count > 0,
      log: (ctx: Context, data: SpendHashesOn) =>
        `Running ${data.action} (${data.target?.hostname}) ${data.count} times, ${data.cost} total hashes`,
      action: (ctx: Context, data: SpendHashesOn) => {
        const ret = ctx.ns.hacknet.spendHashes(data.action, data.target?.hostname, data.count)
        if (!ret) {
          throw `Error spending hashes on ${data.action} (${data.target?.hostname}) ${data.count} times for ${data.cost}`
        }
      },
    }),

    // TEMP HACK.
    new Step({
      name: "TempCheckSkipUpgrade",
      gather: () => undefined,
      predicate: (ctx: Context) => ctx.ns.ls("home").includes("hacknetNoUpgrade.txt"),
      action: () => true,
    }),

    // Wait for the first minute to allow for augmentation purchase chaining.
    new Step({
      name: "WaitForOneMinute",
      gather: () => undefined,
      predicate: (ctx: Context) => ctx.ns.getPlayer().playtimeSinceLastAug < 60_000,
      action: () => true,
    }),

    // Stop after an hour.
    new Step({
      name: "StopUpgradesAfterAnHour",
      gather: () => undefined,
      predicate: (ctx: Context) => ctx.ns.getPlayer().playtimeSinceLastAug >= 3_600_000,
      action: () => true,
    }),

    // TODO if in a gang, don't upgrade until there is enough to buy the cheapest gang aug (ignoring anything over 1t).
    // This will allow rapid cycle buying in another chain.

    new Step({
      name: "BuyHacknetServer",
      gather: () => undefined,
      predicate: (ctx: Context) =>
        ctx.ns.hacknet.getPurchaseNodeCost() <= ctx.ns.getPlayer().money &&
        ctx.ns.hacknet.numNodes() < ctx.ns.hacknet.maxNumNodes(),
      log: () => "Buying a new Hacknet Server",
      action: (ctx: Context) => {
        ctx.ns.hacknet.purchaseNode()
      },
    }),

    new RepeatingStep({
      name: "HacknetUpgrade",
      gather: (ctx: Context) => bestUpgrade(ctx.ns),
      predicate: (ctx: Context, upgrade: UpgradeScenario | undefined) => {
        if (upgrade === undefined || upgrade.type === "newNode") {
          return false
        }
        const player = ctx.ns.getPlayer()
        return upgrade.cost + 1_000_000 <= player.money
      },
      log: (ctx: Context, upgrade: UpgradeScenario | undefined) =>
        `Upgrading ${upgrade?.type} on Hacknet Server ${upgrade?.index}`,
      action: (ctx: Context, upgrade: UpgradeScenario | undefined) => {
        switch (upgrade?.type) {
          case "level":
            ctx.ns.hacknet.upgradeLevel(upgrade.index, 1)
            break
          case "ram":
            ctx.ns.hacknet.upgradeRam(upgrade.index, 1)
            break
          case "core":
            ctx.ns.hacknet.upgradeCore(upgrade.index, 1)
            break
        }
      },
    }),

    new Step({
      name: "UpgradeCache",
      gather: (ctx: Context) => {
        const numNodes = ctx.ns.hacknet.numNodes()
        let totalCache = 0
        const upgrades: UpgradeScenario[] = []
        for (let i = 0; i < numNodes; i++) {
          const cache = ctx.ns.hacknet.getNodeStats(i).cache
          if (cache === undefined) {
            continue
          }
          totalCache += cache
          const cost = ctx.ns.hacknet.getCacheUpgradeCost(i, 1)
          upgrades.push({ index: i, type: "cache", cost, production: 0, baseProduction: cache })
        }
        if (upgrades.length === 0 || totalCache >= 1_000_000) {
          return undefined
        }
        return upgrades.reduce((a, b) => (a.baseProduction <= b.baseProduction ? a : b))
      },
      predicate: (ctx: Context, upgrade: UpgradeScenario | undefined) =>
        upgrade !== undefined && upgrade.cost <= ctx.player.money * 0.01,
      log: (ctx: Context, upgrade: UpgradeScenario | undefined) =>
        `Upgrading Cache on Hacknet Server ${upgrade?.index}`,
      action: (ctx: Context, upgrade: UpgradeScenario | undefined) => {
        if (upgrade === undefined) throw "Upgrade is undefined"
        ctx.ns.hacknet.upgradeCache(upgrade.index, 1)
      },
    }),
  ]
}

export async function main(ns: NS) {
  // Stub entrypoint to run only the hacknet chain.
  await Execute(ns, "Hacknet", HacknetSteps())
}
