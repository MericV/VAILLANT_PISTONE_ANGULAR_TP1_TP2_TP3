# Rapport d'usage de l'IA - TP1 à TP3

Ce document est mis à jour après chaque séance de travail avec l'assistant IA. Les secrets, mots de passe et JWT ne sont jamais copiés dans ce rapport.

## Assistant utilisé

- TP1 et début du TP2 : GitHub Copilot.
- Fin du TP2 et TP3 : Claude Code (extension VS Code), modèle Claude Opus 5.5 (voir la section « Session Claude Code »).
- Usage : lecture du dépôt, diagnostic des erreurs, aide à l'implémentation, vérification des builds et préparation des preuves Network.
- Règle de sécurité : aucune URI MongoDB complète, aucun secret JWT et aucun mot de passe ne sont conservés dans le rapport ou les captures.

## Mission 0 - Préparation et cartographie

### Objectif

Démarrer MongoDB Atlas, le backend et le frontend Angular, puis comprendre le trajet d'une requête de connexion.

### Travail réalisé avec l'assistant

- Lecture de `README.md`, `ATLAS_SETUP.md`, `API_CONTRACT.md` et des sujets TP1 à TP3.
- Configuration du backend avec un fichier local `backend/.env`, ignoré par Git.
- Correction de l'URI MongoDB pour utiliser l'utilisateur de test `admin` et la base `guitar-practice-cloud`.
- Vérification du proxy Angular : `/api` cible `http://localhost:3000` dans `frontend-starter/proxy.conf.json`.
- Mise à jour de Node.js via Homebrew vers `v26.8.2`, requise par Angular CLI 22.

### Vérifications

- `GET http://localhost:3000/api/health` renvoie `{"status":"ok"}`.
- Le backend affiche une connexion réussie à MongoDB Atlas et crée le compte de démonstration.
- Le frontend Angular compile avec `npm run build`.
- Le frontend répond sur `http://localhost:4200/` avec HTTP `200`.

### Livrable

- [Schéma annoté du flux de connexion](SCHEMA_FLUX_TP1.md)

Le schéma décrit le trajet :

```text
LoginPageComponent -> AuthService -> HttpClient -> proxy Angular -> API Express -> MongoDB Atlas
```

## Mission 1 - Authentification et profil

### Objectif

Compléter les formulaires, l'état d'authentification, la déconnexion et la gestion du profil utilisateur.

### Modifications réalisées

- Ajout d'états de chargement dans la connexion et l'inscription.
- Validation visible de l'email, du nom et du mot de passe.
- Validation frontend du mot de passe avec un minimum de 8 caractères.
- Ajout d'un bouton de déconnexion dans le composant racine.
- Suppression du token dans `localStorage` et remise à zéro des Signals lors de la déconnexion.
- Gestion d'un `401` dans l'intercepteur : nettoyage de l'authentification et redirection vers `/login`.
- Chargement automatique du profil à l'ouverture de la page profil.
- Messages d'erreur et états de sauvegarde pour la lecture et la modification du profil.

### Fichiers concernés

- `frontend-starter/src/app/components/app/app.ts`
- `frontend-starter/src/app/components/app/app.html`
- `frontend-starter/src/app/components/login-page/login-page.ts`
- `frontend-starter/src/app/components/login-page/login-page.html`
- `frontend-starter/src/app/components/register-page/register-page.ts`
- `frontend-starter/src/app/components/register-page/register-page.html`
- `frontend-starter/src/app/components/profile-page/profile-page.ts`
- `frontend-starter/src/app/components/profile-page/profile-page.html`
- `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts`

### Preuves Network

- [Connexion réussie](preuves/tp1/image.png) : `POST /api/auth/login`, `200 OK`.
- [Connexion refusée](preuves/tp1/image-1.png) : `POST /api/auth/login`, `401 Unauthorized`.
- [Modification du profil](preuves/tp1/image-2.png) : `PUT /api/users/me`, `200 OK`.

La troisième capture doit être conservée avec la valeur réelle de l'en-tête `Authorization` masquée.

### Audit des preuves au 17 septembre 2026

- Captures 1 et 2 : conformes, avec respectivement `200 OK` et `401 Unauthorized`.
- Capture 3 : techniquement conforme (`PUT /api/users/me`, `200 OK`), mais la version actuellement enregistrée affiche encore le JWT dans l'en-tête `Authorization`. Elle doit être remplacée par une capture recadrée ou masquée avant rendu.

