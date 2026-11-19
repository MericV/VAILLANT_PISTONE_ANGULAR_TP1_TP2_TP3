import mongoose from "mongoose";

/*
 * Ce schéma conserve les métadonnées d'une piste. Le fichier audio lui-même
 * reste sur le disque ; storedName contient le nom technique utilisé côté
 * serveur et n'est jamais exposé par toPublic().
 */
const schema = new mongoose.Schema(
  {
    // Absent pour une piste de base (catalogue commun importé au démarrage depuis pistes-de-base/).
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required() {
        return !this.base;
      },
      index: true,
    },
    base: { type: Boolean, default: false, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    // Texte libre ajouté après l'import (notes de travail, tonalité, tempo…).
    description: { type: String, trim: true, maxlength: 500, default: "" },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true, select: false },
    // Pochette d'album facultative (image dans les uploads), servie par GET /api/tracks/:id/cover.
    coverName: { type: String, select: false },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    // Durée en secondes, mesurée par le navigateur à l'import (absente des pistes plus anciennes).
    duration: { type: Number, min: 0, max: 7200 },
  },
  { timestamps: true },
);

// Cet index accélère la liste des pistes d'un utilisateur triées par date.
schema.index({ ownerId: 1, createdAt: -1 });

/**
 * Convertit un document Mongoose en objet sûr pour le frontend.
 * L'identifiant MongoDB devient la propriété simple `id` attendue par Angular.
 */
schema.methods.toPublic = function () {
  console.debug(`[track-model] Préparation de la piste publique ${this.id}`);
  return {
    id: this.id,
    ownerId: this.ownerId ? String(this.ownerId) : null,
    base: this.base,
    title: this.title,
    description: this.description,
    originalName: this.originalName,
    mimeType: this.mimeType,
    size: this.size,
    duration: this.duration ?? null,
    cover: Boolean(this.coverName),
    createdAt: this.createdAt,
  };
};

export const Track = mongoose.model("Track", schema);
