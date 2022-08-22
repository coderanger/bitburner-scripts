import type { NS } from "@ns"

// Algorithmic Stock Trader
async function algorithmicStockTrader(ns: NS, transactions: number, prices: number[]) {
  const days = prices.length
  const lastBuyDay = days - 1

  const explore = (curProfit: number, curTransactions: number, startDay: number, acc: number[]) => {
    // ns.tprint(`!!! ${curProfit} ${curTransactions} ${startDay} ${acc}`)
    if (curTransactions >= transactions) {
      return [curProfit, acc] as const
    }
    let bestProfit = curProfit
    let bestAcc = acc
    // Look at all future buy days.
    for (let buyDay = startDay; buyDay < lastBuyDay; buyDay++) {
      const buyPrice = prices[buyDay]
      for (let sellDay = buyDay + 1; sellDay < days; sellDay++) {
        const sellPrice = prices[sellDay]
        if (sellPrice > buyPrice) {
          // Viable transaction, try it out.
          const [guess, guessAcc] = explore(
            curProfit + (sellPrice - buyPrice),
            curTransactions + 1,
            sellDay + 1,
            // Uncomment this when debugging, the memory alloc slows things down.
            acc //.concat(buyDay, sellDay)
          )
          if (guess > bestProfit) {
            bestProfit = guess
            bestAcc = guessAcc
          }
        }
      }
    }
    return [bestProfit, bestAcc] as const
  }

  return explore(0, 0, 0, [])
}

export async function main(ns: NS) {
  const val = await algorithmicStockTrader(
    ns,
    4000,
    [
      71, 63, 115, 102, 140, 199, 31, 47, 66, 51, 60, 35, 58, 43, 185, 137, 183, 183, 173, 182, 71,
      131, 19, 1, 29, 30, 6, 35, 109, 67, 35, 128, 112, 103, 77, 157, 33, 74, 31, 26, 150, 64,
    ]
  )

  // const val = await algorithmicStockTrader(ns, 1, [31, 26, 150, 64])

  ns.tprint(val)
}
