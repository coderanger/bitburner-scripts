/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  Chain,
  Context,
  EachStep,
  Execute,
  RepeatingStep,
  RunChainStep,
  Step,
} from "./decisionTree"
import type { Server } from "./utils"
import { step } from "/steps/stepslib"
import type { NS } from "@ns"

const SHOULD_BACKDOOR: Record<string, boolean> = {
  CSEC: true,
  "avmnite-02h": true,
  "I.I.I.I": true,
  run4theh111z: true,
  "The-Cave": true,
}

const STEP_SCRIPTS = {
  xp: "/steps/xp.js",
  grow: "/steps/grow2.js",
  weaken: "/steps/weaken2.js",
  hack: "/steps/hack2.js",
}

// Time in milliseconds between steps/batches.
const STEP_PADDING = 200
const BATCH_PADDING = 200

interface BatchStep {
  script: "xp" | "grow" | "weaken" | "hack"
  args?: (string | number)[]
  // For home threads, threads * Math.pow(122/129, cores-1)
  threads: number
  time: number
  securityDelta: number
  // Used for computing the delay.
  endOffset?: number
  delay?: number
  fullScript?: string
  ram?: number
  workers?: {
    hostname: string
    threads: number
    effectiveThreads: number
  }[]
}

type Batch = BatchStep[]

function analyzeGrowThreads(ns: NS, target: Server, cores: number) {
  let threadsGuess = 10
  for (let n = 0; n < 10; n++) {
    const requiredMoneyMul = target.info.moneyMax / (target.info.moneyAvailable + threadsGuess)
    const threads = Math.ceil(ns.growthAnalyze(target.hostname, requiredMoneyMul, cores))
    if (threads === threadsGuess) {
      return threads
    }
    threadsGuess = threads
  }
  return threadsGuess
}

