import { Chain, Context, EachStep, Execute, RunChainStep, Step } from "./decisionTree"
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
].map(
  (c) =>
    new RunChainStep({
      name: c.name,
      chain: c,
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
        const commandPort = ctx.ns.getPortHandle(3)
        const commands: Command[] = []
        while (!commandPort.empty()) {
          const [cmd, ...args] = JSON.parse(commandPort.read().toString())
          commands.push({ cmd, args })
        }
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
).concat(CoreChains)

export async function main(ns: NS) {
  await Execute(ns, "Main", Steps)
}
