import { moneyStr } from "./utils"
import type { AugmentationStats, NS } from "@ns"

const FACTIONS = [
  "CyberSec",
  "Tian Di Hui",
  "Netburners",
  "Sector-12",
  "Chongqing",
  "New Tokyo",
  "Ishima",
  "Aevum",
  "Volhaven",
  "NiteSec",
  "The Black Hand",
  "BitRunners",
  "ECorp",
  "MegaCorp",
  "KuaiGong International",
  "Four Sigma",
  "NWO",
  "Blade Industries",
  "OmniTek Incorporated",
  "Bachman & Associates",
  "Clarke Incorporated",
  "Fulcrum Secret Technologies",
  "Slum Snakes",
  "Tetrads",
  "Silhouette",
  "Speakers for the Dead",
  "The Dark Army",
  "The Syndicate",
  "The Covenant",
  "Daedalus",
  "Illuminati",
]

export interface Augmentation {
  name: string
  cost: number
  rep: number
  preReqs: string[]
  stats: AugmentationStats
  factions: string[]
}

export interface AvailableAugmentation {
  aug: Augmentation
  faction: string
  cost: number
}

export class AugDB {
  augs: Record<string, Augmentation> = {}

  constructor(ns: NS) {
    for (const faction of FACTIONS) {
      for (const aug of ns.singularity.getAugmentationsFromFaction(faction)) {
        if (this.augs[aug] === undefined) {
          this.augs[aug] = {
            name: aug,
            cost: ns.singularity.getAugmentationBasePrice(aug),
            rep: ns.singularity.getAugmentationRepReq(aug),
            preReqs: ns.singularity.getAugmentationPrereq(aug),
            stats: ns.singularity.getAugmentationStats(aug),
            factions: [],
          }
        }
        this.augs[aug].factions.push(faction)
      }
    }
  }

  getByFaction(faction: string) {
    const augs: Augmentation[] = []
    for (const aug in this.augs) {
      if (this.augs[aug].factions.includes(faction)) {
        augs.push(this.augs[aug])
      }
    }
    return augs
  }

  getAvailable(ns: NS) {
    const available: AvailableAugmentation[] = []
    const existing = ns.singularity.getOwnedAugmentations(true).reduce((a, b) => {
      a[b] = true
      return a
    }, {} as Record<string, boolean>)
    const player = ns.getPlayer()
    for (const augName in this.augs) {
      if (existing[augName]) {
        continue
      }
      const aug = this.augs[augName]
      const availableFrom = aug.factions.filter(
        (faction) => ns.singularity.getFactionRep(faction) >= aug.rep
      )
      if (availableFrom.length === 0 || !aug.preReqs.every((a) => existing[a])) {
        continue
      }
      const cost = ns.singularity.getAugmentationPrice(augName)
      if (cost > player.money) {
        continue
      }
      available.push({
        aug,
        cost,
        faction: availableFrom[0],
      })
    }
    return available
  }
}

export async function main(ns: NS) {
  const opts = ns.flags([
    ["available", false],
    ["missing", false],
  ])
  const augDb = new AugDB(ns)
  const existing = ns.singularity.getOwnedAugmentations(true).reduce((a, b) => {
    a[b] = true
    return a
  }, {} as Record<string, boolean>)
  if (opts.available) {
    ns.tprint("Available augmentations:")
    const available = augDb.getAvailable(ns)
    for (const avail of available) {
      ns.tprint(`${avail.aug.name} from ${avail.faction} for ${moneyStr(avail.cost)}`)
    }
  }
  if (opts.missing) {
    ns.tprint("Missing augmentations:")
    for (const augName in augDb.augs) {
      if (!existing[augName]) {
        ns.tprint(`${augName} from ${augDb.augs[augName].factions.join(", ")}`)
      }
    }
  }
}
