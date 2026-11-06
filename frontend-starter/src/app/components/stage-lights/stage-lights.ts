import { afterNextRender, Component, computed, ElementRef, input, OnDestroy, viewChild } from '@angular/core';
import { bandLevel } from '../../shared/utils/audio-level';

/** Courbe un niveau audio (0–1) en opacité : rien sous `floor`, plein à `floor + 1 / gain`. */
const toOpacity = (level: number, floor: number, gain: number) => Math.min(1, Math.max(0, (level - floor) * gain));

/**
 * Lumières du décor qui battent sur la musique, posées derrière le contenu du parent.
 * Le décor (`backgrounds/x.webp`) est rendu dans Blender en trois calques : `x-base.webp`
 * (projecteurs tamisés), `x-a.webp` et `x-b.webp` (chacun avec un groupe de projecteurs allumé).
 * Les calques A et B s'ajoutent à la base en « lighten » : A suit les basses, B les aigus.
 * Sans analyseur (lobby, boutique), une pulsation régulière (≈ 120 bpm) les fait battre.
 * Mouvement réduit demandé : rien n'est posé, le parent garde l'image complète, fixe.
 */
@Component({
  selector: 'app-stage-lights',
  template: `
    @if (!still) {
      <div [style.background-image]="layer('base')"></div>
      <div #a class="light" [style.background-image]="layer('a')"></div>
      <div #b class="light" [style.background-image]="layer('b')"></div>
    }
  `,
  styles: `
    :host { position: absolute; inset: 0; z-index: -1; overflow: hidden; border-radius: inherit; pointer-events: none; }
    div { position: absolute; inset: 0; background: center 30% / cover no-repeat; }
    .light { mix-blend-mode: lighten; opacity: 0; }
  `,
})
export class StageLightsComponent implements OnDestroy {
  /** Image complète du décor, ex. `backgrounds/rock.webp`. */
  readonly image = input.required<string>();
  readonly analyser = input<AnalyserNode | null>(null);

  protected readonly still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  private readonly stem = computed(() => this.image().replace(/\.webp$/, ''));
  private readonly a = viewChild<ElementRef<HTMLElement>>('a');
  private readonly b = viewChild<ElementRef<HTMLElement>>('b');
  private frame = 0;

  constructor() {
    afterNextRender(() => {
      if (!this.still) this.frame = requestAnimationFrame(this.draw);
    });
  }

  protected layer(name: string): string {
    return `url(${this.stem()}-${name}.webp)`;
  }

  private bins = new Uint8Array(0);
  private levelA = 0;
  private levelB = 0;

  private readonly draw = (now: number) => {
    const analyser = this.analyser();
    let a: number;
    let b: number;
    if (analyser) {
      if (this.bins.length !== analyser.frequencyBinCount) this.bins = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(this.bins);
      const rate = analyser.context.sampleRate;
      a = toOpacity(bandLevel(this.bins, rate, 40, 160), 0.3, 2.2);
      b = toOpacity(bandLevel(this.bins, rate, 2000, 6000), 0.05, 6);
    } else {
      const beat = (now / 500) * Math.PI;
      a = Math.max(0, Math.sin(beat)) ** 2;
      b = Math.max(0, Math.sin(beat + Math.PI / 2)) ** 2 * 0.8;
    }
    // Les lumières s'allument d'un coup et retombent doucement.
    this.levelA = Math.max(a, this.levelA * 0.9);
    this.levelB = Math.max(b, this.levelB * 0.88);
    const elA = this.a()?.nativeElement;
    const elB = this.b()?.nativeElement;
    if (elA) elA.style.opacity = this.levelA.toFixed(3);
    if (elB) elB.style.opacity = this.levelB.toFixed(3);
    this.frame = requestAnimationFrame(this.draw);
  };

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
  }
}
