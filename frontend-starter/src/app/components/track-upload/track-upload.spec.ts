import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { TrackUploadComponent } from './track-upload';
import { TrackService } from '../../shared/services/track.service';
import { UploadEvent } from '../../shared/models/upload-event.model';
import { Track } from '../../shared/models/track.model';

const track: Track = {
  id: 'track-1',
  title: 'Practice',
  originalName: 'practice.mp3',
  mimeType: 'audio/mpeg',
  size: 5,
  createdAt: '2026-09-24T08:00:00.000Z',
};

/**
 * Test de composant : TrackService est remplacé par un double.
 * Un Subject permet d'émettre les événements de progression « à la main »
 * et d'observer l'état intermédiaire du composant.
 */
describe('TrackUploadComponent', () => {
  let fixture: ComponentFixture<TrackUploadComponent>;
  let component: TrackUploadComponent;
  let events$: Subject<UploadEvent>;
  let service: { upload: ReturnType<typeof vi.fn> };

  const mp3 = () => new File(['audio'], 'practice.mp3', { type: 'audio/mpeg' });
  const select = (file: File) =>
    component.choose({ target: { files: [file] } } as unknown as Event);
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(async () => {
    events$ = new Subject<UploadEvent>();
    service = { upload: vi.fn(() => events$.asObservable()) };
    TestBed.configureTestingModule({
      imports: [TrackUploadComponent],
      providers: [{ provide: TrackService, useValue: service }],
    });
    fixture = TestBed.createComponent(TrackUploadComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('refuse un type de fichier invalide sans appel HTTP', async () => {
    select(new File(['text'], 'notes.txt', { type: 'text/plain' }));
    component.upload();
    await fixture.whenStable();

    expect(service.upload).not.toHaveBeenCalled();
    expect(text()).toContain('Format refusé');
  });

  it('refuse un fichier de plus de 25 Mo sans appel HTTP', () => {
    const big = mp3();
    Object.defineProperty(big, 'size', { value: 25 * 1024 * 1024 + 1 });
    select(big);
    component.upload();

    expect(service.upload).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('25 Mo');
  });

  it('affiche la progression et désactive le bouton pendant l’envoi', async () => {
    select(mp3());
    component.title.setValue('Practice');
    component.upload();
    events$.next({ type: 'progress', percent: 42 });
    await fixture.whenStable();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
    const progress = (fixture.nativeElement as HTMLElement).querySelector('progress') as HTMLProgressElement;
    expect(component.state()).toEqual({ status: 'uploading', percent: 42 });
    expect(progress.value).toBe(42);
    expect(text()).toContain('42 %');
    expect(button.disabled).toBe(true);
    expect(component.title.disabled).toBe(true);
    expect(service.upload).toHaveBeenCalledWith(expect.any(File), 'Practice', null, null);
  });

  it('empêche une seconde soumission pendant l’envoi', () => {
    select(mp3());
    component.upload();
    component.upload();

    expect(service.upload).toHaveBeenCalledTimes(1);
  });

  it('passe en succès, vide le formulaire et émet uploaded', async () => {
    const uploaded = vi.fn();
    component.uploaded.subscribe(uploaded);
    select(mp3());
    component.title.setValue('Practice');
    component.upload();

    events$.next({ type: 'progress', percent: 100 });
    events$.next({ type: 'done', track });
    events$.complete();
    await fixture.whenStable();

    expect(component.state()).toEqual({ status: 'success', track });
    expect(uploaded).toHaveBeenCalledWith(track);
    expect(component.title.value).toBe('');
    expect(component.files()).toEqual([]);
    expect(text()).toContain('Piste « Practice » envoyée.');
  });

  it('passe en erreur et affiche le message du serveur', async () => {
    select(mp3());
    component.upload();
    events$.error(
      new HttpErrorResponse({ status: 400, error: { message: 'Format audio non accepté' } }),
    );
    await fixture.whenStable();

    expect(component.state()).toEqual({ status: 'error', message: 'Format audio non accepté' });
    expect(component.title.enabled).toBe(true);
    expect(text()).toContain('Format audio non accepté');
  });

  it('envoie plusieurs fichiers l’un après l’autre, chacun sous son nom', async () => {
    const uploaded = vi.fn();
    component.uploaded.subscribe(uploaded);
    const second = new Subject<UploadEvent>();
    service.upload.mockReturnValueOnce(events$.asObservable()).mockReturnValueOnce(second.asObservable());
    component.choose({ target: { files: [mp3(), new File(['b'], 'funk.wav', { type: 'audio/wav' })] } } as unknown as Event);
    component.title.setValue('ignoré'); // un titre ne vaut que pour un fichier seul
    component.upload();

    expect(service.upload).toHaveBeenCalledTimes(1);
    expect(service.upload).toHaveBeenLastCalledWith(expect.any(File), 'practice.mp3', null, null);
    expect(component.current()).toBe(1);

    events$.next({ type: 'done', track });
    expect(service.upload).toHaveBeenLastCalledWith(expect.any(File), 'funk.wav', null, null);
    expect(component.current()).toBe(2);

    second.next({ type: 'done', track: { ...track, title: 'funk.wav' } });
    await fixture.whenStable();

    expect(uploaded).toHaveBeenCalledTimes(2);
    expect(component.state()).toEqual({ status: 'success', track: { ...track, title: 'funk.wav' } });
    expect(component.files()).toEqual([]);
  });

  it('joint la pochette choisie à un fichier seul, et refuse une image invalide', () => {
    select(mp3());
    (component as unknown as { chooseCover(e: Event): void }).chooseCover({ target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })], value: '' } } as unknown as Event);
    expect(component.errorMessage()).toContain('Pochette refusée');

    const art = new File(['img'], 'pochette.jpg', { type: 'image/jpeg' });
    (component as unknown as { chooseCover(e: Event): void }).chooseCover({ target: { files: [art], value: '' } } as unknown as Event);
    component.upload();

    expect(service.upload).toHaveBeenCalledWith(expect.any(File), 'practice.mp3', null, art);
  });
});
