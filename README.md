# Guitar Practice Cloud — Guithar Hero

Projet Angular 22 / Express / MongoDB Atlas réalisé dans le cadre des TP1 à TP3
du M1 MIAGE SIRIS (UE Composants logiciels pour l'entreprise, Programmation Web).

**Binôme :** Meric VAILLANT et Noa PISTONE.

L'application part du portail « Guitar Practice Cloud » fourni (bibliothèque de morceaux
personnels) et le prolonge en **Guithar Hero**, un jeu de rythme inspiré de Fortnite
Festival, joué sur ses propres morceaux.

## Fonctionnalités

### TP1 à TP3 (sujet)

| TP | Réalisé |
|---|---|
| TP1 | Connexion, inscription, déconnexion, profil réactif (Signals), intercepteur JWT, gestion du `401` |
| TP2 | Bibliothèque paginée (Angular Material), cards, upload `multipart` validé, lecture audio authentifiée (`Blob` + `ObjectURL`) |
| TP3 | Suppression avec confirmation, barre de progression d'upload, tests frontend et backend |

Le détail de chaque mission, les preuves Network et l'usage de l'IA sont dans
[RAPPORT_IA_MODELE.md](RAPPORT_IA_MODELE.md).

### Guithar Hero (extension)

- **Jeu :** jusqu'à 5 couloirs, notes longues, étoiles, difficulté réglable. Les partitions sont générées depuis le morceau, par instrument (lead, basse, batterie, chant).
- **Progression :** scores en ligne, classement général, points, avatars et boutique (fonds de scène animés en WebGL).
- **Multijoueur :** amis (identifiant `#xxxx`), groupes et parties en direct synchronisées. Le créateur du groupe est l'hôte, et le serveur pousse l'état aux joueurs par Server-Sent Events.

Touches de jeu : `A`/`Q`, `Z`/`W`, `E`, `R`, `T` pour les couloirs (AZERTY ou QWERTY),
`Espace` pour l'Overdrive, `Échap` pour arrêter la partie.

## Stack

- **Frontend :** Angular 22 (standalone, Signals, `input()` / `output()`), Angular Material, Vitest.
- **Backend :** Node.js, Express 5, Mongoose 9, Multer, JWT (`jsonwebtoken`, `bcryptjs`), `node:test`.
- **Base de données :** MongoDB Atlas.

## Installation

Prérequis : Node.js 22 ou plus récent (testé avec la v26), un cluster MongoDB Atlas
(voir [ATLAS_SETUP.md](ATLAS_SETUP.md)) et Git.

### 1. Backend

```bash
cd backend
cp .env.example .env   # renseigner MONGODB_URI et JWT_SECRET
npm install
npm start              # http://localhost:3000
```

Si Atlas refuse la connexion, autoriser son adresse IP dans *Network Access*.

### 2. Frontend

Dans un second terminal :

```bash
cd frontend-starter
npm install
npm start              # http://localhost:4200
```

Le proxy Angular (`proxy.conf.json`) redirige `/api` vers `http://localhost:3000`.
Compte de démonstration : `demo@example.com` / `Demo1234!`.

## Tests et build

```bash
cd frontend-starter && npm test && npm run build
cd backend && npm test
```

Aucun test n'a besoin du backend ni de MongoDB : les appels HTTP sont simulés
avec `HttpTestingController`, et les tests backend s'arrêtent avant tout accès à la base.

## Structure

```text
backend/              API Express (src/app.js), état des parties en direct (src/live.js), tests
frontend-starter/     Application Angular
  src/app/components/   pages (tracks, game, leaderboard, shop, groups, live…) et composants
  src/app/shared/       services HTTP, intercepteur, guard, modèles, pipes
preuves/              Captures Network des TP1 à TP3
ajout-specification/  Spécifications d'évolutions possibles
```

## Documents

- [SUJET_ETUDIANT_TP1.md](SUJET_ETUDIANT_TP1.md), [TP2](SUJET_ETUDIANT_TP2.md), [TP3](SUJET_ETUDIANT_TP3.md) : sujets.
- [API_CONTRACT.md](API_CONTRACT.md) : routes, authentification et formats échangés.
- [SCHEMA_FLUX_TP1.md](SCHEMA_FLUX_TP1.md) : trajet d'une requête de connexion.
- [RAPPORT_IA_MODELE.md](RAPPORT_IA_MODELE.md) : rapport d'usage de l'IA, mission par mission.
- [DOCTRINE.md](DOCTRINE.md) : règles d'architecture et de qualité suivies par le binôme et par l'assistant.

## Sécurité

Aucun secret n'est versionné : `backend/.env` est ignoré par Git, et `.env.example` ne
contient que des valeurs fictives. Le JWT est masqué sur les captures. Le contrôle d'accès
repose sur le backend (JWT + propriétaire de la ressource), et non sur le guard Angular.
