import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { firstValueFrom, Observable, of } from 'rxjs';
import { lobbyGuard } from './lobby.guard';
import { GroupService } from '../services/group.service';
import { AuthService } from '../services/auth.service';

describe('lobbyGuard', () => {
  const run = async (groups: unknown[]) => {
    const service = { list: vi.fn(() => of(groups)), create: vi.fn(() => of({ id: 'new' })) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: GroupService, useValue: service },
        { provide: AuthService, useValue: { currentUser: signal({ name: 'Léa' }) } },
      ],
    });
    const result = TestBed.runInInjectionContext(() => lobbyGuard({} as never, {} as never)) as Observable<UrlTree>;
    const url = TestBed.inject(Router).serializeUrl(await firstValueFrom(result));
    return { url, service };
  };

  it('ouvre le salon de mon propre groupe en priorité', async () => {
    const { url, service } = await run([{ id: 'ami', isOwner: false }, { id: 'moi', isOwner: true }]);
    expect(url).toBe('/groups/moi/live');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('sans groupe, crée le mien puis l’ouvre', async () => {
    const { url, service } = await run([]);
    expect(service.create).toHaveBeenCalledWith('Groupe de Léa');
    expect(url).toBe('/groups/new/live');
  });
});
