/**
 * Règles de validation d'un fichier audio, alignées sur le backend
 * (`backend/src/app.js` : ensemble `allowed` et `MAX_FILE_SIZE`).
 *
 * Cette validation frontend évite un aller-retour inutile et donne un message
 * immédiat. Elle ne remplace jamais la validation Multer côté serveur : un
 * client peut toujours contourner Angular et appeler l'API directement.
 */
export const ALLOWED_AUDIO_TYPES: ReadonlySet<string> = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
]);

/** Taille maximale acceptée par le backend : 25 Mo. */
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024;

/** Retourne un message d'erreur lisible, ou `null` si le fichier est acceptable. */
export function validateAudioFile(file: File): string | null {
  if (!ALLOWED_AUDIO_TYPES.has(file.type)) {
    return 'Format refusé. Utilisez un fichier MP3, WAV, OGG ou M4A.';
  }
  if (file.size > MAX_AUDIO_SIZE) {
    return 'Le fichier ne doit pas dépasser 25 Mo.';
  }
  return null;
}

/** Traduit un type MIME en libellé court affiché dans les cards. */
export function audioFormatLabel(mimeType: string): string {
  switch (mimeType) {
    case 'audio/mpeg':
      return 'MP3';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'WAV';
    case 'audio/ogg':
      return 'OGG';
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'M4A';
    default:
      return mimeType;
  }
}

/** Durée lisible « m:ss » (ou « h:mm:ss »), « — » si inconnue. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  const mmss = `${Math.floor((s % 3600) / 60)}:${String(s % 60).padStart(2, '0')}`;
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mmss.padStart(5, '0')}` : mmss;
}

/**
 * Mesure la durée d'un fichier audio dans le navigateur, sans l'envoyer : un élément
 * <audio> lit seulement ses métadonnées. `null` si le navigateur ne sait pas le lire.
 */
export function measureDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof Audio === 'undefined' || !URL.createObjectURL) return resolve(null);
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/**
 * Teinte (0–359) de la pochette générée d'une piste, stable pour un identifiant.
 * Hachage FNV-1a : deux identifiants presque identiques (ObjectId) donnent des teintes éloignées.
 */
export function trackHue(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  // Brassage final (MurmurHash3) : sans lui, un seul caractère d'écart ne fait qu'alterner deux teintes.
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) % 360;
}

/** Pochettes acceptées par le backend : JPEG, PNG ou WebP de 3 Mo au plus. */
export function validateCover(file: File): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Pochette refusée : choisissez une image JPEG, PNG ou WebP.';
  if (file.size > 3 * 1024 * 1024) return 'La pochette ne doit pas dépasser 3 Mo.';
  return null;
}