const AllocateTaskChain = new Chain("AllocateTask", [
  new Step({
    name: "SetupBatch",
    dryRunSafe: true,
    gather: () => undefined,
    action: (ctx: Context) => {
      ctx.onceData["attackBatch"] = []
    },
  }),

  new Step({
    // If there's no target, allocate any available RAM for gaining XP.
    name: "HackingXp",
    dryRunSafe: true,
    gather: (ctx: Context) => ctx.onceData["attackTarget"] as Server | undefined,
    predicate: (ctx: Context, target: Server | undefined) => target === undefined,
    action: (ctx: Context) => {
      // Check if we can target joesguns, it's the best for XP.
      let target = "home"
      if (ctx.servers["joesguns"].info.hasAdminRights) {
        target = "joesguns"
      }
      const reps = Math.max(Math.floor(60_000 / ctx.ns.getWeakenTime(target)), 1)

      const xpStep: BatchStep = {
        script: "xp",
        args: [target, reps],
        threads: -1, // All the RAM dot gif
        time: 60_000,
        securityDelta: 0,
      }
      ;(ctx.onceData["attackBatch"] as Batch).push(xpStep)
      // Bail out since we're now done.
      return true
    },
  }),

  // If the target isn't marked as initialized, create an initialization batch.
  new Step({
    name: "InitializeGrow",
    dryRunSafe: true,
    gather: (ctx: Context) => ctx.onceData["attackTarget"] as Server,
    predicate: (ctx: Context, target: Server) =>
      ctx.data[`targetInitialized-${target!.hostname}`] !== true,
    action: (ctx: Context, target: Server) => {
      const threads = analyzeGrowThreads(ctx.ns, target, 1)
      ;(ctx.onceData["attackBatch"] as Batch).push({
        script: "grow",
        threads,
        time: ctx.ns.getGrowTime(target.hostname),
        securityDelta: ctx.ns.growthAnalyzeSecurity(threads, target.hostname, 1),
      })
    },
  }),

  new Step({
    name: "InitializeWeaken",
    dryRunSafe: true,
    gather: (ctx: Context) => ctx.onceData["attackTarget"] as Server,
    predicate: (ctx: Context, target: Server) =>
      ctx.data[`targetInitialized-${target!.hostname}`] !== true,
    action: (ctx: Context, target: Server) => {
      const batch = ctx.onceData["attackBatch"] as Batch
      const sec =
        target.info.hackDifficulty +
        batch.reduce((a, b) => a + b.securityDelta, 0) -
        target.info.minDifficulty
      const threads = sec / ctx.ns.weakenAnalyze(1, 1)
      batch.push({
        script: "weaken",
        threads,
        time: ctx.ns.getWeakenTime(target.hostname),
        securityDelta: -1 * sec,
      })
      return true
    },
  }),

  // Create a normal HWGW batch.
  new Step({
    name: "Hack",
    dryRunSafe: true,
    gather: (ctx: Context) => ctx.onceData["attackTarget"] as Server,
    action: (ctx: Context, target: Server) => {
      const threads = ctx.ns.hackAnalyzeThreads(target.hostname, target.info.moneyMax - 1_000_000)
      ;(ctx.onceData["attackBatch"] as Batch).push({
        script: "hack",
        threads,
        time: ctx.ns.getHackTime(target.hostname),
        securityDelta: ctx.ns.hackAnalyzeSecurity(threads, target.hostname),
      })
    },
  }),

  new Step({
    name: "WeakenOne",
    dryRunSafe: true,
    gather: (ctx: Context) => ctx.onceData["attackTarget"] as Server,
    action: (ctx: Context, target: Server) => {
      const batch = ctx.onceData["attackBatch"] as Batch
      const sec = batch.reduce((a, b) => a + b.securityDelta, 0) - target.info.minDifficulty
      const threads = sec / ctx.ns.weakenAnalyze(1, 1)
      batch.push({
        script: "weaken",
        threads,
        time: ctx.ns.getWeakenTime(target.hostname),
        securityDelta: -1 * sec,
      })
    },
  }),

  new Step({
    name: "Grow",
    dryRunSafe: true,
    gather: (ctx: Context) => ctx.onceData["attackTarget"] as Server,
    action: (ctx: Context, target: Server) => {
      const threads = analyzeGrowThreads(ctx.ns, target, 1)
      ;(ctx.onceData["attackBatch"] as Batch).push({
        script: "grow",
        threads,
        time: ctx.ns.getGrowTime(target.hostname),
        securityDelta: ctx.ns.growthAnalyzeSecurity(threads, target.hostname, 1),
      })
    },
  }),

  new Step({
    name: "WeakenTwo",
    dryRunSafe: true,
    gather: (ctx: Context) => ctx.onceData["attackTarget"] as Server,
    action: (ctx: Context, target: Server) => {
      const batch = ctx.onceData["attackBatch"] as Batch
      const sec = batch.reduce((a, b) => a + b.securityDelta, 0) - target.info.minDifficulty
      const threads = sec / ctx.ns.weakenAnalyze(1, 1)
      batch.push({
        script: "weaken",
        threads,
        time: ctx.ns.getWeakenTime(target.hostname),
        securityDelta: -1 * sec,
      })
    },
  }),
])

