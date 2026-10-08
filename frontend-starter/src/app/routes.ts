import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { LoginPageComponent } from './components/login-page/login-page';
import { ProfilePageComponent } from './components/profile-page/profile-page';
import { RegisterPageComponent } from './components/register-page/register-page';
import { TracksPageComponent } from './components/tracks-page/tracks-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tracks' },
  { path: 'login', component: LoginPageComponent },
  { path: 'register', component: RegisterPageComponent },
  { path: 'profile', component: ProfilePageComponent, canActivate: [authGuard] },
  { path: 'tracks', component: TracksPageComponent, canActivate: [authGuard] },
  // Chargé à la demande : le code du jeu n'est téléchargé qu'au premier clic sur « Jouer ».
  {
    path: 'game/:id',
    loadComponent: () => import('./components/game-page/game-page').then((m) => m.GamePageComponent),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: 'tracks' },
];
