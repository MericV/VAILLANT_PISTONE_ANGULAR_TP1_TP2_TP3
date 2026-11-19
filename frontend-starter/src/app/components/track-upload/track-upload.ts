import { Component, computed, ElementRef, inject, OnDestroy, output, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Track } from '../../shared/models/track.model';
import { UploadState } from '../../shared/models/upload-event.model';
import { FileSizePipe } from '../../shared/pipes/file-size.pipe';
import { TrackService } from '../../shared/services/track.service';
import { measureDuration, validateAudioFile, validateCover } from '../../shared/utils/audio-file';
import { httpErrorMessage } from '../../shared/utils/http-error';

/**
 * Formulaire d'import : zone de glisser-déposer (ou sélecteur), un ou plusieurs fichiers,
 * envoyés l'un après l'autre avec suivi de progression.
 * Flux : formulaire → TrackService.upload() → HttpClient → événements de progression.
 * Le composant émet `uploaded` après chaque `201` pour que la page recharge la liste.
 * Le titre saisi ne sert que pour un fichier seul ; sinon chaque piste prend le nom de son fichier.
 */
@Component({
  selector: 'app-track-upload',
  imports: [ReactiveFormsModule, FileSizePipe],
  templateUrl: './track-upload.html',
  styleUrl: './track-upload.css',
})
export class TrackUploadComponent implements OnDestroy {
  private readonly service = inject(TrackService);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly uploaded = output<Track>();

  readonly title = new FormControl('', { nonNullable: true });
  readonly files = signal<File[]>([]);
  readonly state = signal<UploadState>({ status: 'idle' });
  /** Fichier survolé pendant un glisser-déposer : la zone s'illumine. */
  readonly dragging = signal(false);
  /** Rang (à partir de 1) du fichier en cours d'envoi. */
  readonly current = signal(0);
  /** Pochette d'album facultative (fichier seul) et son aperçu local. */
  readonly cover = signal<File | null>(null);
  readonly coverPreview = signal('');
  /** Durées mesurées dès le choix des fichiers (sans les envoyer), jointes à l'envoi. */
  private readonly durations = new Map<File, number | null>();

  // Valeurs dérivées de l'union `state` : le template reste simple et typé.
  readonly uploading = computed(() => this.state().status === 'uploading');
  readonly percent = computed(() => {
    const state = this.state();
    return state.status === 'uploading' ? state.percent : 0;
  });
  /** 100 % envoyé mais pas encore de réponse : le serveur écrit le fichier et la métadonnée. */
  readonly processing = computed(() => this.uploading() && this.percent() === 100);
  readonly successTitle = computed(() => {
    const state = this.state();
    return state.status === 'success' ? state.track.title : '';
  });
  readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.message : '';
  });

  choose(event: Event): void {
    this.select([...((event.target as HTMLInputElement).files ?? [])]);
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (!this.uploading()) this.select([...(event.dataTransfer?.files ?? [])]);
  }

  protected dragOver(event: DragEvent): void {
    event.preventDefault(); // autorise le dépôt
    this.dragging.set(!this.uploading());
  }

  protected chooseCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    const problem = file ? validateCover(file) : null;
    if (problem) return this.state.set({ status: 'error', message: problem });
    this.setCover(file);
  }

  protected setCover(file: File | null): void {
    if (this.coverPreview()) URL.revokeObjectURL(this.coverPreview());
    this.cover.set(file);
    let preview = '';
    try {
      if (file) preview = URL.createObjectURL(file);
    } catch {
      // Aperçu indisponible (environnement sans ObjectURL) : la pochette sera quand même envoyée.
    }
    this.coverPreview.set(preview);
  }

  /** Retire un fichier de la liste avant l'envoi. */
  protected discard(file: File): void {
    this.files.update((files) => files.filter((f) => f !== file));
    this.durations.delete(file);
    if (!this.files().length) this.state.set({ status: 'idle' });
  }

  /**
   * Un nouveau choix efface l'ancien succès/erreur, mais on valide tout de suite
   * pour afficher le problème avant même le clic sur « Envoyer ».
   */
  private select(files: File[]): void {
    this.files.set(files);
    this.durations.clear();
    for (const file of files) void measureDuration(file).then((seconds) => this.durations.set(file, seconds));
    const problem = files.map(validateAudioFile).find((message) => message !== null) ?? null;
    this.state.set(problem ? { status: 'error', message: problem } : { status: 'idle' });
  }

  upload(): void {
    const files = this.files();
    // Garde anti double-soumission : le bouton est désactivé, mais on protège aussi la méthode.
    if (!files.length || this.uploading()) return;

    const problem = files.map(validateAudioFile).find((message) => message !== null);
    if (problem) {
      this.state.set({ status: 'error', message: problem });
      return;
    }
    this.title.disable();
    this.send(files, 0);
  }

  /** Envoie les fichiers l'un après l'autre (un seul envoi à la fois pour le serveur). */
  private send(files: File[], index: number): void {
    const file = files[index];
    const title = files.length === 1 ? this.title.value || file.name : file.name;
    this.current.set(index + 1);
    this.state.set({ status: 'uploading', percent: 0 });
    const cover = files.length === 1 ? this.cover() : null; // la pochette ne vaut que pour un fichier seul
    this.service.upload(file, title, this.durations.get(file) ?? null, cover).subscribe({
      next: (event) => {
        if (event.type === 'progress') {
          this.state.set({ status: 'uploading', percent: event.percent });
          return;
        }
        this.uploaded.emit(event.track);
        if (index + 1 < files.length) return this.send(files, index + 1);
        this.state.set({ status: 'success', track: event.track });
        this.reset();
      },
      error: (error: unknown) => {
        this.title.enable();
        this.state.set({ status: 'error', message: httpErrorMessage(error, `Envoi de « ${file.name} » impossible`) });
      },
    });
  }

  /** Vide le formulaire, y compris l'<input type="file"> natif qui garde sinon ses fichiers. */
  private reset(): void {
    this.title.enable();
    this.title.setValue('');
    this.files.set([]);
    this.durations.clear();
    this.setCover(null);
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = '';
  }

  ngOnDestroy(): void {
    if (this.coverPreview()) URL.revokeObjectURL(this.coverPreview());
  }
}
