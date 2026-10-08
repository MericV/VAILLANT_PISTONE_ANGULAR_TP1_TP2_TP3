/**
 * Génération automatique d'un « chart » (liste de notes à jouer) à partir du signal audio.
 *
 * Principe : détection des attaques (onsets). On découpe le son en petites fenêtres,
 * on mesure l'énergie de chacune et on repère les hausses brusques d'énergie
 * (coup de batterie, attaque de corde). Chaque hausse marquée devient une note.
 *
 * Le couloir (lane) de la note dépend de la « brillance » du son au moment de l'attaque,
 * estimée par le taux de passage par zéro : un son grave (grosse caisse, basse) va à gauche,
 * un son aigu (charleston, note haute) va à droite, comme sur un manche de guitare.
 */

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface ChartNote {
  /** Instant où la note doit être frappée, en millisecondes depuis le début du morceau. */
  timeMs: number;
  /** Couloir 0 à `lanes - 1` de la difficulté. */
  lane: number;
  /** Durée de maintien (note « sustain ») en ms ; 0 pour une note simple. */
  durationMs: number;
  /**
   * Hammer-on / pull-off : note rapprochée de la précédente, sur un autre couloir.
   * Elle se valide sans réappuyer si sa touche est déjà enfoncée et que la note précédente a été réussie.
   */
  hopo: boolean;
  /** Numéro de la phrase Overdrive (notes dorées) à laquelle la note appartient, ou -1. */
  phrase: number;
}

/** Nombre maximal de couloirs (Difficile et Expert). */
export const MAX_LANES = 5;

/**
 * Réglages par difficulté, inspirés de Fortnite Festival :
 * - `lanes` : 4 voies en Facile/Moyen, 5 en Difficile/Expert ;
 * - `minGapMs` / `sensitivity` : écart minimal entre notes et exigence sur la force d'une attaque ;
 * - `chordShare` : part des attaques les plus fortes jouées en accord (deux notes simultanées) ;
 * - `hopoGapMs` : une note à moins de cet écart de la précédente devient HOPO (0 = jamais) ;
 * - `visibleMs` : temps de descente d'une note à vitesse 1x (plus court = défilement plus rapide).
 */
export const DIFFICULTIES: Record<
  Difficulty,
  { label: string; lanes: number; minGapMs: number; sensitivity: number; chordShare: number; hopoGapMs: number; visibleMs: number }
> = {
  easy: { label: 'Facile', lanes: 4, minGapMs: 450, sensitivity: 1.8, chordShare: 0, hopoGapMs: 0, visibleMs: 1800 },
  medium: { label: 'Moyen', lanes: 4, minGapMs: 260, sensitivity: 1.5, chordShare: 0, hopoGapMs: 300, visibleMs: 1500 },
  hard: { label: 'Difficile', lanes: 5, minGapMs: 170, sensitivity: 1.35, chordShare: 0.2, hopoGapMs: 220, visibleMs: 1250 },
  expert: { label: 'Expert', lanes: 5, minGapMs: 110, sensitivity: 1.2, chordShare: 0.3, hopoGapMs: 180, visibleMs: 1000 },
};

// Notes maintenues : un son qui dure (énergie qui reste haute) avant une longue pause.
const SUSTAIN_MIN_GAP_MS = 600;
const SUSTAIN_MAX_MS = 2500;
const SUSTAIN_ENERGY_RATIO = 0.75;
// Phrases Overdrive : 6 notes dorées toutes les 32 attaques, à partir de la 16e.
const PHRASE_FIRST = 16;
const PHRASE_EVERY = 32;
const PHRASE_LENGTH = 6;

const FRAME = 1024; // ~23 ms à 44,1 kHz
const HOP = 512; // fenêtres qui se chevauchent de moitié : ~11,6 ms de résolution
const AVERAGE_WINDOW_S = 0.5; // seuil adaptatif calculé sur ±0,5 s autour de chaque fenêtre

