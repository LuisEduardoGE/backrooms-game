export interface GameParams {
  debug: boolean;
  seed: number | null;
}

export function parseParams(search: string): GameParams {
  const params = new URLSearchParams(search);
  const raw = params.get('seed');
  const seed = raw !== null && /^\d{1,10}$/.test(raw) && Number(raw) <= 0xffffffff ? Number(raw) : null;
  return { debug: params.has('debug'), seed };
}
