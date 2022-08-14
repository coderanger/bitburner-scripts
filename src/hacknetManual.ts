import type { NS } from "@ns"

const FILENAME = "hacknetNoUpgrade.txt"

export async function main(ns: NS) {
  const arg = ns.args[0] as string | undefined
  if (arg === undefined) {
    ns.tprint(ns.read(FILENAME) as string)
  } else if (arg === "clear") {
    ns.rm(FILENAME)
  } else {
    await ns.write(FILENAME, arg, "w")
  }
}
