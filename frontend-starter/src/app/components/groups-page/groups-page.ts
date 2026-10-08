import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Group } from '../../shared/models/group.model';
import { GroupService } from '../../shared/services/group.service';
import { httpErrorMessage } from '../../shared/utils/http-error';
import { AvatarBadgeComponent } from '../avatar-badge/avatar-badge';

/** Onglet Groupe : créer un groupe, le rejoindre avec un code, ouvrir son salon de jeu. */
@Component({
  imports: [ReactiveFormsModule, RouterLink, AvatarBadgeComponent],
  templateUrl: './groups-page.html',
  styleUrl: './groups-page.css',
})
export class GroupsPageComponent {
  private readonly service = inject(GroupService);
  private readonly snackBar = inject(MatSnackBar);

  readonly groups = signal<Group[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  /** Action en cours : 'create', 'join' ou l'id du groupe quitté. Une seule à la fois. */
  readonly busy = signal<string | null>(null);

  /*
   * Un FormGroup par formulaire : c'est la directive [formGroup] qui émet (ngSubmit).
   * Sans elle, le navigateur ferait un envoi classique et rechargerait la page.
   */
  readonly createForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S.*\S/), Validators.maxLength(40)],
    }),
  });
  readonly joinForm = new FormGroup({
    code: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\s*[A-Za-z0-9]{6}\s*$/)] }),
  });
  readonly name = this.createForm.controls.name;
  readonly code = this.joinForm.controls.code;

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service.list().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(httpErrorMessage(error, 'Groupes impossibles à charger'));
      },
    });
  }

  create(): void {
    if (this.busy()) return;
    if (this.name.invalid) {
      this.name.markAsTouched();
      return;
    }
    this.busy.set('create');
    this.service.create(this.name.value.trim()).subscribe({
      next: (group) => {
        this.busy.set(null);
        this.name.reset();
        this.groups.update((groups) => [group, ...groups]);
        this.notify(`Groupe « ${group.name} » créé. Partagez le code ${group.code} pour inviter.`);
      },
      error: (error: unknown) => this.fail(error, 'Création impossible'),
    });
  }

  join(): void {
    if (this.busy()) return;
    if (this.code.invalid) {
      this.code.markAsTouched();
      return;
    }
    this.busy.set('join');
    this.service.join(this.code.value.trim().toUpperCase()).subscribe({
      next: (group) => {
        this.busy.set(null);
        this.code.reset();
        this.groups.update((groups) => [group, ...groups]);
        this.notify(`Bienvenue dans « ${group.name} ».`);
      },
      error: (error: unknown) => this.fail(error, 'Impossible de rejoindre ce groupe'),
    });
  }

  leave(group: Group): void {
    if (this.busy()) return;
    if (!window.confirm(`Quitter « ${group.name} » ? Il faudra son code pour revenir.`)) return;
    this.busy.set(group.id);
    this.service.leave(group.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.groups.update((groups) => groups.filter((g) => g.id !== group.id));
        this.notify(`Vous avez quitté « ${group.name} ».`);
      },
      error: (error: unknown) => this.fail(error, 'Impossible de quitter ce groupe'),
    });
  }

  private fail(error: unknown, fallback: string): void {
    this.busy.set(null);
    if (error instanceof HttpErrorResponse && error.status === 401) return;
    this.notify(httpErrorMessage(error, fallback));
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'Fermer', { duration: 5000 });
  }
}
