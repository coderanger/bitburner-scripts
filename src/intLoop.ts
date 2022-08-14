import type { NS } from "@ns"

export async function main(ns: NS) {
  ns.singularity.joinFaction("Four Sigma")
  // const player = ns.getPlayer()
  // if (player.skills.intelligence < 150) {
  ns.singularity.softReset("intLoop.js")
  // } else {
  // ns.alert("Intelligence grinding complete")
  // }
}
