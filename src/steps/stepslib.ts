import type { NS } from "@ns"

export interface Flags {
  delay: number
  server: string
  batch: string
}

export async function step(fn: (ns: NS, flags: Flags) => Promise<void>) {
  return async (ns: NS) => {
    const opts = ns.flags([
      ["delay", 0],
      ["server", ""],
      ["batch", ""],
    ]) as unknown as Flags
    if (opts.server === "") {
      throw "Server is required"
    }
    if (opts.batch === "") {
      throw "Batch is required"
    }
    await ns.sleep(opts.delay)

    await fn(ns, opts)

    const donePort = ns.getPortHandle(5)
    while (!donePort.tryWrite(opts.batch)) {
      await ns.sleep(100)
    }
  }
}