// ponytail: flux d'énergie, simple et rapide (~100 ms pour 3 min). Passer au flux spectral (FFT)
// si les notes semblent mal placées sur des morceaux très denses ; mesuré 4x plus lent ici.
export function generateChart(samples: Float32Array, sampleRate: number, difficulty: Difficulty): ChartNote[] {
  const { lanes, minGapMs, sensitivity, chordShare, hopoGapMs } = DIFFICULTIES[difficulty];
  const frameCount = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  if (frameCount < 3) return [];

  // 1. Énergie (échelle logarithmique, proche de la perception) et brillance de chaque fenêtre.
  const energy = new Float32Array(frameCount);
  const brightness = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const start = f * HOP;
    let sum = 0;
    let crossings = 0;
    for (let i = start; i < start + FRAME; i++) {
      sum += samples[i] * samples[i];
      if (i > start && samples[i] >= 0 !== samples[i - 1] >= 0) crossings++;
    }
    energy[f] = Math.log1p(100 * Math.sqrt(sum / FRAME));
    brightness[f] = crossings / FRAME;
  }

  // 2. Flux : uniquement les hausses d'énergie (une baisse n'est pas une attaque).
  const flux = new Float32Array(frameCount);
  for (let f = 1; f < frameCount; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1]);

  // 3. Seuil adaptatif : moyenne locale du flux (sommes cumulées), pour suivre les passages calmes et forts.
  const prefix = new Float64Array(frameCount + 1);
  for (let f = 0; f < frameCount; f++) prefix[f + 1] = prefix[f] + flux[f];
  const half = Math.max(1, Math.round((AVERAGE_WINDOW_S * sampleRate) / HOP));

  // 4. Pics : maximum local, au-dessus du seuil, assez loin de la note précédente.
  const onsets: { timeMs: number; brightness: number; frame: number; strength: number }[] = [];
  let lastMs = -Infinity;
  for (let f = 1; f < frameCount - 1; f++) {
    const from = Math.max(0, f - half);
    const to = Math.min(frameCount, f + half + 1);
    const threshold = ((prefix[to] - prefix[from]) / (to - from)) * sensitivity + 0.02;
    const timeMs = Math.round(((f * HOP + FRAME / 2) / sampleRate) * 1000);
    if (flux[f] > threshold && flux[f] >= flux[f - 1] && flux[f] > flux[f + 1] && timeMs - lastMs >= minGapMs) {
      onsets.push({ timeMs, brightness: brightness[f], frame: f, strength: flux[f] });
      lastMs = timeMs;
    }
  }

  // 5. Couloirs par quantiles de brillance du morceau : chaque couloir reçoit la même part des notes.
  const sorted = onsets.map((o) => o.brightness).sort((a, b) => a - b);
  const bounds = Array.from({ length: lanes - 1 }, (_, q) => sorted[Math.floor(((q + 1) * sorted.length) / lanes)] ?? 0);
  const laneOf = (o: (typeof onsets)[number]) => bounds.filter((b) => o.brightness > b).length;

  // 6. Accords : les attaques les plus fortes (top `chordShare`) reçoivent une seconde note, deux couloirs plus loin.
  const strengths = onsets.map((o) => o.strength).sort((a, b) => b - a);
  const chordMin = chordShare > 0 ? strengths[Math.floor(chordShare * strengths.length)] ?? Infinity : Infinity;

  const notes: ChartNote[] = [];
  let previous: { timeMs: number; lane: number; chord: boolean } | null = null;
  onsets.forEach((o, i) => {
    const lane = laneOf(o);
    const next = onsets[i + 1];
    const gap = next ? next.timeMs - o.timeMs : Infinity;
    // 7. Maintien : longue pause ET énergie qui reste haute sur les 70 % de la pause (le son tient).
    let durationMs = 0;
    if (gap >= SUSTAIN_MIN_GAP_MS && next) {
      const end = o.frame + Math.max(1, Math.floor((next.frame - o.frame) * 0.7));
      let sum = 0;
      for (let f = o.frame + 1; f <= end; f++) sum += energy[f];
      if (sum / (end - o.frame) >= SUSTAIN_ENERGY_RATIO * energy[o.frame]) durationMs = Math.min(gap - 200, SUSTAIN_MAX_MS);
    }
    const chord = durationMs === 0 && o.strength > chordMin;
    // 8. HOPO : note rapprochée, sur un autre couloir, jamais dans ou juste après un accord.
    const hopo =
      hopoGapMs > 0 && !chord && previous !== null && !previous.chord &&
      o.timeMs - previous.timeMs <= hopoGapMs && lane !== previous.lane;
    // 9. Phrase Overdrive : quelques séries de notes dorées réparties dans le morceau.
    const offset = i - PHRASE_FIRST;
    const phrase = offset >= 0 && offset % PHRASE_EVERY < PHRASE_LENGTH ? Math.floor(offset / PHRASE_EVERY) : -1;

    notes.push({ timeMs: o.timeMs, lane, durationMs, hopo, phrase });
    if (chord) notes.push({ timeMs: o.timeMs, lane: lane + 2 < lanes ? lane + 2 : lane - 2, durationMs: 0, hopo: false, phrase });
    previous = { timeMs: o.timeMs, lane, chord };
  });
  return notes;
}

