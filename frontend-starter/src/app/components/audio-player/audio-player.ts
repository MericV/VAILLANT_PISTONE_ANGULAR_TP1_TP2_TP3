import { Component, ElementRef, input, model, OnDestroy, output, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { formatDuration } from '../../shared/utils/audio-file';

/** Nombre de barres de l'égaliseur. */
const BARS = 24;

/**
 * Lecteur en verre flottant en bas de l'écran : précédent / lecture / suivant, vignette, titre,
 * progression cliquable, volume et un égaliseur qui bouge avec la musique. En fin de morceau,
 * il demande le suivant à la page.
 * Composant de présentation : il reçoit l'URL du morceau et signale erreur et fermeture.
 * Un clic sur le centre ouvre la vue plein écran, façon Apple Music (fond tiré de la pochette).
 * L'égaliseur lit le son via la Web Audio API (AnalyserNode branché sur l'élément <audio>).
 */
@Component({
  selector: 'app-audio-player',
  imports: [NgTemplateOutlet],
  // Plein écran : l'hôte couvre toute la fenêtre ; Échap revient au mini-lecteur.
  host: { '[class.expanded]': 'expanded()', '(document:keydown.escape)': 'expanded.set(false)' },
  templateUrl: './audio-player.html',
  styleUrl: './audio-player.css',
})
export class AudioPlayerComponent implements OnDestroy {
  readonly src = input.required<string>();
  readonly title = input.required<string>();
  /** Ligne sous le titre (ex. « Piste de base · 3:04 »). */
  readonly subtitle = input('');
  /** Teinte de la vignette, la même que la pochette de la piste. */
  readonly hue = input(260);
  /** URL locale de la pochette d'album, sinon la vignette générée. */
  readonly cover = input<string | null>(null);
  readonly hasPrevious = input(false);
  readonly hasNext = input(false);
  /** Vue plein écran (pochette en grand), ouverte par la page ou par un clic sur le mini-lecteur. */
  readonly expanded = model(false);
  readonly failed = output<void>();
  readonly closed = output<void>();
  readonly previous = output<void>();
  readonly next = output<void>();

  protected readonly paused = signal(true);
  protected readonly time = signal(0);
  protected readonly duration = signal(0);
  protected readonly volume = signal(1);
  protected readonly bars = signal<number[]>(Array(BARS).fill(0.08));
  /** Horloge « m:ss », « 0:00 » tant que rien n'est joué. */
  protected readonly clock = (seconds: number) => (seconds > 0 ? formatDuration(seconds) : '0:00');

  private readonly audio = viewChild.required<ElementRef<HTMLAudioElement>>('audio');
  private analyser: AnalyserNode | null = null;
  private context: AudioContext | null = null;
  private frame = 0;

  protected toggle(): void {
    const audio = this.audio().nativeElement;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }

  protected seek(event: Event): void {
    this.audio().nativeElement.currentTime = Number((event.target as HTMLInputElement).value);
  }

  protected setVolume(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.audio().nativeElement.volume = value;
    this.volume.set(value);
  }

  /** Branche l'analyseur au premier « play » (un geste de l'utilisateur, exigé par les navigateurs). */
  protected onPlay(): void {
    this.paused.set(false);
    if (!this.analyser && typeof AudioContext !== 'undefined') {
      try {
        this.context = new AudioContext();
        const source = this.context.createMediaElementSource(this.audio().nativeElement);
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 128;
        source.connect(this.analyser);
        this.analyser.connect(this.context.destination);
      } catch {
        this.analyser = null; // égaliseur indisponible : la lecture continue sans lui
      }
    }
    void this.context?.resume();
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.draw);
  }

  protected onEnded(): void {
    this.onPause();
    if (this.hasNext()) this.next.emit();
  }

  protected onPause(): void {
    this.paused.set(true);
    cancelAnimationFrame(this.frame);
    this.bars.set(Array(BARS).fill(0.08));
  }

  protected onTime(): void {
    const audio = this.audio().nativeElement;
    this.time.set(audio.currentTime);
    if (Number.isFinite(audio.duration)) this.duration.set(audio.duration);
  }

  /** Hauteur de chaque barre (0–1) d'après les fréquences, des graves aux aigus. */
  private readonly draw = () => {
    if (this.analyser) {
      const bins = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(bins);
      const step = Math.floor(bins.length / BARS) || 1;
      this.bars.set(Array.from({ length: BARS }, (_, i) => Math.max(0.08, bins[i * step] / 255)));
    }
    this.frame = requestAnimationFrame(this.draw);
  };

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    void this.context?.close();
  }
}
