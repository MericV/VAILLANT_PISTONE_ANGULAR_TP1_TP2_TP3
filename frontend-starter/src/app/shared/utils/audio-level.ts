/**
 * Énergie d'une bande de fréquences (de `fromHz` à `toHz`) dans le spectre d'un AnalyserNode,
 * de 0 à 1. `bins` vient de getByteFrequencyData : chaque case couvre sampleRate / fftSize Hz.
 */
export function bandLevel(bins: Uint8Array, sampleRate: number, fromHz: number, toHz: number): number {
  const binHz = sampleRate / (bins.length * 2);
  const from = Math.max(1, Math.floor(fromHz / binHz));
  const to = Math.max(from + 1, Math.ceil(toHz / binHz));
  let sum = 0;
  for (let i = from; i < to; i++) sum += bins[i] ?? 0;
  return sum / ((to - from) * 255);
}