const AttackChain = new Chain("Attack", [
  new Step({
    name: "ResetAttackDone",
    dryRunSafe: true,
    gather: () => undefined,
    action: (ctx: Context) => {
      ctx.onceData["attackDone"] = false
      ctx.onceData["attackWorkerRamAlloc"] = {}
    },
  }),

  // Find a target not currently under attack.
  new Step({
    name: "FindTarget",
    dryRunSafe: true,
    gather: (ctx: Context) => {
      if (ctx.data["goal"] === "Hacking XP") {
        return undefined
      }
      const now = Date.now()
      const targets = Object.values(ctx.servers).filter(
        (s) =>
          s.info.moneyMax > 10_000_000_000 &&
          s.info.hasAdminRights &&
          s.info.requiredHackingSkill <= ctx.player.skills.hacking &&
          (ctx.data[`targetUnavailable-${s.hostname}`] || 0) < now &&
          ctx.onceData[`targetFailed-${s.hostname}`] !== true
      )
      if (targets.length === 0) {
        return undefined
      }
      return targets.reduce((a, b) => (a.info.moneyMax >= b.info.moneyMax ? a : b))
    },
    log: (ctx: Context, target: Server | undefined) =>
      target ? `Using ${target?.hostname} as target` : "No targets available, running for XP",
    action: (ctx: Context, target: Server | undefined) => {
      ctx.onceData["attackTarget"] = target
    },
  }),

  // Work out what we're doing with this target.
  new RunChainStep({
    name: "AllocateTask",
    chain: AllocateTaskChain,
  }),

  // Pull out all the workers we have.
  new Step({
    name: "FindWorkers",
    dryRunSafe: true,
    gather: (ctx: Context) => {
      const useNetworkWorkers = ctx.servers["home"].info.maxRam <= 512
      return Object.values(ctx.servers).filter(
        (s) =>
          s.info.hasAdminRights &&
          (useNetworkWorkers || s.info.purchasedByPlayer || s.hostname === "home") &&
          (ctx.data["useHacknetWorkers"] || !s.hostname.startsWith("hacknet-node-")) &&
          s.ramAvailable >= 1
      )
    },
    action: (ctx: Context, workers: Server[]) => {
      if (workers.length === 0) {
        // Somehow we have no workers, give up entirely.
        ctx.log.error("No workers found, something is weird")
        ctx.onceData["attackDone"] = true
        return true
      }
      ctx.onceData["attackWorkers"] = workers
      return false
    },
  }),

  // Some pre-setup, compute the delays, initialize some arrays, etc..
  new Step({
    name: "AllocateSetup",
    dryRunSafe: true,
    gather: (ctx: Context) => ctx.onceData["attackBatch"] as Batch,
    action: (ctx: Context, batch: Batch) => {
      const target = ctx.onceData["attackTarget"] as Server | undefined
      // Work out the end offsets, in reverse.
      let maxTime = 0
      for (let i = 0; i < batch.length; i++) {
        const step = batch[batch.length - 1 - i]
        step.endOffset = i * STEP_PADDING
        maxTime = Math.max(maxTime, step.time + step.endOffset)
      }
      // Now work out the delays.
      for (const step of batch) {
        step.delay = maxTime - step.time - step.endOffset!
        // And also some misc stuff.
        step.workers = []
        step.fullScript = STEP_SCRIPTS[step.script]
        step.ram = ctx.ns.getScriptRam(step.fullScript)
        if (step.args === undefined && target !== undefined) {
          step.args = [target.hostname]
        }
      }
    },
  }),

  // Try to find a place to run the batch. If we can't, then we're done.
  new RepeatingStep({
    name: "AllocateBatch",
    dryRunSafe: true,
    gather: (ctx: Context) => {
      const batch = ctx.onceData["attackBatch"] as Batch
      // Find a batch step that isn't fully allocated, if there is one.
      return batch.find((s) => s.threads !== s.workers!.reduce((a, b) => a + b.effectiveThreads, 0))
    },
    predicate: (ctx: Context, step: BatchStep | undefined) => step !== undefined,
    action: (ctx: Context, step: BatchStep | undefined) => {
      let workers = ctx.onceData["attackWorkers"] as Server[]
      const workerRamAlloc = ctx.onceData["attackWorkerRamAlloc"] as Record<string, number>
      // If we're not doing an XP step, ignore anything under 64TB since it will never work and takes a long time.
      if (step!.script !== "xp") {
        workers = workers.filter((s) => s.info.maxRam >= 65536)
        if (workers.length === 0) {
          // No workers available
          const target = ctx.onceData["attackTarget"] as Server | undefined
          if (target !== undefined) ctx.onceData[`targetFailed-${target.hostname}`] = true
          return true
        }
      }
      // Find the worker with the most available RAM, taking into account what we've allocated so far.
      const { worker, ramAvailable } = workers
        .map((s) => ({
          worker: s,
          ramAvailable: s.ramAvailable - (workerRamAlloc[s.hostname] || 0),
        }))
        .reduce((a, b) => (a.ramAvailable >= b.ramAvailable ? a : b))
      // Work out how many threads we need and how many can be run on this worker.
      const threadsPossible = Math.floor(ramAvailable / step!.ram!)
      if (threadsPossible === 0) {
        // We've run out of room to allocate stuff, move on.
        const target = ctx.onceData["attackTarget"] as Server | undefined
        if (target === undefined) {
          ctx.log.debug(`Unable to complete allocating batch for XP`)
          ctx.onceData["attackDone"] = true
        } else {
          ctx.log.debug(`Unable to complete allocating batch against ${target.hostname}`)
          ctx.onceData[`targetFailed-${target.hostname}`] = true
        }
        return true
      }
      const threadsNeeded =
        step!.threads - step!.workers!.reduce((a, b) => a + b.effectiveThreads, 0)
      const threads =
        step!.threads === -1 ? threadsPossible : Math.min(threadsNeeded, threadsPossible)
      // TODO This all needs to check if we're on home and do cores math. But not tonight.
      // For now this just over-estimates stuff.
      step!.workers!.push({
        hostname: worker.hostname,
        threads,
        effectiveThreads: threads,
      })
      workerRamAlloc[worker.hostname] =
        (workerRamAlloc[worker.hostname] || 0) + step!.ram! * threads
      return false
    },
  }),

  new Step({
    name: "CheckAllocationFailed",
    dryRunSafe: true,
    gather: (ctx: Context) => ctx.onceData["attackTarget"] as Server | undefined,
    action: (ctx: Context, target: Server | undefined) => {
      return target !== undefined && ctx.onceData[`targetFailed-${target.hostname}`] === true
    },
  }),

  new Step({
    name: "Exec",
    gather: () => undefined,
    action: (ctx: Context) => {
      const batch = ctx.onceData["attackBatch"] as Batch
      for (const step of batch) {
        for (const worker of step.workers!) {
          const pid = ctx.ns.exec(step.fullScript!, worker.hostname, worker.threads, ...step.args!)
          if (pid === 0) {
            ctx.log.error(
              `Error trying to run ${step.fullScript} on ${worker.hostname} with ${worker.threads} threads`
            )
          }
        }
      }
    },
  }),

  new Step({
    name: "MarkBusy",
    dryRunSafe: true,
    gather: () => undefined,
    action: (ctx: Context) => {
      const target = ctx.onceData["attackTarget"] as Server | undefined
      if (target === undefined) {
        return
      }
      const batch = ctx.onceData["attackBatch"] as Batch
      const now = Date.now()
      for (const step of batch) {
        const key = `targetUnavailable-${target.hostname}`
        ctx.data[key] = Math.max(
          (ctx.data[key] as number) || 0,
          now + step.delay! + step.time + BATCH_PADDING
        )
      }
    },
  }),

  new Step({
    name: "Debug",
    dryRunSafe: true,
    gather: () => undefined,
    action: (ctx: Context) => {
      ctx.log.debug(
        () => `target ${(ctx.onceData["attackTarget"] as Server | undefined)?.hostname}`
      )
      ctx.log.debug(() => `batch ${JSON.stringify(ctx.onceData["attackBatch"], undefined, 2)}`)
    },
  }),

  // new Step({
  //   name: "InitializeWorker",
  //   gather: (ctx: Context) => ctx.onceData["attackWorker"] as Server,
  //   predicate: (ctx: Context, worker: Server) =>
  //     ctx.data[`workerInitialized-${worker.hostname}`] !== true,
  //   log: (ctx: Context, worker: Server) => `Initializing worker ${worker.hostname}`,
  //   action: async (ctx: Context, worker: Server) => {
  //     const files = ["stepslib", "hack2", "weaken2", "grow2", "xp"]
  //     for (const file of files) {
  //       await ctx.ns.scp(`/steps/${file}.js`, worker.hostname)
  //     }
  //     ctx.data[`workerInitialized-${worker.hostname}`] = true
  //   },
  // }),

  // TODO check some goal mode/flag and worker.isPurchasedServer || == home and run a ns.share() payload.

  // new Step({
  //   name: "GetHackingXp",
  //   gather: GatherAttackData,
  //   predicate: (ctx: Context, { worker, target }: AttackData) =>
  //     // The 7 is because a full batch takes at least 6.95GB of RAM with 1 thread on each. Babby workers farm XP.
  //     ctx.data["goal"] === "Hacking XP" || target === undefined || worker.ramAvailable < 7,
  //   log: (ctx: Context, { worker }: AttackData) => `Launching steps/xp.js on ${worker.hostname}`,
  //   action: (ctx: Context, { worker }: AttackData) => {
  //     // Check if we can target joesguns, it's the best for XP.
  //     let target = "home"
  //     if (ctx.servers["joesguns"].info.hasAdminRights) {
  //       target = "joesguns"
  //     }

  //     // Work out how many reps for 60 seconds.
  //     const script = "/steps/xp.js"
  //     const reps = Math.max(Math.floor(60_000 / ctx.ns.getWeakenTime(target)), 1)
  //     const scriptRam = ctx.ns.getScriptRam(script, target)
  //     const threads = Math.max(Math.floor(worker.ramAvailable / scriptRam), 1)
  //     ctx.ns.exec(script, worker.hostname, threads, target, reps)

  //     // Refresh both the worker and target.
  //     ctx.servers[worker.hostname].refresh()
  //     ctx.servers[target].refresh()

  //     // Abort the chain.
  //     return true
  //   },
  // }),

  // new Step({
  //   name: "InitializeTarget",
  //   gather: GatherAttackData,
  //   predicate: (ctx: Context, { target }: AttackData) =>
  //     ctx.data[`targetInitialized-${target?.hostname}`] !== true,
  //   log: (ctx: Context, { target }: AttackData) => `Initializing target ${target!.hostname}`,
  //   action: (ctx: Context, { worker, target }: AttackData) => {
  //     let busyTime = 0
  //     // First grow to max money.
  //     if (target!.info.moneyAvailable !== target!.info.moneyMax) {
  //       const requiredMoneyMul = target!.info.moneyMax / Math.max(target!.info.moneyAvailable, 1)
  //       const requiredGrowThreads = Math.ceil(
  //         ctx.ns.growthAnalyze(target!.hostname, requiredMoneyMul, worker.info.cpuCores)
  //       )
  //       const growScriptRam = ctx.ns.getScriptRam("/steps/grow2.js")
  //       const possibleGrowThreads = Math.floor(worker.ramAvailable / growScriptRam)
  //       const growThreads = Math.min(requiredGrowThreads, possibleGrowThreads)
  //       // Launch grow as best we can.
  //       ctx.ns.exec("/steps/grow2.js", worker.hostname, growThreads, 0, target!.hostname)
  //       busyTime = Math.max(busyTime, ctx.ns.getGrowTime(target!.hostname))
  //       ctx.servers[worker.hostname].refresh()
  //       ctx.servers[target!.hostname].refresh()
  //     }
  //     // Then weaken security to min.
  //     if (target!.info.hackDifficulty !== target!.info.minDifficulty) {
  //     }
  //   },
  // }),
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

    // Transfer attack scripts to all potential workers.
    new EachStep({
      name: "InitializeWorkers",
      gather: (ctx: Context) =>
        Object.values(ctx.servers).filter(
          (s) => s.info.maxRam > 0 && ctx.data[`workerInitialized-${s.hostname}`] !== true
        ),
      log: (ctx: Context, worker: Server) => `Initializing worker ${worker.hostname}`,
      action: async (ctx: Context, worker: Server) => {
        const files = ["stepslib", "hack2", "weaken2", "grow2", "xp"]
        for (const file of files) {
          await ctx.ns.scp(`/steps/${file}.js`, worker.hostname)
        }
        ctx.data[`workerInitialized-${worker.hostname}`] = true
      },
    }),

    new RepeatingStep({
      name: "LaunchAttack",
      dryRunSafe: true,
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
