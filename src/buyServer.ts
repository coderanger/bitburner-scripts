import { ramStr } from "./utils"
import type { NS } from "@ns"

function parseArg(
  ns: NS,
  arg: string | number | boolean | undefined
): [number | undefined, number | undefined] {
  if (arg === undefined) {
    const player = ns.getPlayer()
    return [undefined, player.money / (1024 * 1024)]
  }

  const match = arg
    .toString()
    .toLowerCase()
    .match(/^([0-9.,]+)(|g|gb|tb|m|b|t)$/)
  if (!match) {
    throw "Unable to parse argument"
  }
  const rawNumber = parseFloat(match[1].replace(/,/, ""))
  switch (match[2]) {
    case "g":
    case "gb":
      return [rawNumber, undefined]
    case "tb":
      return [rawNumber * 1024, undefined]
    case "m":
      return [undefined, rawNumber]
    case "b":
      return [undefined, rawNumber * 1024]
    case "": // No unit is the same as T.
    case "t":
      return [undefined, rawNumber * 1024 * 1024]
  }
  throw `Unknown unit ${match[2]}`
}

function listServers(ns: NS) {
  for (const server of ns.getPurchasedServers()) {
    ns.tprint(`${server}: ${ramStr(ns.getServerRam(server)[0])}`)
  }
}

export async function main(ns: NS) {
  if (ns.args[0] === "-l") {
    return listServers(ns)
  }
  const [ramGoal, moneyGoal] = parseArg(ns, ns.args[0])
  let ramToBuy
  let count = 1
  if (ramGoal !== undefined) {
    ramToBuy = Math.pow(2, Math.floor(Math.log2(ramGoal)))
  } else if (moneyGoal !== undefined) {
    for (let i = 1; i <= 20; i++) {
      if (ns.getPurchasedServerCost(Math.pow(2, i)) / (1024 * 1024) <= moneyGoal) {
        ramToBuy = Math.pow(2, i)
      }
    }
    if (ramToBuy === undefined) {
      ramToBuy = 1048576
    }
    count = Math.floor((moneyGoal * 1024 * 1024) / ns.getPurchasedServerCost(ramToBuy))
  } else {
    throw "What?"
  }

  const existingServerCount = ns.getPurchasedServers().length
  if (existingServerCount + count > 25) {
    count = 25 - existingServerCount
  }
  if (count === 0) {
    // TODO: This should ask to sell things.
    await ns.alert("All servers are purchased")
    return
  }
  const serverNames = []
  for (let i = 0; i < count; i++) {
    serverNames.push(`worker-${i + existingServerCount}`)
  }
  const serverNameString =
    count === 1 ? serverNames[0] : `${serverNames[0]} to ${existingServerCount + count - 1}`

  const costToBuy = ns.getPurchasedServerCost(ramToBuy) * count
  const player = ns.getPlayer()

  let ramFormatted = ramToBuy
  let ramUnit = "GB"
  if (ramFormatted >= 1024) {
    ramFormatted = ramFormatted / 1024
    ramUnit = "TB"
  }
  const ramString = `${ramFormatted.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}${ramUnit}`

  let moneyFormatted = costToBuy / (1000 * 1000)
  let moneyUnit = "M"
  if (moneyFormatted >= 1000) {
    moneyFormatted = moneyFormatted / 1000
    moneyUnit = "B"
  }
  if (moneyFormatted >= 1000) {
    moneyFormatted = moneyFormatted / 1000
    moneyUnit = "T"
  }
  const moneyString = `${moneyFormatted.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}${moneyUnit}`

  if (costToBuy > player.money) {
    await ns.alert(`You can't afford ${ramString} for $${moneyString}`)
    return
  }

  const ok = await ns.prompt(
    `Would you like to buy ${serverNameString} with ${ramString} for $${moneyString}?`
  )
  if (ok) {
    for (const serverName of serverNames) {
      const out = ns.purchaseServer(serverName, ramToBuy)
      if (!out) {
        await ns.alert(`Error while purchasing ${serverName} with ${ramToBuy}`)
        return
      }
    }
  }
}
