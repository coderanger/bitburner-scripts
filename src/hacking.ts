import { Chain, Context, EachStep, Execute, RepeatingStep, Step } from "./decisionTree"
import type { Server } from "./utils"
import type { NS } from "@ns"

const SHOULD_BACKDOOR: Record<string, boolean> = {
  CSEC: true,
  "avmnite-02h": true,
  "I.I.I.I": true,
  run4theh111z: true,
  "The-Cave": true,
}

const AttackChain = new Chain("Attack", [
  new Step({
    name: "ResetAttackDone",
    gather: () => undefined,
    action: (ctx: Context) => {
      ctx.onceData["attackDone"] = false
    },
  }),

  // TODO read from port 5 to check for any batch done signals and clear those from in-progress target tracking.

  // Look for a server we're allowed to use with available resources.
  new Step({
    name: "FindWorker",
    gather: (ctx: Context) => {
      const useNetworkWorkers = ctx.servers["home"].info.maxRam <= 512
      const workers = Object.values(ctx.servers).filter(
        (s) =>
          (useNetworkWorkers || s.info.purchasedByPlayer || s.hostname === "home") &&
          (ctx.data["useHacknetWorkers"] || !s.hostname.startsWith("hacknet-node-")) &&
          s.info.maxRam >= 4 &&
          s.ramAvailable >= 1.75
      )
      if (workers.length === 0) {
        return undefined
      }
      return workers.reduce((prev, cur) =>
        prev.info.maxRam - prev.info.ramUsed <= cur.info.maxRam - cur.info.ramUsed ? prev : cur
      )
    },
    predicate: (ctx: Context, worker: Server | undefined) => {
      if (worker === undefined) {
        // We're done.
        ctx.onceData["attackDone"] = true
        return false
      }
      return true
    },
    final: true,
    log: (ctx: Context, worker: Server | undefined) => `Using ${worker?.hostname} as worker`,
    action: (ctx: Context, worker: Server | undefined) => {
      ctx.onceData["attackWorker"] = worker
    },
  }),

  new Step({
    name: "InitializeWorker",
    gather: (ctx: Context) => ctx.onceData["attackWorker"] as Server,
    predicate: (ctx: Context, worker: Server) =>
      ctx.data[`workerInitialized-${worker.hostname}`] !== true,
    log: (ctx: Context, worker: Server) => `Initializing worker ${worker.hostname}`,
    action: async (ctx: Context, worker: Server) => {
      const files = ["steplib", "hack2", "weaken2", "grow2", "xp"]
      for (const file of files) {
        await ctx.ns.scp(`/steps/${file}.js`, worker.hostname)
      }
      ctx.data[`workerInitialized-${worker.hostname}`] = true
    },
  }),

  // TODO check some goal mode/flag and worker.isPurchasedServer || == home and run a ns.share() payload.

  new Step({
    name: "GetHackingXp",
    gather: (ctx: Context) => ctx.onceData["attackWorker"] as Server,
    predicate: (ctx: Context) => ctx.data["goal"] === "Hacking XP",
    log: (ctx: Context, worker: Server) => `Launching steps/xp.js on ${worker.hostname}`,
    action: (ctx: Context, worker: Server) => {
      // Check if we can target joesguns, it's the best for XP.
      let target = "home"
      if (ctx.servers["joesguns"].info.hasAdminRights) {
        target = "joesguns"
      }

      // Work out how many reps for 60 seconds.
      const script = "/steps/xp.js"
      const reps = Math.max(Math.floor(60_000 / ctx.ns.getWeakenTime(target)), 1)
      const scriptRam = ctx.ns.getScriptRam(script, target)
      const threads = Math.max(Math.floor(worker.ramAvailable / scriptRam), 1)
      ctx.ns.exec(script, worker.hostname, threads, target, reps)

      // Refresh both the worker and target.
      ctx.servers[worker.hostname].refresh()
      ctx.servers[target].refresh()

      // Abort the chain.
      return true
    },
  }),

  // Find a target not currently under attack.
  new Step({
    name: "FindTarget",
    gather: (ctx: Context) => {
      // something
    },
    predicate: (ctx: Context, target: Server | undefined) => {
      if (target === undefined) {
        // We're done.
        ctx.onceData["attackDone"] = true
        return false
      }
      return true
    },
    final: true,
    log: (ctx: Context, target: Server | undefined) => `Using ${target?.hostname} as worker`,
    action: (ctx: Context, target: Server | undefined) => {
      ctx.onceData["attackTarget"] = target
    },
  }),
])

