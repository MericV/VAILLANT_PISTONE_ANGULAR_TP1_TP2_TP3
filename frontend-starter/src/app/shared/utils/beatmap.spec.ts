import { ChartNote, DIFFICULTIES, findHittable, GameNote, generateChart, grade, judge, maxScore, multiplierFor, starProgress } from './beatmap';

const RATE = 44100;

/**
 * Signal synthétique : bruit de fond faible + coups secs (bruit fort pendant 30 ms)
 * à des instants connus. Le détecteur doit les retrouver à ±20 ms près.
 */
function clicks(timesMs: number[], durationMs: number): Float32Array {
  const samples = new Float32Array(Math.round((durationMs / 1000) * RATE));
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < samples.length; i++) samples[i] = 0.01 * noise();
  for (const t of timesMs) {
    const start = Math.round((t / 1000) * RATE);
    for (let i = start; i < start + 0.03 * RATE && i < samples.length; i++) samples[i] = 0.8 * noise();
  }
  return samples;
}

describe('generateChart', () => {
  const expected = [1000, 1500, 2000, 2500, 3000, 3500, 4000];
  const samples = clicks(expected, 5000);

  it('place une note sur chaque attaque, à ±20 ms près', () => {
    // En Difficile, un accord ajoute une seconde note au même instant : on compare les instants distincts.
    const times = [...new Set(generateChart(samples, RATE, 'hard').map((n) => n.timeMs))];

    expect(times.length).toBe(expected.length);
    times.forEach((t, i) => expect(Math.abs(t - expected[i])).toBeLessThanOrEqual(20));
  });

  it('respecte l’écart minimal de la difficulté facile (450 ms)', () => {
    const dense = clicks([1000, 1200, 1400, 1600, 1800, 2000], 3000);
    const chart = generateChart(dense, RATE, 'easy');

    chart.slice(1).forEach((note, i) => expect(note.timeMs - chart[i].timeMs).toBeGreaterThanOrEqual(450));
  });

  it('attribue des couloirs valides', () => {
    for (const note of generateChart(samples, RATE, 'medium')) {
      expect(note.lane).toBeGreaterThanOrEqual(0);
      expect(note.lane).toBeLessThan(DIFFICULTIES.medium.lanes);
    }
  });

  it('ne produit aucune note sur un silence', () => {
    expect(generateChart(new Float32Array(RATE * 2), RATE, 'hard')).toEqual([]);
  });

  it('utilise 5 voies et des accords en Expert, 4 voies sans accord en Facile', () => {
    const expert = generateChart(samples, RATE, 'expert');
    const chords = expert.filter((n, i) => i > 0 && n.timeMs === expert[i - 1].timeMs);

    expect(expert.every((n) => n.lane >= 0 && n.lane < 5)).toBe(true);
    expect(chords.length).toBeGreaterThan(0);
    for (const second of chords) {
      const first = expert[expert.indexOf(second) - 1];
      expect(Math.abs(second.lane - first.lane)).toBe(2); // deux couloirs d'écart : jouable à deux doigts
    }
    const easy = generateChart(samples, RATE, 'easy');
    expect(new Set(easy.map((n) => n.timeMs)).size).toBe(easy.length);
  });

  it('transforme un son tenu suivi d’une pause en note maintenue', () => {
    const held = new Float32Array(RATE * 4);
    let seed = 7;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let i = 0; i < held.length; i++) held[i] = 0.01 * noise();
    for (let i = RATE; i < RATE * 2.6; i++) held[i] = 0.6 * noise(); // son tenu de 1 s à 2,6 s
    for (let i = RATE * 3.2; i < RATE * 3.23; i++) held[i] = 0.8 * noise(); // coup sec à 3,2 s

    const chart = generateChart(held, RATE, 'medium');
    const [sustain, next] = chart;

    // Le bruit tenu peut déclencher une seconde attaque : le maintien s'arrête 200 ms avant elle.
    expect(sustain.durationMs).toBeGreaterThan(500);
    expect(sustain.timeMs + sustain.durationMs).toBeLessThanOrEqual(next.timeMs - 200);
    expect(chart.at(-1)!.durationMs).toBe(0); // le coup sec final n'est suivi de rien
    // Des coups secs rapprochés ne sont jamais maintenus.
    expect(generateChart(samples, RATE, 'medium').every((n) => n.durationMs === 0)).toBe(true);
  });

  it('marque en HOPO les notes rapprochées sur un autre couloir, jamais en Facile', () => {
    const fast = clicks(Array.from({ length: 30 }, (_, i) => 500 + i * 160), 6000);
    const expert = generateChart(fast, RATE, 'expert');
    const hopos = expert.filter((n) => n.hopo);

    expect(hopos.length).toBeGreaterThan(0);
    for (const note of hopos) {
      const previous = expert[expert.indexOf(note) - 1];
      expect(note.timeMs - previous.timeMs).toBeLessThanOrEqual(DIFFICULTIES.expert.hopoGapMs);
      expect(note.lane).not.toBe(previous.lane);
    }
    expect(generateChart(fast, RATE, 'easy').some((n) => n.hopo)).toBe(false);
  });

  it('répartit des phrases Overdrive de 6 notes', () => {
    const long = clicks(Array.from({ length: 60 }, (_, i) => 500 + i * 300), 19000);
    const chart = generateChart(long, RATE, 'medium');

    expect(chart.filter((n) => n.phrase === 0)).toHaveLength(6);
    expect(chart.slice(0, 16).every((n) => n.phrase === -1)).toBe(true);
  });
});

