import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Track } from "../src/models/Track.js";
import { Score } from "../src/models/Score.js";
import { AVATARS, avatarById, coinsFor, STARTER_AVATAR } from "../src/avatars.js";

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test("health sans dépendre de MongoDB", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "ok");
});

test("schémas Mongoose et relation", () => {
  const u = new User({
    name: "Test",
    email: "TEST@example.com",
    password: "12345678",
  });

  assert.equal(u.email, "test@example.com");
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
  });
  
  assert.equal(t.title, "Blues");
  assert.equal(Track.schema.path("ownerId").options.ref, "User");
});

/*
 * Tests de contrat et de sécurité (TP3, extension backend).
 * Ils n'ouvrent aucune connexion MongoDB : chaque requête est rejetée par le
 * middleware `auth` ou par Multer AVANT le premier accès à la base.
 * Le JWT de test est signé avec le même secret que l'application ; il n'est
 * jamais affiché dans les logs du test.
 */
const TEST_SECRET = process.env.JWT_SECRET || "tp1-development-secret";
const validToken = () =>
  jwt.sign(
    { sub: new mongoose.Types.ObjectId().toString(), email: "test@example.com" },
    TEST_SECRET,
    { expiresIn: "5m" },
  );

test("401 sans JWT sur une route protégée", async () => {
  const r = await fetch(base + "/api/tracks?page=1&limit=5");
  assert.equal(r.status, 401);
  assert.equal((await r.json()).message, "Authentification requise");
});

test("401 avec un JWT invalide", async () => {
  const r = await fetch(base + "/api/users/me", {
    headers: { Authorization: "Bearer ceci-nest-pas-un-jwt" },
  });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).message, "Jeton invalide ou expiré");
});

