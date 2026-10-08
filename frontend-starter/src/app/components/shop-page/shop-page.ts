import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Avatar } from '../../shared/models/user.model';
import { AuthService } from '../../shared/services/auth.service';
import { ShopService } from '../../shared/services/shop.service';
import { httpErrorMessage } from '../../shared/utils/http-error';
import { AvatarBadgeComponent } from '../avatar-badge/avatar-badge';

/** État d'un avatar pour le joueur : il décide du bouton affiché sur sa carte. */
export type AvatarStatus = 'equipped' | 'owned' | 'affordable' | 'locked';

/**
 * Boutique : les points gagnés en jouant achètent des avatars, puis on choisit celui affiché.
 * Le serveur reste seul juge du solde et de la possession ; la page ne fait qu'afficher son avis.
 */
@Component({
  imports: [DecimalPipe, AvatarBadgeComponent],
  templateUrl: './shop-page.html',
  styleUrl: './shop-page.css',
})
export class ShopPageComponent {
  private readonly shop = inject(ShopService);
  private readonly snackBar = inject(MatSnackBar);
  readonly auth = inject(AuthService);

  readonly avatars = signal<Avatar[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  /** Avatar en cours d'achat ou d'équipement : un seul à la fois. */
  readonly busyId = signal<string | null>(null);

  readonly coins = computed(() => this.auth.currentUser()?.coins ?? 0);
  /** Chaque avatar avec son état pour le joueur connecté. */
  readonly items = computed(() => {
    const user = this.auth.currentUser();
    return this.avatars().map((avatar) => {
      const status: AvatarStatus =
        user?.avatar.id === avatar.id ? 'equipped'
        : user?.avatars.includes(avatar.id) ? 'owned'
        : this.coins() >= avatar.price ? 'affordable'
        : 'locked';
      return { avatar, status, missing: Math.max(0, avatar.price - this.coins()) };
    });
  });

  constructor() {
    // Le solde affiché doit être frais : un autre onglet a pu jouer ou acheter.
    this.auth.profile().subscribe({ error: () => undefined });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.shop.catalog().subscribe({
      next: (avatars) => {
        this.avatars.set(avatars);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(httpErrorMessage(error, 'Boutique impossible à charger'));
      },
    });
  }

  buy(avatar: Avatar): void {
    this.run(avatar, () => this.shop.buy(avatar.id), `${avatar.name} acheté. Il est dans votre collection.`);
  }

  equip(avatar: Avatar): void {
    this.run(avatar, () => this.shop.equip(avatar.id), `${avatar.name} est maintenant votre avatar.`);
  }

  /** La requête n'est créée qu'après la vérification « une action à la fois ». */
  private run(avatar: Avatar, request: () => ReturnType<ShopService['buy']>, success: string): void {
    if (this.busyId()) return;
    this.busyId.set(avatar.id);
    request().subscribe({
      next: () => {
        this.busyId.set(null);
        this.snackBar.open(success, 'Fermer', { duration: 4000 });
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        if (error instanceof HttpErrorResponse && error.status === 401) return;
        this.snackBar.open(httpErrorMessage(error, 'Action impossible'), 'Fermer', { duration: 5000 });
        // Le serveur ne partage pas notre avis (solde, possession) : on relit le compte.
        this.auth.profile().subscribe({ error: () => undefined });
      },
    });
  }
}
