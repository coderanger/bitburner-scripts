import { moneyStr, ramStr } from "./utils"
import type { NS, Server as NSServer } from "@ns"

function serverHasBackdoor(ns: NS, server: string) {
  if (server === undefined) {
    return (s: string) => serverHasBackdoor(ns, s)
  }
  const info = ns.getServer(server)
  return info.backdoorInstalled
}

function tryAttack(fn: (arg0: string) => void, server: string) {
  try {
    fn(server)
    return true
  } catch (err) {
    return false
  }
}

// A hack to work around the undocumented nature of the heart.break() call.
interface NSKarma extends NS {
  heart: {
    break: () => number
  }
}

class Player {
  ns: NSKarma
  portsOpenable!: number
  karma!: number

  skills!: {
    hacking: number
  }

  constructor(ns: NS) {
    this.ns = ns as NSKarma
    this.refresh()
  }

  refresh() {
    Object.assign(this, this.ns.getPlayer())
    this.portsOpenable =
      (this.ns.fileExists("BruteSSH.exe", "home") ? 1 : 0) +
      (this.ns.fileExists("FTPCrack.exe", "home") ? 1 : 0) +
      (this.ns.fileExists("RelaySMTP.exe", "home") ? 1 : 0) +
      (this.ns.fileExists("HTTPWorm.exe", "home") ? 1 : 0) +
      (this.ns.fileExists("SQLInject.exe", "home") ? 1 : 0)
    this.karma = this.ns.heart.break()
  }
}

class Server {
  ns: NS
  hostname: string
  path: string[]

  hasAdminRights!: boolean
  numOpenPortsRequired!: number
  maxRam!: number
  moneyMax!: number
  requiredHackingSkill!: number
  backdoorInstalled!: boolean
  purchasedByPlayer!: boolean

  constructor(ns: NS, hostname: string, path: string[]) {
    this.ns = ns
    this.hostname = hostname
    this.path = path.concat(this.hostname)
    this.refresh()
  }

  refresh() {
    const info = this.ns.getServer(this.hostname) as Partial<NSServer>
    delete info.moneyAvailable
    Object.assign(this, info)
  }

  get securityLevel() {
    return this.ns.getServerSecurityLevel(this.hostname)
  }

  get moneyAvailable() {
    return this.ns.getServerMoneyAvailable(this.hostname)
  }

  async root(player: Player) {
    if (this.purchasedByPlayer || this.hostname === "home") {
      return true
    }
    if (!this.hasAdminRights && player.portsOpenable >= this.numOpenPortsRequired) {
      // Try to nuke the server.
      tryAttack(this.ns.brutessh, this.hostname)
      tryAttack(this.ns.ftpcrack, this.hostname)
      tryAttack(this.ns.relaysmtp, this.hostname)
      tryAttack(this.ns.httpworm, this.hostname)
      tryAttack(this.ns.sqlinject, this.hostname)
      this.ns.nuke(this.hostname)
      this.refresh()
    }
    if (
      this.hasAdminRights &&
      !this.backdoorInstalled &&
      player.skills.hacking >= this.requiredHackingSkill
    ) {
      // Always go home first.
      this.ns.tprint(`Installing a backdoor on ${this.hostname}`)
      this.ns.singularity.connect("home")
      for (const server of this.path) {
        this.ns.singularity.connect(server)
      }
      await this.ns.singularity.installBackdoor()
      this.ns.singularity.connect("home")
      this.refresh()
    }
    return this.hasAdminRights
  }
}

/**
 * Get info on the whole network recursively.
 */
function analyzeNetwork(ns: NS) {
  /** @type {Record<string, Server>} */
  const servers: Record<string, Server> = {
    home: new Server(ns, "home", []),
  }
  const scanInner = (server: string, path: string[]) => {
    for (const s of ns.scan(server)) {
      if (s !== "home" && !servers[s]) {
        // Something new, acquire and recurse.
        servers[s] = new Server(ns, s, path)
        scanInner(s, path.concat([s]))
      }
    }
  }
  scanInner("home", [])
  return servers
}

