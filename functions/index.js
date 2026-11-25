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
  if (!after || after.mode === "duo" || after.status !== "running" || !after.turn) return;
  if (before && before.status === "running" && before.turn === after.turn) return;
  const other = (after.players || []).find(p => p !== after.turn);
  const who = await nameOf(other); const kind = after.mode === "budget" ? "💰 Mode Budget" : "⚡ Draft";
  await notify(after.turn, `${kind} : à toi de jouer !`, `${who} attend ton choix.`);
});
// Draft / Budget : invitation, refus, acceptation
exports.draftInvite = onDocumentWritten({ document: "onzeol_drafts/{id}", region: REGION }, async ev => {
  const before = ev.data.before.exists ? ev.data.before.data() : null, after = ev.data.after.exists ? ev.data.after.data() : null;
  if (!after || after.mode === "duo") return;
  const kind = after.mode === "budget" ? "💰 Partie Budget" : "⚡ Draft";
  const bi = before && before.inv, ai = after.inv;
  if (ai && after.status === "lobby" && (!bi || bi.at !== ai.at)) {
    const to = (after.players || []).find(p => p !== ai.by);
    return notify(to, `${kind} : invitation`, `${await nameOf(ai.by)} t'invite à jouer. Accepte ou refuse dans 🌐 En ligne.`);
  }
  if (bi && !ai) {
    const other = (after.players || []).find(p => p !== bi.by);
    if (after.refused && after.refused.by === other && after.refused.at > bi.at) return notify(bi.by, `${kind} : invitation refusée`, `${await nameOf(other)} a refusé ton invitation.`);
    if (after.status === "running" && after.turn !== bi.by) return notify(bi.by, `${kind} : invitation acceptée`, `${await nameOf(other)} a accepté, la partie commence !`);
  }
});
// 👥 2 contre 2 : invitation, refus/annulation, début du draft, ton tour, draft terminé
exports.duoDraft = onDocumentWritten({ document: "onzeol_drafts/{id}", region: REGION }, async ev => {
  const before = ev.data.before.exists ? ev.data.before.data() : null, after = ev.data.after.exists ? ev.data.after.data() : null;
  if (!after || after.mode !== "duo") return;
  const pl = after.players || [], bs = before && before.status;
  const nm = async u => await nameOf(u);
  if (!before && after.status === "lobby") {
    const by = await nm(after.by);
    for (const u of pl) if (u !== after.by) await notify(u, "👥 2 contre 2 : invitation", `${by} t'invite à un 2 contre 2. Accepte ou refuse dans 🌐 En ligne › 2 contre 2.`);
    return;
  }
  if (after.status === "cancelled" && bs !== "cancelled") {
    const w = (after.refused || after.cancelled || {}).by; const who = await nm(w);
    for (const u of pl) if (u !== w) await notify(u, "👥 2 contre 2 annulé", `${who} ${after.refused ? "a refusé l'invitation" : "a annulé la partie"}.`);
    return;
  }
  if (after.status === "done" && bs === "running") {
    for (const u of pl) await notify(u, "👥 2 contre 2 : draft terminé", "Les équipes sont prêtes. Appuie sur « Prêt » dans 🌐 En ligne › 2 contre 2.");
    return;
  }
  if (after.status === "running" && after.turn && !(bs === "running" && before.turn === after.turn)) {
    const prev = bs === "running" ? await nm(before.turn) : null;
    await notify(after.turn, "👥 2 contre 2 : à toi de choisir !", prev ? `${prev} a fait son choix, c'est ton tour.` : "Les 4 ont accepté, tu choisis en premier !");
  }
});
// 🃏 Jeux de cartes : invitation, réponse, « à toi de jouer », fin de partie (nx = joueurs qui doivent jouer, écrit par l'appli)
const CG_N = { bat: "⚔️ Bataille de stats", duel: "🃏 Duel 5 cartes", tab: "🥅 Tirs au but", cbt: "🔥 Combat TCG", pyr: "🔺 Pyramide", pom: "↕️ Plus ou moins" };
// 🔴 Échange en direct : invitation, acceptation, échange conclu
exports.liveTrade = onDocumentWritten({ document: "onzeol_ltrades/{id}", region: REGION }, async ev => {
  const before = ev.data.before.exists ? ev.data.before.data() : null, after = ev.data.after.exists ? ev.data.after.data() : null;
  if (!after) return; const [a, b] = after.players || [], bs = before && before.status;
  if (!before && after.status === "invite") return notify(b, "🔴 Échange en direct", `${await nameOf(a)} t'invite à échanger des cartes en direct. Ouvre l'appli pour le rejoindre !`);
  if (bs === "invite" && after.status === "open") return notify(a, "🔴 Échange en direct", `${await nameOf(b)} a rejoint ton échange.`);
  if (bs === "invite" && after.status === "cancelled") return notify(a, "🔴 Échange en direct", `${await nameOf(b)} a refusé ton invitation.`);
});

