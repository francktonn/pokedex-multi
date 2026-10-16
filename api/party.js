/* party.js — GROUPE commun à tous les modes de jeu (barre au-dessus des onglets).
   Un seul code pour le groupe ; l'hôte choisit le mode (Qui est-ce ? / Wordle) et les autres voient un bandeau
   « Rejoindre ». Chaque mode garde sa propre salle : le groupe ne fait que relayer son code, et chaque joueur
   s'y inscrit lui-même avec son profil. Les scores restent propres à chaque mode (rien n'est cumulé).
   Chargé au démarrage (pas à la demande) pour que le bandeau soit visible sur tous les onglets. */
(function () {
  "use strict";
  var host = document.getElementById("partyBar");
  if (!host) return;

  var MODES = {
    whois:  { label: "Qui est-ce ?",    icon: "❔", api: "/api/whois",  tab: "tabWhois",  ctl: "WhoIsCtl",  keys: ["whois_code", "whois_pid"] },
    wordle: { label: "Pokédex Wordle", icon: "🟩", api: "/api/wordle", tab: "tabWordle", ctl: "WordleCtl", keys: ["wordle_code", "wordle_pid"] }
  };
  var ORDER = ["whois", "wordle"];

  var CSS = [
    ":host{display:block; font-family:'Nunito',sans-serif; color:#fff;}",
    "*{box-sizing:border-box; -webkit-tap-highlight-color:transparent;}",
    ".bar{background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.14); border-radius:20px; padding:8px; -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px);}",
    ".row{display:flex; align-items:center; gap:8px; flex-wrap:wrap;}",
    ".row + .row{margin-top:8px;}",
    ".grow{flex:1; min-width:0;}",
    ".title{font-family:'Silkscreen',monospace; font-size:11px; letter-spacing:.12em; opacity:.9;}",
    ".code{font-family:'Silkscreen',monospace; font-size:15px; letter-spacing:.16em; background:rgba(0,0,0,.28); padding:5px 10px; border-radius:10px;}",
    "button{font:inherit; cursor:pointer; border:0; color:#fff;}",
    ".ic{width:36px; height:36px; border-radius:50%; background:rgba(0,0,0,.28); font-size:15px;}",
    ".pill{min-height:44px; width:100%; border-radius:999px; background:transparent; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:15px;}",
    ".btn{min-height:42px; padding:0 16px; border-radius:14px; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:14px; color:#221d17; background:linear-gradient(180deg,#ffd96b,#FFC93C 55%,#f0b21f); box-shadow:0 3px 0 #D99A12;}",
    ".btn:active{transform:translateY(2px); box-shadow:0 1px 0 #D99A12;}",
    ".btn:disabled{opacity:.55; cursor:default;}",
    ".btn.alt{background:rgba(0,0,0,.28); color:#fff; box-shadow:none;}",
    "input{font:inherit; font-size:16px; font-weight:700; color:#221d17; background:#fff; border:2px solid transparent; border-radius:12px; padding:9px 12px; outline:none; min-width:0;}",
    "input:focus{border-color:#D99A12;}",
    "input.c{width:110px; text-transform:uppercase; letter-spacing:.2em; text-align:center;}",
    ".members{display:flex; gap:8px; flex-wrap:wrap;}",
    ".m{display:flex; align-items:center; gap:6px; background:rgba(0,0,0,.25); border-radius:999px; padding:3px 10px 3px 3px; font-weight:800; font-size:13px;}",
    ".m.away{opacity:.45;} .m.me{box-shadow:inset 0 0 0 1.5px #FFC93C;}",
    ".m img, .m .noav{width:28px; height:28px; border-radius:50%; background:#0e1a12; border:2px solid #070d08; object-fit:contain; image-rendering:pixelated; flex-shrink:0;}",
    ".m .noav{display:flex; align-items:center; justify-content:center; color:#8ff0a4; font-family:'Silkscreen',monospace; font-size:11px;}",
    ".m button{background:transparent; color:#ff9b91; font-size:13px; padding:0 0 0 2px;}",
    ".banner{display:flex; align-items:center; gap:10px; background:linear-gradient(180deg,rgba(255,217,107,.28),rgba(255,201,60,.18)); border:1px solid rgba(255,201,60,.55); border-radius:14px; padding:8px 10px; font-weight:800; font-size:14px; animation:pop .35s cubic-bezier(.2,.8,.2,1) both;}",
    "@keyframes pop{from{opacity:0; transform:translateY(-6px)}to{opacity:1; transform:none}}",
    ".note{font-weight:700; font-size:13px; opacity:.9;}",
    ".err{color:#ffd0cb; font-weight:800; font-size:13px; min-height:0;}",
    ".hidden{display:none !important;}",
    "@media (prefers-reduced-motion:reduce){*{animation-duration:.001ms !important;}}"
  ].join("\n");

  var root = host.attachShadow({ mode: "open" });
  var style = document.createElement("style"); style.textContent = CSS; root.appendChild(style);
  var mount = document.createElement("div"); root.appendChild(mount);

  var P = { code: null, pid: null, st: null, open: false, err: "", busy: false, polling: null, seen: false, lastMode: null, lastModeCode: null, sig: "", notice: "" };

  // ---------- Utilitaires ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function profile() { return window.PokeProfile ? window.PokeProfile.get() : null; }
  function myName() { var pr = profile(); return pr ? pr.name : (load("party_name") || "").trim().slice(0, 16); }
  function myAvatar() { var pr = profile(); return pr && pr.favId ? pr.favId : null; }
  function myCard() { return profile() ? window.PokeProfile.card() : null; }
  function sprite(id, st) { return window.PokeProfile ? window.PokeProfile.sprite(id, st) : "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/" + id + ".png"; }
  function request(url, method, body, query) {
    var opt = { method: method };
    if (body) { opt.headers = { "Content-Type": "application/json" }; opt.body = JSON.stringify(body); }
    return fetch(url + (query ? "?" + query : ""), opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || "Erreur"); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function partyPost(action, extra) { return request("/api/party", "POST", Object.assign({ action: action, code: P.code, playerId: P.pid }, extra || {})); }

  // ---------- Salles des modes ----------
  function ctlOf(mode) { return window[MODES[mode].ctl] || null; }
  // Code de la salle du mode dans laquelle JE suis (onglet déjà chargé, ou session mémorisée sinon).
  function myRoomCode(mode) {
    var c = ctlOf(mode);
    return c ? (c.code() || null) : (load(MODES[mode].keys[0]) || null);
  }
  function openMode(mode, code, pid) {
    var m = MODES[mode];
    store(m.keys[0], code); store(m.keys[1], pid);
    var c = ctlOf(mode);
    if (c) c.enter(code, pid);          // onglet déjà chargé : on y entre directement
    var tab = document.getElementById(m.tab);
    if (tab) tab.click();               // sinon il se charge et reprend la session mémorisée
  }
  function leaveModeRoom(mode, code) {
    if (!mode || !code || !MODES[mode]) return;
    var c = ctlOf(mode), m = MODES[mode];
    if (c && c.code() === code) { c.leave(); return; }
    if (load(m.keys[0]) === code) {
      var pid = load(m.keys[1]);
      if (pid) request(m.api, "POST", { action: "leave", code: code, playerId: pid }).catch(function () {});
      store(m.keys[0], null); store(m.keys[1], null);
    }
  }

  // ---------- Groupe : créer / rejoindre / quitter ----------
  function needName() {
    if (myName()) { P.err = ""; return true; }
    P.err = "Choisis un pseudo (ou crée ton profil)."; render(); return false;
  }
  function enterParty(code, pid) {
    P.code = code; P.pid = pid; P.st = null; P.seen = false; P.open = false; P.err = "";
    store("party_code", code); store("party_pid", pid);
    try { var u = new URL(location.href); if (u.searchParams.has("party")) { u.searchParams.delete("party"); history.replaceState(null, "", u.pathname + u.search); } } catch (e) {}
    startPolling(); render();
  }
  function leaveLocal(msg) {
    clearInterval(P.polling); P.polling = null;
    P.code = P.pid = P.st = null; P.seen = false; P.lastMode = P.lastModeCode = null; P.sig = ""; P.open = false;
    store("party_code", null); store("party_pid", null);
    P.notice = msg || ""; render();
  }
  function createParty() {
    var inp = root.getElementById("nameIn"); if (inp && inp.value.trim()) store("party_name", inp.value.trim().slice(0, 16));
    if (!needName()) return;
    P.busy = true; render();
    request("/api/party", "POST", { action: "create", name: myName(), avatar: myAvatar(), card: myCard() })
      .then(function (r) { P.busy = false; enterParty(r.code, r.playerId); })
      .catch(function (e) { P.busy = false; P.err = e.message; render(); });
  }
  function joinParty() {
    var inp = root.getElementById("nameIn"); if (inp && inp.value.trim()) store("party_name", inp.value.trim().slice(0, 16));
    var code = (root.getElementById("codeIn").value || "").trim().toUpperCase();
    if (!needName()) return;
    if (!code) { P.err = "Entre le code du groupe."; render(); return; }
    P.busy = true; render();
    request("/api/party", "POST", { action: "join", code: code, name: myName(), avatar: myAvatar(), card: myCard() })
      .then(function (r) { P.busy = false; enterParty(r.code, r.playerId); })
      .catch(function (e) { P.busy = false; P.err = e.message; render(); });
  }
  function quitParty() {
    if (!window.confirm("Quitter le groupe ? Tu quitteras aussi la salle du mode en cours.")) return;
    var st = P.st;
    if (st && st.mode) leaveModeRoom(st.mode, st.modeCode);
    partyPost("leave").catch(function () {}).then(function () { leaveLocal(""); });
  }

  // ---------- Changement de mode (hôte) / rejoindre (membres) ----------
  function hostSwitch(mode) {
    var st = P.st; if (!st || !st.isHost || P.busy) return;
    if (!needName()) return;
    P.busy = true; P.err = ""; render();
    if (st.mode && st.modeCode) leaveModeRoom(st.mode, st.modeCode);
    var m = MODES[mode];
    request(m.api, "POST", { action: "create", name: myName(), avatar: myAvatar(), card: myCard() })
      .then(function (r) {
        return partyPost("setmode", { mode: mode, modeCode: r.code }).then(function (s) {
          openMode(mode, r.code, r.playerId);
          P.st = s; P.lastMode = s.mode; P.lastModeCode = s.modeCode;
        });
      })
      .catch(function (e) { P.err = e.message; })
      .then(function () { P.busy = false; render(); });
  }
  function joinMode() {
    var st = P.st; if (!st || !st.mode || P.busy) return;
    if (!needName()) return;
    P.busy = true; P.err = ""; render();
    var m = MODES[st.mode], mode = st.mode;
    request(m.api, "POST", { action: "join", code: st.modeCode, name: myName(), avatar: myAvatar(), card: myCard() })
      .then(function (r) { openMode(mode, r.code, r.playerId); })
      .catch(function (e) { P.err = e.status === 404 ? "Cette salle n'existe plus, demande à l'hôte de relancer le mode." : e.message; })
      .then(function () { P.busy = false; render(); });
  }

  // ---------- Sondage ----------
  function startPolling() { clearInterval(P.polling); poll(); P.polling = setInterval(poll, 2000); }
  function poll() {
    if (!P.code || document.hidden) return;
    request("/api/party", "GET", null, "code=" + encodeURIComponent(P.code) + "&playerId=" + encodeURIComponent(P.pid))
      .then(function (st) {
        // Le mode a changé : on quitte l'ancienne salle (si j'y suis encore) pour ne pas laisser de joueur fantôme.
        if (P.seen && st.modeCode !== P.lastModeCode && P.lastMode) leaveModeRoom(P.lastMode, P.lastModeCode);
        P.seen = true; P.lastMode = st.mode; P.lastModeCode = st.modeCode;
        P.st = st; render();
      })
      .catch(function (e) {
        if (e.status === 404 || e.status === 403) leaveLocal(e.status === 403 ? "Tu as été retiré du groupe." : "Le groupe n'existe plus.");
      });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });

  // Garde ta carte à jour auprès du groupe.
  var cardTimer = null;
  function pushCard() { clearTimeout(cardTimer); cardTimer = setTimeout(function () { if (P.code && profile()) partyPost("card", { card: myCard() }).catch(function () {}); }, 800); }
  window.addEventListener("statschange", pushCard);
  window.addEventListener("profilechange", pushCard);

  // ---------- Rendu ----------
  function render() {
    var st = P.st, inMode = st && st.mode ? myRoomCode(st.mode) === st.modeCode : false;
    var sig = JSON.stringify([P.code, P.open, P.err, P.busy, P.notice, inMode, st && Object.assign({}, st, { now: 0 })]);
    if (sig === P.sig) return; P.sig = sig;
    var keepCode = root.getElementById("codeIn") ? root.getElementById("codeIn").value : "";
    var keepName = root.getElementById("nameIn") ? root.getElementById("nameIn").value : "";
    mount.textContent = "";
    var bar = el("div", "bar"); mount.appendChild(bar);
    if (!P.code) renderOut(bar, keepCode, keepName); else renderIn(bar, st, inMode);
  }

  function renderOut(bar, keepCode, keepName) {
    if (!P.open) {
      var b = el("button", "pill", "👥 Jouer en groupe" + (P.notice ? "  ·  " + P.notice : "")); b.type = "button";
      b.onclick = function () { P.open = true; P.notice = ""; render(); };
      bar.appendChild(b); return;
    }
    var r1 = el("div", "row"); bar.appendChild(r1);
    r1.appendChild(el("span", "title grow", "👥 GROUPE — UN CODE POUR TOUS LES MODES"));
    var close = el("button", "ic", "✕"); close.type = "button"; close.setAttribute("aria-label", "Fermer");
    close.onclick = function () { P.open = false; P.err = ""; render(); }; r1.appendChild(close);
    if (!profile()) {
      var rn = el("div", "row"); bar.appendChild(rn);
      var ni = document.createElement("input"); ni.id = "nameIn"; ni.className = "grow"; ni.maxLength = 16; ni.placeholder = "Ton pseudo"; ni.autocomplete = "off"; ni.value = keepName || load("party_name") || "";
      rn.appendChild(ni);
    }
    var r2 = el("div", "row"); bar.appendChild(r2);
    var cr = el("button", "btn grow", "Créer un groupe"); cr.type = "button"; cr.disabled = P.busy; cr.onclick = createParty; r2.appendChild(cr);
    var r3 = el("div", "row"); bar.appendChild(r3);
    var ci = document.createElement("input"); ci.id = "codeIn"; ci.className = "c"; ci.maxLength = 5; ci.placeholder = "ABCDE"; ci.autocomplete = "off"; ci.value = keepCode;
    ci.addEventListener("input", function () { ci.value = ci.value.toUpperCase(); });
    ci.addEventListener("keydown", function (e) { if (e.key === "Enter") joinParty(); });
    r3.appendChild(ci);
    var jb = el("button", "btn alt grow", "Rejoindre avec ce code"); jb.type = "button"; jb.disabled = P.busy; jb.onclick = joinParty; r3.appendChild(jb);
    if (P.err) bar.appendChild(el("div", "err", P.err));
  }

  function renderIn(bar, st, inMode) {
    var r1 = el("div", "row"); bar.appendChild(r1);
    r1.appendChild(el("span", "title", "👥 GROUPE"));
    r1.appendChild(el("span", "code", P.code));
    var sp = el("span", "grow"); r1.appendChild(sp);
    var cp = el("button", "ic", "📋"); cp.type = "button"; cp.title = "Copier le code";
    cp.onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(P.code).then(function () { P.notice = ""; cp.textContent = "✓"; setTimeout(function () { cp.textContent = "📋"; }, 1200); }); };
    r1.appendChild(cp);
    var sh = el("button", "ic", "🔗"); sh.type = "button"; sh.title = "Inviter";
    sh.onclick = function () {
      var url = location.origin + location.pathname + "?party=" + P.code;
      if (navigator.share) navigator.share({ title: "Groupe Pokédex", text: "Rejoins mon groupe ! Code : " + P.code, url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { sh.textContent = "✓"; setTimeout(function () { sh.textContent = "🔗"; }, 1200); });
    };
    r1.appendChild(sh);
    var q = el("button", "ic", "🚪"); q.type = "button"; q.title = "Quitter le groupe"; q.onclick = quitParty; r1.appendChild(q);

    if (!st) { bar.appendChild(el("div", "note", "Connexion au groupe…")); return; }

    var r2 = el("div", "members"); r2.style.marginTop = "8px"; bar.appendChild(r2);
    st.members.forEach(function (m) {
      var chip = el("div", "m" + (m.away ? " away" : "") + (m.id === P.pid ? " me" : ""));
      var card = m.card || {};
      if (m.avatar) {
        var im = document.createElement("img"); im.alt = ""; im.src = sprite(m.avatar, card.s);
        if (window.PokeProfile) im.style.borderColor = window.PokeProfile.frame(card.c);
        if (card.s === 2) im.style.imageRendering = "auto";
        chip.appendChild(im);
      } else chip.appendChild(el("span", "noav", "?"));
      chip.appendChild(el("span", "", m.name + (m.id === st.hostId ? " 👑" : "")));
      chip.style.cursor = "pointer"; chip.title = m.away ? "Absent — voir le profil" : "Voir le profil";
      chip.addEventListener("click", function (ev) {
        if (ev.target.closest && ev.target.closest("button")) return;
        if (window.PokeCard) window.PokeCard.show({ name: m.name, avatar: m.avatar, card: m.card, me: m.id === P.pid });
      });
      if (st.isHost && m.id !== P.pid) {
        var k = el("button", "", "✕"); k.type = "button"; k.title = "Exclure " + m.name;
        k.onclick = function () {
          if (!window.confirm("Exclure " + m.name + " du groupe ?")) return;
          partyPost("kick", { targetPlayerId: m.id }).then(function (s) { P.st = s; render(); }).catch(function (e) { P.err = e.message; render(); });
        };
        chip.appendChild(k);
      }
      r2.appendChild(chip);
    });

    var r3 = el("div", "row"); bar.appendChild(r3);
    if (st.isHost) {
      r3.appendChild(el("span", "note grow", st.mode ? "Mode du groupe :" : "Choisis un mode pour le groupe :"));
      ORDER.forEach(function (mode) {
        var active = st.mode === mode && inMode, away = st.mode === mode && !inMode;
        var b = el("button", "btn" + (active ? " alt" : ""), (active ? "✓ " : "") + MODES[mode].icon + " " + MODES[mode].label);
        b.type = "button"; b.disabled = P.busy || active;
        b.onclick = function () {
          if (away) joinMode(); else hostSwitch(mode);
        };
        if (away) b.textContent = "↩ Reprendre " + MODES[mode].icon + " " + MODES[mode].label;
        r3.appendChild(b);
      });
    } else if (!st.mode) {
      r3.appendChild(el("span", "note", "⏳ En attente que l'hôte choisisse un mode…"));
    } else if (inMode) {
      r3.appendChild(el("span", "note", "✅ Tu joues avec le groupe : " + MODES[st.mode].icon + " " + MODES[st.mode].label));
    } else {
      var bn = el("div", "banner grow"); r3.appendChild(bn);
      bn.appendChild(el("span", "grow", "🎮 Le groupe joue à " + MODES[st.mode].icon + " " + MODES[st.mode].label));
      var jb = el("button", "btn", "Rejoindre"); jb.type = "button"; jb.disabled = P.busy; jb.onclick = joinMode; bn.appendChild(jb);
    }
    if (P.err) bar.appendChild(el("div", "err", P.err));
  }

  // ---------- Démarrage ----------
  var qs = new URLSearchParams(location.search);
  var invite = (qs.get("party") || "").toUpperCase();
  var sc = load("party_code"), sp = load("party_pid");
  if (sc && sp && !/^[A-Z0-9]{5}$/.test(invite)) { P.code = sc; P.pid = sp; render(); startPolling(); }
  else {
    if (/^[A-Z0-9]{5}$/.test(invite)) { P.open = true; render(); var ci = root.getElementById("codeIn"); if (ci) ci.value = invite; }
    else render();
  }
})();
