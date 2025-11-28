# Monitoring des services tiers

Interface statique pour suivre rapidement les pages de statut des fournisseurs tiers (Zoho, Microsoft 365, Fasterize, OVHcloud, etc.). Les données sont lues depuis `services.json` et rendues côté client avec JavaScript.

## Utilisation

1. Ouvrez `index.html` dans un navigateur ou servez le dossier avec un serveur statique (`python -m http.server 8000`).
2. Les données sont rechargées automatiquement toutes les 60 secondes. Cliquez sur « Recharger les données » pour forcer un rafraîchissement immédiat si vous modifiez `services.json` pendant que la page est ouverte.

### Affichage plein écran (mur d'écrans)

- La page est optimisée pour un affichage plein écran : large grille, cartes contrastées et bandeau de synthèse lisible à distance.
- Les services en incident ou maintenance sont triés en premier et mis en avant par un code couleur accentué ; aucun champ de recherche n'est nécessaire pour la consultation passive.
- L'entête affiche la cadence d'auto-rafraîchissement et l'horodatage de la dernière mise à jour pour contrôler d'un coup d'œil la fraîcheur des données.
- Cliquez sur le bouton « Plein écran » pour verrouiller l'affichage sur un mur d'écran, puis « Quitter le plein écran » si besoin.
- Les liens de statut pointent vers les sources officielles : Zoho est suivi via `https://status.zoho.eu/` (instance européenne) et PostFinance via `https://status-checkout.postfinance.ch/` (page checkout dédiée).

## Mettre à jour la liste

- Ajoutez/supprimez/éditez les entrées dans `services.json`. Chaque entrée comporte :
  - `name`: nom du service
  - `status`: `operational`, `degraded`, `down` ou `unknown`
  - `statusUrl`: lien vers la page de statut officielle
  - `description`: courte description du périmètre
  - `notes`: consignes internes (optionnel)

Les statuts sont déclaratifs : mettez-les à jour manuellement en fonction des pages officielles ou de vos propres sondes internes.

## Déploiement rapide

Comme l'interface est 100 % statique (HTML/CSS/JS), plusieurs options simples s'offrent à vous pour la tester ou la publier :

- **Serveur local rapide** : `python -m http.server 8000` puis ouvrez http://localhost:8000 dans votre navigateur.
- **Serveur jetable** : `npx serve .` si Node.js est disponible (installe automatiquement un serveur statique éphémère).
- **Hébergement statique** : copiez simplement les fichiers du dossier (`index.html`, `styles.css`, `app.js`, `services.json`) sur un hébergement de fichiers statiques (Netlify, Vercel, GitHub Pages, S3 + CloudFront, etc.). Aucun backend n'est nécessaire.

### Notes GitHub Pages

- Déployez depuis la racine du dépôt (ou le dossier `/docs`) et assurez-vous que `services.json` est bien publié au même niveau que `index.html`.
- Les chemins sont relatifs (`./services.json`, `./styles.css`, `./app.js`) pour fonctionner avec les URL GitHub Pages de type `https://<utilisateur>.github.io/<repo>/`.
- Si vous utilisez un thème Jekyll, ajoutez éventuellement un fichier `.nojekyll` pour servir les fichiers tels quels.

Dans tous les cas, vérifiez que `services.json` est accessible sur le même domaine/port que `index.html`, car les requêtes sont effectuées côté navigateur.
