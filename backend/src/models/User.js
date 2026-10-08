import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { avatarById, backgroundById, STARTER_AVATAR, STARTER_BACKGROUND } from "../catalog.js";

/*
 * Un schéma Mongoose décrit la forme des documents MongoDB et leurs règles de
 * validation. `timestamps` ajoute automatiquement createdAt et updatedAt.
 */
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // select:false empêche de renvoyer le hash par défaut dans les requêtes.
    passwordHash: { type: String, required: true, select: false },
    // Points gagnés en jouant, dépensés dans la boutique. min: 0 : jamais de solde négatif.
    coins: { type: Number, default: 0, min: 0 },
    // Avatars possédés (identifiants du catalogue) et avatar affiché.
    avatars: { type: [String], default: () => [STARTER_AVATAR] },
    avatar: { type: String, default: STARTER_AVATAR },
    // Fonds de scène possédés et fond affiché derrière la piste pendant une partie.
    backgrounds: { type: [String], default: () => [STARTER_BACKGROUND] },
    background: { type: String, default: STARTER_BACKGROUND },
  },
  { timestamps: true },
);

/**
 * Virtual property : `password` n'est pas stocké dans MongoDB.
 * Le setter conserve temporairement le mot de passe en mémoire pour que le
 * hook pre('validate') puisse le hacher avant la sauvegarde.
 */
schema.virtual("password").set(function (value) {
  this._plainPassword = value;
});

/**
 * Hook exécuté avant la validation d'un nouvel utilisateur.
 * bcrypt transforme le mot de passe en hash irréversible ; le mot de passe
 * original ne doit jamais être écrit dans la base ni dans les logs.
 */
schema.pre("validate", async function () {
  if (this.isNew && this._plainPassword) {
    console.debug(`[user-model] Hachage du mot de passe pour ${this.email}`);
    this.passwordHash = await bcrypt.hash(this._plainPassword, 10);
  }
});

/** Compare un mot de passe reçu avec le hash stocké. */
schema.methods.verifyPassword = function (value) {
  console.debug(`[user-model] Vérification du mot de passe pour ${this.email}`);
  return bcrypt.compare(value, this.passwordHash);
};

/** Retourne uniquement les champs qu'une réponse HTTP peut exposer. */
schema.methods.toPublic = function () {
  return {
    id: this.id,
    name: this.name,
    email: this.email,
    createdAt: this.createdAt,
    coins: this.coins ?? 0,
    avatar: avatarById(this.avatar),
    // Les comptes créés avant la boutique n'ont pas encore de liste : ils ont l'avatar de départ.
    avatars: this.avatars?.length ? this.avatars : [STARTER_AVATAR],
    background: backgroundById(this.background),
    backgrounds: this.backgrounds?.length ? this.backgrounds : [STARTER_BACKGROUND],
  };
};

export const User = mongoose.model("User", schema);
