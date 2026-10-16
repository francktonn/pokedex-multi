/* bonus.js — missions quotidiennes et hebdomadaires, série de connexion et shop rotatif.
   Chargé au démarrage du site (pas à l'ouverture de l'onglet Bonus) pour compter les actions même si l'onglet n'a jamais été ouvert.
   Tout est mémorisé sur cet appareil (localStorage). Expose window.PokeQuests (missions + série) et window.PokeShop (offres du jour / de la semaine). */
(function () {
  "use strict";

  // ---------- Dates ----------
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function dayStr(d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function mondayStr() { var d = new Date(), wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dayStr(d); }
  function yesterdayStr() { var d = new Date(); d.setDate(d.getDate() - 1); return dayStr(d); }
  function msUntilTomorrow() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - d.getTime(); }
  function msUntilMonday() { var d = new Date(), wd = (d.getDay() + 6) % 7; return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (7 - wd)).getTime() - d.getTime(); }

  // ---------- Tirage reproductible (le même jour donne les mêmes offres / missions) ----------
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    var a = hash(seed);
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function pick(list, n, seed) {
    var r = rng(seed), a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, n);
  }
  // Comme pick(), mais sans deux missions du même type le même jour (ex. « 2 manches » et « 4 manches »).
  function pickDistinct(list, n, seed) {
    var out = [], used = {};
    pick(list, list.length, seed).forEach(function (q) { if (out.length < n && !used[q.stat]) { used[q.stat] = 1; out.push(q); } });
    return out;
  }
  function load(key) { try { var o = JSON.parse(localStorage.getItem(key) || "null"); return o && typeof o === "object" ? o : null; } catch (e) { return null; } }
  function save(key, v, evt) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} window.dispatchEvent(new CustomEvent(evt)); }
  function num(v) { v = Math.floor(Number(v)); return v > 0 ? v : 0; }
  function toast(text, opts) { if (window.toast) window.toast(text, opts); }

  // =====================================================================
  // MISSIONS
  // stat : rounds (manches multijoueur terminées) · crates (crates ouvertes) · found (Pokémon trouvés en Devinette)
  //        wplayed / wwon (manches jouées / gagnées à « Qui est-ce ? ») · days (jours de connexion dans la semaine)
  // m = Pokédollars, xp = XP du Battle Pass
  // =====================================================================
  var DAILY = [
    { id: "d_rounds2", stat: "rounds",  t: 2, text: "Termine 2 manches multijoueur",            m: 150, xp: 20 },
    { id: "d_rounds4", stat: "rounds",  t: 4, text: "Termine 4 manches multijoueur",            m: 300, xp: 35 },
    { id: "d_crate",   stat: "crates",  t: 1, text: "Ouvre 1 crate",                            m: 100, xp: 15 },
    { id: "d_found",   stat: "found",   t: 2, text: "Trouve 2 Pokémon en Devinette",            m: 150, xp: 20 },
    { id: "d_wplay",   stat: "wplayed", t: 2, text: "Joue 2 manches de « Qui est-ce ? »",       m: 120, xp: 20 },
    { id: "d_wwin",    stat: "wwon",    t: 1, text: "Gagne 1 manche de « Qui est-ce ? »",       m: 150, xp: 25 }
  ];
  var WEEKLY = [
    { id: "w_rounds",  stat: "rounds",  t: 12, text: "Termine 12 manches multijoueur",          m: 700, xp: 90 },
    { id: "w_crate",   stat: "crates",  t: 5,  text: "Ouvre 5 crates",                          m: 600, xp: 80 },
    { id: "w_found",   stat: "found",   t: 12, text: "Trouve 12 Pokémon en Devinette",          m: 700, xp: 90 },
    { id: "w_wplay",   stat: "wplayed", t: 10, text: "Joue 10 manches de « Qui est-ce ? »",     m: 650, xp: 85 },
    { id: "w_wwin",    stat: "wwon",    t: 6,  text: "Gagne 6 manches de « Qui est-ce ? »",     m: 750, xp: 100 },
    { id: "w_days",    stat: "days",    t: 5,  text: "Connecte-toi 5 jours cette semaine",      m: 500, xp: 75 }
  ];
  var byId = {};
  DAILY.concat(WEEKLY).forEach(function (q) { byId[q.id] = q; });
  var QKEY = "pokeQuests_v1";

  function qLoad() {
    var o = load(QKEY) || {};
    var s = { day: typeof o.day === "string" ? o.day : "", week: typeof o.week === "string" ? o.week : "", d: [], w: [], snap: null };
    function clean(arr, pool) {
      return (Array.isArray(arr) ? arr : []).filter(function (q) { return q && byId[q.id] && pool.indexOf(byId[q.id]) >= 0; })
        .map(function (q) { return { id: q.id, p: Math.min(byId[q.id].t, num(q.p)), c: q.c === true }; });
    }
    s.d = clean(o.d, DAILY); s.w = clean(o.w, WEEKLY);
    if (o.snap && typeof o.snap === "object") s.snap = { wp: num(o.snap.wp), wc: num(o.snap.wc), gf: num(o.snap.gf) };
    return s;
  }
  function qSave(s) { save(QKEY, s, "questchange"); }
  function mk(def) { return { id: def.id, p: 0, c: false }; }
  // Nouveau jour / nouvelle semaine : on tire de nouvelles missions. Renvoie true si quelque chose a changé.
  function qEnsure(s) {
    var t = dayStr(), w = mondayStr(), ch = false;
    if (s.day !== t || s.d.length !== 3) { s.day = t; s.d = pickDistinct(DAILY, 3, "d" + t).map(mk); ch = true; }
    if (s.week !== w || s.w.length !== 3) { s.week = w; s.w = pickDistinct(WEEKLY, 3, "w" + w).map(mk); ch = true; }
    return ch;
  }
  function qState() { var s = qLoad(); if (qEnsure(s)) qSave(s); return s; }

  function track(stat, n) {
    n = Math.floor(Number(n)); if (!(n > 0)) return;
    var s = qState(), ch = false;
    s.d.concat(s.w).forEach(function (q) {
      var def = byId[q.id];
      if (def.stat === stat && !q.c && q.p < def.t) {
        q.p = Math.min(def.t, q.p + n); ch = true;
        if (q.p >= def.t) toast("Mission accomplie : " + def.text + " !", { kind: "ok", icon: "🎯", ttl: 4200 });
      }
    });
    if (ch) qSave(s);
  }

  // Parties de « Qui est-ce ? » et Pokémon trouvés : on compare les statistiques locales à la dernière valeur vue.
  function syncStats() {
    if (!window.PokeStats) return;
    var S = window.PokeStats.get(), cur = { wp: S.whois.played, wc: S.whois.correct, gf: S.guess.found };
    var s = qState(), snap = s.snap;
    s.snap = cur;
    if (!snap) { qSave(s); return; } // première fois : on ne compte pas l'historique passé
    var dp = cur.wp - snap.wp, dc = cur.wc - snap.wc, df = cur.gf - snap.gf;
    if (dp === 0 && dc === 0 && df === 0) return;
    qSave(s);
    if (dp > 0) track("wplayed", dp);
    if (dc > 0) track("wwon", dc);
    if (df > 0) track("found", df);
  }

  // ---------- Série de connexion ----------
  var SKEY = "pokeStreak_v1";
  // Cycle de 7 jours : m = Pokédollars, c = crates, xp = XP du Battle Pass
  var STREAK = [ { m: 100 }, { m: 150 }, { m: 200, xp: 20 }, { m: 250, c: 1 }, { m: 300, xp: 30 }, { m: 400 }, { m: 600, c: 2, xp: 50 } ];
  function sLoad() {
    var o = load(SKEY) || {};
    return { last: typeof o.last === "string" ? o.last : "", streak: num(o.streak), best: num(o.best), claimed: typeof o.claimed === "string" ? o.claimed : "" };
  }
  // Appelé au démarrage et à chaque retour sur la page : compte le jour de connexion et prolonge ou remet à zéro la série.
  function checkin() {
    var s = sLoad(), t = dayStr();
    if (s.last === t) return false;
    s.streak = s.last === yesterdayStr() ? s.streak + 1 : 1;
    s.last = t; s.best = Math.max(s.best, s.streak);
    save(SKEY, s, "questchange");
    track("days", 1);
    return true;
  }
  function streakState() {
    var s = sLoad(), t = dayStr(), day = s.streak > 0 ? ((s.streak - 1) % 7) + 1 : 1;
    return { streak: s.streak, best: s.best, day: day, rewards: STREAK, canClaim: s.last === t && s.claimed !== t, claimedToday: s.claimed === t };
  }
  function streakClaim() {
    var st = streakState();
    if (!st.canClaim) return null;
    var r = STREAK[st.day - 1], out = { m: r.m || 0, c: 0, xp: r.xp || 0 };
    if (r.c) {
      if (!window.PokeCrates || window.PokeCrates.state().stock + r.c > 99) return { error: "stock" };
    }
    var s = sLoad(); s.claimed = dayStr(); save(SKEY, s, "questchange");
    if (out.m && window.PokeMoney) window.PokeMoney.add(out.m);
    if (r.c && window.PokeCrates) out.c = window.PokeCrates.grant(r.c);
    if (out.xp && window.PokePass) window.PokePass.addXp(out.xp);
    return out;
  }

  window.PokeQuests = {
    track: track,
    streak: { state: streakState, claim: streakClaim },
    state: function () {
      var s = qState();
      function view(list) {
        return list.map(function (q) {
          var def = byId[q.id];
          return { id: q.id, text: def.text, target: def.t, progress: q.p, done: q.p >= def.t, claimed: q.c, money: def.m, xp: def.xp };
        });
      }
      return { daily: view(s.d), weekly: view(s.w), msDaily: msUntilTomorrow(), msWeekly: msUntilMonday() };
    },
    // Récupère la récompense d'une mission terminée. kind = "daily" | "weekly". Renvoie { money, xp } ou null.
    claim: function (kind, id) {
      var s = qState(), list = kind === "weekly" ? s.w : s.d, q = null;
      list.forEach(function (x) { if (x.id === id) q = x; });
      if (!q || q.c) return null;
      var def = byId[q.id]; if (q.p < def.t) return null;
      q.c = true; qSave(s);
      if (window.PokeMoney) window.PokeMoney.add(def.m);
      if (window.PokePass) window.PokePass.addXp(def.xp);
      return { money: def.m, xp: def.xp };
    },
    // Nombre de récompenses prêtes à être récupérées (missions terminées + bonus de série du jour) : sert à la pastille de l'onglet Bonus.
    claimable: function () {
      var s = qState(), n = 0;
      s.d.concat(s.w).forEach(function (q) { if (!q.c && q.p >= byId[q.id].t) n++; });
      if (streakState().canClaim) n++;
      return n;
    }
  };

  // =====================================================================
  // SHOP ROTATIF
  // Offres du jour : 2 objets de crate pas encore possédés (-20 %) + 1 lot au hasard. Offres de la semaine : 2 gros lots.
  // Chaque offre ne peut être achetée qu'une fois par période.
  // =====================================================================
  var HKEY = "pokeShop_v1";
  var ITEM_BASE = [1250, 2500, 5000, 10000]; // prix normal par rareté (Commun → Légendaire), vendu -20 %
  var PACKS = [
    { id: "p_c3", kind: "crates", n: 3,   name: "Lot de 3 crates",  base: 3000, price: 2400 },
    { id: "p_c5", kind: "crates", n: 5,   name: "Lot de 5 crates",  base: 5000, price: 3750 },
    { id: "p_xp", kind: "xp",     xp: 200, name: "Boost XP +200",   base: 1200, price: 900 }
  ];
  var WEEKLY_OFFERS = [
    { id: "w_c10", kind: "crates", n: 10,  name: "Méga lot de 10 crates", base: 10000, price: 7000 },
    { id: "w_xp",  kind: "xp",     xp: 600, name: "Super boost XP +600",  base: 3000,  price: 2200 }
  ];

  function hLoad() {
    var o = load(HKEY) || {};
    var s = { day: typeof o.day === "string" ? o.day : "", week: typeof o.week === "string" ? o.week : "", daily: [], wb: {} };
    (Array.isArray(o.daily) ? o.daily : []).forEach(function (x) {
      if (!x || typeof x.id !== "string" || !/^(item|crates|xp)$/.test(x.kind)) return;
      s.daily.push({ id: x.id, kind: x.kind, name: String(x.name || "").slice(0, 40), price: num(x.price), base: num(x.base), n: num(x.n), xp: num(x.xp),
        key: String(x.key || ""), list: String(x.list || ""), idx: num(x.idx), catName: String(x.catName || ""), css: String(x.css || ""), e: String(x.e || ""), rar: num(x.rar), b: x.b === true });
    });
    if (o.wb && typeof o.wb === "object") Object.keys(o.wb).forEach(function (k) { if (o.wb[k]) s.wb[k] = true; });
    return s;
  }
  function hSave(s) { save(HKEY, s, "shopchange"); }
  function hEnsure(s) {
    var t = dayStr(), w = mondayStr(), ch = false, C = window.PokeCrates;
    if (s.day !== t) {
      s.day = t; s.daily = [];
      if (C) {
        var free = C.items().filter(function (it) { return !C.owns(it.list, it.idx); });
        pick(free, 2, "i" + t).forEach(function (it) {
          s.daily.push({ id: "i:" + it.key, kind: "item", name: it.name, key: it.key, list: it.list, idx: it.idx, catName: it.catName, css: it.css, e: it.e, rar: it.rar,
            base: ITEM_BASE[it.rar], price: Math.round(ITEM_BASE[it.rar] * 0.8), n: 0, xp: 0, b: false });
        });
      }
      var pk = pick(PACKS, 1, "p" + t)[0];
      s.daily.push({ id: pk.id, kind: pk.kind, name: pk.name, price: pk.price, base: pk.base, n: pk.n || 0, xp: pk.xp || 0, key: "", list: "", idx: 0, catName: "", css: "", e: "", rar: 0, b: false });
      ch = true;
    }
    if (s.week !== w) { s.week = w; s.wb = {}; ch = true; }
    return ch;
  }
  function hState() { var s = hLoad(); if (hEnsure(s)) hSave(s); return s; }

  window.PokeShop = {
    state: function () {
      var s = hState(), C = window.PokeCrates, rars = (C && C.rarities) || [];
      var daily = s.daily.map(function (o) {
        var owned = o.kind === "item" && !!C && C.owns(o.list, o.idx);
        return { id: o.id, kind: o.kind, name: o.name, price: o.price, base: o.base, n: o.n, xp: o.xp, catName: o.catName, css: o.css, e: o.e,
          rarity: o.kind === "item" && rars[o.rar] ? rars[o.rar] : null, bought: o.b, owned: owned };
      });
      var weekly = WEEKLY_OFFERS.map(function (o) {
        return { id: o.id, kind: o.kind, name: o.name, price: o.price, base: o.base, n: o.n || 0, xp: o.xp || 0, catName: "", css: "", e: "", rarity: null, bought: !!s.wb[o.id], owned: false };
      });
      return { daily: daily, weekly: weekly, msDaily: msUntilTomorrow(), msWeekly: msUntilMonday() };
    },
    // Achète une offre. Renvoie { ok:true, text } ou { error:"…" }.
    buy: function (id) {
      var s = hState(), C = window.PokeCrates, M = window.PokeMoney, o = null, weekly = false;
      s.daily.forEach(function (x) { if (x.id === id) o = x; });
      if (!o) { WEEKLY_OFFERS.forEach(function (x) { if (x.id === id) { o = x; weekly = true; } }); }
      if (!o || !C || !M) return { error: "Offre introuvable." };
      if (weekly ? s.wb[o.id] : o.b) return { error: "Offre déjà achetée." };
      if (o.kind === "item" && C.owns(o.list, o.idx)) return { error: "Tu possèdes déjà cet objet." };
      if (o.kind === "crates" && C.state().stock + o.n > 99) return { error: "Stock de crates trop plein (99 max). Ouvre-en quelques-unes." };
      if (M.get() < o.price) return { error: "Solde insuffisant." };
      if (!M.spend(o.price)) return { error: "Solde insuffisant." };
      var text = "";
      if (o.kind === "item") { C.grantItem(o.key); text = "« " + o.name + " » ajouté à ta collection !"; }
      else if (o.kind === "crates") { var got = C.grant(o.n); text = "+" + got + " crate" + (got > 1 ? "s" : "") + " !"; }
      else { if (window.PokePass) window.PokePass.addXp(o.xp); text = "+" + o.xp + " XP du Battle Pass !"; }
      if (weekly) s.wb[o.id] = true; else o.b = true;
      hSave(s);
      return { ok: true, text: text };
    }
  };

  // ---------- Démarrage et rafraîchissement ----------
  function tick() {
    checkin();
    qState();
    hState();
    syncStats();
    if (window.PokePass && window.PokePass.sync) window.PokePass.sync();
  }
  window.addEventListener("statschange", syncStats);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
  setInterval(function () { if (!document.hidden) tick(); }, 30000);
  tick();
})();
