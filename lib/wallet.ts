/** Small display helpers shared by the wallet UI. */

export function shortenAddress(address?: string | null, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}