## TP2 - Bibliothèque, upload et lecture audio

Une première passe (GitHub Copilot) avait ajouté la validation locale, les états d'envoi et la révocation de l'ObjectURL dans un composant unique. La seconde passe (Claude Code) a découpé la page, ajouté le Paginator Material et les cards, et réécrit les tests.

### Mission 2 - Bibliothèque paginée

- `TrackService.list(page, limit)` transmet réellement `page` et `limit` (`HttpParams`).
- Signals de `TracksPageComponent` : `tracks`, `page`, `limit`, `total`, `pages`, `loading`, `error`.
- Template : `@for (...; track track.id)`, `@empty` pour la bibliothèque vide, `@if` pour le chargement et l'erreur.
- **Avancé réalisé :** `mat-paginator` d'Angular Material (boutons page précédente et suivante désactivés aux bornes, choix de 5, 10 ou 20 pistes par page, libellés traduits via `FrenchPaginatorIntl`). `pageIndex` (qui commence à 0) est converti en `page` (qui commence à 1) dans `onPage()`.
- Chaque changement de page appelle le serveur. Si une requête est encore en cours, elle est annulée (`unsubscribe`) : la dernière page demandée gagne.
- Pagination Mongoose (`aggregate-paginate-v2`) : non réalisée (option facultative, elle modifie le backend et le contrat).

### Mission 3 - Analyse du flux upload et lecture

| Étape | Fichier | Méthode |
|---|---|---|
| Choix du fichier | `components/track-upload/track-upload.ts` | `choose()` |
| Validation locale (MIME + 25 Mo) | `shared/utils/audio-file.ts` | `validateAudioFile()` |
| Construction du `FormData` (`audio`, `title`) | `shared/services/track.service.ts` | `upload()` |
| Appel HTTP d'upload | `shared/services/track.service.ts` | `http.post(..., { observe: 'events' })` |
| Ajout du JWT | `shared/interceptors/auth.interceptor.ts` | `authInterceptor` |
| Contrôles serveur | `backend/src/app.js` | `auth`, `upload.single("audio")`, `fileFilter`, `limits.fileSize`, `!req.file` |
| Récupération du `Blob` | `shared/services/track.service.ts` | `audio()` avec `responseType: 'blob'` |
| Création de l'`ObjectURL`, affectation au `<audio>` | `components/tracks-page/tracks-page.ts` | `play()` → `audioUrl` → `[src]` |
| Révocation | `components/tracks-page/tracks-page.ts` | `releaseAudio()` appelée dans `play()`, `stopPlayer()`, `ngOnDestroy()` |

Flux d'upload : `TrackUploadComponent → TrackService.upload() → HttpClient → authInterceptor → proxy → POST /api/tracks → Multer (disque) → MongoDB (métadonnées)`.
Flux de lecture : `TracksPageComponent.play() → TrackService.audio() → GET /api/tracks/:id/audio (JWT) → res.sendFile → Blob → URL.createObjectURL → <audio>`.

**Pourquoi une URL directement placée dans `src` ne reçoit pas le header :** c'est le navigateur qui télécharge le média d'un `<audio src="...">`, en dehors d'Angular. `HttpClient` et donc l'intercepteur ne participent pas à cette requête : aucun `Authorization` n'est ajouté et le backend répond `401`.

**Pourquoi valider côté frontend si le backend valide déjà :** le message est immédiat et on évite d'envoyer 25 Mo pour rien. Mais n'importe quel client (curl, Postman, script) peut appeler l'API sans passer par Angular : seule la validation Multer protège réellement le serveur.

### Ajouts d'interface

- `TrackUploadComponent` : état de chargement, bouton et champs désactivés pendant l'envoi, garde contre la double soumission, message de succès, erreur serveur, formulaire (y compris l'`<input type="file">`) vidé après succès, retour en page 1.
- `TrackCardComponent` : cards responsives (`grid auto-fill`), titre, nom original, format (MP3/WAV/OGG/M4A), taille lisible (`FileSizePipe`), date (`DatePipe`, `<time datetime>`), boutons Lire et Supprimer avec `aria-label` nominatif, badge « En lecture ».
- Lecteur : morceau en cours affiché, erreur du `<audio>` (`(error)`) et erreur HTTP (404) compréhensibles.

