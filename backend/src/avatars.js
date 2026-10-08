/**
 * Catalogue des avatars de la boutique. Il vit uniquement côté serveur : c'est lui qui
 * fixe les prix. Les réponses de l'API contiennent l'avatar résolu (emoji, couleur),
 * le frontend n'a donc pas de seconde copie de cette liste à maintenir.
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
 * Points gagnés à la fin d'une partie : un point pour 100 de score, plus 10 par étoile.
 * Une partie moyenne (≈ 20 000 points, 3 étoiles) rapporte donc ≈ 230 points.
 */
export function coinsFor(score, stars) {
  return Math.floor(score / 100) + 10 * stars;
}
