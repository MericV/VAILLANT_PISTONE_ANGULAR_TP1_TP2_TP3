/**
 * Génération automatique d'un « chart » (liste de notes à jouer) à partir du signal audio.
 *
 * Principe : détection des attaques (onsets). On découpe le son en petites fenêtres,
 * on mesure l'énergie de chacune et on repère les hausses brusques d'énergie
 * (coup de batterie, attaque de corde). Chaque hausse marquée devient une note.
 *
 * Le couloir (lane) de la note dépend de sa hauteur, mesurée par FFT juste après l'attaque :
 * une note grave va à gauche, une note aiguë à droite, et une même note revient sur la même
 * touche, comme sur un manche de guitare. Une note qui sonne longtemps devient une note longue.
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

// Notes longues : la hauteur reste la même (±1 demi-ton) et le son ne faiblit pas trop.
const SUSTAIN_MIN_MS = 400;
const SUSTAIN_MAX_MS = 3000;
const SUSTAIN_STEP_MS = 100; // on vérifie la tenue du son tous les 100 ms
const SUSTAIN_ENERGY_RATIO = 0.4; // le son peut descendre à 40 % de son énergie de départ
// Hauteur mesurée 40 ms après l'attaque : le choc initial (médiator, baguette) brouille le spectre.
const PITCH_DELAY_MS = 40;
// Plage où l'on cherche la mélodie : au-dessus du gros de la basse, sous les cymbales.
const PITCH_BAND = { minHz: 100, maxHz: 1500 };
// Les couloirs sont répartis selon les hauteurs jouées dans les ±5 s autour de chaque note.
const LANE_WINDOW_MS = 10000;
// Phrases Overdrive : 6 notes dorées toutes les 32 attaques, à partir de la 16e.
const PHRASE_FIRST = 16;
const PHRASE_EVERY = 32;
const PHRASE_LENGTH = 6;

const FRAME = 1024; // ~23 ms à 44,1 kHz
const HOP = 512; // fenêtres qui se chevauchent de moitié : ~11,6 ms de résolution
const AVERAGE_WINDOW_S = 0.5; // seuil adaptatif calculé sur ±0,5 s autour de chaque fenêtre

// ponytail: attaques par flux d'énergie (rapide) ; la FFT ne sert qu'aux instants des attaques
// (hauteur, tenue). Passer au flux spectral si les attaques elles-mêmes semblent mal placées.
export function generateChart(samples: Float32Array, sampleRate: number, difficulty: Difficulty): ChartNote[] {
  const { lanes, minGapMs, sensitivity, chordShare, hopoGapMs } = DIFFICULTIES[difficulty];
  const frameCount = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  if (frameCount < 3) return [];

  // 1. Énergie de chaque fenêtre (échelle logarithmique, proche de la perception).
  const energy = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    for (let i = f * HOP; i < f * HOP + FRAME; i++) sum += samples[i] * samples[i];
    energy[f] = Math.log1p(100 * Math.sqrt(sum / FRAME));
  }

  // 2. Flux : uniquement les hausses d'énergie (une baisse n'est pas une attaque).
  const flux = new Float32Array(frameCount);
  for (let f = 1; f < frameCount; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1]);

  // 3. Seuil adaptatif : moyenne locale du flux (sommes cumulées), pour suivre les passages calmes et forts.
  const prefix = new Float64Array(frameCount + 1);
  for (let f = 0; f < frameCount; f++) prefix[f + 1] = prefix[f] + flux[f];
  const half = Math.max(1, Math.round((AVERAGE_WINDOW_S * sampleRate) / HOP));

  // 4. Pics : maximum local, au-dessus du seuil, assez loin de la note précédente.
  const onsets: { timeMs: number; sample: number; strength: number }[] = [];
  let lastMs = -Infinity;
  for (let f = 1; f < frameCount - 1; f++) {
    const from = Math.max(0, f - half);
    const to = Math.min(frameCount, f + half + 1);
    const threshold = ((prefix[to] - prefix[from]) / (to - from)) * sensitivity + 0.02;
    const timeMs = Math.round(((f * HOP + FRAME / 2) / sampleRate) * 1000);
    if (flux[f] > threshold && flux[f] >= flux[f - 1] && flux[f] > flux[f + 1] && timeMs - lastMs >= minGapMs) {
      onsets.push({ timeMs, sample: f * HOP, strength: flux[f] });
      lastMs = timeMs;
    }
  }

  // 5. Hauteur de chaque attaque, puis notes longues : tant que la même note sonne, le joueur tient
  //    la touche, et les attaques qui tombent pendant ce maintien sont retirées.
  const analyse = pitchAnalyser(samples, sampleRate, PITCH_BAND);
  const delay = Math.round((PITCH_DELAY_MS / 1000) * sampleRate);
  const step = Math.round((SUSTAIN_STEP_MS / 1000) * sampleRate);
  const kept: { timeMs: number; strength: number; midi: number | null; durationMs: number }[] = [];
  let busyUntil = -Infinity;
  for (const o of onsets) {
    if (o.timeMs < busyUntil) continue;
    const base = analyse(o.sample + delay);
    let held = 0;
    let misses = 0; // un coup de batterie peut brouiller une mesure isolée : on en tolère une à la suite
    for (let t = SUSTAIN_STEP_MS; base && t <= SUSTAIN_MAX_MS && misses < 2; t += SUSTAIN_STEP_MS) {
      const now = analyse(o.sample + delay + (t / SUSTAIN_STEP_MS) * step);
      const same = now && Math.abs(now.midi - base.midi) <= 1 && now.energy >= SUSTAIN_ENERGY_RATIO * base.energy;
      misses = same ? 0 : misses + 1;
      if (same) held = t;
    }
    const durationMs = held >= SUSTAIN_MIN_MS ? held : 0;
    if (durationMs) busyUntil = o.timeMs + durationMs + SUSTAIN_STEP_MS;
    kept.push({ timeMs: o.timeMs, strength: o.strength, midi: base?.midi ?? null, durationMs });
  }

  // 6. Couloirs selon la hauteur : plus aigu = plus à droite, même note = même touche.
  //    Le rang est calculé parmi les hauteurs distinctes jouées autour de la note (±5 s) :
  //    un passage grave utilise tout le manche autant qu'un passage aigu.
  const lanesOf: number[] = [];
  for (let i = 0; i < kept.length; i++) {
    const midi = kept[i].midi;
    if (midi === null) {
      lanesOf.push(lanesOf[i - 1] ?? Math.floor(lanes / 2)); // hauteur introuvable : on reste sur place
      continue;
    }
    const nearby = new Set<number>();
    for (const other of kept) {
      if (other.midi !== null && Math.abs(other.timeMs - kept[i].timeMs) <= LANE_WINDOW_MS / 2) nearby.add(other.midi);
    }
    const below = [...nearby].filter((m) => m < midi).length;
    lanesOf.push(Math.min(lanes - 1, Math.floor((lanes * below) / nearby.size)));
  }

  // 7. Accords : les attaques les plus fortes (top `chordShare`) reçoivent une seconde note, deux couloirs plus loin.
  const strengths = kept.map((o) => o.strength).sort((a, b) => b - a);
  const chordMin = chordShare > 0 ? strengths[Math.floor(chordShare * strengths.length)] ?? Infinity : Infinity;

  const notes: ChartNote[] = [];
  let previous: { timeMs: number; lane: number; chord: boolean } | null = null;
  kept.forEach((o, i) => {
    const lane = lanesOf[i];
    const chord = o.durationMs === 0 && o.strength > chordMin;
    // 8. HOPO : note rapprochée, sur un autre couloir, jamais dans ou juste après un accord.
    const hopo =
      hopoGapMs > 0 && !chord && previous !== null && !previous.chord &&
      o.timeMs - previous.timeMs <= hopoGapMs && lane !== previous.lane;
    // 9. Phrase Overdrive : quelques séries de notes dorées réparties dans le morceau.
    const offset = i - PHRASE_FIRST;
    const phrase = offset >= 0 && offset % PHRASE_EVERY < PHRASE_LENGTH ? Math.floor(offset / PHRASE_EVERY) : -1;

    notes.push({ timeMs: o.timeMs, lane, durationMs: o.durationMs, hopo, phrase });
    if (chord) notes.push({ timeMs: o.timeMs, lane: lane + 2 < lanes ? lane + 2 : lane - 2, durationMs: 0, hopo: false, phrase });
    previous = { timeMs: o.timeMs, lane, chord };
  });
  return notes;
}

/**
 * Prépare une mesure de hauteur sur une bande de fréquences.
 * La fonction renvoyée prend un instant (en échantillons) et rend la note dominante
 * (numéro MIDI arrondi au demi-ton : 69 = La 440 Hz) et l'énergie de la bande, ou `null` sur un silence.
 *
 * Méthode du « produit spectral harmonique » : une note de fréquence f fait aussi vibrer 2f et 3f.
 * On cherche la fréquence k qui maximise |X(k)| × |X(2k)| × |X(3k)| : c'est la fondamentale,
 * même quand une harmonique est plus forte qu'elle (fréquent sur une guitare ou une voix).
 */
