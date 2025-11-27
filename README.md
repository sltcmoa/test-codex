# Monitoring des services tiers

Interface statique pour suivre rapidement les pages de statut des fournisseurs tiers (Zoho, Microsoft 365, Fasterize, OVHcloud, etc.). Les données sont lues depuis `services.json` et rendues côté client avec JavaScript.

## Utilisation

1. Ouvrez `index.html` dans un navigateur ou servez le dossier avec un serveur statique (`python -m http.server 8000`).
2. Utilisez la barre de recherche pour filtrer les fournisseurs.
3. Cliquez sur « Recharger les données » si vous modifiez `services.json` pendant que la page est ouverte.

## Mettre à jour la liste

- Ajoutez/supprimez/éditez les entrées dans `services.json`. Chaque entrée comporte :
  - `name`: nom du service
  - `status`: `operational`, `degraded`, `down` ou `unknown`
  - `statusUrl`: lien vers la page de statut officielle
  - `description`: courte description du périmètre
  - `notes`: consignes internes (optionnel)

Les statuts sont déclaratifs : mettez-les à jour manuellement en fonction des pages officielles ou de vos propres sondes internes.
