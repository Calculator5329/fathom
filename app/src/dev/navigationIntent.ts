/** Bounded demo vocabulary: proposals for public Fathom navigation only. */
export const DESTINATIONS = [
  { label: 'Home', handle: 'app.nav.home', phrases: ['home'] },
  { label: 'Backtest', handle: 'app.nav.backtest', phrases: ['backtest', 'back test'] },
  { label: 'Asset allocation', handle: 'app.nav.allocation', phrases: ['allocation', 'asset allocation'] },
  { label: 'Income', handle: 'app.nav.income', phrases: ['income', 'dividend income'] },
  { label: 'Monte Carlo', handle: 'app.nav.montecarlo', phrases: ['monte carlo', 'retirement simulator'] },
  { label: 'Research', handle: 'app.nav.stock', phrases: ['research', 'stock research'] },
] as const

export function navigationProposal(text: string) {
  const phrase = text.toLowerCase().trim().replace(/[.!?]+$/, '').replace(/^(?:please )?(?:open|show|go to|take me to) /, '').trim()
  return DESTINATIONS.find(destination => destination.phrases.some(value => value === phrase)) ?? null
}