### Réponses : mémoire, buffering et streaming

- **Le backend charge-t-il le fichier en mémoire ?** Non. `multer.diskStorage()` écrit l'upload sur le disque ; `res.sendFile()` lit le fichier depuis le disque et l'envoie par morceaux (stream), avec gestion des requêtes `Range`.
- **Quand le composant reçoit-il le fichier avec `responseType: 'blob'` ?** Quand la réponse est **entièrement** téléchargée : `HttpClient` émet le `Blob` une seule fois, à la fin. La lecture ne démarre donc qu'après le téléchargement complet.
- **100 morceaux dans la bibliothèque = 100 fichiers en mémoire ?** Non. `GET /api/tracks` ne renvoie que des métadonnées (le backend exclut même `storedName`), 5 par page par défaut. Un `Blob` n'est téléchargé qu'au clic sur « Lire » (`play()`), et un seul à la fois : l'`ObjectURL` précédente est révoquée.
- **Différence avec 100 `<audio src="http://...">` :** chaque élément déclencherait ses propres requêtes (au moins les métadonnées selon `preload`), en **streaming** avec buffering progressif et requêtes `Range` : lecture quasi immédiate, mémoire limitée au tampon. En contrepartie, ces requêtes ne portent pas le JWT (voir plus haut).
- **Pourquoi révoquer l'ObjectURL ?** `URL.createObjectURL` garde une référence vers le `Blob` tant que le document existe. Sans `revokeObjectURL`, chaque lecture laisserait un fichier audio complet en mémoire (fuite mémoire).
- **Distinction :** téléchargement complet d'un `Blob` (tout le fichier en mémoire côté client avant lecture) ≠ buffering du navigateur (le lecteur remplit un tampon et lit pendant le chargement) ≠ streaming côté serveur (le serveur envoie le fichier par morceaux sans le charger entièrement).

### Améliorations facultatives