exports.cardGame = onDocumentWritten({ document: "onzeol_drafts/{id}", region: REGION }, async ev => {
  const before = ev.data.before.exists ? ev.data.before.data() : null, after = ev.data.after.exists ? ev.data.after.data() : null;
  if (!after || after.mode !== "cards") return;
  const kind = CG_N[after.g] || "🃏 Jeu de cartes", pl = after.players || [], other = pl.find(u => u !== after.by), bs = before && before.status;
  if (!before && after.status === "lobby") return notify(other, `${kind} : invitation`, `${await nameOf(after.by)} t'invite à jouer. Réponds dans 🎮 Solo › 🃏 Jeux de cartes.`);
  if (bs === "lobby" && after.status === "cancelled") return notify(after.by, `${kind} : invitation refusée`, `${await nameOf(other)} a refusé ta partie.`);
  if (bs === "lobby" && after.status === "running") return notify(after.by, `${kind} : c'est parti !`, `${await nameOf(other)} a accepté ta partie, à toi de jouer.`);
  if (after.status === "done" && bs === "running") return;
  if (after.status !== "running") return;
  const was = (before && before.nx) || [], now = after.nx || [];
  for (const u of now) if (!was.includes(u)) {
    const o = pl.find(x => x !== u); await notify(u, `${kind} : à toi de jouer !`, `${await nameOf(o)} a joué, c'est ton tour.`);
  }
});

