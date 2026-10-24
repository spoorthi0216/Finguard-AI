/**
 * FinGuard AI — Financial Unit & Currency Formatters
 * 
 * Documentation of Unit Conventions:
 * - Financial amounts (revenue, expenses, reported_profit, calculated_profit, profit_discrepancy, ebitda)
 *   are stored as raw floating-point numbers in their native precision as ingested from source filings.
 * - In SEC EDGAR filings, numerical units can vary (e.g. reported in thousands vs millions vs ones).
 *   FinGuard AI preserves raw reported amounts without silent scaling (no automatic multiplication or division).
 * - Unless a dataset explicitly documents a uniform scale (e.g. millions), we do NOT append 'M' or 'K'
 *   to raw numbers.
 * - Currency codes (e.g. USD, EUR, GBP, JPY, CAD) are respected as supplied in the row metadata.
 *   If currency is absent or null, numbers are formatted without inventing a currency symbol.
 */

/**
 * Returns currency symbol or code prefix.
 */
export function getCurrencySymbol(currency?: string | null): string {
  if (!currency || !currency.trim()) return '';
  const code = currency.trim().toUpperCase();
  switch (code) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'JPY':
      return '¥';
    case 'CAD':
      return 'CA$';
    case 'AUD':
      return 'A$';
    case 'CHF':
      return 'CHF ';
    case 'INR':
      return '₹';
    default:
      return `${code} `;
  }
}

/**
 * Formats a financial amount with its appropriate currency symbol without inventing scales.
 *
 * @param amount - The numeric financial amount (e.g., 119575)
 * @param currency - The currency code (e.g. 'USD', 'EUR', or null)
 * @param options - Additional display options:
 *   - showSign: whether to include a leading '+' for positive numbers
 *   - fallback: text to display if amount is null/undefined (default: 'NULL')
 */
export function formatFinancialAmount(
  amount: number | null | undefined,
  currency?: string | null,
  options?: {
    showSign?: boolean;
    fallback?: string;
  }
): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return options?.fallback ?? 'NULL';
  }

  const symbol = getCurrencySymbol(currency);
  const isNegative = amount < 0;
  const absVal = Math.abs(amount);

  // Format with thousands separators, preserving decimal digits if fractional
  const formattedAbs = absVal.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(absVal) ? 0 : 2,
    maximumFractionDigits: 2,
  });

  if (isNegative) {
    return `-${symbol}${formattedAbs}`;
  }

  if (options?.showSign && amount > 0) {
    return `+${symbol}${formattedAbs}`;
  }

  return `${symbol}${formattedAbs}`;
}

/**
 * Formats a discrepancy delta (e.g. +$18,847 or -$1,200).
 */
export function formatDiscrepancy(
  delta: number | null | undefined,
  currency?: string | null
): string {
  if (delta === null || delta === undefined || isNaN(delta)) {
    return '0';
  }
  return formatFinancialAmount(delta, currency, { showSign: true });
}
