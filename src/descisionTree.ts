import { LOG_LEVELS, Logger } from "./log"
import type { LogLevelType } from "./log"
import type { NS } from "@ns"

export class Context {
  ns: NS
  log: Logger
  dryRun = false
  data: Record<string, unknown> = {}
  onceData: Record<string, unknown> = {}
  perfTimers: number[] = []

  constructor(ns: NS) {
    this.ns = ns
    this.log = new Logger(ns)
  }

  perfStart(level: keyof typeof LOG_LEVELS = "trace") {
    if (this.log.logLevel >= LOG_LEVELS[level]) {
      this.perfTimers.push(performance.now())
    }
  }

  perfEnd(label = "Something", level: keyof typeof LOG_LEVELS = "trace") {
    if (this.log.logLevel >= LOG_LEVELS[level]) {
      const end = performance.now()
      const start = this.perfTimers.pop()
      if (start === undefined) {
        throw "Unbalanced perfStart/End"
      }
      this.log[level](
        `${label} took ${(end - start).toLocaleString(undefined, { maximumFractionDigits: 3 })}ms`
      )
    }
  }
}

type Gather<DataType> = (ctx: Context) => DataType
type Predicate<DataType> = (ctx: Context, data: DataType) => boolean
type Log<DataType> = (ctx: Context, data: DataType) => void | string
type Action<DataType> = (ctx: Context, data: DataType) => void | boolean

export class Step<DataType> {
  name: string
  gather: Gather<DataType>
  predicate: Predicate<DataType>
  log?: Log<DataType>
  action: Action<DataType>
  // If true, a failed predicate also aborts the chain.
  final: boolean

  constructor(options: {
    name: string
    gather: Gather<DataType>
    predicate?: Predicate<DataType>
    log?: Log<DataType>
    action: Action<DataType>
    final?: boolean
  }) {
    this.name = options.name
    this.gather = options.gather
    this.predicate = options.predicate || (() => true)
    this.log = options.log
    this.action = options.action
    this.final = !!options.final
  }

  get shouldSkipDryRun() {
    return true
  }

  run(ctx: Context) {
    ctx.log.debug(`Starting step ${this.name}`)

    // ctx.perfStart()
    const data = this.gather(ctx)
    // ctx.perfEnd(`Step ${this.name} gather`)
    ctx.log.trace(`Got action data ${JSON.stringify(data)}`)

    // ctx.perfStart()
    const pred = this.predicate(ctx, data)
    // ctx.perfEnd(`Step ${this.name} predicate`)

    if (pred) {
      ctx.log.debug(`Running action for ${this.name}`)
      if (this.log) {
        const log = this.log(ctx, data)
        if (typeof log === "string") {
          ctx.log.info(log)
        }
      }
      if (ctx.dryRun && this.shouldSkipDryRun) {
        // Assume we should keep going in dry run mode.
        return false
      }
      // ctx.perfStart()
      const rv = this.action(ctx, data)
      // ctx.perfEnd(`Step ${this.name} action`)
      return rv === undefined ? false : rv
    } else {
      return this.final
    }
  }
}

export class RunChainStep extends Step<null> {
  finalChain: boolean

  constructor(options: {
    name: string
    predicate?: Predicate<null>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain: Chain | Step<any>[] | ((ctx: Context) => Chain | Step<any>[])
    final?: boolean
    finalChain?: boolean
  }) {
    super({
      name: options.name,
      gather: () => null,
      predicate: options.predicate,
      final: options.final,
      action: (ctx: Context) => {
        let chain = options.chain
        if (typeof chain === "function") {
          chain = chain(ctx)
        }
        if (!(chain instanceof Chain)) {
          chain = new Chain(options.name, chain)
        }
        chain.run(ctx)
        return this.finalChain
      },
    })
    this.finalChain = !!options.finalChain
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
    ctx.log.debug(`Running chain ${this.name}`)
    for (const step of this.steps) {
      try {
        ctx.perfStart()
        const ret = step.run(ctx)
        ctx.perfEnd(`Step ${step.name}`)

        if (ret) {
          ctx.log.debug(`Aborting chain`)
          break
        }
      } catch (err) {
        if (ctx.dryRun) {
          // Assume we should just finish this chain because something went wrong.
          break
        } else {
          throw err
        }
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function Execute(ns: NS, steps: Step<any>[]) {
  ns.disableLog("ALL")
  // Parse standard flags.
  const options = ns.flags([
    ["log-level", "info"],
    ["dry-run", false],
    ["once", false],
    ["tprint", false],
  ])

  const ctx = new Context(ns)
  ctx.log.setLogLevel(options["log-level"] as LogLevelType)
  ctx.log.setTprint((options["tprint"] as boolean) || (options["once"] as boolean))
  ctx.log.setBuffered(true)
  ctx.dryRun = options["dry-run"] as boolean

  const chain = new Chain("Root", steps)

  while (true) {
    ctx.onceData = {}
    ctx.perfStart("info")
    chain.run(ctx)
    ctx.perfEnd("Execution", "info")
    if (ctx.perfTimers.length !== 0) {
      throw "Unmatched perfStart/End"
    }
    ctx.log.flushBuffer()
    if (options.once) {
      break
    }
    await ns.sleep(5000)
  }
}
