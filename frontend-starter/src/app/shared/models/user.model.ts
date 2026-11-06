/** Avatar du catalogue de la boutique (le serveur fixe le prix et l'apparence). */
export interface Avatar {
  id: string;
  name: string;
  emoji: string;
  color: string;
  price: number;
}

/**
 * Fond de scène affiché derrière la piste : une scène rendue dans Blender (`image`, chemin
 * dans public/), dont les lumières battent sur la musique (voir StageLightsComponent).
 * Les couleurs servent de décor pendant le chargement, ou quand `image` est `null`.
 */
export interface Background {
  id: string;
  name: string;
  image: string | null;
  stage: string;
  deep: string;
  spotA: string;
  spotB: string;
  price: number;
}

/** Rayons de la boutique. */
export type Shelf = 'avatars' | 'backgrounds';

/** Public user data returned by the API. */
export interface User {
  id: string;
  name: string;
  email: string;
  /** Identifiant à partager pour être ajouté en ami (4 caractères, affiché « #K7P2 »). */
  tag: string;
  createdAt: string;
  /** Points gagnés en jouant, à dépenser dans la boutique. */
  coins: number;
  /** Avatar affiché. */
  avatar: Avatar;
  /** Identifiants des avatars possédés. */
  avatars: string[];
  /** Fond de scène affiché pendant les parties. */
  background: Background;
  /** Identifiants des fonds possédés. */
  backgrounds: string[];
}
