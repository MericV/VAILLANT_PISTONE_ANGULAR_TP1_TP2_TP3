import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { GroupService } from '../services/group.service';

/**
 * « Jouer » (/lobby) : ouvre le salon de son propre groupe, comme le lobby de Fortnite.
 * À défaut, celui d'un groupe rejoint ; sans aucun groupe, le sien est créé à la volée.
 */
export const lobbyGuard: CanActivateFn = () => {
  const groups = inject(GroupService);
  const auth = inject(AuthService);
  const router = inject(Router);
  const name = `Groupe de ${auth.currentUser()?.name ?? 'moi'}`.slice(0, 40);

  return groups.list().pipe(
    switchMap((list) => {
      const group = list.find((g) => g.isOwner) ?? list[0];
      return group ? of(group) : groups.create(name);
    }),
    map((group) => router.createUrlTree(['/groups', group.id, 'live'])),
    catchError(() => of(router.createUrlTree(['/groups']))),
  );
};
