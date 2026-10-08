/** Avatar du catalogue de la boutique (le serveur fixe le prix et l'apparence). */
export interface Avatar {
  id: string;
  name: string;
  emoji: string;
  color: string;
  price: number;
}

/** Public user data returned by the API. */
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  /** Points gagnés en jouant, à dépenser dans la boutique. */
  coins: number;
  /** Avatar affiché. */
  avatar: Avatar;
  /** Identifiants des avatars possédés. */
  avatars: string[];
}
