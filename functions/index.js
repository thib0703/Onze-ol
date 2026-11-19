// Notifications push de « Les Gones Legends » (Cloud Functions v2)
const { onDocumentWritten, onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
initializeApp();
const db = getFirestore();
const URL = "https://thib0703.github.io/Onze-ol/";
const REGION = "europe-west1";

async function nameOf(uid) { const s = await db.collection("onzeol_users").doc(uid).get(); return (s.exists && s.data().name) || "Quelqu'un"; }
async function notify(uid, title, body) {
  if (!uid || uid === "cpu") return;
  const ref = db.collection("onzeol_users").doc(uid); const s = await ref.get();
  const tokens = (s.exists && s.data().fcm) || []; if (!tokens.length) return;
  const res = await getMessaging().sendEachForMulticast({
    tokens, notification: { title, body },
    webpush: { notification: { icon: URL + "icon-192.png" }, fcmOptions: { link: URL } }
  });
  const bad = tokens.filter((t, i) => !res.responses[i].success && /registration-token-not-registered|invalid-argument/.test(String(res.responses[i].error && res.responses[i].error.code)));
  if (bad.length) await ref.update({ fcm: FieldValue.arrayRemove(...bad) });
}

// Draft / Budget : c'est ton tour
exports.draftTurn = onDocumentWritten({ document: "onzeol_drafts/{id}", region: REGION }, async ev => {
  const before = ev.data.before.exists ? ev.data.before.data() : null, after = ev.data.after.exists ? ev.data.after.data() : null;
  if (!after || after.status !== "running" || !after.turn) return;
  if (before && before.status === "running" && before.turn === after.turn) return;
  const other = (after.players || []).find(p => p !== after.turn);
  const who = await nameOf(other); const kind = after.mode === "budget" ? "💰 Mode Budget" : "⚡ Draft";
  await notify(after.turn, `${kind} : à toi de jouer !`, `${who} attend ton choix.`);
});
// Match lancé contre toi
exports.matchLaunched = onDocumentWritten({ document: "onzeol_meta/main", region: REGION }, async ev => {
  const before = ev.data.before.exists ? ev.data.before.data() : {}, after = ev.data.after.exists ? ev.data.after.data() : {};
  const m = after.match; if (!m || (before.match && before.match.id === m.id)) return;
  const by = await nameOf(m.by);
  for (const t of m.teams || []) if (t.owner && t.owner !== m.by) await notify(t.owner, "🏟️ Match en direct !", `${by} a lancé un match contre toi. Viens voir !`);
});
// Proposition d'échange
exports.tradeCreated = onDocumentCreated({ document: "onzeol_trades/{id}", region: REGION }, async ev => {
  const t = ev.data.data(); await notify(t.to, "🔄 Proposition d'échange", `${await nameOf(t.from)} te propose un échange de cartes.`);
});
exports.tradeAnswered = onDocumentUpdated({ document: "onzeol_trades/{id}", region: REGION }, async ev => {
  const b = ev.data.before.data(), a = ev.data.after.data(); if (b.status === a.status) return;
  if (a.status === "accepted") await notify(a.from, "🔄 Échange accepté", `${await nameOf(a.to)} a accepté ton échange !`);
  if (a.status === "refused") await notify(a.from, "🔄 Échange refusé", `${await nameOf(a.to)} a refusé ton échange.`);
});
// Carte vendue sur le marché
exports.marketSold = onDocumentUpdated({ document: "onzeol_market/{id}", region: REGION }, async ev => {
  const b = ev.data.before.data(), a = ev.data.after.data();
  if (b.status !== "sold" && a.status === "sold") await notify(a.seller, "🏪 Carte vendue !", `${await nameOf(a.buyer)} a acheté ta carte pour ${a.price} pièces.`);
});
// Enchères : surenchère
exports.auctionOutbid = onDocumentUpdated({ document: "onzeol_auctions/{id}", region: REGION }, async ev => {
  const b = ev.data.before.data(), a = ev.data.after.data();
  if (b.bidder && a.bidder && b.bidder !== a.bidder) await notify(b.bidder, "🔨 Surenchère !", `${await nameOf(a.bidder)} a proposé ${a.bid} pièces. Reprends la tête !`);
  if (!b.bidder && a.bidder) await notify(a.seller, "🔨 Première offre", `${await nameOf(a.bidder)} propose ${a.bid} pièces pour ta carte.`);
});

// ---------- Notifications ajoutées ----------
async function allUsers() { const qs = await db.collection("onzeol_users").get(); return qs.docs.map(d => ({ id: d.id, ...d.data() })); }
async function notifyAll(title, body, except) { for (const u of await allUsers()) if (u.id !== except && (u.fcm || []).length) await notify(u.id, title, body); }
const todayParis = () => new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });

// 🎁 Rappel du pack du jour (18h) s'il n'a pas été ouvert
exports.dailyPackReminder = onSchedule({ schedule: "0 18 * * *", timeZone: "Europe/Paris", region: REGION }, async () => {
  const d = todayParis();
  for (const u of await allUsers()) if ((u.fcm || []).length && u.daily !== d) await notify(u.id, "🎁 Ton pack du jour t'attend !", "Il est gratuit : ouvre-le avant minuit dans 🎴 Collec.");
});

// 🏆 Nouveau championnat / nouvelle coupe
exports.leagueCreated = onDocumentCreated({ document: "onzeol_leagues/{id}", region: REGION }, async ev => {
  const L = ev.data.data(); await notifyAll("🏆 Nouveau championnat !", `${await nameOf(L.owner)} a créé « ${L.name} ». Rejoins-le dans l'onglet Ligue.`, L.owner);
});
exports.cupCreated = onDocumentCreated({ document: "onzeol_cups/{id}", region: REGION }, async ev => {
  const K = ev.data.data(); await notifyAll("🏆 Nouvelle coupe !", `${await nameOf(K.owner)} a créé la coupe « ${K.name} » (${K.size} joueurs). Inscris-toi dans 🎮 Jeux.`, K.owner);
});

