# Contrat HTTP - TP1

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title` | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| PATCH | `/tracks/:id` | `{title?, description?}` + JWT | `200 Track` |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) ; supprime aussi les records du morceau |
| POST | `/scores` | `{trackId, difficulty, score, stars, accuracy, maxCombo}` + JWT | `201 {best: true, record}` ou `200 {best: false, record}` |
| GET | `/scores/me` | JWT | `200 ScoreRecord[]` |
| GET | `/scores/leaderboard?difficulty=&limit=20` | JWT | `200 LeaderboardEntry[]` |

`Track` contient `id`, `ownerId`, `title`, `description` (chaîne vide par défaut), `originalName`, `mimeType`, `size` et `createdAt`. `PATCH` accepte un titre non vide (120 caractères max) et une description (500 max) ; au moins un des deux est requis.

`ScoreRecord` contient `id`, `trackId`, `difficulty` (`easy`, `medium`, `hard`, `expert`), `score`, `stars` (0 à 5), `accuracy` (0 à 100), `maxCombo` et `updatedAt`. Seul le meilleur score par joueur, morceau et difficulté est conservé. `POST /scores` exige des entiers positifs (`400` sinon) et un morceau appartenant au joueur (`404` sinon).

`LeaderboardEntry` contient `rank`, `name`, `total` (somme des records), `stars`, `played` et `isMe` (vrai pour le joueur connecté). `difficulty` est facultatif (toutes difficultés par défaut, `400` si inconnue) ; `limit` va de 1 à 50.

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`. Formats acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé.
