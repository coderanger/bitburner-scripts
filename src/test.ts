import { AugDB } from "./augDb"
import type { NS } from "@ns"

export async function main(ns: NS) {
  const db = new AugDB(ns)
  ns.tprint(JSON.stringify(db.augs, undefined, 2))
}
