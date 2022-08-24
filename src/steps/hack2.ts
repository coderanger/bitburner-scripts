import type { NS } from "@ns"

export async function main(ns: NS) {
  await ns.sleep(ns.args[0] as number)
  await ns.hack(ns.args[1] as string)
}
