export interface GameParams {
  debug: boolean;
  seed: number | null;
  /** Debug: sanity never drains. */
  god: boolean;
  /** Demo/trailer mode: the camera walks the true path by itself. */
  attract: boolean;
}

export function parseParams(search: string): GameParams {
  const params = new URLSearchParams(search);
  const raw = params.get('seed');
  const seed = raw !== null && /^\d{1,10}$/.test(raw) && Number(raw) <= 0xffffffff ? Number(raw) : null;
  return { debug: params.has('debug'), seed, god: params.has('god'), attract: params.has('attract') };
}

/** URL for replaying a tape (`seed`) or starting a new one (`null`), keeping other flags. */
export function tapeUrl(href: string, seed: number | null): string {
  const url = new URL(href);
  if (seed === null) url.searchParams.delete('seed');
  else url.searchParams.set('seed', String(seed));
  return url.toString();
}
