import { formatDuration, trackHue } from './audio-file';

describe('formatDuration', () => {
  it('affiche m:ss, h:mm:ss au-delà d’une heure, et « — » si la durée est inconnue', () => {
    expect(formatDuration(184)).toBe('3:04');
    expect(formatDuration(59.6)).toBe('1:00');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
  });
});

describe('trackHue', () => {
  it('donne des teintes variées à des identifiants presque identiques', () => {
    const hues = ['6735b0aa11c2e1b0012ab9001', '6735b0aa11c2e1b0012ab9002', '6735b0aa11c2e1b0012ab9003', '6735b0aa11c2e1b0012ab9004'].map(trackHue);
    expect(new Set(hues.map((h) => Math.round(h / 30))).size).toBeGreaterThanOrEqual(3); // au moins 3 familles de couleurs
    expect(trackHue('abc')).toBe(trackHue('abc')); // stable
  });
});
