import { afterRenderEffect, Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild, viewChildren } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { forkJoin, Subscription } from 'rxjs';
import { Track } from '../../shared/models/track.model';
import { TrackQuery, TrackService } from '../../shared/services/track.service';
import { AuthService } from '../../shared/services/auth.service';
import { ScoreService } from '../../shared/services/score.service';
import { ScoreRecord } from '../../shared/models/score.model';
import { httpErrorMessage } from '../../shared/utils/http-error';
import { formatDuration, trackHue } from '../../shared/utils/audio-file';
import { TrackCardComponent, TrackChanges } from '../track-card/track-card';
import { TrackUploadComponent } from '../track-upload/track-upload';
import { AudioPlayerComponent } from '../audio-player/audio-player';

/**
 * Page « Backing tracks » : orchestre la bibliothèque (recherche, tri, filtre et « Voir plus »),
 * la lecture et la suppression.
 * Toutes les requêtes passent par TrackService ; ce composant ne manipule que des Signals.
 */
@Component({
  imports: [TrackCardComponent, TrackUploadComponent, AudioPlayerComponent],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent implements OnDestroy {
  private readonly service = inject(TrackService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly scores = inject(ScoreService);
  private readonly auth = inject(AuthService);
  private listSubscription?: Subscription;

  // État de la bibliothèque : pages serveur accumulées par « Voir plus ».
  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  /** 5 pistes au départ, puis « Voir plus » en ajoute 10 (deux pages de 5 de l'API). */
  readonly limit = signal(5);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly hasMore = computed(() => this.tracks().length < this.total());

  /** Sources des playlists : catalogue commun, préférés, meilleurs scores, jamais joués. */
  readonly baseTracks = signal<Track[]>([]);
  readonly favoriteTracks = signal<Track[]>([]);
  readonly bestTracks = signal<Track[]>([]);
  readonly neverPlayed = signal<Track[]>([]);
  readonly favoriteIds = computed(() => new Set(this.auth.currentUser()?.favorites ?? []));

  /** Playlists défilantes, dans l'ordre d'affichage ; une playlist vide n'est pas montrée. */
  readonly playlists = computed(() =>
    [
      { id: 'base', title: 'Hits du moment', tracks: this.baseTracks() },
      { id: 'favorites', title: 'Coups de cœur', tracks: this.favoriteTracks() },
      { id: 'best', title: 'Vos records', tracks: this.played() },
      {
        id: 'improve',
        title: 'À retravailler',
        tracks: this.played().filter((t) => (this.bestByTrack()[t.id]?.stars ?? 0) < 5),
      },
      {
        id: 'never',
        title: 'À découvrir',
        tracks: [...this.neverPlayed(), ...this.baseTracks().filter((t) => !this.bestByTrack()[t.id])],
      },
    ].filter((playlist) => playlist.tracks.length),
  );
  private readonly importDialog = viewChild.required<ElementRef<HTMLDialogElement>>('importDialog');
  protected readonly trackHue = trackHue;

  /** URL locale des pochettes d'album, par piste (chargées une fois, à l'affichage). */
  readonly coverUrls = signal<Partial<Record<string, string>>>({});

  /** File de lecture pour précédent / suivant : la playlist (ou la grille) d'où part la lecture. */
  readonly queue = signal<Track[]>([]);
  readonly queueIndex = computed(() => this.queue().findIndex((t) => t.id === this.currentTrack()?.id));
  /** Ligne sous le titre dans le lecteur. */
  readonly nowSubtitle = computed(() => {
    const track = this.currentTrack();
    if (!track) return '';
    // Comme Apple Music : l'artiste (description des pistes de base), sinon l'origine et la durée.
    if (track.base && track.description) return track.description;
    return `${track.base ? 'Piste de base' : 'Ma piste'}${track.duration ? ' · ' + formatDuration(track.duration) : ''}`;
  });

  // Recherche, tri et filtre : appliqués par le serveur sur toute la bibliothèque.
  readonly query = signal<Required<TrackQuery>>({ q: '', sort: 'recent', record: null });
  private searchTimer?: ReturnType<typeof setTimeout>;

  // État des actions sur une piste : l'id permet de n'animer que la card concernée.
  readonly deletingId = signal<string | null>(null);
  readonly loadingAudioId = signal<string | null>(null);
  /** Piste dont le formulaire de modification est ouvert (une seule à la fois). */
  readonly editingId = signal<string | null>(null);
  readonly savingId = signal<string | null>(null);

  /**
   * Bandes du bandeau. La photo est lue dans `public/artistes/<slug>.png` si le fichier existe ;
   * sinon le dégradé seul s'affiche (une image d'arrière-plan introuvable est ignorée par le navigateur).
   * `background` (facultatif) impose la couleur de la bande au lieu de celle lue sur la photo.
   */
  readonly artists: { name: string; slug: string; color: string; background?: string }[] = [
    { name: 'Jul', slug: 'jul', color: '#d9a99a' },
    { name: 'Ninho', slug: 'ninho', color: '#e05a4f' },
    { name: 'SDM', slug: 'sdm', color: '#f0b27a' },
    { name: 'Gazo', slug: 'gazo', color: '#9bb7e8' },
    { name: 'PLK', slug: 'plk', color: '#d6332b', background: '#2a98c4' },
    { name: 'Ziak', slug: 'ziak', color: '#e8935a' },
  ];

  /** Couleur du fond de chaque photo, lue au chargement : la bande se fond avec la photo. */
  readonly photoColors = signal<Partial<Record<string, { background: string; label: string }>>>({});

  /** Records du joueur ; on garde, par morceau, le meilleur toutes difficultés confondues. */
  private readonly records = signal<ScoreRecord[]>([]);
  readonly bestByTrack = computed(() => {
    const best: Partial<Record<string, ScoreRecord>> = {};
    for (const record of this.records()) {
      if ((best[record.trackId]?.score ?? -1) < record.score) best[record.trackId] = record;
    }
    return best;
  });
  /** Mes pistes et Hits du moment déjà joués, du meilleur score au moins bon. */
  readonly played = computed(() => {
    const best = this.bestByTrack();
    const base = this.baseTracks().filter((t) => best[t.id]);
    return [...this.bestTracks(), ...base].sort((a, b) => (best[b.id]?.score ?? 0) - (best[a.id]?.score ?? 0));
  });

  // Lecteur audio.
  readonly currentTrack = signal<Track | null>(null);
  readonly audioUrl = signal('');
  readonly audioError = signal('');

  private readonly shelves = viewChildren<ElementRef<HTMLElement>>('shelf');

  constructor() {
    this.load();
    // Après chaque rendu des playlists : flèche › seulement si la rangée déborde.
    afterRenderEffect(() => {
      this.playlists();
      for (const shelf of this.shelves()) this.updateEdges(shelf.nativeElement);
    });
    // Toute piste affichée qui a une pochette la télécharge (une fois : le service garde le cache).
    effect(() => {
      const known = this.coverUrls();
      for (const track of [...this.tracks(), ...this.playlists().flatMap((p) => p.tracks)]) {
        if (!track.cover || known[track.id]) continue;
        this.service.coverUrl(track.id).subscribe({
          next: (url) => this.coverUrls.update((urls) => ({ ...urls, [track.id]: url })),
          error: () => undefined, // pochette illisible : la pochette générée reste
        });
      }
    });
    // Sections secondaires : en cas d'échec, elles ne s'affichent simplement pas.
    this.service.base().subscribe({ next: (tracks) => this.baseTracks.set(tracks), error: () => undefined });
    this.loadPlaylists();
    // Information secondaire : en cas d'échec, les cartes s'affichent simplement sans record.
    this.scores.mine().subscribe({ next: (records) => this.records.set(records), error: () => undefined });
    for (const artist of this.artists) this.readPhotoColor(artist.slug);
  }

  /**
   * Moyenne des pixels du tiers central de la ligne du haut (le fond, au-dessus de la tête).
   * Seul le centre est utilisé : c'est la partie visible dans la bande, et les bords sont souvent
   * assombris (vignettage).
   * Photo absente : `onload` n'est jamais appelé et la couleur par défaut reste en place.
   */
  private readPhotoColor(slug: string): void {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(image, 0, 0); // ne garde que la première ligne de pixels
      const from = Math.floor(canvas.width / 3);
      const pixels = ctx.getImageData(from, 0, Math.max(1, from), 1).data;
      const rgb = [0, 0, 0];
      for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) rgb[c] += pixels[i + c];
      const [r, g, b] = rgb.map((sum) => Math.round(sum / (pixels.length / 4)));
      // Luminance perçue : nom foncé sur fond clair, clair sur fond foncé.
      const label = 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#1b1f2a' : '#f4f6f8';
      this.photoColors.update((colors) => ({ ...colors, [slug]: { background: `rgb(${r} ${g} ${b})`, label } }));
    };
    image.src = `artistes/${slug}.png`;
  }

  /**
   * Recharge la bibliothèque depuis la page 1 (nouvelle recherche, nouveau tri, import…).
   * Si une requête précédente est encore en cours, elle est annulée : seule la dernière
   * demande est affichée.
   */
  load(): void {
    this.fetch(1);
  }

  /** « Voir plus » : ajoute 10 pistes (les deux pages suivantes) à la suite des pistes affichées. */
  loadMore(): void {
    if (!this.loading() && this.hasMore()) this.fetch(this.page() + 1, this.page() + 2);
  }

  /** Charge les pages `first` à `last` (une seule en général) et les ajoute, ou remplace tout depuis la page 1. */
  private fetch(first: number, last = first): void {
    this.listSubscription?.unsubscribe();
    this.error.set('');
    this.loading.set(true);
    const pages = Array.from({ length: last - first + 1 }, (_, i) => this.service.list(first + i, this.limit(), this.query()));
    this.listSubscription = forkJoin(pages).subscribe({
      next: (responses) => {
        const items = responses.flatMap((response) => response.items);
        this.page.set(last);
        this.tracks.update((tracks) => (first === 1 ? items : [...tracks, ...items]));
        this.total.set(responses[0].total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(httpErrorMessage(error, 'Bibliothèque impossible à charger'));
      },
    });
  }

  /** Recherche par titre : la requête part 300 ms après la dernière frappe. */
  search(text: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.setQuery({ q: text.trim() }), 300);
  }

  setQuery(changes: Partial<TrackQuery>): void {
    this.query.update((query) => ({ ...query, ...changes }));
    this.load();
  }

  /** Playlists calculées par le serveur : préférés, meilleurs scores, jamais joués. */
  private loadPlaylists(): void {
    const ignore = () => undefined; // playlist secondaire : en cas d'échec, elle n'apparaît pas
    this.service.favorites().subscribe({ next: (tracks) => this.favoriteTracks.set(tracks), error: ignore });
    this.service.list(1, 12, { sort: 'record', record: 'with' }).subscribe({
      next: (response) => this.bestTracks.set(response.items),
      error: ignore,
    });
    this.service.list(1, 12, { record: 'without' }).subscribe({
      next: (response) => this.neverPlayed.set(response.items),
      error: ignore,
    });
  }

  /** Cœur d'une pochette : ajoute ou retire la piste des « Morceaux préférés ». */
  toggleFavorite(track: Track): void {
    const favorite = !this.favoriteIds().has(track.id);
    this.service.setFavorite(track.id, favorite).subscribe({
      next: (user) => {
        this.auth.currentUser.set(user);
        this.favoriteTracks.update((tracks) => (favorite ? [track, ...tracks] : tracks.filter((t) => t.id !== track.id)));
      },
      error: (error: unknown) => this.notify(httpErrorMessage(error, 'Préféré impossible à enregistrer')),
    });
  }

  /** Après un upload réussi, la nouvelle piste (la plus récente) est en tête de liste. */
  onUploaded(): void {
    this.load();
    this.loadPlaylists(); // la nouvelle piste rejoint « Jamais joués »
  }

  openImport(): void {
    const dialog = this.importDialog().nativeElement;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', ''); // navigateurs (et jsdom) sans <dialog> modal
  }

  closeImport(): void {
    const dialog = this.importDialog().nativeElement;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  /** Pochette changée (`file`) ou retirée (`null`) depuis le panneau de modification. */
  changeCover({ track, file }: { track: Track; file: File | null }): void {
    const request = file ? this.service.setCover(track.id, file) : this.service.removeCover(track.id);
    request.subscribe({
      next: (updated) => {
        this.coverUrls.update(({ [track.id]: _old, ...urls }) => urls);
        const replace = (tracks: Track[]) => tracks.map((t) => (t.id === updated.id ? updated : t));
        for (const list of [this.tracks, this.bestTracks, this.favoriteTracks, this.neverPlayed, this.queue]) list.update(replace);
        if (this.currentTrack()?.id === updated.id) this.currentTrack.set(updated);
        this.notify(file ? `Pochette de « ${updated.title} » mise à jour.` : `Pochette de « ${updated.title} » retirée.`);
      },
      error: (error: unknown) => this.notify(httpErrorMessage(error, 'Pochette impossible à enregistrer')),
    });
  }

  /** Flèches ‹ › d'une rangée : défile d'une largeur visible, en douceur. */
  scrollRow(carousel: HTMLElement, direction: 1 | -1): void {
    const row = carousel.querySelector<HTMLElement>('.row');
    row?.scrollBy({ left: direction * row.clientWidth * 0.9, behavior: 'smooth' });
  }

  /** Masque la flèche ‹ en début de rangée et › en fin (classes sur le conteneur). */
  updateEdges(carousel: HTMLElement): void {
    const row = carousel.querySelector<HTMLElement>('.row');
    if (!row) return;
    carousel.classList.toggle('at-start', row.scrollLeft <= 4);
    carousel.classList.toggle('at-end', row.scrollLeft + row.clientWidth >= row.scrollWidth - 4);
  }

  /** Précédent (-1) ou suivant (+1) dans la file de lecture. */
  step(direction: 1 | -1): void {
    const next = this.queue()[this.queueIndex() + direction];
    if (next) this.play(next);
  }

  /**
   * Lit une piste. `list` est la playlist (ou la grille) d'où part la lecture : elle devient la
   * file de précédent / suivant. Sans elle, on garde la file en cours si la piste y figure.
   */
  /** Lecteur en plein écran (pochette en grand). */
  readonly playerExpanded = signal(false);

  /** Clic sur une pochette : lance le morceau (s'il ne joue pas déjà) et l'affiche en grand. */
  open(track: Track, list?: Track[]): void {
    if (this.currentTrack()?.id !== track.id) this.play(track, list);
    this.playerExpanded.set(true);
  }

  play(track: Track, list?: Track[]): void {
    if (this.loadingAudioId()) return;
    if (list) this.queue.set(list);
    else if (!this.queue().some((t) => t.id === track.id)) this.queue.set(this.tracks());
    this.audioError.set('');
    this.loadingAudioId.set(track.id);
    this.service.audio(track.id).subscribe({
      next: (blob) => {
        this.loadingAudioId.set(null);
        // L'ancienne ObjectURL est libérée avant d'en créer une nouvelle.
        this.releaseAudio();
        this.audioUrl.set(URL.createObjectURL(blob));
        this.currentTrack.set(track);
      },
      error: (error: unknown) => {
        this.loadingAudioId.set(null);
        if (!this.currentTrack()) this.playerExpanded.set(false); // rien à afficher en grand
        // Avec responseType 'blob', le corps d'erreur est aussi un Blob : on s'appuie sur le statut.
        this.audioError.set(
          error instanceof HttpErrorResponse && error.status === 404
            ? 'Piste introuvable : elle a peut-être été supprimée.'
            : httpErrorMessage(error, 'Lecture audio impossible'),
        );
      },
    });
  }

  /** Erreur du lecteur <audio> lui-même (fichier corrompu, codec non supporté…). */
  onAudioError(): void {
    this.audioError.set('Le navigateur ne peut pas lire ce fichier (format non supporté ou fichier corrompu).');
  }

  /** La carte a déjà demandé confirmation (« Oui, supprimer ») avant d'émettre. */
  remove(track: Track): void {
    if (this.deletingId()) return;

    this.deletingId.set(track.id);
    this.service.remove(track.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.editingId.set(null); // la suppression se lance depuis le formulaire de modification
        if (this.currentTrack()?.id === track.id) this.stopPlayer();
        this.notify(`Piste « ${track.title} » supprimée.`);
        // Retrait sur place : les pistes déjà chargées par « Voir plus » restent affichées.
        this.tracks.update((tracks) => tracks.filter((t) => t.id !== track.id));
        this.total.update((total) => Math.max(0, total - 1));
      },
      error: (error: unknown) => {
        this.deletingId.set(null);
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        // 401 : l'intercepteur a déjà déconnecté l'utilisateur et redirigé vers /login.
        if (status === 401) return;
        this.notify(
          status === 404
            ? 'Cette piste n’existe plus ou ne vous appartient pas. La liste a été actualisée.'
            : httpErrorMessage(error, 'Suppression impossible'),
        );
        // L'affichage n'est plus fiable : on resynchronise avec le serveur.
        this.load();
      },
    });
  }

  edit(track: Track): void {
    if (!this.savingId()) this.editingId.set(track.id);
  }

  cancelEdit(): void {
    if (!this.savingId()) this.editingId.set(null);
  }

  /**
   * Enregistre titre et description. En cas de succès, la piste renvoyée par le serveur
   * remplace l'ancienne dans la liste (pas besoin de recharger toute la page) ; le lecteur
   * et la card en lecture affichent aussitôt le nouveau titre.
   * En cas d'erreur, le formulaire reste ouvert avec la saisie de l'utilisateur.
   */
  save({ track, changes }: { track: Track; changes: TrackChanges }): void {
    if (this.savingId()) return;
    this.savingId.set(track.id);
    this.service.update(track.id, changes).subscribe({
      next: (updated) => {
        this.savingId.set(null);
        this.editingId.set(null);
        this.tracks.update((tracks) => tracks.map((t) => (t.id === updated.id ? updated : t)));
        if (this.currentTrack()?.id === updated.id) this.currentTrack.set(updated);
        this.notify(`Piste « ${updated.title} » modifiée.`);
      },
      error: (error: unknown) => {
        this.savingId.set(null);
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        if (status === 401) return; // déjà géré par l'intercepteur
        if (status === 404) {
          this.editingId.set(null);
          this.notify('Cette piste n’existe plus ou ne vous appartient pas. La liste a été actualisée.');
          this.load();
          return;
        }
        this.notify(httpErrorMessage(error, 'Modification impossible'));
      },
    });
  }

  ngOnDestroy(): void {
    this.listSubscription?.unsubscribe();
    clearTimeout(this.searchTimer);
    this.releaseAudio();
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'Fermer', { duration: 5000 });
  }

  /** Ferme le lecteur (bouton ✕, ou piste en lecture supprimée). */
  stopPlayer(): void {
    this.playerExpanded.set(false);
    this.releaseAudio();
    this.audioUrl.set('');
    this.currentTrack.set(null);
  }

  /** Une ObjectURL garde le Blob en mémoire tant qu'elle n'est pas révoquée. */
  private releaseAudio(): void {
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
  }
}
