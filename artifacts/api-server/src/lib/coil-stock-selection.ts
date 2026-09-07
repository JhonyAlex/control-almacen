/**
 * Pure, deterministic selection of stock coils to cover a meter deficit.
 * No database dependencies so it can be unit-tested and reused anywhere.
 */

export interface CoilCandidate {
  id: number;
  metros: number;
}

/**
 * 1. Prefer the single smallest coil that covers the whole deficit
 *    (minimises surplus).
 * 2. Otherwise greedily take coils from largest to smallest (ties broken by
 *    id) until the deficit is covered; never takes more coils than needed.
 */
export function selectCoilsForDeficit(
  candidates: CoilCandidate[],
  deficitMeters: number,
): CoilCandidate[] {
  if (!(deficitMeters > 0)) return [];
  const usable = candidates.filter((c) => c.metros > 0);

  const sufficient = usable
    .filter((c) => c.metros >= deficitMeters)
    .sort((a, b) => a.metros - b.metros || a.id - b.id);
  if (sufficient.length > 0) return [sufficient[0]];

  const sorted = [...usable].sort((a, b) => b.metros - a.metros || a.id - b.id);
  const chosen: CoilCandidate[] = [];
  let covered = 0;
  for (const candidate of sorted) {
    if (covered >= deficitMeters) break;
    chosen.push(candidate);
    covered += candidate.metros;
  }
  return chosen;
}
