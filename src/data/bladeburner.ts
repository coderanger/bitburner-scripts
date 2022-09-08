import type { NS } from "@ns"

const FILENAME = "/.bladeburner.json.txt"

export interface BladeburnerData {
  updatedAt?: number
  rank: number
  chaos: number
  contracts: {
    name: string
    remaining: number
    successChance: [number, number]
  }[]
  operations: {
    name: string
    remaining: number
    successChance: [number, number]
  }[]
  blackOps: {
    name: string
    remaining: number
    successChance: [number, number]
  }[]
}

export class Bladeburner {
  data: BladeburnerData | undefined
  ns: NS

  constructor(ns: NS) {
    this.ns = ns
    this.load()
  }

  load() {
    const raw = this.ns.read(FILENAME) as string
    if (raw === "") {
      this.data = undefined
      return
    }
    const data = JSON.parse(raw) as BladeburnerData
    const lastAugTime = Date.now() - this.ns.getPlayer().playtimeSinceLastAug * 1000
    if ((data.updatedAt || 0) <= lastAugTime) {
      // Data is too old, ignore it.
      this.data = undefined
      return
    }
    this.data = data
  }

  async update(data: BladeburnerData) {
    data.updatedAt = Date.now()
    await this.ns.write(FILENAME, JSON.stringify(data, undefined, 2), "w")
  }
}