export function HackingSteps() {
  // Helper function for GetRoot step.
  const tryProgram = (fn: (arg0: string) => void, server: string) => {
    try {
      fn(server)
    } catch {
      // Do nothing
    }
  }

  return [
    // Buy a Tor router once we are over $5m.
    new Step({
      name: "BuyTorRouter",
      gather: () => undefined,
      predicate: (ctx: Context) => !ctx.player.tor && ctx.player.money >= 5_000_000,
      log: () => "Purchasing Tor router to access darkweb",
      action: (ctx: Context) => {
        const ok = ctx.ns.singularity.purchaseTor()
        if (!ok) {
          throw "Error purchasing Tor router"
        }
      },
    }),

    // Buy any programs where cost is less than 25% of total money.
    // TODO base this on "less than X seconds of profit".
    new EachStep({
      name: "BuyPrograms",
      gather: (ctx: Context) =>
        ctx.ns.singularity.getDarkwebPrograms().filter((prog) => {
          const cost = ctx.ns.singularity.getDarkwebProgramCost(prog)
          return cost > 0 && cost <= ctx.player.money * 0.25
        }),
      log: (ctx: Context, prog: string) => `Purchasing program ${prog} from darkweb`,
      action: (ctx: Context, prog: string) => {
        const ok = ctx.ns.singularity.purchaseProgram(prog)
        if (!ok) {
          throw `Error buying program ${prog}`
        }
        ctx.player.money -= ctx.ns.singularity.getDarkwebProgramCost(prog)
      },
    }),

    // Try to get root on anything we don't have root on already.
    new EachStep({
      name: "GetRoot",
      gather: (ctx: Context) => {
        const portsOpenable =
          (ctx.ns.fileExists("BruteSSH.exe", "home") ? 1 : 0) +
          (ctx.ns.fileExists("FTPCrack.exe", "home") ? 1 : 0) +
          (ctx.ns.fileExists("RelaySMTP.exe", "home") ? 1 : 0) +
          (ctx.ns.fileExists("HTTPWorm.exe", "home") ? 1 : 0) +
          (ctx.ns.fileExists("SQLInject.exe", "home") ? 1 : 0)
        return Object.values(ctx.servers).filter(
          (s) =>
            !s.info.hasAdminRights &&
            !s.info.purchasedByPlayer &&
            s.info.numOpenPortsRequired <= portsOpenable
        )
      },
      log: (ctx: Context, server: Server) => `Trying to root ${server.hostname}`,
      action: (ctx: Context, server: Server) => {
        tryProgram(ctx.ns.brutessh, server.hostname)
        tryProgram(ctx.ns.ftpcrack, server.hostname)
        tryProgram(ctx.ns.relaysmtp, server.hostname)
        tryProgram(ctx.ns.httpworm, server.hostname)
        tryProgram(ctx.ns.sqlinject, server.hostname)
        ctx.ns.nuke(server.hostname)
        server.refresh()
      },
    }),

    // Install backdoors on faction-unlocker servers.
    // TODO: Should also do any corpo server that we have >= 300k rep with.
    new EachStep({
      name: "InstallBackdoor",
      gather: (ctx: Context) =>
        Object.values(ctx.servers).filter(
          (s) =>
            SHOULD_BACKDOOR[s.hostname] &&
            s.info.hasAdminRights &&
            !s.info.backdoorInstalled &&
            s.info.requiredHackingSkill <= ctx.player.skills.hacking
        ),
      log: (ctx: Context, server: Server) => `Installing a backdoor on ${server.hostname}`,
      action: async (ctx: Context, server: Server) => {
        const currentlyConnected = ctx.ns.singularity.getCurrentServer()
        ctx.ns.tprint(`Installing a backdoor on ${server.hostname}`)
        ctx.ns.singularity.connect("home")
        for (const pathServer of server.path) {
          ctx.ns.singularity.connect(pathServer)
        }
        await ctx.ns.singularity.installBackdoor()
        server.refresh()
        // Try to restore things but if not, go home.
        ctx.ns.singularity.connect(currentlyConnected) || ctx.ns.singularity.connect("home")
      },
    }),

    new RepeatingStep({
      name: "LaunchAttack",
      gather: () => undefined,
      predicate: (ctx: Context) => ctx.onceData["attackDone"] !== true,
      action: async (ctx: Context) => {
        await AttackChain.run(ctx)
      },
    }),
  ]
}

export async function main(ns: NS) {
  // Stub entrypoint to run only the hacking chain.
  await Execute(ns, "Hacking", HackingSteps())
}
