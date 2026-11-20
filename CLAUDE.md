# Les Gones Legends — notes pour Claude

- Mises à jour automatiques : l'appli fait une requête HEAD sur la page et compare l'ETag
  (voir `checkUpdate` dans `index.html`). Rien à synchroniser à la main.
  `APP_V` sert seulement à afficher le numéro de version.
- `version.json` est conservé uniquement pour les anciens téléphones restés sur la version 2026-11-20r ;
  ne plus y toucher.
- Ne pas faire retélécharger `index.html` en boucle (ni intervalles courts sur des fichiers du site) :
  GitHub Pages bloque l'IP ("Rate limit exceeded") au-delà d'un certain nombre de requêtes.
