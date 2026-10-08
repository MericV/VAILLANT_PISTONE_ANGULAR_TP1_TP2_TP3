import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject, throwError } from 'rxjs';
import { ShopPageComponent } from './shop-page';
import { ShopService } from '../../shared/services/shop.service';
import { AuthService } from '../../shared/services/auth.service';
import { Avatar, Background, User } from '../../shared/models/user.model';

const avatars: Avatar[] = [
  { id: 'rocker', name: 'Rockeur', emoji: '🎸', color: '#8f5bff', price: 0 },
  { id: 'drummer', name: 'Batteuse', emoji: '🥁', color: '#ff4f7b', price: 150 },
  { id: 'fox', name: 'Renard', emoji: '🦊', color: '#ff9a3d', price: 600 },
  { id: 'dragon', name: 'Dragon', emoji: '🐉', color: '#ff3b2f', price: 1500 },
];
const backgrounds: Background[] = [
  { id: 'stage', name: 'Scène néon', stage: '#2b1468', deep: '#140a33', spotA: '#ff3fb4', spotB: '#2ee6ff', price: 0 },
  { id: 'sunset', name: 'Coucher de soleil', stage: '#6b1d3a', deep: '#1f0b1a', spotA: '#ff8a1f', spotB: '#ffd34d', price: 300 },
  { id: 'gold', name: 'Salle d’or', stage: '#4a3708', deep: '#140f02', spotA: '#ffd34d', spotB: '#ffffff', price: 2500 },
];
const player = (coins: number, owned: Partial<User> = {}): User => ({
  id: 'u1', name: 'Léa', email: 'l@x.fr', createdAt: '', coins,
  avatars: ['rocker', 'fox'], avatar: avatars[0], backgrounds: ['stage'], background: backgrounds[0], ...owned,
});

describe('ShopPageComponent', () => {
  let fixture: ComponentFixture<ShopPageComponent>;
  let component: ShopPageComponent;
  let shop: Record<'avatars' | 'backgrounds' | 'buy' | 'equip', ReturnType<typeof vi.fn>>;
  let auth: { currentUser: ReturnType<typeof signal<User | null>>; profile: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };
  const host = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) => host().querySelector(`button[aria-label^="${label}"]`) as HTMLButtonElement | null;
  const statuses = (shelf: number) => component.shelves()[shelf].items.map((i) => i.status);

  beforeEach(async () => {
    shop = { avatars: vi.fn(() => of(avatars)), backgrounds: vi.fn(() => of(backgrounds)), buy: vi.fn(), equip: vi.fn() };
    auth = { currentUser: signal<User | null>(player(500)), profile: vi.fn(() => of(null)) };
    snackBar = { open: vi.fn() };
    TestBed.configureTestingModule({
      imports: [ShopPageComponent],
      providers: [
        { provide: ShopService, useValue: shop },
        { provide: AuthService, useValue: auth },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
    fixture = TestBed.createComponent(ShopPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('affiche le solde et l’état de chaque article des deux rayons', () => {
    expect(host().querySelector('.balance')?.textContent).toContain('500');
    expect(statuses(0)).toEqual(['equipped', 'affordable', 'owned', 'locked']);
    expect(statuses(1)).toEqual(['equipped', 'affordable', 'locked']);
    expect(host().textContent).toContain('Fonds de scène');
    expect(host().textContent).toContain('Encore 1,000 points à gagner'); // Dragon : 1500 - 500
  });

  it('affiche un aperçu de chaque fond avec ses couleurs', () => {
    const previews = host().querySelectorAll<HTMLElement>('.preview');
    expect(previews).toHaveLength(3);
    expect(previews[1].style.getPropertyValue('--stage')).toBe('#6b1d3a');
  });

  it('achète un fond abordable dans le bon rayon', () => {
    shop.buy.mockReturnValue(of(player(200, { backgrounds: ['stage', 'sunset'] })));

    button('Acheter Coucher de soleil')!.click();

    expect(shop.buy).toHaveBeenCalledWith('backgrounds', 'sunset');
    expect(snackBar.open.mock.calls[0][0]).toContain('Coucher de soleil');
  });

  it('équipe un avatar possédé', () => {
    shop.equip.mockReturnValue(of(player(500, { avatar: avatars[2] })));
    button('Choisir Renard')!.click();
    expect(shop.equip).toHaveBeenCalledWith('avatars', 'fox');
  });

  it('bloque une seconde action pendant un achat en cours', async () => {
    shop.buy.mockReturnValue(new Subject());
    button('Acheter Batteuse')!.click();
    await fixture.whenStable();

    expect(button('Choisir Renard')!.disabled).toBe(true);
    component.equip(component.shelves()[0].items[2]);
    expect(shop.equip).not.toHaveBeenCalled();
  });

  it('affiche le refus du serveur et relit le solde', () => {
    shop.buy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Points insuffisants' } })));

    button('Acheter Batteuse')!.click();

    expect(snackBar.open).toHaveBeenCalledWith('Points insuffisants', 'Fermer', { duration: 5000 });
    expect(auth.profile).toHaveBeenCalledTimes(2); // à l'ouverture, puis après le refus
    expect(component.busyId()).toBeNull();
  });
});
