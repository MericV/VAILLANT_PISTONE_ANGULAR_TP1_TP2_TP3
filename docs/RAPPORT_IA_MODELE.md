# Rapport - Rockstar Academy

**Auteur :** Meric VAILLANT, M1 MIAGE SIRIS, UE Composants logiciels pour l'entreprise.

Rockstar Academy est une application d'entraînement à la guitare : on importe ses morceaux, on les écoute, puis on les **joue dans un jeu de rythme** façon Guitar Hero ou Fortnite Festival, seul ou en groupe. Le projet part du portail « Guitar Practice Cloud » des TP1 à TP3, puis a été prolongé en jeu complet.

**Stack :** Angular 22 (standalone, Signals, Material, three.js) · Express 5 · Mongoose 9 · Multer · JWT · MongoDB Atlas · Vitest et `node:test`.

## 1. Fonctionnalités

**Accueil et navigation**
- Accueil public : une guitare 3D (rendu Blender) animée au défilement, et des tuiles vers chaque rubrique.
- Barre de navigation en verre ; « Jouer » ouvre directement le salon de son groupe.
- Ciel étoilé animé en CSS sur les pages sans décor, fixe si l'utilisateur a demandé à réduire les animations.

**Compte**
- Inscription et connexion validées, puis déconnexion.
- Un JWT expiré (`401`) déconnecte et renvoie vers `/login`.
- Profil : nom modifiable, solde de points, identifiant d'ami `#xxxx` et avatar 3D orientable à la souris.

**Bibliothèque (Backing tracks)**
- Liste paginée côté serveur : 5 pistes, puis « Voir plus ».
- Recherche par titre, tri (récent, titre, record) et filtre avec ou sans record.
- Catalogue commun de pistes de base, en lecture seule, et favoris.
- Import par glisser-déposer : plusieurs fichiers MP3, WAV, OGG ou M4A de 25 Mo au plus, validés avant l'envoi, avec une vraie barre de progression.
- Modification du titre, de la description et de la pochette ; suppression avec confirmation.
- Lecteur flottant : piste précédente ou suivante, volume, égaliseur animé, vue plein écran. L'audio est lu de façon authentifiée (`Blob` + `ObjectURL`).

**Jeu**
- Partition générée automatiquement depuis le son : les attaques deviennent des notes, la hauteur choisit le couloir, et une note qui dure devient longue.
- 4 instruments (lead, basse, batterie, chant) et 4 difficultés (4 à 5 couloirs, accords en Difficile et Expert).
- Combo, multiplicateur, étoiles de 0 à 5, et Overdrive qui double les points.
- Touches : `A`/`Q` `Z`/`W` `E` `R` `T`, `Espace` et `Échap`.
- Décor de scène dont les projecteurs battent sur la musique.

**Progression**
- Meilleur score gardé par morceau, difficulté et instrument ; chaque partie rapporte des points.
- Classement général, calculé par le serveur et filtrable par difficulté.
- Boutique : 10 avatars 3D et des fonds de scène (garage, bar, club, néon, stade…) achetés avec les points.

**Multijoueur**
- Amis ajoutés par leur identifiant `#xxxx`, amitié réciproque.
- Groupes de 4 au plus : on crée le sien ou on en rejoint un avec un code, et les membres partagent leurs morceaux.
- Parties en direct : un salon où chacun choisit instrument, difficulté et « prêt », puis l'hôte lance. Tout le monde démarre ensemble (Server-Sent Events, horloge du serveur), et les scores du groupe s'affichent en direct.

## 2. Architecture et sécurité

```text
composant → service → HttpClient → intercepteur JWT → proxy /api → Express → Mongoose → MongoDB Atlas
                                                                    └→ Multer → fichiers audio sur disque
```

- **Front :** les composants n'appellent jamais `HttpClient`, ils passent par 5 services. Les pages portent l'état (Signals), les composants de présentation n'ont que des `input()` et `output()`.
- **Back :** toutes les routes sont décrites dans [`API_CONTRACT.md`](../API_CONTRACT.md). L'état des parties en direct est en mémoire ([`live.js`](../backend/src/live.js), fonctions pures testées).
- **Sécurité :** les guards Angular ne font que du confort de navigation. Le backend vérifie le JWT et le propriétaire de chaque ressource, et aucun secret n'est versionné.

## 3. Usage de l'IA

- **Assistants :** GitHub Copilot pour le TP1 et le début du TP2, puis Claude Code avec le modèle Claude Opus 5.5.
- **Cadre :** [`DOCTRINE.md`](DOCTRINE.md) (règles Angular, sécurité, tests, définition de « terminé ») et le skill officiel Angular.
- **Jamais dans un prompt :** l'URI MongoDB, le secret JWT ni un mot de passe.

