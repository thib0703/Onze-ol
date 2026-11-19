// Notifications push de « Les Gones Legends » (Cloud Functions v2)
const { onDocumentWritten, onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
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
