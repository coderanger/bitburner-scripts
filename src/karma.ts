import type { NS } from "@ns"

// A hack to work around the undocumented nature of the heart.break() call.
interface NSKarma extends NS {
  heart: {
    break: () => number
  }
}

export async function main(ns: NSKarma) {
  const karma = ns.heart.break() * -1
  const target = 54_000
  ns.tprint(`Karma: ${karma.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
  if (karma >= target) {
    ns.tprint(`GOAL REACHED`)
    return
  }

  const karmaPerSecond = 1 // From Homicide
  const timeRemaining = (target - karma) / karmaPerSecond
  const hours = Math.floor(timeRemaining / 3600)
  const minutes = Math.floor((timeRemaining - hours * 3600) / 60)
  ns.tprint(`Time remaining: ${hours}:${minutes}`)

  const eta = new Date(Date.now() + timeRemaining * 1000)
  ns.tprint(`ETA: ${eta.toLocaleString()}`)
}
