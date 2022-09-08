import { Chain, Context, EachStep, Execute, RunChainStep, Step } from "./decisionTree"
import { FactionsSteps } from "./factions"
import { GangSteps } from "./gang"
import { HackingSteps } from "./hacking"
import { HacknetSteps } from "./hacknet"
import { SleevesSteps } from "./sleeves"
import type { NS } from "@ns"

const CoreChains = [
  new Chain("Hacking", HackingSteps()),
  new Chain("Gang", GangSteps()),
  new Chain("Hacknet", HacknetSteps()),
  new Chain("Sleeves", SleevesSteps),
  new Chain("Factions", FactionsSteps),
].map(
  (c) =>
    new RunChainStep({
      name: c.name,
      chain: c,
    })
)

const ConditionalChains = [
  {
    name: "Augmentations",
    script: "augmentations.js",
    requiredRam: 256,
  },
  {
    name: "OldMain",
    script: "oldmain.js",
    requiredRam: 256,
  },
  {
    name: "Bladeburner",
    script: "bladeburner.js",
    requiredRam: 256,
  },
].map(
  (c) =>
    new Step({
      name: c.name,
      gather: () => undefined,
      predicate: (ctx: Context) =>
        !ctx.once &&
        ctx.servers["home"].info.maxRam >= c.requiredRam &&
        !ctx.ns.ps("home").some((proc) => proc.filename === c.script),
      action: (ctx: Context) => {
        ctx.ns.exec(c.script, "home", 1)
      },
    })
)

interface Command {
  cmd: string
  args: (string | number | boolean)[]
}

const Steps = (
  [
    new EachStep({
      name: "CommandPort",
      gather: (ctx: Context) => {
        // const commandPort = ctx.ns.getPortHandle(3)
        const commands: Command[] = []
        // while (!commandPort.empty()) {
        //   const [cmd, ...args] = JSON.parse(commandPort.read().toString())
        //   commands.push({ cmd, args })
        // }
        return commands
      },
      log: (ctx: Context, cmd: Command) => `Got command ${cmd.cmd} ${cmd.args}`,
      action: async (ctx: Context, cmd: Command) => {
        switch (cmd.cmd) {
          case "reload":
            ctx.ns.spawn(ctx.ns.getScriptName())
            break
          default:
            await ctx.ns.alert(`Unknown command ${cmd.cmd}`)
            break
        }
      },
    }),
  ] as Step<any>[]
).concat(CoreChains, ConditionalChains)

export async function main(ns: NS) {
  await Execute(ns, "Main", Steps)
}
