import type { NS, Server as NSServer } from "@ns"

const unitStr = (units: string[], divisor: number) => {
  return (n: number) => {
    let val = n
    let i = 0
    while (true) {
      if (val < divisor || i === units.length + 1) {
        return `${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}${units[i]}`
      }
      val = val / divisor
      i++
    }
  }
}

export const moneyStr = unitStr(["", "k", "m", "b", "t"], 1000)
// nb. RAM in bitburner is always expressed in GB as the base unit
export const ramStr = unitStr(["GB", "TB", "EB"], 1024)

export class Server {
  ns: NS
  hostname: string
  path: string[]
  info: NSServer

  constructor(ns: NS, hostname: string, path: string[]) {
    this.ns = ns
    this.hostname = hostname
    this.path = path
    this.info = ns.getServer(hostname)
  }

  refresh() {
    this.info = this.ns.getServer(this.hostname)
  }

  // How much RAM is available to use, taking reserved RAM on home into account.
  get ramAvailable() {
    if (this.hostname === "home") {
      const reserved = 128
      return Math.max(this.info.maxRam - reserved - this.info.ramUsed, 0)
    } else {
      return this.info.maxRam - this.info.ramUsed
    }
  }
}

export function scanNetwork(ns: NS) {
  const servers: Record<string, Server> = {}
  const scanInner = (server: string, path: string[]) => {
    const newPath = path.concat(server)
    servers[server] = new Server(ns, server, newPath)
    for (const s of ns.scan(server)) {
      if (!servers[s]) {
        scanInner(s, newPath)
      }
    }
  }
  scanInner("home", [])
  return servers
}
