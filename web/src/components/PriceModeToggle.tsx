import { useLeaderboardData } from '../lib/LeaderboardDataContext'

/**
 * Switches every cost on the site between each run's frozen quote and its
 * model's latest quote. The frozen view is the published one; the current view
 * compares models at today's prices.
 */
export function PriceModeToggle() {
  const { priceMode, setPriceMode } = useLeaderboardData()
  return (
    <label
      className="price-mode"
      title={
        'Off: each entry is priced with the quote current on its submission date, so published costs never change.\n' +
        "On: every entry is re-priced at its model's latest quote, for a like-for-like comparison."
      }
    >
      <input
        type="checkbox"
        checked={priceMode === 'current'}
        onChange={(e) => setPriceMode(e.target.checked ? 'current' : 'frozen')}
      />
      Current prices
    </label>
  )
}