- Réalisées : barre de progression (TP3), suppression avec confirmation et rafraîchissement (TP3), formatage de la taille et de la date.
- Non réalisées : filtre par titre (le backend ne filtre pas ; filtrer seulement la page courante serait trompeur), image de couverture (nécessite une évolution des données et de l'API).

## TP3 - Fiabilisation et enrichissement

### Mission 5 - Suppression d'une piste

- Flux : `TrackCardComponent (remove) → TracksPageComponent.remove() → TrackService.remove() → HttpClient → DELETE /api/tracks/:id`.
- Confirmation `window.confirm` avant tout appel ; aucun appel HTTP si l'utilisateur annule.
- `deletingId` : la card concernée affiche « Suppression… », toutes les actions de suppression sont désactivées, et la méthode ignore un second appel.
- Retour dans une SnackBar Angular Material (`MatSnackBar`) : succès, `404`, autre erreur.
- La page est rechargée après suppression. Si elle devient vide (dernière piste de la dernière page), on revient à la dernière page existante.
- `404` : piste supprimée entre-temps (autre onglet) ou appartenant à un autre utilisateur. Le backend ne distingue volontairement pas les deux cas, pour ne pas révéler l'existence de la piste d'un autre. Message explicite, puis la liste est resynchronisée.
- `401` : l'intercepteur déconnecte et redirige ; le composant n'affiche rien de plus.
- Si la piste supprimée était en lecture, le lecteur est arrêté et son ObjectURL révoquée.

**Pourquoi le guard et l'interface ne suffisent pas :** le guard ne fait que masquer des pages dans le navigateur de l'utilisateur. N'importe qui peut envoyer `DELETE /api/tracks/<id>` avec curl. C'est le backend qui vérifie la signature et l'expiration du JWT (middleware `auth`) puis le propriétaire (`findOneAndDelete({ _id, ownerId: req.auth.sub })`).

### Mission 6 - Progression de l'upload

- `TrackService.upload()` utilise `reportProgress: true` et `observe: 'events'`, puis traduit les `HttpEvent` en `UploadEvent` (`progress` avec un pourcentage, `done` avec la piste créée).
- `withXhr()` ajouté dans `main.ts` : depuis Angular 21, `HttpClient` utilise `fetch`, qui ne remonte pas la progression d'upload.
- États (`UploadState`, union discriminée) : `idle`, `uploading` avec `percent`, `success`, `error`. À 100 %, l'interface affiche « Traitement par le serveur… » en attendant la réponse `201`.
- Pendant l'envoi : champ titre, sélecteur de fichier et bouton désactivés, garde contre la double soumission.

**Calcul du pourcentage :** chaque événement `HttpEventType.UploadProgress` fournit `loaded` (octets envoyés) et `total` (taille du corps) ; `percent = Math.round(100 * loaded / total)`.

**Différence avec une requête classique :** une requête normale émet une seule valeur (le corps de la réponse) puis se termine. Avec `observe: 'events'`, l'Observable émet une **suite** d'événements (`Sent`, plusieurs `UploadProgress`, `ResponseHeader`, `Response`) : il faut filtrer les types, mettre à jour l'état à chaque émission et ne considérer l'upload réussi qu'à l'événement `Response`.

### Mission 7 - Tests automatisés

Rapport de tests : résultats attendus et observés le 24/09/2026.

| Fichier | Test | Attendu | Observé |
|---|---|---|---|
| `auth.service.spec.ts` | `login()` | `POST /api/auth/login`, corps `{email, password}` | ✅ |
| | stockage | token dans `localStorage` + Signals `token`, `currentUser` | ✅ |
| | échec 401 | aucun token stocké | ✅ |
| | `logout()` | stockage et Signals remis à zéro | ✅ |
| `track.service.spec.ts` | `list()` | `GET /api/tracks?page=2&limit=5` | ✅ |
| | multipart | `POST`, `FormData` avec exactement `audio` et `title`, `reportProgress` | ✅ |
| | progression | 25 %, 100 %, puis `done` avec la piste | ✅ |
| | `audio()` | `GET .../audio`, `responseType: 'blob'` | ✅ |
| | `remove()` | `DELETE /api/tracks/track-1`, `204` | ✅ |
| `auth.interceptor.spec.ts` | token présent | `Authorization: Bearer test-token` | ✅ |
| | sans token | aucun header | ✅ |
| | 401 route protégée | logout + navigation `/login` | ✅ |
| | 401 sur login | pas de redirection | ✅ |
| `auth.guard.spec.ts` | sans token | `UrlTree` `/login` | ✅ |
| | avec token | `true` | ✅ |
| `file-size.pipe.spec.ts` | formatage | `512 o`, `1.5 Ko`, `5.0 Mo` | ✅ |
| `track-card.spec.ts` | rendu | titre, fichier, format, taille | ✅ |
| | actions | `play` et `remove` émis avec la piste | ✅ |
| | suppression en cours | boutons désactivés, « Suppression… » | ✅ |
| `track-upload.spec.ts` | MIME invalide / > 25 Mo | message, aucun appel HTTP | ✅ |
| | progression | 42 % affiché, bouton et titre désactivés | ✅ |
| | double soumission | un seul appel | ✅ |
| | succès | état `success`, `uploaded` émis, formulaire vidé | ✅ |
| | erreur | message serveur affiché, champs réactivés | ✅ |
| `tracks-page.spec.ts` | chargement | `list(1, 5)`, une card par piste | ✅ |
| | pagination | nouvelle requête par page, conversion `pageIndex` | ✅ |
| | après upload | retour page 1 | ✅ |
| | échec HTTP | message d'erreur **affiché dans le DOM** | ✅ |
| | suppression | `DELETE` après confirmation, SnackBar, rechargement | ✅ |
| | annulation / double clic / 404 / page vide | pas d'appel / un appel / message + rechargement / page précédente | ✅ |
| | lecture | ObjectURL créée, affichée, révoquée à la destruction, erreur 404 | ✅ |

Résultat : `npm test` → **8 fichiers, 38 tests réussis**, sans backend ni MongoDB.
Contrôle de pertinence : en renommant volontairement le champ `title` en `titre` et en modifiant le message de succès, 2 tests échouent comme attendu, puis repassent après restauration.

**Extension backend** (`backend/test/api.test.js`, sans modifier les routes) : `401` sans JWT, `401` avec un JWT invalide, `401` avec un JWT signé par un autre secret, `400` pour un upload sans fichier, `400` pour un type MIME refusé. Résultat `npm test` backend : **7 tests réussis**, sans MongoDB (les requêtes sont rejetées avant tout accès à la base). Pagination et accès à la piste d'un autre utilisateur : non couverts, car ils nécessitent une base (test d'intégration avec une base de test).

