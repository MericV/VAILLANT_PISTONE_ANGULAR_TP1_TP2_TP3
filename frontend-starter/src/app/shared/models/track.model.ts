/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
  title: string;
  /** Facultatif : absent des pistes importées avant l'ajout du champ. */
  description?: string;
  originalName: string;
  mimeType: string;
  size: number;
  /** Durée en secondes, mesurée à l'import ; `null` (ou absente) pour les pistes plus anciennes. */
  duration?: number | null;
  createdAt: string;
  /** Vrai si la piste a une pochette d'album (image servie par `GET /api/tracks/:id/cover`). */
  cover?: boolean;
  /** Piste du catalogue commun (lecture seule, ouverte à tous les joueurs). */
  base?: boolean;
}
