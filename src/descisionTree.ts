import { Logger } from "./log"
import type { LogLevelType } from "./log"
import type { NS } from "@ns"

export class Context {
  ns: NS
  log: Logger
  dryRun = false
  data: Record<string, unknown> = {}

  constructor(ns: NS) {
    this.ns = ns
    this.log = new Logger(ns)
  }
}

type Gather<DataType> = (ctx: Context) => DataType
type Predicate<DataType> = (ctx: Context, data: DataType) => boolean
type Log<DataType> = (ctx: Context, data: DataType) => void
type Action<DataType> = (ctx: Context, data: DataType) => void | boolean

export class Step<DataType> {
  name: string
  gather: Gather<DataType>
  predicate: Predicate<DataType>
  log?: Log<DataType>
  action: Action<DataType>

  constructor(options: {
    name: string
    gather: Gather<DataType>
    predicate?: Predicate<DataType>
    log?: Log<DataType>
    action: Action<DataType>
  }) {
    this.name = options.name
    this.gather = options.gather
    this.predicate = options.predicate || (() => true)
    this.log = options.log
    this.action = options.action
  }

  get shouldSkipDryRun() {
    return true
  }

  run(ctx: Context) {
    ctx.log.trace(`Checking action ${this.name}`)
    const data = this.gather(ctx)
    if (this.predicate(ctx, data)) {
      ctx.log.debug(`Running action ${this.name}`)
      if (this.log) {
        this.log(ctx, data)
      }
      if (ctx.dryRun && this.shouldSkipDryRun) {
        // Assume we should keep going in dry run mode.
        return false
      }
      const rv = this.action(ctx, data)
      return rv === undefined ? false : rv
    } else {
      return false
    }
  }
}

export class RunChainStep extends Step<null> {
  constructor(options: {
    name: string
    predicate?: Predicate<null>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain: Chain | ((ctx: Context) => Step<any>[])
  }) {
    super({
      name: options.name,
      gather: () => null,
      predicate: options.predicate,
      action: (ctx: Context) => {
        const chain =
          typeof options.chain === "function"
            ? new Chain(options.name, options.chain(ctx))
            : options.chain
        chain.run(ctx)
      },
    })
  }

  get shouldSkipDryRun() {
    return false
  }
}

export class Chain {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps: Step<any>[]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(name: string, steps: Step<any>[]) {
    this.name = name
    this.steps = steps
  }

  run(ctx: Context) {
    ctx.log.trace(`Running chain ${this.name}`)
    for (const step of this.steps) {
      if (step.run(ctx)) {
        ctx.log.trace(`Aborting chain`)
        break
      }
    }
  }
}

export async function ExecuteChain(ns: NS, chain: Chain) {
  // Parse standard flags.
  const options = ns.flags([
    ["log-level", "info"],
    ["dry-run", false],
    ["once", false],
    ["tprint", false],
  ])

  const ctx = new Context(ns)
  ctx.log.setLogLevel(options["log-level"] as LogLevelType)
  ctx.log.tprint = (options["tprint"] as boolean) || (options["once"] as boolean)
  ctx.dryRun = options["dry-run"] as boolean

  while (true) {
    const start = performance.now()
    chain.run(ctx)
    const end = performance.now()
    ctx.log.debug(
      `Execution complete in ${(end - start).toLocaleString(undefined, {
        maximumFractionDigits: 4,
      })}ms`
    )
    if (options.once) {
      break
    }
    await ns.sleep(1000)
  }
}
