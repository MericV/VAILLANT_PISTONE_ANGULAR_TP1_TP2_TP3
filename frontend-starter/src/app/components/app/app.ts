import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  /** Position de la bulle de verre de la barre, relative à la navigation. */
  protected readonly bubble = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');

  constructor() {
    // Après chaque navigation (classes « active » posées), la bulle rejoint la page courante.
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => requestAnimationFrame(() => this.moveBubble(null)));
    // Après un rechargement de page, seul le jeton est conservé : on relit le profil
    // (avatar, décor, points) dont se servent le lobby, le jeu, la boutique et le profil.
    if (this.auth.token()) this.auth.profile().subscribe({ error: () => undefined });
  }

  /** Place la bulle sous le lien visé, ou sous le lien de la page courante. */
  protected moveBubble(target: EventTarget | null): void {
    const nav = this.nav().nativeElement;
    const link = (target instanceof Element ? target.closest<HTMLElement>('nav > a, nav > button') : null) ?? nav.querySelector<HTMLElement>(':scope > a.active');
    this.bubble.set(link ? { x: link.offsetLeft, y: link.offsetTop, w: link.offsetWidth, h: link.offsetHeight } : null);
  }

  /** Reflet de lumière qui suit la souris sur le verre de la barre. */
  protected glow(event: PointerEvent, bar: HTMLElement): void {
    const box = bar.getBoundingClientRect();
    bar.style.setProperty('--mx', `${event.clientX - box.left}px`);
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