describe('jugement des frappes', () => {
  it('applique les fenêtres 50 / 100 ms', () => {
    expect(judge(-40)).toBe('perfect');
    expect(judge(80)).toBe('good');
    expect(judge(140)).toBe('miss');
  });

  it('calcule la note finale', () => {
    expect(grade(96)).toBe('S');
    expect(grade(60)).toBe('C');
    expect(grade(10)).toBe('D');
  });

  it('trouve la note la plus proche du couloir, dans la fenêtre de 160 ms', () => {
    const notes: GameNote[] = [
      { timeMs: 1000, lane: 0, result: null },
      { timeMs: 1100, lane: 0, result: null },
      { timeMs: 1050, lane: 1, result: null },
      { timeMs: 900, lane: 0, result: 'perfect' as const },
    ].map((n) => ({ ...n, durationMs: 0, hopo: false, phrase: -1, sustaining: false }));

    expect(findHittable(notes, 0, 1070)).toBe(notes[1]);
    expect(findHittable(notes, 0, 2000)).toBeNull();
    expect(findHittable(notes, 0, 905)?.timeMs).toBe(1000); // la note déjà touchée est ignorée
  });
});

describe('multiplicateur, score maximal et étoiles', () => {
  it('monte d’un palier toutes les 10 notes et plafonne à x4', () => {
    expect([0, 9, 10, 29, 30, 500].map(multiplierFor)).toEqual([1, 1, 2, 3, 4, 4]);
  });

  it('calcule le score maximal en tenant compte des paliers et des maintiens', () => {
    const notes = (count: number, durationMs = 0): ChartNote[] =>
      Array.from({ length: count }, (_, i) => ({ timeMs: i * 500, lane: 0, durationMs, hopo: false, phrase: -1 }));
    expect(maxScore([])).toBe(0);
    expect(maxScore(notes(10))).toBe(1000); // 10 notes en x1
    expect(maxScore(notes(12))).toBe(1400); // + 2 notes en x2
    expect(maxScore(notes(45))).toBe(1000 + 2000 + 3000 + 15 * 400);
    expect(maxScore(notes(1, 2000))).toBe(100 + 2 * 50); // 2 s de maintien à 50 points/s
  });

  it('remplit les étoiles une à une selon la part du score maximal', () => {
    expect(starProgress(0, 1000)).toBe(0);
    expect(starProgress(50, 1000)).toBeCloseTo(0.5); // moitié du chemin vers 10 %
    expect(starProgress(250, 1000)).toBe(2);
    expect(starProgress(550, 1000)).toBeCloseTo(3.5); // entre 45 % et 65 %
    expect(starProgress(1000, 1000)).toBe(5);
    expect(starProgress(0, 0)).toBe(0);
  });
});
