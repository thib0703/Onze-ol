# Les Gones Legends — notes pour Claude

- Mises à jour automatiques : l'appli fait une requête HEAD sur la page et compare l'ETag
  (voir `checkUpdate` dans `index.html`). Rien à synchroniser à la main.
  `APP_V` sert seulement à afficher le numéro de version.
- `version.json` est conservé uniquement pour les anciens téléphones restés sur la version 2026-11-20r ;
  ne plus y toucher.
- Ne pas faire retélécharger `index.html` en boucle (ni intervalles courts sur des fichiers du site) :
  GitHub Pages bloque l'IP ("Rate limit exceeded") au-delà d'un certain nombre de requêtes.

## Repères pour reprendre le projet (nov. 2026)
- Tout le jeu est dans `index.html` (JS vanilla, Firebase compat). Serveur : `functions/index.js`
  (déployé automatiquement par GitHub Actions quand `functions/**` ou `firestore.rules` change).
- Après chaque modif : incrémenter `APP_V`, vérifier la syntaxe (`node --check` sur le dernier `<script>`),
  tester dans un navigateur headless, puis commit + push sur `main`.
- Données joueur (doc `onzeol_users/{uid}`) : coins, coll, evo, trophies[{id,k,n,at}], div, career, pass,
  advent, mis (missions), seasonDone, rankDone, crest (écusson 1-12), tuto…
- Méta partagée (`onzeol_meta`) : `main` (matches), `rank` (months → classements mois/saison),
  `preds` (pronos), `olLive` (live score OL écrit par `olLiveScore` toutes les 2 min).
- Trophées : objet `TROPHY`, vitrine `trophiesHTML` / `VIT_CATS`, rattrapage client `trophyCheck`
  et serveur `trophyBackfill`. Saisons : `SEASONK`, `claimSeason`, images `trImg` par saison.
- Images : `img/` (fonds de cartes, cartes/portraits, trophees, tuiles, packs, ecussons, nav,
  stade.webp, vitrine-*.webp, logo.webp). Toutes générées avec ChatGPT puis converties en webp.
- À vérifier au 1er vrai match OL : le live score ESPN (buteurs dans `details`, détection de Lyon).
- Jeux de cartes (🃏, vue `#viewCards`, code « JEUX DE CARTES » dans `index.html`) : 6 modes (`CG_MODES`, moteurs `CG_ENG`,
  vues `CG_VIEW`). Parties en ligne = docs `mode:"cards"` dans `onzeol_drafts` (donne + graine + coups `mv`), l'état est
  rejoué par `cgReplay` : tout doit rester déterministe (utiliser `cgRng`, jamais `Math.random` dans `step`).
  Cartes TCG (`tcgOf`, `tcgHTML`) seulement pour Épique et plus ; Éclats 💠 dans `tcg` du doc joueur. Images : `img/tcg`, `img/jeux`.