test("401 avec un JWT signé par un autre secret", async () => {
  const forged = jwt.sign({ sub: "attaquant" }, "mauvais-secret");
  const r = await fetch(base + "/api/tracks/123", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${forged}` },
  });
  assert.equal(r.status, 401);
});

test("400 pour un upload sans fichier audio", async () => {
  const body = new FormData();
  body.append("title", "Sans fichier");
  const r = await fetch(base + "/api/tracks", {
    method: "POST",
    headers: { Authorization: `Bearer ${validToken()}` },
    body,
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Fichier audio requis");
});

test("400 pour un type MIME refusé", async () => {
  const body = new FormData();
  body.append("audio", new Blob(["pas du son"], { type: "text/plain" }), "notes.txt");
  body.append("title", "Mauvais format");
  const r = await fetch(base + "/api/tracks", {
    method: "POST",
    headers: { Authorization: `Bearer ${validToken()}` },
    body,
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Format audio non accepté");
});

/*
 * PATCH /api/tracks/:id : les corps invalides sont rejetés AVANT MongoDB.
 */
const patchTrack = (body, token = validToken()) =>
  fetch(base + "/api/tracks/" + new mongoose.Types.ObjectId(), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("PATCH piste : 401 sans JWT", async () => {
  const r = await fetch(base + "/api/tracks/123", { method: "PATCH" });
  assert.equal(r.status, 401);
});

test("PATCH piste : 400 si le titre est vide", async () => {
  const r = await patchTrack({ title: "   " });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Titre invalide");
});

test("PATCH piste : 400 si la description n'est pas une chaîne", async () => {
  const r = await patchTrack({ description: 42 });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Description invalide");
});

test("PATCH piste : 400 sans champ modifiable (ownerId ignoré)", async () => {
  const r = await patchTrack({ ownerId: "autre-utilisateur" });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Aucune modification fournie");
});

test("schéma : description vide par défaut et longueurs maximales", async () => {
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "x".repeat(121),
    description: "y".repeat(501),
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 1,
  });
  const { errors } = await t.validate().catch((e) => e);
  assert.ok(errors.title);
  assert.ok(errors.description);
  assert.equal(new Track({}).description, "");
});

/*
 * Scores : contrat et validations rejetés AVANT MongoDB.
 */
const postScore = (body, token = validToken()) =>
  fetch(base + "/api/scores", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const validResult = () => ({
  trackId: new mongoose.Types.ObjectId().toString(),
  difficulty: "hard",
  score: 12345,
  stars: 4,
  accuracy: 92,
  maxCombo: 57,
});

test("scores : 401 sans JWT sur les trois routes", async () => {
  for (const [method, url] of [
    ["POST", "/api/scores"],
    ["GET", "/api/scores/me"],
    ["GET", "/api/scores/leaderboard"],
  ]) {
    const r = await fetch(base + url, { method });
    assert.equal(r.status, 401, `${method} ${url}`);
  }
});

test("POST score : 400 si le morceau n'est pas un identifiant", async () => {
  const r = await postScore({ ...validResult(), trackId: "pas-un-id" });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Morceau invalide");
});

test("POST score : 400 si la difficulté est inconnue", async () => {
  const r = await postScore({ ...validResult(), difficulty: "legendary" });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Difficulté invalide");
});

test("POST score : 400 pour des valeurs impossibles", async () => {
  for (const invalid of [{ score: -1 }, { score: 10.5 }, { score: "999" }, { stars: 6 }, { accuracy: 101 }, { maxCombo: null }]) {
    const r = await postScore({ ...validResult(), ...invalid });
    assert.equal(r.status, 400, JSON.stringify(invalid));
    assert.equal((await r.json()).message, "Résultat de partie invalide");
  }
});

test("classement : 400 si la difficulté filtrée est inconnue", async () => {
  const r = await fetch(base + "/api/scores/leaderboard?difficulty=legendary", {
    headers: { Authorization: `Bearer ${validToken()}` },
  });
  assert.equal(r.status, 400);
});

test("POST score : 400 si l'instrument est inconnu", async () => {
  const r = await postScore({ ...validResult(), instrument: "triangle" });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Instrument invalide");
});

test("schéma Score : un seul record par joueur, morceau, difficulté et instrument", async () => {
  const unique = Score.schema.indexes().find(([fields]) => fields.userId && fields.trackId && fields.difficulty && fields.instrument);
  assert.ok(unique, "index composé attendu");
  assert.equal(unique[1].unique, true);
  const { errors } = await new Score({ difficulty: "legendary", stars: 9 }).validate().catch((e) => e);
  assert.ok(errors.difficulty);
  assert.ok(errors.stars);
  assert.equal(new Score({}).instrument, "lead"); // anciens records : partition lead
});

/*
 * Boutique et points.
 */
test("points : 1 pour 100 de score, plus 10 par étoile", () => {
  assert.equal(coinsFor(0, 0), 0);
  assert.equal(coinsFor(19_999, 3), 199 + 30);
});

test("catalogue : un avatar de départ gratuit, identifiants uniques", () => {
  assert.equal(avatarById(STARTER_AVATAR).price, 0);
  assert.equal(new Set(AVATARS.map((a) => a.id)).size, AVATARS.length);
  assert.equal(avatarById("n-existe-pas").id, STARTER_AVATAR);
});

test("utilisateur : solde à 0, avatar de départ possédé et affiché", () => {
  const publicUser = new User({ name: "Test", email: "t@example.com" }).toPublic();
  assert.equal(publicUser.coins, 0);
  assert.equal(publicUser.avatar.id, STARTER_AVATAR);
  assert.deepEqual(publicUser.avatars, [STARTER_AVATAR]);
});

test("boutique : 401 sans JWT, catalogue avec JWT", async () => {
  assert.equal((await fetch(base + "/api/shop/avatars")).status, 401);
  const r = await fetch(base + "/api/shop/avatars", { headers: { Authorization: `Bearer ${validToken()}` } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).length, AVATARS.length);
});

test("boutique : 404 pour un avatar inconnu, avant toute requête MongoDB", async () => {
  const r = await fetch(base + "/api/shop/avatars/licorne-doree/buy", {
    method: "POST",
    headers: { Authorization: `Bearer ${validToken()}` },
  });
  assert.equal(r.status, 404);
});

test("avatar affiché : 400 pour un identifiant inconnu", async () => {
  const r = await fetch(base + "/api/users/me/avatar", {
    method: "PUT",
    headers: { Authorization: `Bearer ${validToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ avatar: "licorne-doree" }),
  });
  assert.equal(r.status, 400);
});

/*
 * Groupes et parties en direct : sécurité et validations avant MongoDB.
 */
const authed = (url, init = {}) =>
  fetch(base + url, {
    ...init,
    headers: { Authorization: `Bearer ${validToken()}`, "Content-Type": "application/json", ...init.headers },
  });

test("groupes : 401 sans JWT", async () => {
  for (const [method, url] of [
    ["GET", "/api/groups"],
    ["POST", "/api/groups"],
    ["POST", "/api/groups/join"],
    ["GET", "/api/groups/123/live"],
  ]) {
    assert.equal((await fetch(base + url, { method })).status, 401, `${method} ${url}`);
  }
});

test("groupes : 400 pour un nom trop court ou absent", async () => {
  for (const name of [undefined, "x", "   ", 42]) {
    const r = await authed("/api/groups", { method: "POST", body: JSON.stringify({ name }) });
    assert.equal(r.status, 400, String(name));
  }
});

test("groupes : 400 pour un code d'invitation mal formé", async () => {
  const r = await authed("/api/groups/join", { method: "POST", body: JSON.stringify({ code: "abc" }) });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Code d'invitation invalide");
});

test("direct : 404 pour un identifiant de groupe invalide", async () => {
  const r = await authed("/api/groups/pas-un-id/live");
  assert.equal(r.status, 404);
});