### Build

`npm run build` : succès (bundle initial ~643 kB brut / ~144 kB transféré, Angular Material inclus).

### Réponses pour la restitution orale

1. **Pourquoi la suppression passe par un service ?** Le composant ne gère que l'affichage et l'état. Le service concentre l'URL, la méthode et le typage, il est réutilisable et testable séparément avec `HttpTestingController`.
2. **Comment le backend protège la suppression ?** Le middleware `auth` vérifie le JWT (signature et expiration) → `401` ; `findOneAndDelete({ _id, ownerId: req.auth.sub })` ne supprime que les pistes de l'utilisateur → `404` sinon ; le fichier disque est supprimé ensuite.
3. **Comment Angular calcule le pourcentage ?** Grâce aux événements `UploadProgress` du backend XHR (`loaded / total`), activés par `reportProgress: true` + `observe: 'events'` + `withXhr()`.
4. **Pourquoi les tests HTTP n'ont pas besoin de MongoDB ?** `provideHttpClientTesting()` remplace le backend HTTP d'Angular : les requêtes sont capturées par `HttpTestingController` et on leur fournit une réponse simulée (`flush`). Rien ne sort du navigateur.
5. **Ce que vérifie un test d'intercepteur ou de guard :** intercepteur = la requête sortante porte (ou non) le header `Authorization`, et un `401` provoque la déconnexion et la redirection ; guard = sans token, la navigation est remplacée par un `UrlTree` vers `/login`.
6. **Test unitaire et test d'intégration :** un test unitaire isole une unité (service, composant) et remplace ses dépendances par des doubles : il est rapide et déterministe. Un test d'intégration fait travailler plusieurs couches réelles ensemble (Angular + API + MongoDB, ou Express + base de test) et vérifie qu'elles s'assemblent correctement.

## Session Claude Code du 24/09/2026 (TP2 + TP3)

- **Assistant et modèle :** Claude Code (extension VS Code), modèle Claude Opus 5.5.
- **Consommation de tokens :** commande `/cost` (ou `/usage`) dans Claude Code ; pour GitHub Copilot, tableau de bord d'utilisation du compte GitHub.
- **Qui conseille le modèle adapté ?** La documentation de l'éditeur de l'assistant (pages de comparaison des modèles), les consignes de l'enseignant, et l'expérience : un modèle rapide pour des tâches simples, un modèle de raisonnement pour l'architecture ou le débogage.
- **Skill installé :** `npx skills add https://github.com/angular/skills` → `.claude/skills/angular-developer` et `angular-new-app` (skills officiels de l'équipe Angular). Utilisé en particulier pour `withXhr()` (progression d'upload), le pattern de test zoneless `await fixture.whenStable()` et `input()` / `output()`.
- **Doctrine rédigée :** [`DOCTRINE.md`](DOCTRINE.md), référencée depuis `CLAUDE.md` (racine), `frontend-starter/AGENTS.md`, `CLAUDE.md` et `GEMINI.md`.
- **Dépendances ajoutées :** `@angular/material` et `@angular/cdk` `~22.1.0` (Paginator et SnackBar).
- **Configuration :** `tsconfig.spec.json` créé ; les specs sont exclues de `tsconfig.app.json` (elles étaient compilées par `ng build`) ; thème Material `azure-blue` recoloré aux couleurs de l'application.
- **Revue critique des propositions de l'IA :** le style global `button` écrasait les boutons Material (corrigé par `button:not([class*='mat-'])`). La garde `if (this.loading()) return;` de la première version bloquait un changement de page pendant un chargement : elle a été remplacée par une annulation de la requête précédente. Le bouton d'envoi restait désactivé après une erreur serveur, ce qui empêchait de réessayer : corrigé.
- **Vérification de bout en bout non réalisée par l'assistant :** MongoDB Atlas était injoignable depuis la session (liste blanche IP d'Atlas). Le frontend compile et est servi (HTTP 200) ; les preuves Network restent à capturer manuellement.

### Fichiers créés ou modifiés (TP2 + TP3)

