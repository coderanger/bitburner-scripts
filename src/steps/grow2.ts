import { step } from "./stepslib"
import type { Flags } from "./stepslib"
import type { NS } from "@ns"

export const main = step(async (ns: NS, { server }: Flags) => {
  await ns.grow(server)
})
