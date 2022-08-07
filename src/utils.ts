const unitStr = (units: string[], divisor: number) => {
  return (n: number) => {
    let val = n
    let i = 0
    while (true) {
      if (val < divisor || i === units.length + 1) {
        return `${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}${units[i]}`
      }
      val = val / divisor
      i++
    }
  }
}

export const moneyStr = unitStr(["", "k", "m", "b", "t"], 1000)
// nb. RAM in bitburner is always expressed in GB as the base unit
export const ramStr = unitStr(["GB", "TB", "EB"], 1024)
