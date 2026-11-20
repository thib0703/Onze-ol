# Les Gones Legends — notes pour Claude

- À chaque nouvelle version publiée, mettre à jour **les deux** :
  - `const APP_V="..."` dans `index.html`
  - `version.json` → `{"v":"..."}` avec exactement la même valeur
  L'appli compare les deux pour se mettre à jour toute seule.
- Ne pas faire retélécharger `index.html` en boucle (ni intervalles courts sur des fichiers du site) :
  GitHub Pages bloque l'IP ("Rate limit exceeded") au-delà d'un certain nombre de requêtes.