- `frontend-starter/src/main.ts` : `withXhr()`, `MatPaginatorIntl`.
- `frontend-starter/src/app/shared/services/track.service.ts` : progression, `remove()`.
- `frontend-starter/src/app/shared/models/upload-event.model.ts` : `UploadEvent`, `UploadState`.
- `frontend-starter/src/app/shared/utils/audio-file.ts`, `http-error.ts` ; `pipes/file-size.pipe.ts` ; `i18n/paginator-intl.ts` ; `testing/local-storage.mock.ts`.
- `frontend-starter/src/app/components/tracks-page/*` : orchestration, Paginator, lecture, suppression.
- `frontend-starter/src/app/components/track-card/*`, `track-upload/*` : nouveaux composants.
- Specs : `auth.service`, `auth.guard`, `auth.interceptor`, `track.service`, `file-size.pipe`, `track-card`, `track-upload`, `tracks-page`.
- `frontend-starter/angular.json`, `tsconfig.app.json`, `tsconfig.spec.json`, `package.json`, `src/styles.css`.
- `backend/test/api.test.js` : tests de contrat et de sécurité (aucune route modifiée).

## Preuves à capturer manuellement (TP2 + TP3)

À déposer dans `preuves/tp2/` et `preuves/tp3/`, en masquant toujours la ligne `Authorization`, les JWT et les mots de passe.

1. **Pagination :** `GET /api/tracks?page=1&limit=5` puis `page=2` après un clic sur « Page suivante ».
2. **Upload :** `POST /api/tracks`, onglet Payload : `multipart/form-data` avec les champs `audio` et `title`, statut `201`. Pour voir la progression, activer le throttling « Slow 4G » et capturer la barre en cours.
3. **Lecture :** `GET /api/tracks/<id>/audio`, statut `200`, `Content-Type: audio/mpeg`, type `blob`/media.
4. **Fichier invalide :** sélectionner un `.txt` : message « Format refusé », **aucune** requête dans Network. Pour un `400` serveur, renommer un `.txt` en `.mp3` ne suffit pas (le navigateur annonce `audio/mpeg`) : le `400` est prouvé par le test backend « type MIME refusé ».
5. **Suppression :** `DELETE /api/tracks/<id>` → `204` après confirmation, puis le `GET /api/tracks` de rechargement ; supprimer la même piste depuis un second onglet → `404` et SnackBar.
6. **Propriété :** avec un second compte, `GET /api/tracks/<id d'une piste du compte démo>/audio` → `404`.
7. **Console :** aucune erreur inattendue, aucun token affiché.

## Ce que le binôme doit savoir expliquer

- Un Signal Angular contient l'état réactif utilisé immédiatement par les composants : quand `currentUser` ou `token` change, l'interface peut se mettre à jour. `localStorage` est une persistance navigateur séparée : il permet de retrouver le token après un rechargement, mais ne déclenche pas directement le rafraîchissement des composants. Ici, `AuthService` synchronise les deux.
- Le rôle du proxy Angular et le fait qu'Angular ne contacte jamais MongoDB directement.
- Le rôle de l'intercepteur pour ajouter `Authorization: Bearer <token>`.
- Pourquoi les routes backend vérifient le JWT même si le guard Angular protège déjà l'interface.
- Le trajet d'un upload multipart, sa progression, et le rôle de `Blob` et `ObjectURL` pour la lecture audio.
- La séparation page (état + services) / composant de présentation (`input()` / `output()`).

## État de validation

- **TP1 :** code terminé ; capture `preuves/tp1/image-2.png` à refaire avec le JWT masqué.
- **TP2 :** code terminé et testé ; preuves Network à capturer (points 1 à 4 ci-dessus).
- **TP3 :** suppression, progression et tests terminés ; `npm run build` OK ; preuves Network à capturer (points 5 à 7).
- Restaurer un `backend/.env.example` contenant uniquement des valeurs fictives avant le rendu.

## Contexte pour la prochaine session

- Appliquer [`DOCTRINE.md`](DOCTRINE.md).
- Garde-fous : frontend `npm test` = 38 tests réussis, backend `npm test` = 7 tests réussis, `npm run build` OK.
- Node v26.8.2 : `export PATH="/opt/homebrew/bin:$PATH"`.
- Autoriser l'IP courante dans MongoDB Atlas (Network Access) si le backend refuse de démarrer.
