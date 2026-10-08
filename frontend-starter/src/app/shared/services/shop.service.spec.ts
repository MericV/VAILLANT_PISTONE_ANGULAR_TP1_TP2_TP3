import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ShopService } from './shop.service';
import { AuthService } from './auth.service';
import { installLocalStorageMock } from '../testing/local-storage.mock';
import { User } from '../models/user.model';

const user: User = {
  id: 'u1', name: 'Léa', email: 'l@x.fr', createdAt: '', coins: 50, avatars: ['rocker', 'fox'],
  avatar: { id: 'fox', name: 'Renard', emoji: '🦊', color: '#ff9a3d', price: 600 },
};

describe('ShopService', () => {
  let service: ShopService;
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    installLocalStorageMock();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ShopService);
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lit le catalogue', () => {
    service.catalog().subscribe();
    expect(http.expectOne('/api/shop/avatars').request.method).toBe('GET');
  });

  it('achète un avatar et range l’utilisateur à jour dans AuthService', () => {
    service.buy('fox').subscribe();

    const request = http.expectOne('/api/shop/avatars/fox/buy');
    expect(request.request.method).toBe('POST');
    request.flush(user);
    expect(auth.currentUser()).toEqual(user);
  });

  it('change d’avatar avec PUT /api/users/me/avatar', () => {
    service.equip('fox').subscribe();

    const request = http.expectOne('/api/users/me/avatar');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ avatar: 'fox' });
    request.flush(user);
    expect(auth.currentUser()?.avatar.id).toBe('fox');
  });
});