export async function main(ns: NS) {
  // No auto-logging.
  ns.disableLog("ALL")
  const log = (msg: string) =>
    ns.print(
      `${new Date().toLocaleString(undefined, { dateStyle: "short", timeStyle: "long" })}: ${msg}`
    )
  log("Starting ...")

  // Global data.
  const commandPort = ns.getPortHandle(3)
  const initialData = JSON.parse((ns.read("/.daemon.json") as string) || "{}")
  // const targets = initialData.targets || []
  // const tempTargets = initialData.tempTargets || []
  const initializedWorkers: Record<string, boolean> = {} // initialData.initializedWorkers || {}
  // const extraWorkers = initialData.extraWorkers || []
  const growsInARow = initialData.growsInARow || {}
  const useNetworkWorkers = ns.getServerMaxRam("home") <= 512
  const settings = { quiet: false, xp: false, ...initialData.settings }

  const writeData = async () => {
    const data = {
      // targets,
      // tempTargets,
      // initializedWorkers,
      // extraWorkers,
      growsInARow,
      settings,
    }
    await ns.write("/.daemon.json", JSON.stringify(data), "w")
  }

  // Load all servers and player data.
  const servers = analyzeNetwork(ns)
  const player = new Player(ns)

  // A place to store debug data from the last loop.
  const status: {
    workers: string[]
    targets: string[]
    idleTargets: string[]
  } = {
    workers: [],
    targets: [],
    idleTargets: [],
  }

  // Get started.
  log("Control daemon online")
  ns.toast("Control daemon online", "info")

  while (true) {
    // Update player info.
    player.refresh()

    // Process commands.
    while (!commandPort.empty()) {
      const [cmd, ...args] = JSON.parse(commandPort.read().toString())
      log(`Got command ${cmd} ${args}`)
      switch (cmd) {
        // case "target":
        //   for (const arg of args) {
        //     if (!targets.includes(arg)) {
        //       targets.push(arg)
        //     }
        //   }
        //   log(`Updated targets to ${targets.join(", ")} ${tempTargets.join(", ")}`)
        //   writeData()
        //   break
        // case "untarget":
        //   for (const arg of args) {
        //     if (arg === "*") {
        //       targets.splice(0, targets.length)
        //       tempTargets.splice(0, tempTargets.length)
        //     } else {
        //       let i = targets.indexOf(arg)
        //       if (i !== -1) {
        //         targets.splice(i, 1)
        //       }
        //       i = tempTargets.indexOf(arg)
        //       if (i !== -1) {
        //         tempTargets.splice(i, 1)
        //       }
        //     }
        //   }
        //   log(`Updated targets to ${targets.join(", ")} ${tempTargets.join(", ")}`)
        //   writeData()
        //   break
        // case "temptarget":
        //   for (const arg of args) {
        //     if (!tempTargets.includes(arg)) {
        //       tempTargets.push(arg)
        //     }
        //   }
        //   log(`Updated targets to ${targets.join(", ")} ${tempTargets.join(", ")}`)
        //   writeData()
        //   break
        case "reload":
          ns.spawn(ns.getScriptName())
          break
        // case "worker":
        //   for (const arg of args) {
        //     if (!extraWorkers.includes(arg)) {
        //       extraWorkers.push(arg)
        //     }
        //   }
        //   log(`Updated extra workers to ${extraWorkers.join(", ")}`)
        //   writeData()
        //   break
        // case "unworker":
        //   for (const arg of args) {
        //     if (arg === "*") {
        //       extraWorkers.splice(0, extraWorkers.length)
        //     } else {
        //       const i = extraWorkers.indexOf(arg)
        //       if (i !== -1) {
        //         extraWorkers.splice(i, 1)
        //       }
        //     }
        //   }
        //   log(`Updated extra workers to ${extraWorkers.join(", ")}`)
        //   writeData()
        //   break
        case "status":
          ns.tprint("Control daemon status:")
          ns.tprint(`Network Workers: ${useNetworkWorkers}`)
          ns.tprint(`Workers: ${status.workers.join(", ")}`)
          ns.tprint(`Targets: ${status.targets.join(", ")}`)
          ns.tprint(`Idle Targets: ${status.idleTargets.join(", ")}`)
          break
        case "servers":
          if (args[0] === undefined) {
            ns.tprint(Object.keys(servers).join(", "))
          } else {
            ns.tprint(JSON.stringify(servers[args[0]], null, 2))
          }
          break
        case "paths":
          // Display the paths to some interesting servers.
          ns.tprint(`CSEC: ${servers["CSEC"].path.join(", ")}`)
          ns.tprint(`avmnite-02h: ${servers["avmnite-02h"].path.join(", ")}`)
          ns.tprint(`I.I.I.I: ${servers["I.I.I.I"].path.join(", ")}`)
          ns.tprint(`run4theh111z: ${servers["run4theh111z"].path.join(", ")}`)
          ns.tprint(`The-Cave: ${servers["The-Cave"].path.join(", ")}`)
          break
        case "karma":
          ns.tprint(player.karma)
          break
        case "config":
          if (args[0] === undefined) {
            ns.tprint("Settings:")
            for (const k of Object.keys(settings).sort()) {
              ns.tprint(`${k}: ${settings[k]}`)
            }
          } else {
            if (args[1] !== undefined) {
              settings[args[0]] = args[1]
              await writeData()
            }
            ns.tprint(`${args[0]}: ${settings[args[0]]}`)
          }
          break
        case "contracts":
          for (const s in servers) {
            const contracts = ns.ls(s).filter((f) => f.endsWith(".cct"))
            if (contracts.length !== 0) {
              ns.tprint(`${s}: ${contracts.join(", ")}`)
            }
          }
          break
        default:
          await ns.alert(`Unknown command ${cmd}`)
          break
      }
    }

    // Get our worker list.
    const workers = ["home"].concat(ns.getPurchasedServers())

    // If we're using the network for workers, find what we have available.
    for (const s in servers) {
      const server = servers[s]
      const hasRoot = await server.root(player)
      if (
        useNetworkWorkers &&
        s !== "home" &&
        !workers.includes(s) &&
        server.maxRam >= 4 &&
        !s.startsWith("hacknet-node-") &&
        hasRoot
      ) {
        workers.push(server.hostname)
      }
    }
    status.workers = workers

    // Check for any idle workers.
    const runningStuff = workers.map((server) => {
      const ps = ns.ps(server).filter((proc) => proc.filename.startsWith("/steps/"))
      if (ps.length === 0) {
        return {
          worker: server,
          action: null,
          target: null,
        }
      } else {
        return {
          worker: server,
          action: ps[0].filename,
          target: ps[0].args[0],
        }
      }
    })
    const idleWorkers = runningStuff.filter((s) => s.action === null).map((s) => s.worker)

    // Early out when everyone is busy.
    if (idleWorkers.length === 0) {
      await ns.sleep(100)
      continue
    }

    // Try hacking everybody.
    const targets = []
    for (const s in servers) {
      const server = servers[s]
      if (
        server.moneyMax > 0 &&
        server.requiredHackingSkill <= player.skills.hacking &&
        (await server.root(player))
      ) {
        targets.push(server.hostname)
      }
    }
    status.targets = targets

    // Find idle targets.
    const occupiedTargets = runningStuff
      .filter((s) => s.action !== "/steps/selfhack.js" && s.target !== null)
      .map((s) => s.target)
    const idleTargets = targets.filter((server) => !occupiedTargets.includes(server))
    status.idleTargets = idleTargets
    const targetInfo = idleTargets
      .map((server) => {
        return {
          server: server,
          securityLevel: ns.getServerSecurityLevel(server),
          minSecurityLevel: ns.getServerMinSecurityLevel(server),
          moneyAvailable: ns.getServerMoneyAvailable(server),
          maxMoney: ns.getServerMaxMoney(server),
          growable: false,
          weakenable: false,
          hackable: false,
        }
      })
      .map((t) => {
        t.growable = t.moneyAvailable < t.maxMoney * 0.9 && (growsInARow[t.server] || 0) <= 5
        t.weakenable = t.securityLevel > t.minSecurityLevel
        t.hackable = !(t.growable || t.weakenable)
        return t
      })
      .sort((a, b) => b.maxMoney - a.maxMoney)

    // Find something for each worker to do.
    for (const server of idleWorkers) {
      // Make sure the worker is initialized.
      if (!initializedWorkers[server]) {
        await ns.scp("/steps/hack.js", server)
        await ns.scp("/steps/weaken.js", server)
        await ns.scp("/steps/grow.js", server)
        await ns.scp("/steps/selfhack.js", server)
        await ns.scp("/steps/xp.js", server)
        initializedWorkers[server] = true
      }

      // Look for someone hackable, then weakenable, then growable.
      let target: any,
        action,
        args: (string | number)[] = []
      if (!settings.xp) {
        target = targetInfo.find((t) => t.hackable)
        action = "hack"
        if (target === undefined) {
          target = targetInfo.find((t) => t.growable)
          action = "grow"
        }
        if (target === undefined) {
          target = targetInfo.find((t) => t.weakenable)
          action = "weaken"
        }
      }
      // If there's no available target, run hack on self for some XP.
      if (target === undefined) {
        // // Use n00dles as a fallback if we aren't strong enough.
        // target = {server: (servers[server]?.requiredHackingSkill || 0) <= player.hacking ? server : "n00dles"}
        // action = "selfhack"
        // args = [Math.max(Math.floor(30000 / ns.getHackTime(server)), 1)]

        // Reddit says Weaken is better for XP.
        target = {
          server: (await servers.joesguns.root(player)) ? "joesguns" : "home",
        }
        action = "xp"
        args = [Math.max(Math.floor(30000 / ns.getWeakenTime(target.server)), 1)]
      }
      const actionScript = `/steps/${action}.js`
      // Work out how many threads to spawn with.
      const [totalRam, usedRam] = ns.getServerRam(server)
      const memoryReserved = server === "home" ? 128 - usedRam : 0
      const effectiveRam = Math.max(totalRam - usedRam - memoryReserved, 0)
      const scriptRam = ns.getScriptRam(actionScript, server)
      const threads = Math.max(Math.floor(effectiveRam / scriptRam), 1)
      if (action !== "selfhack" && action !== "xp") {
        const logMsg = `Launching ${action}@${server} -> ${target.server} Sec ${Math.floor(
          target.securityLevel || 0
        )}/${target.minSecurityLevel} $${moneyStr(target.moneyAvailable || 0)}/${moneyStr(
          target.maxMoney || 0
        )}`
        log(logMsg)
        if (!settings.quiet) {
          ns.toast(logMsg, "info", 6000)
        }
      }
      // log(`totalRam=${totalRam} memoryReserved=${memoryReserved} effectiveRam=${effectiveRam} scriptRam=${scriptRam} actionScript=${actionScript} threads=${threads}`)
      if (scriptRam === 0) {
        throw `Unable to find action script ${actionScript} on ${server}`
      }
      // Launch the action.
      ns.exec(actionScript, server, threads, target.server, ...args)
      // Remove this target from targetInfo so we don't launch something else here.
      const i = targetInfo.findIndex((t) => t.server === target.server)
      if (i !== -1) {
        targetInfo.splice(i, 1)
      }
      if (action === "hack") {
        // Clean up temp targets after one hack.
        // const i = tempTargets.indexOf(target.server)
        // if (i !== -1) {
        //   tempTargets.splice(i, 1)
        // }
        // And also reset growsInARow.
        growsInARow[target.server] = 0
        await writeData()
      } else if (action === "grow") {
        // Increment growsInARow.
        growsInARow[target.server] = (growsInARow[target.server] || 0) + 1
        await writeData()
      }
    }

    // End of loop.
    await ns.sleep(1000)
  }
  throw "something went wrong"
}
