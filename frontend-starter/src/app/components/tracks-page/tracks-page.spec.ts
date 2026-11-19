import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../../shared/services/auth.service';
import { User } from '../../shared/models/user.model';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { TracksPageComponent } from './tracks-page';
import { TrackService } from '../../shared/services/track.service';
import { ScoreService } from '../../shared/services/score.service';
import { ScoreRecord } from '../../shared/models/score.model';
import { Page } from '../../shared/models/page.model';
import { Track } from '../../shared/models/track.model';

const makeTrack = (id: string): Track => ({
  id,
  title: `Piste ${id}`,
  originalName: `${id}.mp3`,
  mimeType: 'audio/mpeg',
  size: 1024,
  createdAt: '2026-09-24T08:00:00.000Z',
});

const page = (items: Track[], overrides: Partial<Page<Track>> = {}): Page<Track> => ({
  items,
  page: 1,
  limit: 5,
  total: items.length,
  pages: 1,
  ...overrides,
});

describe('TracksPageComponent', () => {
  let fixture: ComponentFixture<TracksPageComponent>;
  let component: TracksPageComponent;
  let service: {
    list: ReturnType<typeof vi.fn<(page: number, limit: number, query?: object) => Observable<Page<Track>>>>;
    upload: ReturnType<typeof vi.fn>;
    audio: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    base: ReturnType<typeof vi.fn>;
    favorites: ReturnType<typeof vi.fn>;
    setFavorite: ReturnType<typeof vi.fn>;
  };
  let auth: { currentUser: ReturnType<typeof signal<User | null>> };
  let snackBar: { open: ReturnType<typeof vi.fn> };
  let scores: { mine: ReturnType<typeof vi.fn> };
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  async function create(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [TracksPageComponent],
      providers: [
        { provide: TrackService, useValue: service },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: ScoreService, useValue: scores },
        { provide: AuthService, useValue: auth },
        provideRouter([]),
      ],
    });
    fixture = TestBed.createComponent(TracksPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  }

  beforeEach(() => {
    service = {
      list: vi.fn(() => of(page([makeTrack('a'), makeTrack('b')]))),
      upload: vi.fn(),
      audio: vi.fn(),
      remove: vi.fn(() => of(undefined)),
      update: vi.fn(),
      base: vi.fn(() => of([])),
      favorites: vi.fn(() => of([])),
      setFavorite: vi.fn(),
    };
    auth = { currentUser: signal<User | null>(null) };
    snackBar = { open: vi.fn() };
    scores = { mine: vi.fn(() => of([])) };
  });

  afterEach(() => vi.restoreAllMocks());

  describe('bibliothèque', () => {
    beforeEach(create);
    const all = { q: '', sort: 'recent', record: null };

    it('charge la première page au démarrage et affiche une card par piste', () => {
      expect(service.list).toHaveBeenCalledWith(1, 5, all);
      expect(fixture.nativeElement.querySelectorAll('.tracks app-track-card').length).toBe(2);
    });

    it('charge les playlists calculées par le serveur : meilleurs scores et jamais joués', () => {
      expect(service.list).toHaveBeenCalledWith(1, 12, { sort: 'record', record: 'with' });
      expect(service.list).toHaveBeenCalledWith(1, 12, { record: 'without' });
      expect(service.favorites).toHaveBeenCalled();
    });

    it('« Voir plus » ajoute 10 pistes (deux pages de 5) à la suite des pistes affichées', () => {
      service.list.mockReturnValueOnce(of(page([makeTrack('c')], { page: 2, total: 4 })));
      service.list.mockReturnValueOnce(of(page([makeTrack('d')], { page: 3, total: 4 })));
      component.total.set(4);

      component.loadMore();

      expect(service.list).toHaveBeenCalledWith(2, 5, all);
      expect(service.list).toHaveBeenLastCalledWith(3, 5, all);
      expect(component.tracks().map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
      expect(component.hasMore()).toBe(false);
    });

    it('relance la recherche depuis la page 1 avec le tri et le filtre choisis', () => {
      component.loadMore();
      component.setQuery({ sort: 'record', record: 'with' });

      expect(service.list).toHaveBeenLastCalledWith(1, 5, { q: '', sort: 'record', record: 'with' });
    });

    it('attend la fin de la frappe avant de chercher un titre', () => {
      vi.useFakeTimers();
      service.list.mockClear();
      component.search('blu');
      component.search(' blues ');
      vi.advanceTimersByTime(300);
      vi.useRealTimers();

      expect(service.list).toHaveBeenCalledTimes(1);
      expect(service.list).toHaveBeenCalledWith(1, 5, { q: 'blues', sort: 'recent', record: null });
    });

    it('recharge depuis le début après un upload réussi', () => {
      component.page.set(3);
      service.list.mockClear();
      component.onUploaded();

      expect(service.list).toHaveBeenCalledWith(1, 5, all);
      expect(service.list).toHaveBeenCalledWith(1, 12, { record: 'without' }); // la piste rejoint « À découvrir »
    });
  });

  it('affiche une erreur après un échec HTTP de la liste', async () => {
    service.list.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Erreur serveur' } })),
    );
    await create();

    expect(component.error()).toBe('Erreur serveur');
    expect(text()).toContain('Erreur serveur');
    expect(text()).not.toContain('Aucune piste');
  });

  describe('suppression', () => {
    beforeEach(create);

    it('appelle DELETE (la carte a déjà confirmé), notifie et retire la carte sans tout recharger', () => {
      service.list.mockClear();
      component.edit(makeTrack('a')); // « Supprimer » est dans le formulaire de modification

      component.remove(makeTrack('a'));

      expect(component.editingId()).toBeNull(); // le formulaire se ferme avec la carte supprimée
      expect(service.remove).toHaveBeenCalledWith('a');
      expect(snackBar.open).toHaveBeenCalledWith('Piste « Piste a » supprimée.', 'Fermer', expect.anything());
      expect(service.list).not.toHaveBeenCalled();
      expect(component.tracks().map((t) => t.id)).toEqual(['b']);
      expect(component.total()).toBe(1);
      expect(component.deletingId()).toBeNull();
    });

    it('bloque les doubles clics pendant une suppression', () => {
      service.remove.mockReturnValue(new Observable()); // requête qui ne se termine jamais

      component.remove(makeTrack('a'));
      component.remove(makeTrack('a'));

      expect(service.remove).toHaveBeenCalledTimes(1);
      expect(component.deletingId()).toBe('a');
    });

    it('gère une piste déjà supprimée (404) : message et resynchronisation', () => {
      service.remove.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      service.list.mockClear();

      component.remove(makeTrack('a'));

      expect(snackBar.open).toHaveBeenCalledWith(
        expect.stringContaining('n’existe plus'),
        'Fermer',
        expect.anything(),
      );
      expect(service.list).toHaveBeenCalledTimes(1);
    });
  });

  describe('lecture audio', () => {
    beforeEach(async () => {
      // jsdom ne fournit pas createObjectURL / revokeObjectURL.
      URL.createObjectURL = vi.fn(() => 'blob:fake-url');
      URL.revokeObjectURL = vi.fn();
      await create();
    });

    it('crée une ObjectURL et affiche le morceau en cours', async () => {
      service.audio.mockReturnValue(of(new Blob(['x'], { type: 'audio/mpeg' })));

      component.play(makeTrack('a'));
      await fixture.whenStable();

      expect(service.audio).toHaveBeenCalledWith('a');
      expect(component.audioUrl()).toBe('blob:fake-url');
      expect(fixture.nativeElement.querySelector('app-audio-player')).not.toBeNull();
      expect(text()).toContain('Piste a');
      expect(text()).toContain('Ma piste'); // sous-titre du lecteur
    });

    it('ferme le lecteur avec ✕ et libère l’ObjectURL', async () => {
      service.audio.mockReturnValue(of(new Blob(['x'])));
      component.play(makeTrack('a'));
      await fixture.whenStable();

      (fixture.nativeElement.querySelector('button[aria-label="Fermer le lecteur"]') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(component.currentTrack()).toBeNull();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
      expect(fixture.nativeElement.querySelector('app-audio-player')).toBeNull();
    });

    it('révoque l’ObjectURL finale à la destruction du composant', () => {
      service.audio.mockReturnValue(of(new Blob(['x'])));
      component.play(makeTrack('a'));

      fixture.destroy();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    });

    it('affiche une erreur compréhensible si la piste est introuvable', () => {
      service.audio.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

      component.play(makeTrack('a'));

      expect(component.audioError()).toContain('introuvable');
    });
  });

  describe('modification d’une piste', () => {
    beforeEach(create);
    const changes = { title: 'Blues lent', description: 'Shuffle, 80 bpm' };

    it('remplace la piste modifiée dans la liste, ferme le formulaire et notifie', async () => {
      const updated = { ...makeTrack('a'), ...changes };
      service.update.mockReturnValue(of(updated));
      component.edit(makeTrack('a'));
      service.list.mockClear();

      component.save({ track: makeTrack('a'), changes });
      await fixture.whenStable();

      expect(service.update).toHaveBeenCalledWith('a', changes);
      expect(component.editingId()).toBeNull();
      expect(component.tracks()[0]).toEqual(updated);
      expect(text()).toContain('Shuffle, 80 bpm');
      expect(service.list).not.toHaveBeenCalled(); // pas de rechargement complet
      expect(snackBar.open).toHaveBeenCalledWith('Piste « Blues lent » modifiée.', 'Fermer', { duration: 5000 });
    });

    it('garde le formulaire ouvert et bloque la double soumission pendant l’envoi', () => {
      const pending = new Subject<Track>();
      service.update.mockReturnValue(pending);
      component.edit(makeTrack('a'));

      component.save({ track: makeTrack('a'), changes });
      component.save({ track: makeTrack('a'), changes });

      expect(service.update).toHaveBeenCalledTimes(1);
      expect(component.savingId()).toBe('a');
      expect(component.editingId()).toBe('a');
    });

    it('garde la saisie et affiche le message serveur en cas de 400', () => {
      service.update.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Titre invalide' } })),
      );
      component.edit(makeTrack('a'));

      component.save({ track: makeTrack('a'), changes });

      expect(component.editingId()).toBe('a');
      expect(component.savingId()).toBeNull();
      expect(snackBar.open).toHaveBeenCalledWith('Titre invalide', 'Fermer', { duration: 5000 });
    });
  });

  describe('records', () => {
    const record = (trackId: string, difficulty: ScoreRecord['difficulty'], score: number, stars: number): ScoreRecord => ({
      id: `${trackId}-${difficulty}`, trackId, difficulty, instrument: 'lead', score, stars, accuracy: 90, maxCombo: 10, updatedAt: '2026-10-08',
    });

    it('garde le meilleur record par morceau, toutes difficultés confondues, et l’affiche sur la carte', async () => {
      scores.mine.mockReturnValue(of([record('a', 'easy', 900, 2), record('a', 'expert', 4200, 4), record('b', 'hard', 300, 1)]));
      await create();

      expect(component.bestByTrack()['a']?.score).toBe(4200);
      expect(component.bestByTrack()['b']?.score).toBe(300);
      expect(text()).toContain('4,200');
    });

    it('affiche la bibliothèque même si les records ne se chargent pas', async () => {
      scores.mine.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      await create();

      expect(fixture.nativeElement.querySelectorAll('.tracks app-track-card').length).toBe(2);
      expect(component.error()).toBe('');
    });
  });

  describe('pistes de base et file de lecture', () => {
    beforeEach(async () => {
      URL.createObjectURL = vi.fn(() => 'blob:fake-url');
      URL.revokeObjectURL = vi.fn();
      service.base.mockReturnValue(of([{ ...makeTrack('base1'), base: true }]));
      service.audio.mockReturnValue(of(new Blob(['x'])));
      await create();
    });

    it('affiche le catalogue commun dans la première rangée, sans bouton Modifier', () => {
      const shelf = fixture.nativeElement.querySelector('.row') as HTMLElement;
      expect(shelf.textContent).toContain('Piste base1');
      expect(shelf.querySelector('button[aria-label^="Modifier"]')).toBeNull();
    });

    it('un clic sur une pochette lance le morceau et l’affiche en plein écran', () => {
      (fixture.nativeElement.querySelector('.row .cover') as HTMLElement).click();
      fixture.detectChanges();

      expect(component.currentTrack()?.id).toBe('base1');
      expect(fixture.nativeElement.querySelector('app-audio-player .full')).not.toBeNull();
    });

    it('enchaîne précédent / suivant dans la playlist d’où part la lecture', () => {
      component.play(makeTrack('a'), component.tracks());
      component.step(1);
      expect(component.currentTrack()?.id).toBe('b');
      component.step(1); // fin de la playlist : on reste sur la dernière piste
      expect(component.currentTrack()?.id).toBe('b');
      component.step(-1);
      expect(component.currentTrack()?.id).toBe('a');
    });

    it('affiche les playlists dans l’ordre, sans les playlists vides', () => {
      component.bestTracks.set([]);
      component.neverPlayed.set([makeTrack('c')]);
      fixture.detectChanges();
      const titles = [...fixture.nativeElement.querySelectorAll('.shelf h2')].map((h: HTMLElement) => h.textContent?.replace('›', '').trim());
      expect(titles).toEqual(['Hits du moment', 'À découvrir', 'Mes pistes 2']);
    });

    it('le cœur ajoute aux préférés, met le profil à jour et alimente la playlist', () => {
      const user = { favorites: ['a'] } as User;
      service.setFavorite.mockReturnValue(of(user));

      component.toggleFavorite(makeTrack('a'));

      expect(service.setFavorite).toHaveBeenCalledWith('a', true);
      expect(auth.currentUser()).toBe(user);
      expect(component.favoriteTracks().map((t) => t.id)).toEqual(['a']);
      expect(component.playlists().map((p) => p.id)).toContain('favorites');
    });
  });
});
