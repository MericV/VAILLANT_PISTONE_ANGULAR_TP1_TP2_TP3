import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject, throwError } from 'rxjs';
import { ShopPageComponent } from './shop-page';
import { ShopService } from '../../shared/services/shop.service';
import { AuthService } from '../../shared/services/auth.service';
import { Avatar, User } from '../../shared/models/user.model';

const catalog: Avatar[] = [
  { id: 'rocker', name: 'Rockeur', emoji: '🎸', color: '#8f5bff', price: 0 },
  { id: 'drummer', name: 'Batteuse', emoji: '🥁', color: '#ff4f7b', price: 150 },
  { id: 'fox', name: 'Renard', emoji: '🦊', color: '#ff9a3d', price: 600 },
  { id: 'dragon', name: 'Dragon', emoji: '🐉', color: '#ff3b2f', price: 1500 },
];
const player = (coins: number, avatars = ['rocker', 'fox'], current = 'rocker'): User => ({
  id: 'u1', name: 'Léa', email: 'l@x.fr', createdAt: '', coins, avatars, avatar: catalog.find((a) => a.id === current)!,
});

describe('ShopPageComponent', () => {
  let fixture: ComponentFixture<ShopPageComponent>;
  let component: ShopPageComponent;
  let shop: { catalog: ReturnType<typeof vi.fn>; buy: ReturnType<typeof vi.fn>; equip: ReturnType<typeof vi.fn> };
  let auth: { currentUser: ReturnType<typeof signal<User | null>>; profile: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };
  const host = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) => host().querySelector(`button[aria-label^="${label}"]`) as HTMLButtonElement | null;

  beforeEach(async () => {
    shop = { catalog: vi.fn(() => of(catalog)), buy: vi.fn(), equip: vi.fn() };
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

  it('affiche le solde et l’état de chaque avatar pour le joueur', () => {
    expect(host().querySelector('.balance')?.textContent).toContain('500');
    expect(component.items().map((i) => i.status)).toEqual(['equipped', 'affordable', 'owned', 'locked']);
    expect(host().textContent).toContain('Avatar actuel');
    expect(button('Acheter Batteuse')).not.toBeNull();
    expect(button('Choisir Renard')).not.toBeNull();
    expect(host().textContent).toContain('Encore 1,000 points à gagner'); // Dragon : 1500 - 500
  });

  it('achète un avatar abordable et confirme l’achat', () => {
    shop.buy.mockReturnValue(of(player(350, ['rocker', 'fox', 'drummer'])));

    button('Acheter Batteuse')!.click();

    expect(shop.buy).toHaveBeenCalledWith('drummer');
    expect(snackBar.open).toHaveBeenCalledWith('Batteuse acheté. Il est dans votre collection.', 'Fermer', { duration: 4000 });
  });

  it('bloque une seconde action pendant un achat en cours', async () => {
    shop.buy.mockReturnValue(new Subject());
    button('Acheter Batteuse')!.click();
    await fixture.whenStable();

    expect(button('Choisir Renard')!.disabled).toBe(true);
    component.equip(catalog[2]);
    expect(shop.equip).not.toHaveBeenCalled();
  });

  it('équipe un avatar possédé', () => {
    shop.equip.mockReturnValue(of(player(500, ['rocker', 'fox'], 'fox')));

    button('Choisir Renard')!.click();

    expect(shop.equip).toHaveBeenCalledWith('fox');
  });

  it('affiche le refus du serveur et relit le solde', () => {
    shop.buy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Points insuffisants' } })));

    button('Acheter Batteuse')!.click();

    expect(snackBar.open).toHaveBeenCalledWith('Points insuffisants', 'Fermer', { duration: 5000 });
    expect(auth.profile).toHaveBeenCalledTimes(2); // à l'ouverture, puis après le refus
    expect(component.busyId()).toBeNull();
  });
});
