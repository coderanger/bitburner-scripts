import { Context, Execute, RunChainStep, StatefulStep, Step } from "./decisionTree"
import type { GangGenInfo, NS } from "@ns"

const CRIME_GANG_FACTIONS = ["Tetrads", "The Syndicate"]
const GANG_MEMBER_NAMES = [
  "Number One",
  "Snake Eyes",
  "Trip",
  "Club",
  "Cinque",
  "Hexadecimal",
  "Lucky",
  "Spider",
  "K-9",
  "Big Top",
  "Pskyer",
  "Baker",
  "Crow",
]

type AscensionStats = Record<string, { current: number; next: number }>

function UpgradeGangMemberSteps(gangMember: string) {
  return () => [
    new Step({
      name: `AscendGangMember-${gangMember}`,
      gather: (ctx: Context) => {
        const results = ctx.ns.gang.getAscensionResult(gangMember)
        if (results === undefined) {
          // Can't ascend.
          return undefined
        }
        // Figure out the stat multiplier increases.
        const info = ctx.ns.gang.getMemberInformation(gangMember)
        const stats: AscensionStats = {}
        for (const stat of ["agi", "cha", "def", "dex", "hack", "str"] as const) {
          const current = info[`${stat}_asc_mult`]
          const next = current * results[stat]
          stats[stat] = { current, next }
        }
        return stats
      },
      predicate: (ctx: Context, stats: AscensionStats | undefined) => {
        if (stats === undefined) {
          // Can't ascend.
          return false
        }
        // Check if the jump is enough to care.
        const readyStats: Record<string, boolean> = {}
        for (const statName in stats) {
          const stat = stats[statName]
          let ready
          if (stat.current >= 4 && ctx.ns.gang.getMemberNames().length < 12) {
            // Ascending will keep resetting respect which prevents getting all our members.
            ready = false
          } else if (stat.current < 50) {
            const threshold = stat.current < 10 ? 2 : stat.current < 35 ? 5 : 15
            ready = stat.current - (stat.current % threshold) + threshold <= stat.next
          } else {
            // Just don't care past 35.
            ready = false
          }
          readyStats[statName] = ready
        }
        ctx.log.trace(`Ascension ready stats ${JSON.stringify(readyStats)}`)
        return (
          // readyStats.hack || readyStats.chr || (readyStats.str && readyStats.def && readyStats.dex)
          readyStats.str && readyStats.def && readyStats.dex
        )
      },
      log: (ctx: Context, stats: AscensionStats | undefined) => {
        const increases: { statName: string; increase: number }[] = []
        for (const statName in stats) {
          const stat = stats[statName]
          const increase = stat.next - stat.current
          if (increase >= 0.1) {
            increases.push({ statName, increase })
          }
        }
        increases.sort((a, b) => b.increase - a.increase)
        if (increases.length === 0) {
          throw `Error trying to ascend ${gangMember} but found no increases ${JSON.stringify(
            stats
          )}`
        }
        ctx.log.info(
          `Ascending ${gangMember}: ${increases
            .map(
              (i) =>
                `${i.statName} +${i.increase.toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}`
            )
            .join(" ")}`
        )
      },
      action: (ctx: Context) => {
        ctx.ns.gang.ascendMember(gangMember)
      },
    }),

    new Step({
      name: `EquipGangMember-${gangMember}`,
      gather: (ctx: Context) => {
        const toPurchase: string[] = []
        let money = ctx.ns.getPlayer().money
        const info = ctx.ns.gang.getMemberInformation(gangMember)
        for (const equip of ctx.ns.gang.getEquipmentNames()) {
          if (info.upgrades.includes(equip) || info.augmentations.includes(equip)) {
            continue
          }
          const stats = ctx.ns.gang.getEquipmentStats(equip)
          const cost = ctx.ns.gang.getEquipmentCost(equip)
          const type = ctx.ns.gang.getEquipmentType(equip)
          // How much to pay. Augmentations are 50%, normal upgrades 2%, anything that's for hacking is 1% of that.
          const maxPrice =
            (type === "Augmentation" ? 0.5 : 0.02) * (stats.hack === undefined ? 1 : 0.01)
          if (cost <= money * maxPrice) {
            toPurchase.push(equip)
            money -= cost
          }
        }
        return toPurchase
      },
      predicate: (ctx: Context, toPurchase: string[]) => {
        return toPurchase.length !== 0
      },
      log: (ctx: Context, toPurchase: string[]) => {
        ctx.log.info(`Buying equipment ${toPurchase.join(", ")} for ${gangMember}`)
      },
      action: (ctx: Context, toPurchase: string[]) => {
        for (const equip of toPurchase) {
          ctx.ns.gang.purchaseEquipment(gangMember, equip)
        }
      },
    }),
  ]
}

