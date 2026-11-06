/**
 * Catalogue de la boutique : avatars et fonds de scène. Il vit uniquement côté serveur :
 * c'est lui qui fixe les prix. Les réponses de l'API contiennent l'article résolu
 * (emoji, couleurs), le frontend n'a donc pas de seconde copie de ces listes à maintenir.
 */
/**
 * Avatars : objets de musicien rendus en 3D dans Blender (blender/avatars.blend). Le frontend
 * affiche `public/avatars/<id>.webp`, une bande de 24 vues qui tourne au survol. Les
 * identifiants historiques (rocker, dragon…) sont conservés : les achats restent valables.
 */
export const AVATARS = [
  { id: "rocker", name: "Médiator", emoji: "🎸", color: "#8f5bff", price: 0 },
  { id: "drummer", name: "Baguettes", emoji: "🥁", color: "#ff4f7b", price: 150 },
  { id: "singer", name: "Micro vintage", emoji: "🎤", color: "#4dc3ff", price: 250 },
  { id: "keys", name: "Synthé", emoji: "🎹", color: "#4dffa6", price: 400 },
  { id: "fox", name: "Casque studio", emoji: "🎧", color: "#ff9a3d", price: 600 },
  { id: "alien", name: "Pédale fuzz", emoji: "🎛️", color: "#7dff6a", price: 800 },
  { id: "robot", name: "Ampli", emoji: "🔊", color: "#9bb7e8", price: 1000 },
  { id: "dragon", name: "Strat noire", emoji: "🎸", color: "#ff3b2f", price: 1500 },
  { id: "unicorn", name: "Flying V", emoji: "⚡", color: "#ff7ad9", price: 2000 },
  { id: "skull", name: "Les Paul dorée", emoji: "👑", color: "#ffd34d", price: 3000 },
];

export const STARTER_AVATAR = "rocker";

/** Avatar du catalogue, ou celui de départ si l'identifiant n'existe plus. */
export function avatarById(id) {
  return AVATARS.find((avatar) => avatar.id === id) ?? AVATARS[0];
}

/**
 * Fonds de scène affichés derrière la piste, dans le lobby et dans l'aperçu de la boutique.
 * Chaque fond est une scène rendue dans Blender (`image`, servie par le frontend). Les
 * identifiants historiques (caustics, aurora…) sont conservés : les achats restent valables.
 * Les couleurs (`stage`, `deep`, `spotA`, `spotB`) servent de décor pendant le chargement.
 */
export const BACKGROUNDS = [
  { id: "stage", name: "Garage de répétition", image: "backgrounds/garage.webp", stage: "#3a2a10", deep: "#0d0905", spotA: "#ffb347", spotB: "#ffe0a3", price: 0 },
  { id: "caustics", name: "Bar blues", image: "backgrounds/bar.webp", stage: "#3d2410", deep: "#0e0804", spotA: "#ff9a3d", spotB: "#ffd34d", price: 400 },
  { id: "aurora", name: "Club enfumé", image: "backgrounds/club.webp", stage: "#0b2a2a", deep: "#020a0a", spotA: "#4dffa6", spotB: "#2ee6ff", price: 800 },
  { id: "flux", name: "Scène néon", image: "backgrounds/neon.webp", stage: "#2a1438", deep: "#08040e", spotA: "#ff3fb4", spotB: "#2ee6ff", price: 1000 },
  { id: "rock", name: "Concert rock", image: "backgrounds/rock.webp", stage: "#3a0f3d", deep: "#07030a", spotA: "#ff3fb4", spotB: "#ffc46b", price: 1200 },
  { id: "lasers", name: "Show laser", image: "backgrounds/lasers.webp", stage: "#0c2a14", deep: "#020a04", spotA: "#4dff6a", spotB: "#2ee6ff", price: 1500 },
  { id: "dots", name: "Concert sur le toit", image: "backgrounds/toit.webp", stage: "#3a3448", deep: "#0a0910", spotA: "#ffb38a", spotB: "#ffd9a3", price: 1800 },
  { id: "sparks", name: "Festival pyro", image: "backgrounds/fest.webp", stage: "#3a1a04", deep: "#0a0401", spotA: "#ff8a1f", spotB: "#ffd34d", price: 2500 },
  { id: "ascii", name: "Stade", image: "backgrounds/stade.webp", stage: "#1a1430", deep: "#05040a", spotA: "#ff3fb4", spotB: "#8fa8ff", price: 3000 },
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
