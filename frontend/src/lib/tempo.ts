/** Un intervallo come lo si dice: «45 s», «3 min 12 s», «1 h 5 min» (i secondi spariscono oltre l'ora). */
export function durata(secondi: number): string {
  const s = Math.max(0, Math.floor(secondi));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  if (m) return r ? `${m} min ${r} s` : `${m} min`;
  return `${r} s`;
}