// function SetGangTaskAction(taskName: string) {
//   return (ctx: Context) => {
//     for (const member of ctx.ns.gang.getMemberNames()) {
//       ctx.ns.gang.setMemberTask(member, taskName)
//     }
//     return true
//   }
// }

function getBestTasks(ctx: Context, gangMember: string) {
  const gangInfo = ctx.ns.gang.getGangInformation()
  const memberInfo = ctx.ns.gang.getMemberInformation(gangMember)
  const tasks = ctx.ns.gang
    .getTaskNames()
    .filter((n) => n !== "Unassigned")
    .map((taskName) => {
      const taskStats = ctx.ns.gang.getTaskStats(taskName)
      return {
        taskName,
        respect: ctx.ns.formulas.gang.respectGain(gangInfo, memberInfo, taskStats),
        money: ctx.ns.formulas.gang.moneyGain(gangInfo, memberInfo, taskStats),
      }
    })
  const bestRespect = tasks.reduce((prev, current) =>
    current.respect > prev.respect ? current : prev
  )
  const bestMoney = tasks.reduce((prev, current) => (current.money > prev.money ? current : prev))
  ctx.log.debug(
    `Got best tasks for ${gangMember}: Respect=${
      bestRespect.taskName
    } @ ${bestRespect.respect.toLocaleString(undefined, { maximumFractionDigits: 1 })} Money=${
      bestMoney.taskName
    } @ ${bestMoney.money.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
  )
  return {
    respect: bestRespect.respect,
    respectTask: bestRespect.taskName,
    money: bestMoney.money,
    moneyTask: bestMoney.taskName,
  }
}

function TaskGangMemberSteps(gangMember: string) {
  const cachedBestTasksKey = `gangTasks-${gangMember}`
  const cachedBestTasks = (ctx: Context) =>
    ctx.onceData[cachedBestTasksKey] as ReturnType<typeof getBestTasks>

  return [
    new Step({
      name: "BootstrapSkillUpTask",
      gather: (ctx: Context) => {
        ctx.onceData[cachedBestTasksKey] = getBestTasks(ctx, gangMember)
      },
      predicate: (ctx: Context) =>
        ctx.ns.gang.getMemberNames().length < 12 &&
        cachedBestTasks(ctx).respect <= 10 &&
        ctx.ns.gang.getMemberInformation(gangMember).str <= 200,
      log: () => `Tasking ${gangMember} to train for bootstrapping`,
      action: (ctx: Context) => {
        ctx.ns.gang.setMemberTask(gangMember, "Train Combat")
        return true
      },
    }),

    new StatefulStep({
      name: "ReduceWantedTask",
      gather: (ctx: Context) => ctx.ns.gang.getGangInformation(),
      enter: (ctx: Context, { wantedPenalty, wantedLevel }: GangGenInfo) =>
        wantedPenalty <= 0.95 && wantedLevel > 100,
      exit: (ctx: Context, { wantedPenalty, wantedLevel }: GangGenInfo) =>
        wantedPenalty >= 0.99 || wantedLevel < 10,
      log: () => `Tasking ${gangMember} to Vigilante Justice to reduce wanted level`,
      action: (ctx: Context) => {
        ctx.ns.gang.setMemberTask(gangMember, "Vigilante Justice")
        return true
      },
    }),

    new Step({
      name: "BootstrapRespectTask",
      gather: () => undefined,
      predicate: (ctx: Context) => ctx.ns.gang.getMemberNames().length < 12,
      log: (ctx: Context) =>
        `Tasking ${gangMember} to ${
          cachedBestTasks(ctx).respectTask
        } respect until we have 12 members`,
      action: (ctx: Context) => {
        ctx.ns.gang.setMemberTask(gangMember, cachedBestTasks(ctx).respectTask)
        return true
      },
    }),

    new Step({
      name: "ManualTask",
      gather: (ctx: Context): [string, string] => {
        const fileData = (ctx.ns.read("gangManual.txt") as string).trim()
        const tasks = cachedBestTasks(ctx)
        switch (fileData) {
          case "respect":
            return ["respect", tasks.respectTask]
          case "money":
            return ["money", tasks.moneyTask]
          case "train":
            return ["train", "Train Combat"]
          case "territory":
            return ["territory", "Territory Warfare"]
          default:
            return ["", ""]
        }
      },
      predicate: (ctx: Context, [goal]: [string, string]) => goal !== "",
      log: (ctx: Context, [goal, task]: [string, string]) =>
        `Tasking ${gangMember} to ${task} from manual override for ${goal}`,
      action: (ctx: Context, [, task]: [string, string]) => {
        ctx.ns.gang.setMemberTask(gangMember, task)
        return true
      },
    }),

    new Step({
      name: "AutoTerritoryWarfareTask",
      gather: () => undefined,
      predicate: (ctx: Context) => ctx.onceData["autoTwTask"] === true,
      log: () => `Tasking ${gangMember} to Territory Warfare because it is almost ready`,
      action: (ctx: Context) => {
        ctx.ns.gang.setMemberTask(gangMember, "Territory Warfare")
        return true
      },
    }),

    // TODO the rest of this.

    new Step({
      name: "FallbackTask",
      gather: (ctx: Context) => {
        const minutes = new Date().getMinutes() + ctx.ns.gang.getMemberNames().indexOf(gangMember)
        const isEarly = ctx.player.playtimeSinceLastAug < 60_000
        if (!isEarly && minutes % 15 === 0 && ctx.ns.gang.getGangInformation().territory <= 0.95) {
          return "Territory Warfare"
        }
        const bestTasks = cachedBestTasks(ctx)
        const memberInfo = ctx.ns.gang.getMemberInformation(gangMember)
        const isHighLevel = memberInfo.str_asc_mult >= 30 && memberInfo.def_asc_mult >= 30
        const hasGangRep = ctx.ns.gang.getGangInformation().respect >= 1_000_000_000
        return [
          isHighLevel || isEarly ? bestTasks.moneyTask : "Train Combat",
          hasGangRep && !isEarly ? bestTasks.moneyTask : bestTasks.respectTask,
          bestTasks.moneyTask,
        ][minutes % 3]
      },
      predicate: () => true,
      log: (ctx: Context, taskName: string) => `Tasking ${gangMember} to ${taskName} as a fallback`,
      action: (ctx: Context, taskName: string) => {
        ctx.ns.gang.setMemberTask(gangMember, taskName)
        return true
      },
    }),
  ]
}

export function GangSteps() {
  return [
    new Step({
      name: "CreateGang",
      gather: (ctx: Context) => {
        // Check if we're in a crime gang faction. If not don't bother with the rest.
        const player = ctx.ns.getPlayer()
        return CRIME_GANG_FACTIONS.find((faction) => player.factions.includes(faction)) || ""
      },
      predicate: (ctx: Context, gangFaction: string) => {
        return gangFaction !== "" && !ctx.ns.gang.inGang()
      },
      log: (ctx: Context, gangFaction: string) => {
        ctx.log.info(`Creating a gang with ${gangFaction}`)
      },
      action: (ctx: Context, gangFaction: string) => {
        return !ctx.ns.gang.createGang(gangFaction)
      },
    }),

    new Step({
      name: "CheckInGang",
      final: true,
      gather: () => undefined,
      predicate: (ctx: Context) => ctx.ns.gang.inGang(),
      action: () => undefined,
    }),

    new Step({
      name: "RecruitGangMember",
      gather: (ctx: Context) => {
        // Find an unused name.
        const usedNames = ctx.ns.gang.getMemberNames()
        const unusedNames = GANG_MEMBER_NAMES.filter((n) => !usedNames.includes(n))
        if (unusedNames.length === 0) {
          // Just in case, but this should be impossible.
          unusedNames.push((usedNames.length + 1).toString())
        }
        // Pick one at random.
        return unusedNames[(unusedNames.length * Math.random()) | 0]
      },
      predicate: (ctx: Context) => ctx.ns.gang.canRecruitMember(),
      log: (ctx: Context, name: string) => {
        ctx.log.info(`Recruiting gang member ${name}`)
      },
      action: (ctx: Context, name: string) => {
        ctx.ns.gang.recruitMember(name)
        // Later this can be handled by a chain of its own but having it here too
        // is good for safety so new members aren't left on Unassigned if something blows up.
        ctx.ns.gang.setMemberTask(name, "Train Combat")
      },
    }),

    new RunChainStep({
      name: "UpgradeGangMembers",
      chain: (ctx: Context) =>
        ctx.ns.gang.getMemberNames().map(
          (member) =>
            new RunChainStep({
              name: `UpgradeGangMember-${member}`,
              chain: UpgradeGangMemberSteps(member),
            })
        ),
    }),

    // Check the expected time of everyone running Territory Warfare until we have enough to enable
    // and do that if less than X minutes (10, 20, 30?)
    // Game runs TW power math every 20 seconds (200 ms/cycle, 100 cycles/update, == 20 s/update)
    // Per-member math https://github.com/danielyxie/bitburner/blob/738152d614a923e7a66a108b4c5d7c148d904851/src/Gang/GangMember.ts#L79
    // return (this.hack + this.str + this.def + this.dex + this.agi + this.cha) / 95;
    // Gang math https://github.com/danielyxie/bitburner/blob/5d2b81053d762111adb094849bf2d09f596b2157/src/Gang/Gang.ts#L331
    // return 0.015 * Math.max(0.002, this.getTerritory()) * memberTotal;
    // Only counts members in the TW task
    // So compute how much more power we need right now, compute how long that would take, add on X% because other gangs
    // are also gaining power at the same time.
    new Step({
      name: "AutoTerritoryWarfareTask",
      gather: () => undefined,
      predicate: (ctx: Context) => {
        // Work out what power we need right now to hit our 0.8 threshold (used below to enable TW).
        const gang = ctx.ns.gang.getGangInformation()
        if (gang.territoryWarfareEngaged) {
          // Already enabled.
          return false
        }
        const allGangs = ctx.ns.gang.getOtherGangInformation()
        const allPowers: number[] = []
        for (const faction in allGangs) {
          if (faction !== gang.faction) {
            allPowers.push(allGangs[faction].power * 4)
          }
        }
        const neededPower = Math.max(...allPowers) - gang.power
        if (neededPower <= 0) {
          // Already done. This shouldn't happen often since we check above but maybe on the last cycle.
          return false
        }
        // Work out our power gain per cycle. See above comment for game math (no formula available).
        const memberTotal = ctx.ns.gang
          .getMemberNames()
          .map((name) => {
            const member = ctx.ns.gang.getMemberInformation(name)
            return (
              (member.hack + member.str + member.def + member.dex + member.agi + member.cha) / 95
            )
          })
          .reduce((a, b) => a + b, 0)
        const powerPerUpdate = 0.015 * Math.max(0.002, gang.territory) * memberTotal
        const minutesNeeded = neededPower / (powerPerUpdate * 3) // 3 updates/minute
        return minutesNeeded <= 30
      },
      action: (ctx: Context) => {
        ctx.onceData["autoTwTask"] = true
      },
    }),

    new RunChainStep({
      name: "TaskGangMembers",
      chain: (ctx: Context) =>
        ctx.ns.gang.getMemberNames().map(
          (member) =>
            new RunChainStep({
              name: `TaskGangMembers-${member}`,
              chain: TaskGangMemberSteps(member),
            })
        ),
    }),

    new Step({
      name: "EnableTerritoryWarfare",
      gather: () => undefined,
      predicate: (ctx: Context) => {
        const gang = ctx.ns.gang.getGangInformation()
        if (gang.territoryWarfareEngaged || gang.territory === 1.0) {
          // Already on.
          return false
        }
        const allGangs = ctx.ns.gang.getOtherGangInformation()
        const winChances: number[] = []
        for (const faction in allGangs) {
          if (faction === gang.faction || allGangs[faction].territory === 0) {
            continue
          }
          winChances.push(gang.power / (allGangs[faction].power + gang.power))
        }
        return Math.min(...winChances) >= 0.8
      },
      log: () => "Enabling territory warfare",
      action: (ctx: Context) => ctx.ns.gang.setTerritoryWarfare(true),
    }),

    new Step({
      name: "DisableTerritoryWarfare",
      gather: () => undefined,
      predicate: (ctx: Context) => {
        const gang = ctx.ns.gang.getGangInformation()
        return gang.territoryWarfareEngaged && gang.territory === 1.0
      },
      log: () => "Disabling territory warfare",
      action: (ctx: Context) => ctx.ns.gang.setTerritoryWarfare(false),
    }),
  ]
}

export async function main(ns: NS) {
  // Stub entrypoint to run only the gang chain.
  await Execute(ns, "Gang", GangSteps())
}
