import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { GamePageComponent } from './game-page';
import { TrackService } from '../../shared/services/track.service';
import { GameNote } from '../../shared/utils/beatmap';

const RATE = 44100;

/** Morceau synthétique de 3 s : un seul coup sec à 1 s, donc une seule note attendue. */
function samplesWithClickAt1s(): Float32Array {
  const samples = new Float32Array(RATE * 3);
  for (let i = RATE; i < RATE * 1.03; i++) samples[i] = i % 2 ? 0.8 : -0.8;
  return samples;
}

/** Double d'AudioContext : l'horloge `currentTime` est pilotée par le test. */
class FakeAudioContext {
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  decodeAudioData = vi.fn(async () => ({
    sampleRate: RATE,
    numberOfChannels: 1,
    length: RATE * 3,
    getChannelData: () => samplesWithClickAt1s(),
  }));
  createBufferSource = vi.fn(() => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null, onended: null }));
}

describe('GamePageComponent', () => {
  let fixture: ComponentFixture<GamePageComponent>;
  let component: GamePageComponent;
  let audio: FakeAudioContext;
  let service: { audio: ReturnType<typeof vi.fn> };

  async function create(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [GamePageComponent],
      providers: [
        provideRouter([]),
        { provide: TrackService, useValue: service },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'track-1' }) } } },
      ],
    });
    fixture = TestBed.createComponent(GamePageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve)); // laisse finir le décodage asynchrone
  }

  beforeEach(() => {
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super();
        audio = this;
      }
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    service = { audio: vi.fn(() => of(new Blob(['x'], { type: 'audio/mpeg' }))) };
  });

  afterEach(() => vi.unstubAllGlobals());

  it('télécharge le morceau de la route, le décode et propose les difficultés', async () => {
    await create();
    await fixture.whenStable();

    expect(service.audio).toHaveBeenCalledWith('track-1');
    expect(component.phase()).toBe('ready');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Difficile');
  });

  it('affiche une erreur claire si le morceau n’existe plus (404)', async () => {
    service.audio.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    await create();
    await fixture.whenStable();

    expect(component.phase()).toBe('error');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Morceau introuvable');
  });

  it('compte un Perfect quand la touche est frappée au moment de la note', async () => {
    await create();
    await component.start(); // décompte de 3 s : la musique commence à currentTime = 3

    audio.currentTime = 3 + 1.005; // 5 ms après la note placée à ~1 s du morceau
    component.onKey(new KeyboardEvent('keydown', { key: 'a' }));

    expect(component.counts().perfect).toBe(1);
    expect(component.score()).toBe(100);
    expect(component.combo()).toBe(1);
  });

  it('ignore une frappe dans un couloir vide, sans pénalité', async () => {
    await create();
    await component.start();

    audio.currentTime = 3 + 1;
    component.onKey(new KeyboardEvent('keydown', { key: 'r' }));

    expect(component.judged()).toBe(0);
  });

  it('arrête la musique et ferme l’AudioContext en quittant la page', async () => {
    await create();
    await component.start();

    fixture.destroy();

    expect(audio.close).toHaveBeenCalled();
  });

  it('remplit la barre de combo par paliers de 10 et affiche le multiplicateur', async () => {
    await create();
    await component.start();

    component.combo.set(14);
    await fixture.whenStable();

    expect(component.comboSegments()).toEqual([1, 0.4, 0]);
    expect(component.tier()).toBe(1);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.multiplier')?.textContent).toBe('x2');
    expect(host.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('14');

    component.combo.set(45);
    expect(component.comboSegments()).toEqual([1, 1, 1]);
    expect(component.tier()).toBe(2);
    expect(component.multiplier()).toBe(4); // plafond, comme dans Festival
  });

  it('remplit les étoiles selon la part du score maximal de la partition', async () => {
    await create();
    await component.start(); // partition d'une seule note : score maximal 100

    expect(component.stars()).toBe(0);
    component.score.set(50); // 50 % → entre la 3e (45 %) et la 4e étoile (65 %)
    await fixture.whenStable();

    expect(component.starFills().slice(0, 4)).toEqual([1, 1, 1, expect.closeTo(0.25)]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.stars')?.getAttribute('aria-label')).toBe('3 étoile(s) sur 5');
  });

  describe('mécaniques avancées', () => {
    /** Note de test : par défaut simple, couloir 0, sans phrase. */
    const note = (timeMs: number, extra: Partial<GameNote> = {}): GameNote => ({
      timeMs, lane: 0, durationMs: 0, hopo: false, phrase: -1, result: null, sustaining: false, ...extra,
    });
    /** Place l'horloge audio à `ms` millisecondes du morceau (après le décompte de 3 s). */
    const at = (ms: number) => (audio.currentTime = 3 + ms / 1000);
    const key = (type: 'keydown' | 'keyup', k: string) =>
      type === 'keydown' ? component.onKey(new KeyboardEvent(type, { key: k })) : component.onKeyUp(new KeyboardEvent(type, { key: k }));
    const tick = () => (component as unknown as { loop(): void }).loop();

    async function play(notes: GameNote[]): Promise<void> {
      await create();
      await component.start();
      (component as unknown as { notes: GameNote[] }).notes = notes;
    }

    it('note maintenue : des points en continu tant que la touche est tenue', async () => {
      await play([note(1000, { durationMs: 1000 })]);
      at(1000);
      tick();
      key('keydown', 'a');
      expect(component.score()).toBe(100);

      at(1500);
      tick(); // 0,5 s tenue à 50 points/s
      expect(component.score()).toBeCloseTo(125);

      key('keyup', 'a');
      at(1800);
      tick(); // touche relâchée : plus de points
      expect(component.score()).toBeCloseTo(125);
    });

    it('HOPO : la touche déjà tenue suffit si la note précédente est réussie', async () => {
      await play([note(1000), note(1150, { lane: 1, hopo: true })]);
      at(850);
      key('keydown', 'z'); // trop tôt pour être une frappe : simple appui maintenu, sans pénalité
      at(1000);
      key('keydown', 'a');
      at(1150);
      tick();

      expect(component.counts().perfect).toBe(2);
      expect(component.combo()).toBe(2);
    });

    it('HOPO : sans note précédente réussie, il faut frapper la touche', async () => {
      await play([note(1150, { lane: 1, hopo: true })]);
      at(850);
      key('keydown', 'z');
      at(1150);
      tick();

      expect(component.judged()).toBe(0);
    });

    it('Overdrive : une phrase dorée réussie remplit un quart de jauge', async () => {
      await play([note(1000, { phrase: 0 }), note(1500, { lane: 1, phrase: 0 })]);
      at(1000);
      key('keydown', 'a');
      expect(component.overdrive()).toBe(0); // phrase pas encore terminée
      at(1500);
      key('keydown', 'z');

      expect(component.overdrive()).toBe(0.25);
    });

    it('Overdrive : une phrase avec un raté ne remplit rien', async () => {
      await play([note(1000, { phrase: 0 }), note(1500, { lane: 1, phrase: 0 })]);
      at(1200);
      tick(); // la première note est ratée
      at(1500);
      key('keydown', 'z');

      expect(component.overdrive()).toBe(0);
    });

    it('Overdrive : Espace l’active dès la moitié, double le multiplicateur puis se vide', async () => {
      await play([note(5000)]);
      at(0);
      tick();
      component.overdrive.set(0.25);
      key('keydown', ' ');
      expect(component.overdriveActive()).toBe(false); // moins de la moitié : refusé

      component.overdrive.set(0.5);
      key('keydown', ' ');
      expect(component.overdriveActive()).toBe(true);
      expect(component.multiplier()).toBe(2);

      at(4000);
      tick(); // 4 s à 1/16 par seconde : il reste 0,25
      expect(component.overdrive()).toBeCloseTo(0.25);
      at(8100);
      tick();
      expect(component.overdriveActive()).toBe(false);
      expect(component.multiplier()).toBe(1);
    });

    it('passe à 5 couloirs en Expert : la touche T devient jouable', async () => {
      await create();
      component.difficulty.set('expert');
      expect(component.lanes().map((l) => l.key)).toEqual(['A', 'Z', 'E', 'R', 'T']);
      await component.start();
      (component as unknown as { notes: GameNote[] }).notes = [note(1000, { lane: 4 })];

      at(1000);
      key('keydown', 't');
      expect(component.counts().perfect).toBe(1);
    });
  });
});