/** Mélange les canaux d'un AudioBuffer en un seul signal mono. */
export function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) mono[i] += channel[i] / buffer.numberOfChannels;
  }
  return mono;
}

// Fenêtres de jugement reprises de Guithar Hero (L3) : écart absolu entre la frappe et la note.
export const PERFECT_WINDOW_MS = 50;
export const GOOD_WINDOW_MS = 100;
export const MISS_WINDOW_MS = 160;

export type Judgement = 'perfect' | 'good' | 'miss';

/** Note pendant une partie : `result` reste `null` tant qu'elle n'est ni touchée ni manquée. */
export interface GameNote extends ChartNote {
  result: Judgement | null;
  /** Vrai tant que le joueur tient la touche d'une note maintenue réussie. */
  sustaining: boolean;
}

/** Note en attente la plus proche de l'instant `nowMs` dans ce couloir, si elle est dans la fenêtre de frappe. */
export function findHittable(notes: GameNote[], lane: number, nowMs: number): GameNote | null {
  let best: GameNote | null = null;
  for (const note of notes) {
    if (note.lane !== lane || note.result) continue;
    const delta = Math.abs(note.timeMs - nowMs);
    if (delta <= MISS_WINDOW_MS && (!best || delta < Math.abs(best.timeMs - nowMs))) best = note;
  }
  return best;
}

export function judge(deltaMs: number): Judgement {
  const delta = Math.abs(deltaMs);
  if (delta <= PERFECT_WINDOW_MS) return 'perfect';
  if (delta <= GOOD_WINDOW_MS) return 'good';
  return 'miss';
}

/** Note finale selon la précision (pourcentage de notes touchées), comme dans Guithar Hero. */
export function grade(accuracy: number): string {
  if (accuracy >= 95) return 'S';
  if (accuracy >= 85) return 'A';
  if (accuracy >= 70) return 'B';
  if (accuracy >= 55) return 'C';
  return 'D';
}

/** Multiplicateur plafonné comme dans Fortnite Festival : x1 → x4, un palier toutes les 10 notes d'affilée. */
export const MAX_MULTIPLIER = 4;
export function multiplierFor(combo: number): number {
  return Math.min(MAX_MULTIPLIER, Math.floor(combo / 10) + 1);
}

/** Points d'un Perfect, avant multiplicateur. Un Good rapporte un forfait de 50 points. */
export const PERFECT_POINTS = 100;

/** Points par seconde de maintien d'une note sustain, avant multiplicateur. */
export const SUSTAIN_POINTS_PER_S = 50;

/**
 * Score maximal d'une partition : toutes les notes en Perfect d'affilée, maintiens tenus jusqu'au bout.
 * L'Overdrive n'est pas compté : c'est un bonus qui permet de dépasser ce score.
 */
export function maxScore(notes: readonly ChartNote[]): number {
  return notes.reduce(
    (total, note, i) => total + multiplierFor(i) * (PERFECT_POINTS + (note.durationMs / 1000) * SUSTAIN_POINTS_PER_S),
    0,
  );
}

/** Part du score maximal à atteindre pour chaque étoile (1 à 5). */
export const STAR_THRESHOLDS = [0.1, 0.25, 0.45, 0.65, 0.85];

/**
 * Progression vers les étoiles, de 0 à 5 : la partie entière compte les étoiles gagnées,
 * la partie décimale remplit l'étoile suivante (3.4 = 3 étoiles et 40 % de la quatrième).
 */
export function starProgress(score: number, max: number): number {
  if (max <= 0) return 0;
  const ratio = score / max;
  let previous = 0;
  for (let star = 0; star < STAR_THRESHOLDS.length; star++) {
    const threshold = STAR_THRESHOLDS[star];
    if (ratio < threshold) return star + (ratio - previous) / (threshold - previous);
    previous = threshold;
  }
  return STAR_THRESHOLDS.length;
}
