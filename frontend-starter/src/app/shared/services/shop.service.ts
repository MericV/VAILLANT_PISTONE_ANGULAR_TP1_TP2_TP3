import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { Avatar, User } from '../models/user.model';
import { AuthService } from './auth.service';

/**
 * Boutique d'avatars. Après un achat ou un changement d'avatar, le serveur renvoie
 * l'utilisateur à jour : on le range dans AuthService pour que la barre du haut
 * (solde, avatar) se mette à jour partout.
 */
@Injectable({ providedIn: 'root' })
export class ShopService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  catalog() {
    return this.http.get<Avatar[]>('/api/shop/avatars');
  }

  buy(id: string) {
    return this.http.post<User>(`/api/shop/avatars/${id}/buy`, null).pipe(tap((user) => this.auth.currentUser.set(user)));
  }

  equip(id: string) {
    return this.http.put<User>('/api/users/me/avatar', { avatar: id }).pipe(tap((user) => this.auth.currentUser.set(user)));
  }
}
