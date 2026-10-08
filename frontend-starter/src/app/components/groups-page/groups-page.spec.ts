import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { GroupsPageComponent } from './groups-page';
import { GroupService } from '../../shared/services/group.service';
import { Group } from '../../shared/models/group.model';

const avatar = { id: 'rocker', name: 'Rockeur', emoji: '🎸', color: '#8f5bff', price: 0 };
const group = (id: string, name: string): Group => ({
  id, name, code: 'K7QF2M', isOwner: true, members: [{ id: 'u1', name: 'Léa', avatar, isOwner: true }],
});

describe('GroupsPageComponent', () => {
  let fixture: ComponentFixture<GroupsPageComponent>;
  let component: GroupsPageComponent;
  let service: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; join: ReturnType<typeof vi.fn>; leave: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    service = { list: vi.fn(() => of([group('g1', 'Les Riffs')])), create: vi.fn(), join: vi.fn(), leave: vi.fn() };
    snackBar = { open: vi.fn() };
    TestBed.configureTestingModule({
      imports: [GroupsPageComponent],
      providers: [provideRouter([]), { provide: GroupService, useValue: service }, { provide: MatSnackBar, useValue: snackBar }],
    });
    fixture = TestBed.createComponent(GroupsPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  it('liste mes groupes avec leur code et un lien vers le salon', () => {
    expect(host().textContent).toContain('Les Riffs');
    expect(host().textContent).toContain('K7QF2M');
    expect(host().querySelector('a.go')?.getAttribute('href')).toBe('/groups/g1/live');
  });

  it('crée un groupe et annonce son code', async () => {
    service.create.mockReturnValue(of(group('g2', 'Les Accords')));
    component.name.setValue('  Les Accords ');

    component.create();
    await fixture.whenStable();

    expect(service.create).toHaveBeenCalledWith('Les Accords');
    expect(component.groups()[0].id).toBe('g2');
    expect(snackBar.open.mock.calls[0][0]).toContain('K7QF2M');
  });

  it('refuse un code mal formé sans appeler le serveur', () => {
    component.code.setValue('abc');
    component.join();
    expect(service.join).not.toHaveBeenCalled();
  });

  it('rejoint un groupe avec un code en minuscules et affiche le refus du serveur', () => {
    service.join.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Groupe complet (4 membres)' } })));
    component.code.setValue('k7qf2m');

    component.join();

    expect(service.join).toHaveBeenCalledWith('K7QF2M');
    expect(snackBar.open).toHaveBeenCalledWith('Groupe complet (4 membres)', 'Fermer', { duration: 5000 });
    expect(component.busy()).toBeNull();
  });

  it('quitte un groupe après confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    service.leave.mockReturnValue(of(undefined));

    component.leave(component.groups()[0]);

    expect(service.leave).toHaveBeenCalledWith('g1');
    expect(component.groups()).toEqual([]);
  });
});
