import type { NS } from "@ns"

export async function main(ns: NS) {
  if (!ns.args[0]) {
    ns.alert("Args are required")
    return
  }

  const homeCommandPort = ns.getPortHandle(3)
  while (!homeCommandPort.tryWrite(JSON.stringify(ns.args))) {
    await ns.sleep(100)
  }
}
