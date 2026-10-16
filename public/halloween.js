/* halloween.js — événement Halloween (du 17 octobre au 31 octobre inclus, fin le 1er novembre à minuit).
   Chargé au démarrage du site (comme bonus.js) pour compter les bonbons même si l'onglet 🎃 n'a jamais été ouvert.
   Tout est mémorisé sur cet appareil (localStorage). Expose window.PokeHalloween.

   • Bonbons 🍬 : gagnés à chaque manche de Devinette terminée (+10) et à chaque Pokémon trouvé (+5), avec un plafond par jour,
     et via la récompense de connexion quotidienne (calendrier de 15 jours, sans plafond).
   • Boutique : objets de profil (marqués `hw: prix` dans les listes de PokeProfile) et skins de Pokédex (marqués `hw: prix`
     dans PokePass.skins) achetables uniquement avec des bonbons. Ce qui est acheté reste acquis pour toujours.
   • À la fin de l'événement, les bonbons restants sont convertis en Pokédollars. */
(function () {
  "use strict";

  // ---------- Réglages ----------
  var LOGIN = [10, 10, 15, 15, 20, 25, 40,   15, 15, 20, 20, 25, 30, 40,   100]; // un jour = une case (17 → 31 oct.)
  var START = new Date(2026, 9, 17).getTime();                   // 17 oct. 2026, 00:00 (heure de l'appareil)
  var END = new Date(2026, 9, 17 + LOGIN.length).getTime();      // 1er nov. 2026, 00:00 (exclu)
  var CANDY_ROUND = 10;      // par manche de Devinette terminée
  var CANDY_FOUND = 5;       // par Pokémon trouvé en Devinette
  var PLAY_CAP = 200;        // plafond de bonbons « de jeu » par jour (la connexion quotidienne n'est pas concernée)
  var MONEY_PER_CANDY = 5;   // conversion en Pokédollars quand l'événement se termine
  var MAX = 99999;
  var KEY = "pokeHalloween_v1";

  // Listes de PokeProfile → champ du profil → libellé (même table que les crates et le Battle Pass)
  var CATS = [["bgs", "bg", "Fond de carte"], ["titles", "title", "Titre"], ["frameStyles", "frameStyle", "Style de cadre"], ["shapes", "shape", "Forme de photo"],
    ["effects", "effect", "Effet animé"], ["nameFonts", "nameFont", "Police du pseudo"], ["nameColors", "nameColor", "Couleur du pseudo"]];
  var RARITIES = [{ name: "Commun", color: "#8e9aa8", max: 100 }, { name: "Rare", color: "#3a86d6", max: 250 },
    { name: "Épique", color: "#9b6bd6", max: 500 }, { name: "Légendaire", color: "#E6A700", max: 999999 }];

  // ---------- Utilitaires ----------
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function dayStr(d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function num(v) { v = Math.floor(Number(v)); return v > 0 ? v : 0; }
  function toast(text, opts) { if (window.toast) window.toast(text, opts); }
  // Numéro du jour dans l'événement (0 = 17 oct.), en dates calendaires : insensible aux changements d'heure.
  function dayIndex(d) {
    var a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), b = Date.UTC(2026, 9, 17);
    return Math.round((a - b) / 86400000);
  }
  function rarityOf(price) { for (var i = 0; i < RARITIES.length; i++) if (price <= RARITIES[i].max) return i; return RARITIES.length - 1; }

  // ---------- État mémorisé ----------
  function read() {
    var s = { candies: 0, earned: 0, owned: {}, claimed: {}, play: { day: "", n: 0 }, snap: null, hello: "", settled: false };
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || "null");
      if (o && typeof o === "object") {
        s.candies = Math.min(MAX, num(o.candies)); s.earned = num(o.earned);
        if (o.owned && typeof o.owned === "object") Object.keys(o.owned).forEach(function (k) { if (/^[a-zA-Z]+:[a-zA-Z0-9]+$/.test(k) && o.owned[k]) s.owned[k] = Number(o.owned[k]) || 1; });
        if (o.claimed && typeof o.claimed === "object") Object.keys(o.claimed).forEach(function (k) { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && o.claimed[k]) s.claimed[k] = true; });
        if (o.play && typeof o.play === "object") s.play = { day: typeof o.play.day === "string" ? o.play.day : "", n: num(o.play.n) };
        if (o.snap != null && isFinite(Number(o.snap))) s.snap = num(o.snap);
        s.hello = typeof o.hello === "string" ? o.hello : ""; s.settled = o.settled === true;
      }
    } catch (e) {}
    return s;
  }
  function write(s, silent) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    if (!silent) window.dispatchEvent(new CustomEvent("halloweenchange"));
  }

  // ---------- Période ----------
  function active() { var t = Date.now(); return t >= START && t < END; }

  // ---------- Gains ----------
  // Ajoute des bonbons (hors événement : rien). opts.play = soumis au plafond quotidien. Renvoie le nombre réellement ajouté.
  function award(n, opts) {
    n = Math.floor(Number(n)); opts = opts || {};
    if (!(n > 0) || !active()) return 0;
    var s = read(), day = dayStr(), g = n;
    if (s.play.day !== day) s.play = { day: day, n: 0 };
    if (opts.play) { g = Math.min(n, Math.max(0, PLAY_CAP - s.play.n)); s.play.n += g; }
    if (g > 0) { s.candies = Math.min(MAX, s.candies + g); s.earned += g; }
    write(s);
    return g;
  }
  function playState() {
    var s = read(), n = s.play.day === dayStr() ? s.play.n : 0;
    return { used: n, cap: PLAY_CAP, left: Math.max(0, PLAY_CAP - n) };
  }
  // Appelé par index.html à chaque manche de Devinette terminée.
  function onRound(count) {
    count = Math.floor(Number(count));
    if (!(count > 0) || !active()) return 0;
    return award(CANDY_ROUND * count, { play: true });
  }
  // Pokémon trouvés en Devinette : on compare les statistiques locales à la dernière valeur vue (l'historique passé ne compte pas).
  function syncStats() {
    if (!window.PokeStats) return;
    var f = window.PokeStats.get().guess.found, s = read(), prev = s.snap;
    s.snap = f; write(s, true);
    if (prev === null || f <= prev || !active()) return;
    var d = f - prev, g = award(d * CANDY_FOUND, { play: true });
    if (g > 0) toast("+" + g + " 🍬 bonbons !", { kind: "ok", icon: "🎃", ttl: 2400 });
    else toast("Plafond de bonbons atteint pour aujourd'hui (" + PLAY_CAP + "). Reviens demain !", { kind: "warn", icon: "🍬", ttl: 3600 });
  }

  // ---------- Connexion quotidienne ----------
  var MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function loginState() {
    var s = read(), now = new Date(), idx = dayIndex(now), days = [];
    for (var i = 0; i < LOGIN.length; i++) {
      var d = new Date(2026, 9, 17 + i), ds = dayStr(d);
      days.push({ i: i, date: d.getDate(), month: MONTHS[d.getMonth()], reward: LOGIN[i], big: LOGIN[i] >= 40,
        status: s.claimed[ds] ? "claimed" : i < idx ? "missed" : i === idx ? "today" : "future" });
    }
    var can = active() && idx >= 0 && idx < LOGIN.length && !s.claimed[dayStr(now)];
    var total = 0, got = 0;
    days.forEach(function (d) { total += d.reward; if (d.status === "claimed") got += d.reward; });
    return { days: days, today: idx, canClaim: can, claimedToday: !!s.claimed[dayStr(now)], total: total, got: got };
  }
  function loginClaim() {
    var st = loginState();
    if (!st.canClaim) return null;
    var n = LOGIN[st.today], s = read();
    s.claimed[dayStr()] = true; s.candies = Math.min(MAX, s.candies + n); s.earned += n;
    write(s);
    return { candies: n, day: st.today + 1 };
  }

  // ---------- Boutique ----------
  function skinsDef() { return (window.PokePass && window.PokePass.skins) || {}; }
  // Tous les articles : skins (hw = prix dans PokePass.skins) puis objets de profil (hw = prix dans les listes de PokeProfile).
  function catalog() {
    var s = read(), P = window.PokeProfile, out = [], SK = skinsDef();
    Object.keys(SK).forEach(function (id) {
      if (!SK[id].hw) return;
      var price = num(SK[id].hw), key = "skin:" + id;
      out.push({ key: key, kind: "skin", list: "skins", idx: 0, id: id, field: "", catName: "Skin du Pokédex", name: SK[id].name, price: price, css: SK[id].color || "", rar: rarityOf(price), owned: !!s.owned[key] });
    });
    if (P) CATS.forEach(function (c) {
      (P[c[0]] || []).forEach(function (it, i) {
        if (!it || !it.hw) return;
        var price = num(it.hw), key = c[0] + ":" + i;
        out.push({ key: key, kind: "item", list: c[0], idx: i, id: "", field: c[1], catName: c[2], name: it.name, price: price, css: it.css || "", rar: rarityOf(price), owned: !!s.owned[key] });
      });
    });
    return out;
  }
  function find(key) { var all = catalog(); for (var i = 0; i < all.length; i++) if (all[i].key === key) return all[i]; return null; }

  function buy(key) {
    if (!active()) return { error: "L'événement est terminé : la boutique est fermée." };
    var it = find(key);
    if (!it) return { error: "Article introuvable." };
    var s = read();
    if (s.owned[key]) return { error: "Tu possèdes déjà cet article." };
    if (s.candies < it.price) return { error: "Il te manque " + (it.price - s.candies) + " 🍬." };
    if (it.kind === "skin" && (!window.PokePass || !window.PokePass.grantSkin)) return { error: "Les skins ne sont pas disponibles pour l'instant." };
    s.candies -= it.price; s.owned[key] = Date.now();
    write(s);
    if (it.kind === "skin") window.PokePass.grantSkin(it.id);
    return { ok: true, text: "« " + it.name + " » est à toi !", item: it };
  }
  // Équipe un article possédé : skin du Pokédex ou personnalisation du profil enregistré.
  function equip(key) {
    var it = find(key);
    if (!it || !read().owned[key]) return { error: "Article non débloqué." };
    if (it.kind === "skin") return window.PokePass && window.PokePass.setSkin(it.id) ? { ok: true } : { error: "Impossible d'équiper ce skin." };
    var P = window.PokeProfile, cur = P && P.get();
    if (!cur) return { error: "Crée d'abord ton profil dans l'onglet Profil." };
    cur[it.field] = it.idx; P.set(cur);
    return { ok: true };
  }
  function isEquipped(it) {
    if (it.kind === "skin") return !!window.PokePass && window.PokePass.state().skin === it.id;
    var cur = window.PokeProfile && window.PokeProfile.get();
    return !!cur && cur[it.field] === it.idx;
  }

  // ---------- Fin de l'événement ----------
  function settle() {
    if (Date.now() < END) return;
    var s = read();
    if (s.settled) return;
    s.settled = true;
    var c = s.candies, money = c * MONEY_PER_CANDY;
    s.candies = 0; write(s);
    if (c > 0 && window.PokeMoney) {
      window.PokeMoney.add(money);
      toast("L'événement Halloween est terminé ! Tes " + c + " 🍬 restants sont convertis en " + money.toLocaleString("fr-FR") + " ₽. Tes récompenses restent à toi.", { kind: "win", icon: "🎃", ttl: 7000 });
    }
  }

  window.PokeHalloween = {
    active: active,
    started: function () { return Date.now() >= START; },
    ended: function () { return Date.now() >= END; },
    startsAt: START, endsAt: END,
    msLeft: function () { return Math.max(0, END - Date.now()); },
    candies: function () { return read().candies; },
    earned: function () { return read().earned; },
    format: function (v) { return (v == null ? read().candies : v).toLocaleString("fr-FR") + " 🍬"; },
    rates: { round: CANDY_ROUND, found: CANDY_FOUND, cap: PLAY_CAP, perCandy: MONEY_PER_CANDY },
    playState: playState,
    onRound: onRound,
    award: award,
    login: { state: loginState, claim: loginClaim },
    rarities: RARITIES, cats: CATS,
    catalog: catalog, buy: buy, equip: equip, isEquipped: isEquipped,
    owns: function (key) { return !!read().owned[key]; },
    ownsItem: function (list, idx) { return !!read().owned[list + ":" + idx]; },
    ownsSkin: function (id) { return !!read().owned["skin:" + id]; },
    // Admin : tout débloquer.
    unlockAll: function () {
      var s = read();
      catalog().forEach(function (it) { s.owned[it.key] = s.owned[it.key] || Date.now(); if (it.kind === "skin" && window.PokePass && window.PokePass.grantSkin) window.PokePass.grantSkin(it.id); });
      s.candies = Math.min(MAX, s.candies + 9999); write(s);
    }
  };

  // ---------- Démarrage et rafraîchissement ----------
  function tick() {
    settle();
    syncStats();
    // Rappel une fois par jour : la récompense de connexion attend.
    if (active() && loginState().canClaim) {
      var s = read(), t = dayStr();
      if (s.hello !== t) { s.hello = t; write(s, true); toast("🎃 Halloween : ta récompense de connexion du jour t'attend !", { icon: "🍬", ttl: 5000 }); }
    }
    window.dispatchEvent(new CustomEvent("halloweentick"));
  }
  window.addEventListener("statschange", syncStats);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
  setInterval(function () { if (!document.hidden) tick(); }, 30000);
  tick();
})();
