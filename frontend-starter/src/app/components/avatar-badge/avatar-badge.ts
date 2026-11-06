import { Component, input } from '@angular/core';
import { Avatar } from '../../shared/models/user.model';

/** Pastille ronde d'un avatar : son rendu 3D détouré, qui tourne au survol. Décorative. */
@Component({
  selector: 'app-avatar-badge',
  templateUrl: './avatar-badge.html',
  styleUrl: './avatar-badge.css',
})
export class AvatarBadgeComponent {
  readonly avatar = input.required<Avatar>();
  /** Diamètre en pixels. */
  readonly size = input(32);
}