// ⚽ Résultats des matchs automatiques de coupe
exports.cupTieReady = onDocumentUpdated({ document: "onzeol_cups/{id}", region: REGION }, async ev => {
  const b = ev.data.before.data(), a = ev.data.after.data();
  if (a.status === "running" && b.status === "open") { for (const m of a.members || []) await notify(m, "🏆 Tirage effectué !", `La coupe « ${a.name} » commence : les matchs se jouent automatiquement.`); return; }
  const R = a.rounds || [];
  for (let ri = 0; ri < R.length; ri++) for (let i = 0; i < R[ri].ties.length; i++) {
    const t = R[ri].ties[i], p = ((b.rounds || [])[ri] || { ties: [] }).ties[i] || { legs: [] };
    if ((t.legs || []).length <= (p.legs || []).length) continue;
    const l = t.legs[t.legs.length - 1], an = await nameOf(t.a), bn = await nameOf(t.b);
    const txt = `${an} ${l.s[0]}-${l.s[1]} ${bn}${t.w ? ` · qualifié : ${t.w === t.a ? an : bn}` : ""}`;
    for (const x of [t.a, t.b]) await notify(x, `⚽ ${a.name} : résultat`, txt + " (revois le match dans 🎮 Jeux)");
  }
  if (a.status === "done" && b.status !== "done") for (const m of a.members || []) if (m !== a.winner) await notify(m, "🏆 Coupe terminée", `${await nameOf(a.winner)} remporte la coupe « ${a.name} » !`);
});
// ⚽ Résultats et lancement des championnats automatiques
exports.leagueUpdate = onDocumentUpdated({ document: "onzeol_leagues/{id}", region: REGION }, async ev => {
  const b = ev.data.before.data(), a = ev.data.after.data();
  if (a.status === "running" && b.status !== "running") { for (const m of a.members || []) if (m !== a.owner) await notify(m, "🏆 Le championnat commence !", `« ${a.name} » est lancé : les matchs se jouent automatiquement.`); return; }
  const F = a.fix || [], P = b.fix || [];
  for (let i = 0; i < F.length; i++) { const f = F[i]; if (!f.s || (P[i] && P[i].s)) continue;
    const txt = `${await nameOf(f.a)} ${f.s[0]}-${f.s[1]} ${await nameOf(f.b)} (journée ${f.r})`;
    for (const x of [f.a, f.b]) await notify(x, `⚽ ${a.name} : résultat`, txt + " · revois le match dans Ligue"); }
});

// 🌈 Carte Mythique ou ✨ Gold Pack tiré par un pote (via le fil d'actu)
exports.bigPull = onDocumentCreated({ document: "onzeol_feed/{id}", region: REGION }, async ev => {
  const f = ev.data.data(); const t = f.text || "";
  if (/GOLD PACK/.test(t)) await notifyAll("✨ GOLD PACK !", t, f.who);
  else if (t.startsWith("🌈")) await notifyAll("🌈 Carte Mythique !", t, f.who);
});

// 🤕 Forme réelle : un de tes joueurs se blesse ou est suspendu (lecture de live.json, 2× par jour)
exports.liveInjuries = onSchedule({ schedule: "30 10,19 * * *", timeZone: "Europe/Paris", region: REGION }, async () => {
  let live; try { const r = await fetch(URL + "live.json?t=" + Date.now()); if (!r.ok) return; live = await r.json(); } catch (e) { return; }
  const ref = db.collection("onzeol_meta").doc("liveSeen"); const seenDoc = await ref.get(); const seen = (seenDoc.exists && seenDoc.data().players) || {};
  const P = live.players || {}; const fresh = Object.entries(P).filter(([id, x]) => (x.st === "inj" || x.st === "sus") && seen[id] !== x.st);
  await ref.set({ players: Object.fromEntries(Object.entries(P).map(([id, x]) => [id, x.st])), at: Date.now() });
  if (!fresh.length || !seenDoc.exists) return; // première lecture : on mémorise sans notifier
  const base = id => String(id).split("--")[0];
  for (const u of await allUsers()) {
    if (!(u.fcm || []).length) continue;
    const mine = new Set([...Object.values(u.slots || {}), ...Object.values(u.bench || {})].filter(Boolean).map(base));
    for (const [id, x] of fresh) if (mine.has(id)) await notify(u.id, x.st === "inj" ? "🤕 Un de tes joueurs est blessé" : "🟥 Un de tes joueurs est suspendu", `${id.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")} : ${x.note || ""} (${x.mod > 0 ? "+" : ""}${x.mod} dans le jeu)`);
  }
});

// 💾 Sauvegarde de tous les comptes chaque nuit (garde 21 jours)
exports.nightlyBackup = onSchedule({ schedule: "15 3 * * *", timeZone: "Europe/Paris", region: REGION }, async () => {
  const day = new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  const qs = await db.collection("onzeol_users").get(); const users = {};
  qs.forEach(d => { const x = { ...d.data() }; delete x.fcm; users[d.id] = x; });
  await db.collection("onzeol_backups").doc(day).set({ at: Date.now(), by: "nuit", users });
  const old = await db.collection("onzeol_backups").get(); const lim = new Date(Date.now() - 21 * 86400000).toLocaleDateString("fr-CA");
  for (const d of old.docs) if (d.id < lim) await d.ref.delete();
});
