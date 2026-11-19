import { Component, computed, effect, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Track } from '../../shared/models/track.model';
import { ScoreRecord } from '../../shared/models/score.model';
import { FileSizePipe } from '../../shared/pipes/file-size.pipe';
import { audioFormatLabel, formatDuration, trackHue, validateCover } from '../../shared/utils/audio-file';

/** Champs modifiables après l'import, envoyés tels quels au `PATCH`. */
export type TrackChanges = Pick<Track, 'title' | 'description'>;

/**
 * Card de présentation d'une piste, façon pochette d'album : pochette générée, actions au survol.
 * Une piste de base (catalogue commun) est en lecture seule : pas de « Modifier ».
 * Composant « présentationnel » : il ne connaît ni HttpClient ni TrackService.
 * Il reçoit des données par `input()` et signale les actions par `output()` ;
 * c'est la page parente qui décide quoi faire (lecture, modification, suppression).
 * « Modifier » ouvre un panneau de verre modal (<dialog>) ; « Supprimer » y est rangé et
 * demande une confirmation en deux temps.
 */
@Component({
  selector: 'app-track-card',
  imports: [DatePipe, DecimalPipe, FileSizePipe, RouterLink, ReactiveFormsModule],
  templateUrl: './track-card.html',
  styleUrl: './track-card.css',
})
export class TrackCardComponent {
  readonly track = input.required<Track>();
  /** Faux dans une rangée secondaire : la modification se fait depuis la grille « Mes pistes ». */
  readonly editable = input(true);
  /** Morceau marqué d'un cœur (playlist « Coups de cœur »). */
  readonly favorite = input(false);
  /** URL locale de la pochette d'album (chargée par la page), sinon la pochette générée. */
  readonly coverUrl = input<string | null>(null);
  /** Erreur de pochette à afficher dans le panneau (image refusée…). */
  readonly coverError = signal('');
  /** Vrai si cette piste est celle chargée dans le lecteur. */
  readonly current = input(false);
  /** Vrai pendant le téléchargement du Blob audio de cette piste. */
  readonly loadingAudio = input(false);
  /** Vrai pendant la requête DELETE de cette piste. */
  readonly deleting = input(false);
  /** Vrai quand une autre action globale empêche d'agir (ex. autre suppression). */
  readonly disabled = input(false);
  /**
   * Vrai quand la page a ouvert le formulaire de cette piste. C'est la page qui le
   * referme, uniquement après la réponse du serveur : en cas d'erreur, la saisie est conservée.
   */
  readonly editing = input(false);
  /** Vrai pendant la requête PATCH de cette piste. */
  readonly saving = input(false);
  /** Meilleur score du joueur sur ce morceau, ou `null` s'il n'y a jamais joué. */
  readonly best = input<ScoreRecord | null>(null);
  /** Cinq étoiles, pleines jusqu'au nombre gagné : affichage seulement. */
  readonly bestStars = computed(() => [1, 2, 3, 4, 5].map((n) => n <= (this.best()?.stars ?? 0)));

  readonly play = output<Track>();
  /** Clic sur la pochette (hors boutons) : lecture en plein écran. */
  readonly open = output<Track>();
  readonly remove = output<Track>();
  readonly edit = output<Track>();
  readonly cancelEdit = output<void>();
  readonly save = output<{ track: Track; changes: TrackChanges }>();
  readonly favoriteToggle = output<Track>();
  /** Nouvelle pochette choisie (`file`), ou pochette retirée (`null`). */
  readonly coverChange = output<{ track: Track; file: File | null }>();

  /** `pattern(/\S/)` refuse un titre fait uniquement d'espaces, que `required` laisse passer. */
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)],
    }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });

  readonly format = computed(() => audioFormatLabel(this.track().mimeType));
  readonly duration = computed(() => formatDuration(this.track().duration));
  /** Teinte de la pochette, stable pour une piste : tirée de son identifiant. */
  readonly hue = computed(() => trackHue(this.track().id));
  /** Premier clic sur « Supprimer » : on attend la confirmation. */
  readonly confirming = signal(false);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // Le panneau suit l'input `editing` : la page l'ouvre, et le referme après la réponse du serveur.
    effect(() => {
      const dialog = this.dialog().nativeElement;
      this.confirming.set(false);
      if (this.editing() && !dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', ''); // navigateurs (et jsdom) sans <dialog> modal
      } else if (!this.editing() && dialog.open) {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
      }
    });
  }
  readonly busy = computed(() => this.disabled() || this.deleting() || this.loadingAudio());

  /** Pré-remplit le formulaire avec les valeurs actuelles avant de demander son ouverture. */
  startEdit(): void {
    this.form.reset({ title: this.track().title, description: this.track().description ?? '' });
    this.edit.emit(this.track());
  }

  /** Pochette choisie dans le panneau : vérifiée ici, envoyée par la page. */
  chooseCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const problem = validateCover(file);
    this.coverError.set(problem ?? '');
    if (!problem) this.coverChange.emit({ track: this.track(), file });
  }

  submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { title, description } = this.form.getRawValue();
    this.save.emit({ track: this.track(), changes: { title: title.trim(), description: description.trim() } });
  }

  /** Les boutons et le lien posés sur la pochette gardent leur propre action. */
  protected openFrom(event: MouseEvent): void {
    if (!(event.target as HTMLElement).closest('button, a')) this.open.emit(this.track());
  }
}
