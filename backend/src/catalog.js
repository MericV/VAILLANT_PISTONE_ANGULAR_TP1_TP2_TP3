/**
 * Catalogue de la boutique : avatars et fonds de scène. Il vit uniquement côté serveur :
 * c'est lui qui fixe les prix. Les réponses de l'API contiennent l'article résolu
 * (emoji, couleurs), le frontend n'a donc pas de seconde copie de ces listes à maintenir.
 */
export const AVATARS = [
  { id: "rocker", name: "Rockeur", emoji: "🎸", color: "#8f5bff", price: 0 },
  { id: "drummer", name: "Batteuse", emoji: "🥁", color: "#ff4f7b", price: 150 },
  { id: "singer", name: "Chanteur", emoji: "🎤", color: "#4dc3ff", price: 250 },
  { id: "keys", name: "Claviériste", emoji: "🎹", color: "#4dffa6", price: 400 },
  { id: "fox", name: "Renard", emoji: "🦊", color: "#ff9a3d", price: 600 },
  { id: "alien", name: "Alien", emoji: "👽", color: "#7dff6a", price: 800 },
  { id: "robot", name: "Robot", emoji: "🤖", color: "#9bb7e8", price: 1000 },
  { id: "dragon", name: "Dragon", emoji: "🐉", color: "#ff3b2f", price: 1500 },
  { id: "unicorn", name: "Licorne", emoji: "🦄", color: "#ff7ad9", price: 2000 },
  { id: "skull", name: "Métal", emoji: "💀", color: "#ffd34d", price: 3000 },
];

export const STARTER_AVATAR = "rocker";

/** Avatar du catalogue, ou celui de départ si l'identifiant n'existe plus. */
export function avatarById(id) {
  return AVATARS.find((avatar) => avatar.id === id) ?? AVATARS[0];
}

/**
 * Fonds de scène affichés derrière la piste pendant une partie. Chaque fond est un dégradé
 * de deux couleurs (`stage` en haut, `deep` en bas) éclairé par deux projecteurs (`spotA`, `spotB`) :
 * pas d'image à télécharger, le navigateur le dessine en CSS.
 */
export const BACKGROUNDS = [
  { id: "stage", name: "Scène néon", stage: "#2b1468", deep: "#140a33", spotA: "#ff3fb4", spotB: "#2ee6ff", price: 0 },
  { id: "sunset", name: "Coucher de soleil", stage: "#6b1d3a", deep: "#1f0b1a", spotA: "#ff8a1f", spotB: "#ffd34d", price: 300 },
  { id: "ocean", name: "Abysses", stage: "#0c3a5c", deep: "#04121f", spotA: "#2ee6ff", spotB: "#4d7cff", price: 400 },
  { id: "forest", name: "Forêt néon", stage: "#0f4a32", deep: "#04160f", spotA: "#7dff6a", spotB: "#2ee6ff", price: 500 },
  { id: "lava", name: "Coulée de lave", stage: "#5c1408", deep: "#190402", spotA: "#ff3b2f", spotB: "#ff9a3d", price: 800 },
  { id: "galaxy", name: "Galaxie", stage: "#1b0f4a", deep: "#05030f", spotA: "#b48cff", spotB: "#ff7ad9", price: 1200 },
  { id: "aurora", name: "Aurore boréale", stage: "#0b3a3a", deep: "#031012", spotA: "#4dffa6", spotB: "#b48cff", price: 1600 },
  { id: "gold", name: "Salle d'or", stage: "#4a3708", deep: "#140f02", spotA: "#ffd34d", spotB: "#ffffff", price: 2500 },
];

export const STARTER_BACKGROUND = "stage";

export function backgroundById(id) {
  return BACKGROUNDS.find((background) => background.id === id) ?? BACKGROUNDS[0];
}

/**
 * Rayons de la boutique. Chaque rayon décrit son catalogue et les deux champs de
 * l'utilisateur concernés : la liste des articles possédés et l'article utilisé.
 * Les routes d'achat et d'équipement sont écrites une seule fois pour tous les rayons.
 */
export const SHOP = {
  avatars: { catalog: AVATARS, owned: "avatars", equipped: "avatar", starter: STARTER_AVATAR, label: "Avatar" },
  backgrounds: { catalog: BACKGROUNDS, owned: "backgrounds", equipped: "background", starter: STARTER_BACKGROUND, label: "Fond" },
};

/**
 * Points gagnés à la fin d'une partie : un point pour 100 de score, plus 10 par étoile.
 * Une partie moyenne (≈ 20 000 points, 3 étoiles) rapporte donc ≈ 230 points.
 */
export function coinsFor(score, stars) {
  return Math.floor(score / 100) + 10 * stars;
}
