import { afterNextRender, Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

/** 150 images calculées dans Blender (blender/guitare-accueil.blend) : la caméra glisse du manche au corps. */
const FRAME_COUNT = 150;
const frameUrl = (i: number) => `home-guitar/f${String(i + 1).padStart(3, '0')}.webp`;

/**
 * Accueil : le défilement « joue » le mouvement de caméra (technique des pages produits Apple).
 * Le canvas est fixe en arrière-plan ; la position de défilement choisit l'image à dessiner.
 */
@Component({
  imports: [RouterLink],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePageComponent {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('stage');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const canvas = this.canvas().nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Animations réduites : une seule image fixe, le corps de la guitare.
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const frames = Array.from({ length: still ? 1 : FRAME_COUNT }, (_, i) => {
        const img = new Image();
        img.src = frameUrl(still ? FRAME_COUNT - 1 : i);
        img.onload = () => i === current && draw();
        return img;
      });
      let current = 0;
      let raf = 0;

      const draw = () => {
        const img = frames[current];
        if (!img.complete || !img.naturalWidth) return;
        // Équivalent de object-fit: cover.
        const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      };
      const resize = () => {
        canvas.width = innerWidth * devicePixelRatio;
        canvas.height = innerHeight * devicePixelRatio;
        draw();
      };
      const onScroll = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const max = document.documentElement.scrollHeight - innerHeight;
          const progress = max > 0 ? scrollY / max : 0;
          const next = Math.min(frames.length - 1, Math.round(progress * (frames.length - 1)));
          if (next !== current) {
            current = next;
            draw();
          }
        });
      };

      resize();
      addEventListener('resize', resize);
      if (!still) addEventListener('scroll', onScroll, { passive: true });
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(raf);
        removeEventListener('resize', resize);
        removeEventListener('scroll', onScroll);
      });
    });
  }
}