| # | Mission | Proposé par l'IA | Rejeté ou corrigé par moi | Preuve |
|---|---|---|---|---|
| 1 | TP1 : connexion, inscription | trajet de la connexion, validation, états de chargement | URI Atlas corrigée à la main, sans la donner à l'IA ; Node mis à jour pour Angular 22 | [200](preuves/tp1/image.png), [401](preuves/tp1/image-1.png), [schéma du flux](SCHEMA_FLUX_TP1.md) |
| 2 | TP1 : déconnexion, `401`, profil | `logout()`, interception du `401`, profil en Signals | appel `HttpClient` direct dans le composant refusé (passer par `AuthService`) | [PUT /users/me](preuves/tp1/image-2.png) |
| 3 | TP2 : pagination et cards | `HttpParams`, Paginator, `TrackCard` en `input()` / `output()` | garde « en chargement » remplacée par l'annulation de la requête précédente ; pas de filtre sur la seule page affichée | [page 1](preuves/tp2/Capture%20d’écran%202026-09-24%20à%2009.11.36.png), [page 2](preuves/tp2/Capture%20d’écran%202026-09-24%20à%2009.14.21.png) |
| 4 | TP2 : upload et lecture | validation locale, `FormData`, `Blob` + `ObjectURL` | URL de l'API dans `<audio src>` refusée : le JWT n'y passe pas | [lecture](preuves/tp2/Capture%20d’écran%202026-09-24%20à%2009.52.50.png), [refus 25 Mo](preuves/tp2/Capture%20d’écran%202026-09-24%20à%2009.44.15.png) |
| 5 | TP3 : suppression et progression | confirmation, `deletingId`, `reportProgress` | progression bloquée à 0 % (`fetch`), corrigée par `withXhr()` ; bouton bloqué après une erreur | [204](preuves/tp3/suppression.png), [404](preuves/tp3/uppression-404.png), [16 %](preuves/tp3/Capture%20d’écran%202026-09-24%20à%2009.41.21.png) |
| 6 | TP3 : tests | Vitest + `HttpTestingController`, tests zoneless, sécurité du back | style global qui écrasait Material ; specs compilées par `ng build` ; pas de test d'intégration avec une vraie base | 38 tests front et 7 back au 24/09 |
| 7 | Jeu, progression, multijoueur | génération de partition (FFT), rendu en perspective, routes scores, boutique, amis et groupes, Server-Sent Events, rendus Blender | état des salons gardé en mémoire (suffisant ici, Redis s'il fallait plusieurs serveurs) | commits du jeu ; `API_CONTRACT.md` |
| 8 | Nom, accueil public, fond, rangement | accueil sans connexion, fond depuis `AppComponent`, documents rangés dans `docs/` | guitariste 3D jugé peu réaliste, puis vidéo Pexels trop agitée, d'où un ciel en CSS ; `frontend-starter/` et `API_CONTRACT.md` non déplacés | commits `1dec117`, `387ef77` |

**Ce que je sais expliquer sans l'IA :**
- le trajet d'une requête du composant jusqu'à MongoDB ;
- la conversion `pageIndex` (à partir de 0) / `page` (à partir de 1), et pourquoi la dernière page demandée gagne ;
- pourquoi `<audio src>` n'envoie pas le JWT, et pourquoi révoquer une `ObjectURL` ;
- `withXhr()` et le calcul `loaded / total` ;
- pourquoi le guard ne protège rien côté serveur (`findOneAndDelete({ _id, ownerId })`) ;
- la détection d'attaques pour générer la partition ;
- le principe des Server-Sent Events et la correction du décalage d'horloge.

## 4. Tests et état au 27/11/2026

Aucun test n'a besoin du backend ni de MongoDB : les appels HTTP sont simulés par `HttpTestingController`.

Les tests couvrent :
- les 5 services, l'intercepteur et les guards ;
- les composants (cards, upload, bibliothèque, jeu, classement, boutique, groupes, salon) et la génération de partition ;
- côté back : les `401` et `400`, et la logique du salon.

**Résultats :**
- build réussi ;
- backend : **50 tests réussis sur 50** ;
- frontend : **151 tests réussis sur 152**.

Le test en échec (`groups-page.spec.ts`, ajout d'un ami) échouait déjà avant la mission 8, et reste à corriger.

**Limites :**
- les parties en direct ne survivent pas à un redémarrage du serveur ;
- l'affichage du ciel étoilé et de l'accueil public reste à vérifier dans le navigateur, avec des captures.
