# Monitoring des services tiers

Tableau de bord dynamique qui agrège les statuts des fournisseurs (Zoho, Microsoft 365, Fasterize, OVHcloud, etc.) en interrogeant les pages de statut publiques quand elles exposent une API et en basculant sur un scraping HTML quand aucune API JSON n’est disponible.

## Utilisation

1. Installez Node.js 18+ (le serveur s’appuie sur `fetch` natif côté Node).
2. Depuis la racine du projet, lancez le serveur :
   - `npm run start` (port par défaut 3000) ou `PORT=8080 npm run start` pour choisir un autre port.
3. Ouvrez le tableau de bord sur http://localhost:3000 (ou le port choisi).
4. Les données sont rechargées automatiquement toutes les 60 secondes. Cliquez sur « Recharger les données » pour forcer un rafraîchissement immédiat.

### Affichage plein écran (mur d'écrans)

- La page est optimisée pour un affichage plein écran : large grille, cartes contrastées et bandeau de synthèse lisible à distance.
- Les services en incident ou maintenance sont triés en premier et mis en avant par un code couleur accentué ; aucun champ de recherche n'est nécessaire pour la consultation passive.
- L'entête affiche la cadence d'auto-rafraîchissement et l'horodatage de la dernière mise à jour pour contrôler d'un coup d'œil la fraîcheur des données.
- Cliquez sur le bouton « Plein écran » pour verrouiller l'affichage sur un mur d'écran, puis « Quitter le plein écran » si besoin.
- Les liens de statut pointent vers les sources officielles : Zoho est suivi via `https://status.zoho.eu/` (instance européenne) et PostFinance via `https://status-checkout.postfinance.ch/` (page checkout dédiée).

## Comment sont récupérés les statuts ?

- Chaque fournisseur est décrit dans `services.json` avec une source (`statuspage` quand l’API Atlassian Statuspage est disponible, `html` pour scraper une page de statut sans API, sinon `none`).
- Le serveur Node interroge ces API (`/api/v2/status.json`) côté backend pour contourner les restrictions CORS, valide que la réponse est bien du JSON, puis renvoie un JSON agrégé à l’interface (`/api/status`).
- En cas d’échec JSON, un fallback de scraping HTML est tenté quand `htmlFallback` ou `type: "html"` est renseigné (ex. Sogecommerce via `https://sogecommerce.status.lyra.com/`).
- Les indicateurs Statuspage sont mappés vers les états du dashboard : `none` → `operational`, `maintenance`/`minor` → `degraded`, `major`/`critical` → `down`, sinon `unknown`. Pour le scraping HTML, le serveur recherche des mots-clés (opérationnel, maintenance, incident) pour déterminer l’état.
- Si une source n’expose pas d’API ni de fallback HTML, le service est retourné en `unknown` avec une note explicite. Ajoutez une source compatible si vous disposez d’une API interne ou publique.

## Mettre à jour la liste

- Éditez `services.json` pour ajouter/supprimer/mettre à jour des services. Pour chaque entrée :
  - `name`: nom du service
  - `statusUrl`: lien vers la page de statut officielle
  - `description`: courte description du périmètre
  - `notes`: consignes internes (optionnel)
- `source`: `{ "type": "statuspage", "api": "https://.../api/v2/status.json", "htmlFallback": true }` pour tenter un scraping HTML si l’API ne renvoie pas de JSON ; `{ "type": "html", "html": { "url": "https://..." } }` pour scraper directement ; ou `{ "type": "none" }`.
  - `fallbackStatus`: valeur utilisée si l’API ne répond pas (`operational`, `degraded`, `down` ou `unknown`)

Après modification, relancez le serveur pour recharger la configuration.

## Déploiement rapide

- **Serveur local** : `npm run start` puis ouvrez http://localhost:3000.
- **Reverse proxy** : publiez le serveur derrière un proxy (Nginx/Traefik) si vous souhaitez exposer le dashboard ; toutes les ressources sont servies par `server.js`.
- **Statique uniquement ?** : la version actuelle nécessite le backend Node pour appeler les API de statut (CORS). Un hébergement purement statique ne permettra pas de récupérer les statuts dynamiques, mais l'interface basculera automatiquement sur `services.json` et affichera les états `fallbackStatus` si le backend est indisponible (bandeau « mode statique » en haut).
- **GitHub Pages** : vous pouvez publier les fichiers statiques (`index.html`, `styles.css`, `app.js`, `services.json`) sur GitHub Pages. Sans backend Node, le dashboard passera en lecture statique : il chargera `services.json`, marquera chaque carte avec la note « Chargé depuis la configuration statique (aucun backend disponible) » et ne pourra pas interroger les API tierces. GitHub Pages n’exécute pas de code serveur et ne peut pas contourner les CORS des APIs tierces : pour du dynamique, exposez un backend `/api/status` hébergé ailleurs (petit serveur Node, Function, Cloudflare Worker, etc.) et paramétrez un proxy ou un sous-domaine vers ce backend.

### Pourquoi les données dynamiques ne fonctionnent pas sur GitHub Pages ?

- GitHub Pages sert uniquement des fichiers statiques ; aucun code serveur n’y tourne pour appeler les APIs de statut et bypasser les restrictions CORS.
- Les pages de statut tierces refusent souvent les requêtes directes depuis le navigateur (CORS). Le backend `/api/status` du projet est justement là pour faire ces appels côté serveur.
- Résultat : sur Pages, l’interface bascule en « mode statique » et affiche `services.json`. Pour obtenir des données temps réel, vous devez déployer le backend Node (ou équivalent) sur une plateforme qui autorise les requêtes sortantes (ex. Render, Fly.io, Railway, Vercel/Functions) et pointer `/api/status` vers ce backend.

Dans tous les cas, vérifiez que `services.json` reste au même niveau que `index.html`, car le serveur l’utilise pour déterminer les sources des statuts.
