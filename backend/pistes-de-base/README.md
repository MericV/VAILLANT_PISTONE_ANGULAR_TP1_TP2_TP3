# Pistes de base

Déposez ici des fichiers audio (MP3, WAV, OGG ou M4A) : au démarrage, le serveur les ajoute
au catalogue commun « Pistes de base », visible par tous les joueurs, en lecture seule.
Retirer un fichier le retire du catalogue au démarrage suivant.

Facultatif : `catalogue.json` précise titre, description et durée (en secondes) par fichier.
Sans lui, le titre est tiré du nom du fichier (`blues-en-mi.mp3` → « Blues en mi »).

```json
{
  "blues-en-mi.mp3": { "title": "Blues en Mi", "description": "Shuffle, 90 bpm", "duration": 184 }
}
```

Vérifiez que vous avez le droit de diffuser chaque morceau (vos compositions, ou une licence libre).