function pitchAnalyser(samples: Float32Array, sampleRate: number, band: { minHz: number; maxHz: number }) {
  const size = sampleRate >= 32000 ? 4096 : 2048; // ≈ 93 ms : assez long pour séparer deux demi-tons graves
  const hann = new Float64Array(size).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  const kMin = Math.max(1, Math.ceil((band.minHz * size) / sampleRate));
  const kMax = Math.min(Math.floor((band.maxHz * size) / sampleRate), Math.floor((size / 2 - 1) / 3));
  return (start: number): { midi: number; energy: number } | null => {
    const magnitude = spectrum(samples, start, hann);
    let energy = 0;
    for (let k = kMin; k <= kMax; k++) energy += magnitude[k] * magnitude[k];
    if (energy < 1e-3) return null;
    let best = kMin;
    let bestScore = -Infinity;
    for (let k = kMin; k <= kMax; k++) {
      const score = Math.log(magnitude[k] + 1e-9) + Math.log(magnitude[2 * k] + 1e-9) + Math.log(magnitude[3 * k] + 1e-9);
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    }
    return { midi: Math.round(69 + 12 * Math.log2((best * sampleRate) / size / 440)), energy };
  };
}

/** Module du spectre (FFT radix-2 itérative, taille = longueur de la fenêtre) à partir de `start`. */
function spectrum(samples: Float32Array, start: number, window: Float64Array): Float64Array {
  const size = window.length;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) re[i] = (samples[start + i] ?? 0) * window[i];
  // Permutation par inversion des bits, puis papillons de Cooley-Tukey.
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < size; i += length) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < length / 2; k++) {
        const a = i + k;
        const b = a + length / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
  const magnitude = new Float64Array(size / 2);
  for (let k = 0; k < size / 2; k++) magnitude[k] = Math.hypot(re[k], im[k]);
  return magnitude;
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
