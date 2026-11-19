import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { filter, map, Observable, shareReplay } from 'rxjs';
import { Page } from '../models/page.model';
import { Track } from '../models/track.model';
import { User } from '../models/user.model';
import { UploadEvent } from '../models/upload-event.model';

/** Recherche, tri et filtre de la bibliothèque (paramètres facultatifs de `GET /api/tracks`). */
export interface TrackQuery {
  q?: string;
  sort?: 'recent' | 'title' | 'record';
  record?: 'with' | 'without' | null;
}

/** Encapsulates all HTTP operations for backing tracks. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly http = inject(HttpClient);
  /** Pochettes déjà téléchargées (ObjectURL), partagées par toutes les cartes et le lecteur. */
  private readonly covers = new Map<string, Observable<string>>();

  /**
   * Pagination serveur : chaque page correspond à une nouvelle requête HTTP.
   * Recherche, tri et filtre sont faits par le serveur, sur toute la bibliothèque.
   */
  list(page = 1, limit = 5, query: TrackQuery = {}) {
    const params: Record<string, string | number> = { page, limit };
    if (query.q) params['q'] = query.q;
    if (query.sort && query.sort !== 'recent') params['sort'] = query.sort;
    if (query.record) params['record'] = query.record;
    return this.http.get<Page<Track>>('/api/tracks', { params });
  }

  /** Playlist « Coups de cœur ». */
  favorites() {
    return this.http.get<Track[]>('/api/tracks/favorites');
  }

  /** Ajoute ou retire une piste des préférés ; le serveur renvoie le profil à jour. */
  setFavorite(id: string, favorite: boolean) {
    return favorite
      ? this.http.put<User>(`/api/tracks/${id}/favorite`, {})
      : this.http.delete<User>(`/api/tracks/${id}/favorite`);
  }

  /** Catalogue commun : les pistes de base, en lecture seule. */
  base() {
    return this.http.get<Track[]>('/api/tracks/base');
  }

  /**
   * Envoie le multipart `audio` + `title` et suit la progression.
   *
   * Avec `observe: 'events'` et `reportProgress: true`, l'Observable n'émet plus
   * une seule réponse finale mais une suite d'événements (`Sent`,
   * `UploadProgress`… puis `Response`). Le service les traduit en `UploadEvent`
   * pour que le composant n'ait pas à connaître les types internes d'Angular.
   * Les événements de progression nécessitent `withXhr()` (voir `main.ts`).
   */
  upload(file: File, title: string, duration: number | null = null, cover: File | null = null): Observable<UploadEvent> {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', title);
    if (duration) body.append('duration', String(Math.round(duration)));
    if (cover) body.append('cover', cover);
    return this.http
      .post<Track>('/api/tracks', body, { reportProgress: true, observe: 'events' })
      .pipe(
        map((event) => toUploadEvent(event)),
        filter((event): event is UploadEvent => event !== null),
      );
  }

  /** Télécharge l'audio en `Blob` : la requête passe par l'intercepteur JWT. */
  audio(id: string) {
    return this.http.get(`/api/tracks/${id}/audio`, {
      responseType: 'blob',
    });
  }

  /**
   * URL locale (ObjectURL) de la pochette : l'image passe par HttpClient pour porter le JWT,
   * et n'est téléchargée qu'une fois par session.
   */
  coverUrl(id: string): Observable<string> {
    let url = this.covers.get(id);
    if (!url) {
      url = this.http.get(`/api/tracks/${id}/cover`, { responseType: 'blob' }).pipe(
        map((blob) => URL.createObjectURL(blob)),
        shareReplay(1),
      );
      this.covers.set(id, url);
    }
    return url;
  }

  /** Ajoute ou remplace la pochette d'une de mes pistes. */
  setCover(id: string, file: File) {
    const body = new FormData();
    body.append('cover', file);
    this.covers.delete(id);
    return this.http.put<Track>(`/api/tracks/${id}/cover`, body);
  }

  /** Retire la pochette : la piste reprend sa pochette générée. */
  removeCover(id: string) {
    this.covers.delete(id);
    return this.http.delete<Track>(`/api/tracks/${id}/cover`);
  }

  /** Modifie le titre et/ou la description. Le backend renvoie la piste à jour (`200`), `400` ou `404`. */
  update(id: string, changes: Pick<Track, 'title' | 'description'>) {
    return this.http.patch<Track>(`/api/tracks/${id}`, changes);
  }

  /** Supprime une piste. Le backend vérifie le JWT et le propriétaire (`204` ou `404`). */
  remove(id: string) {
    return this.http.delete<void>(`/api/tracks/${id}`);
  }
}

/**
 * Traduit un `HttpEvent` en événement métier, ou `null` s'il est inutile à l'interface.
 * Le pourcentage vaut `loaded / total` : `total` peut être absent si le navigateur
 * ne connaît pas la taille du corps, on affiche alors 0 % jusqu'à la réponse.
 */
function toUploadEvent(event: HttpEvent<Track>): UploadEvent | null {
  if (event.type === HttpEventType.UploadProgress) {
    const percent = event.total ? Math.round((100 * event.loaded) / event.total) : 0;
    return { type: 'progress', percent };
  }
  if (event.type === HttpEventType.Response && event.body) {
    return { type: 'done', track: event.body };
  }
  return null;
}
