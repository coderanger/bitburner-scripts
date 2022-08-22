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
}