// Match lancé contre toi
exports.matchLaunched = onDocumentWritten({ document: "onzeol_meta/main", region: REGION }, async ev => {
  const before = ev.data.before.exists ? ev.data.before.data() : {}, after = ev.data.after.exists ? ev.data.after.data() : {};
  const m = after.match; if (!m || (before.match && before.match.id === m.id)) return;
  const by = await nameOf(m.by);
  const to = new Set(); for (const t of m.teams || []) for (const u of (t.owners || [t.owner])) if (u && u !== m.by) to.add(u);
  for (const u of to) await notify(u, "🏟️ Match en direct !", m.duo ? `${by} a lancé un match en duo avec toi. Viens voir !` : `${by} a lancé un match contre toi. Viens voir !`);
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
// 🧪 Notification de test (bouton dans le menu du compte)
exports.notifPing = onDocumentUpdated({ document: "onzeol_users/{uid}", region: REGION }, async ev => {
  const b = ev.data.before.data() || {}, a = ev.data.after.data() || {};
  if (!a.pingAt || a.pingAt === b.pingAt) return;
  await new Promise(r => setTimeout(r, 8000));
  await notify(ev.params.uid, "🧪 Test réussi !", "Les notifications marchent sur ce téléphone 👍");
});
// 👥 Demandes d'ami
exports.friendRequest = onDocumentWritten({ document: "onzeol_social/{id}", region: REGION }, async ev => {
  const before = ev.data.before.exists ? ev.data.before.data() : null, after = ev.data.after.exists ? ev.data.after.data() : null;
  if (!after || !Array.isArray(after.u)) return;
  const other = after.u.find(x => x !== after.by);
  if (after.status === "pending" && (!before || before.status !== "pending" || before.by !== after.by))
    return notify(other, "👥 Demande d'ami", `${await nameOf(after.by)} veut t'ajouter en ami. Réponds dans 👥 Social.`);
  if (after.status === "accepted" && before && before.status === "pending")
    return notify(before.by, "👥 Demande acceptée", `${await nameOf(before.u.find(x => x !== before.by))} a accepté ta demande d'ami !`);
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
  const L = ev.data.data(); await notifyAll("🏆 Nouveau championnat !", `${await nameOf(L.owner)} a créé « ${L.name} ». Rejoins-le dans 🌐 En ligne › Championnats.`, L.owner);
});
exports.cupCreated = onDocumentCreated({ document: "onzeol_cups/{id}", region: REGION }, async ev => {
  const K = ev.data.data(); if (K.weekend) return notifyAll("🏆 La Coupe du week-end est ouverte !", "Inscris-toi avant samedi 20 h dans 🌐 En ligne › Coupes : Pack Légende pour le vainqueur !");
  await notifyAll("🏆 Nouvelle coupe !", `${await nameOf(K.owner)} a créé la coupe « ${K.name} » (${K.size} joueurs). Inscris-toi dans 🌐 En ligne › Coupes.`, K.owner);
});

// 🏆 COUPE DU WEEK-END automatique : créée le vendredi 18 h, inscriptions libres, tirage le samedi 20 h
const ADMIN_UID = "EMx6WLN3DtazTVDRozJmdvUHnVE2";
const wkId = () => { const d = new Date(); const w = Math.floor((d.getTime() / 86400000 + 3) / 7); return "wk-" + w; };
exports.weekendCupCreate = onSchedule({ schedule: "3 18 * * 5", timeZone: "Europe/Paris", region: REGION }, async () => {
  const ref = db.collection("onzeol_cups").doc(wkId()); if ((await ref.get()).exists) return;
  const d = new Date(); const label = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
  await ref.set({ name: "Coupe du week-end · " + label, owner: ADMIN_UID, size: 8, members: [], status: "open", rounds: [], created: Date.now(), weekend: true });
});
exports.weekendCupStart = onSchedule({ schedule: "7 20 * * 6", timeZone: "Europe/Paris", region: REGION }, async () => {
  const ref = db.collection("onzeol_cups").doc(wkId()); const s = await ref.get(); if (!s.exists) return; const K = s.data(); if (K.status !== "open") return;
  const M = (K.members || []).slice();
  if (M.length < 4) { await ref.update({ status: "done", cancelled: true }); return notifyAll("🏆 Coupe du week-end annulée", "Pas assez d'inscrits cette semaine (4 minimum). Rendez-vous vendredi prochain !"); }
  const size = M.length >= 8 ? 8 : 4; const P = M.slice(0, size).sort(() => Math.random() - .5); const ties = [];
  for (let i = 0; i < P.length; i += 2) ties.push({ a: P[i], b: P[i + 1], legs: [], w: null });
  await ref.update({ size, members: P, status: "running", rounds: [{ ties }], start: Date.now() });
  for (const u of P) await notify(u, "🏆 Coupe du week-end : c'est parti !", "Le tirage est fait, les matchs se jouent automatiquement. Suis le tableau dans 🌐 En ligne › Coupes.");
});

// 📨 Invitation à une coupe ou un championnat (le créateur ajoute des joueurs dans inv)
async function notifyInvites(b, a, kind, tab) {
  const before = (b && b.inv) || {}, after = (a && a.inv) || {};
  const by = await nameOf(a.owner);
  for (const [u, at] of Object.entries(after)) {
    if (before[u] === at || (a.members || []).includes(u)) continue;
    await notify(u, `📨 Invitation : ${a.name}`, `${by} t'invite dans ${kind} « ${a.name} ». Rejoins-le dans ${tab}.`);
  }
}
exports.cupInvite = onDocumentUpdated({ document: "onzeol_cups/{id}", region: REGION }, async ev => {
  await notifyInvites(ev.data.before.data(), ev.data.after.data(), "la coupe", "🌐 En ligne › Coupes");
});
exports.leagueInvite = onDocumentUpdated({ document: "onzeol_leagues/{id}", region: REGION }, async ev => {
  await notifyInvites(ev.data.before.data(), ev.data.after.data(), "le championnat", "🌐 En ligne › Championnats");
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
    for (const x of [t.a, t.b]) await notify(x, `⚽ ${a.name} : résultat`, txt + " (revois le match dans 🌐 En ligne › Coupes)");
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
    for (const x of [f.a, f.b]) await notify(x, `⚽ ${a.name} : résultat`, txt + " · revois le match dans 🌐 En ligne › Championnats"); }
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

// 🏆 Trophées de progression pour TOUS les joueurs (même ceux qui n'ouvrent pas l'appli) — même logique que trophyCheck() dans index.html
const UL_OLD_IDS = {"fleury-di-nallo": "Fleury Di Nallo", "serge-chiesa": "Serge Chiesa", "bernard-lacombe": "Bernard Lacombe", "nestor-combin": "Néstor Combin", "angel-rambert": "Ángel Rambert", "yves-chauveau": "Yves Chauveau", "aime-mignot": "Aimé Mignot", "raymond-domenech": "Raymond Domenech", "jean-djorkaeff": "Jean Djorkaeff", "jean-tigana": "Jean Tigana", "remi-garde": "Rémi Garde"};
const SET_T = {"bronze": "Toutes les Communes", "silver": "Toutes les Rares", "gold": "Toutes les Épiques", "icon": "Toutes les Légendaires", "myth": "Toutes les Mythiques", "coach": "Tous les entraîneurs", "bresil": "Les Brésiliens", "septuple": "Les champions du septuplé", "actuel": "L'effectif actuel", "e2000": "Les années 2000", "e2010": "Les années 2010", "e2020": "La nouvelle génération", "france": "Les Bleus de l'OL 🇫🇷", "lmod": "Toutes les Légendes modernes ⭐", "ultime": "Toutes les Légendes Ultimes 👑", "all": "L'album complet"};
const CAREER_STAGES = [[7, "Ligue 1"], [11, "Europa League"], [15, "Ligue des champions"]];
const DIV_NAME = d => d === -1 ? "Division Ultime" : d === 0 ? "Ligue des Champions" : `Division ${d}`;
const prettyId = id => id.replace(/--\w+$/, "").split("-").map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
function trophiesFor(c) {
  const T = (c.trophies || []).map(x => ({ ...x })); let ch = false; const now = Date.now();
  const has = id => T.some(x => x.id === id); const put = (id, k, n) => { if (has(id)) return; T.push({ id, k, n, at: now }); ch = true; };
  T.forEach(x => { if (x.k === "cup" && String(x.id).startsWith("wk-")) { x.k = "wk"; ch = true; } });
  const rm = id => { const i = T.findIndex(x => x.id === id); if (i >= 0) { T.splice(i, 1); ch = true; } };
  const D = c.div; if (D) { rm("div-up"); for (let d = 9; d >= (D.best ?? 10); d--) put("div-up-" + d, "up", `Montée en ${DIV_NAME(d)}`);
    if (D.d === 0 && D.p >= 9) put("ldc-" + D.w, "ldc", "Titre en Ligue des Champions"); }
  const K = c.career; if (K) { rm("car"); CAREER_STAGES.forEach(([n, comp], i) => { if ((K.best || 0) >= n) put("car-" + (n - 1), "car", `Carrière : ${comp} remportée`); }); }
  const P = c.pass; if (P && P.lv >= 30 && P.s) { const [y, m] = String(P.s).split("-").map(Number); put("pass-" + P.s, "pass", "Pass " + new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })); }
  const A = c.advent; if (A && Object.keys(A.o || {}).length >= 24) put("noel-" + A.y, "noel", `Noël ${A.y} : 24/24`);
  (c.albumDone || []).forEach(id => { if (SET_T[id]) put("alb-" + id, "alb", SET_T[id].trim()); });
  if ((c.goldPacks || 0) > 0) put("gold", "gold", "Gold Pack ouvert");
  const own = Object.keys(c.coll || {}).filter(id => c.coll[id] > 0);
  const gf = own.find(id => id.endsWith("--gf")); if (gf) put("gf", "gf", prettyId(gf));
  const ul = own.find(id => id.endsWith("--ul") || UL_OLD_IDS[id]); if (ul) put("ul", "ul", UL_OLD_IDS[ul] || prettyId(ul));
  return ch ? T : null;
}
exports.trophyBackfill = onSchedule({ schedule: "*/30 * * * *", timeZone: "Europe/Paris", region: REGION }, async () => {
  const qs = await db.collection("onzeol_users").get();
  for (const d of qs.docs) { const T = trophiesFor(d.data() || {}); if (T) await d.ref.update({ trophies: T }); }
});

// 📊 Récap du dimanche soir : la semaine de chacun + le meilleur du club (matchs des 7 derniers jours)
exports.weeklyRecap = onSchedule({ schedule: "13 20 * * 0", timeZone: "Europe/Paris", region: REGION }, async () => {
  const meta = await db.collection("onzeol_meta").doc("main").get(); const M = ((meta.exists && meta.data().matches) || []).filter(h => h && h.at > Date.now() - 7 * 86400000 && h.score && h.owners);
  const users = await allUsers(); const S = {};
  for (const u of users) S[u.id] = { w: 0, g: 0, p: 0, tr: (u.trophies || []).filter(t => t.at > Date.now() - 7 * 86400000).length };
  for (const h of M) h.owners.forEach((u, i) => { if (!S[u] || h.nr) return; const a = h.score[i], b = h.score[1 - i]; S[u].p++; S[u].g += a || 0; if (a > b) S[u].w++; });
  const best = users.filter(u => S[u.id].p).sort((a, b) => S[b.id].w - S[a.id].w || S[b.id].g - S[a.id].g)[0];
  const scorer = users.filter(u => S[u.id].g).sort((a, b) => S[b.id].g - S[a.id].g)[0];
  for (const u of users) { if (!(u.fcm || []).length) continue; const s = S[u.id];
    const me = s.p ? `Ta semaine : ${s.p} match${s.p > 1 ? "s" : ""}, ${s.w} victoire${s.w > 1 ? "s" : ""}, ${s.g} but${s.g > 1 ? "s" : ""}${s.tr ? `, ${s.tr} trophée${s.tr > 1 ? "s" : ""}` : ""}.` : "Tu n'as pas joué cette semaine, ton 11 t'attend !";
    const club = best ? ` 🏆 Joueur de la semaine : ${best.name || "?"} (${S[best.id].w} victoires)${scorer && scorer.id !== best.id ? ` · ⚽ meilleure attaque : ${scorer.name || "?"} (${S[scorer.id].g} buts)` : ""}.` : "";
    await notify(u.id, "📊 Le récap de la semaine", me + club); }
});

// 🔴 LIVE SCORE OL : toutes les 2 min, on lit les matchs du jour (ESPN) dans les compétitions de l'OL.
// Le score en direct est écrit dans onzeol_meta/olLive (l'appli l'écoute) + notification à chaque but et au coup de sifflet final.
const OL_LEAGUES = ["fra.1", "uefa.europa", "uefa.champions", "uefa.europa.conf", "fra.coupe_de_france"];
const isLyon = t => /^(olympique )?lyon(nais)?$/i.test(String((t && (t.displayName || t.name)) || "").trim()) || String((t && t.shortDisplayName) || "") === "Lyon";
const shortTeam = t => { const n = String((t && (t.shortDisplayName || t.displayName)) || "?"); return isLyon(t) ? "OL" : n; };
async function espn(url) { try { const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000); const r = await fetch(url, { signal: ctl.signal }); clearTimeout(to); return r.ok ? await r.json() : null; } catch (e) { return null; } }
exports.olLiveScore = onSchedule({ schedule: "*/2 * * * *", timeZone: "Europe/Paris", region: REGION }, async () => {
  let found = null;
  for (const lg of OL_LEAGUES) { const sb = await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard`); if (!sb) continue;
    for (const ev of sb.events || []) { const c = (ev.competitions || [])[0]; if (!c) continue; const H = (c.competitors || []).find(x => x.homeAway === "home"), A = (c.competitors || []).find(x => x.homeAway === "away"); if (!H || !A) continue;
      if (!isLyon(H.team) && !isLyon(A.team)) continue; const st = (c.status || ev.status || {}); const kick = new Date(ev.date || c.date).getTime();
      if (Math.abs(kick - Date.now()) > 5 * 3600000) continue; found = { lg, ev, c, H, A, st, kick }; break; }
    if (found) break; }
  const ref = db.collection("onzeol_meta").doc("olLive"); const prevS = await ref.get(); const prev = prevS.exists ? prevS.data() : {};
  if (!found) { if (prev.state && prev.state !== "none" && Date.now() - (prev.at || 0) > 3 * 3600000) await ref.set({ state: "none", at: Date.now() }); return; }
  const { lg, ev, c, H, A, st, kick } = found; const state = (st.type && st.type.state) || "pre";
  const side = id => String(id) === String(H.team && H.team.id) ? "h" : "a";
  const goals = [], cards = [];
  for (const d of c.details || []) { const who = ((d.athletesInvolved || [])[0] || {}).displayName || ""; const m = (d.clock && d.clock.displayValue) || "";
    if (d.scoringPlay) goals.push({ m, t: side(d.team && d.team.id), p: who, og: !!d.ownGoal, pen: !!d.penaltyKick });
    else if (d.redCard || d.yellowCard) cards.push({ m, t: side(d.team && d.team.id), p: who, red: !!d.redCard }); }
  const doc = { state, ev: String(ev.id), lg, comp: (lg === "fra.1" ? "Ligue 1" : lg === "uefa.europa" ? "Ligue Europa" : lg === "uefa.champions" ? "Ligue des champions" : lg === "uefa.europa.conf" ? "Ligue Conférence" : "Coupe de France"),
    h: shortTeam(H.team), a: shortTeam(A.team), olHome: isLyon(H.team), hs: +H.score || 0, as: +A.score || 0, clk: st.displayClock || "", det: (st.type && (st.type.shortDetail || st.type.detail)) || "", kick, goals, cards, at: Date.now() };
  const same = prev.ev === doc.ev && prev.state === doc.state && prev.hs === doc.hs && prev.as === doc.as && prev.clk === doc.clk && JSON.stringify(prev.goals || []) === JSON.stringify(goals) && JSON.stringify(prev.cards || []) === JSON.stringify(cards);
  if (!same) await ref.set(doc);
  // 🔔 notifications : nouveaux buts, puis fin de match
  if (prev.ev === doc.ev) {
    const olSide = doc.olHome ? "h" : "a"; const sc = `${doc.h} ${doc.hs}-${doc.as} ${doc.a}`;
    if (prev.state === "pre" && state === "in") await notifyAll("🔴 C'est parti !", `${doc.h} - ${doc.a} · ${doc.comp} : suis le live score dans l'appli.`);
    for (const g of goals.slice((prev.goals || []).length)) {
      const forOL = g.t === olSide; await notifyAll(forOL ? "⚽ BUUUT POUR L'OL !" : "😤 But adverse", `${sc} · ${g.p || "?"} ${g.m}${g.pen ? " (pen.)" : ""}${g.og ? " (csc)" : ""}`); }
    if (prev.state === "in" && state === "post") { const ol = doc.olHome ? doc.hs : doc.as, op = doc.olHome ? doc.as : doc.hs;
      await notifyAll(ol > op ? "🎉 Victoire de l'OL !" : ol < op ? "😞 Défaite de l'OL" : "🤝 Match nul", `${sc} · ${doc.comp}. Va voir tes points de prono !`); }
  } else if (state === "in") await notifyAll("🔴 C'est parti !", `${doc.h} - ${doc.a} · ${doc.comp} : le live score est dans l'appli.`);
});
