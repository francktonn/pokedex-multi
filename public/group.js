/* group.js — onglet « Groupe » : un groupe persistant d'un mode de jeu à l'autre.
   L'hôte choisit le mode, configure sa salle (dans l'onglet du jeu), puis « envoie le groupe » :
   tous les membres rejoignent alors automatiquement la salle. Les scores repartent de zéro à chaque jeu
   car chaque jeu crée une nouvelle salle. Ce fichier pilote les modes via window.__guessBridge /
   __whoisBridge / __wordleBridge (créer / rejoindre / quitter une salle). */
(function () {
  "use strict";
  var API = "/api/group";
  var SESSION_KEY = "group_session";
  var NAME_KEY = "group_name";
  var MODES = {
    guess:  { label: "Devinette",       icon: "🔴", desc: "Chacun devine le Pokémon des autres.", bridge: "__guessBridge" },
    whois:  { label: "Qui est-ce ?",    icon: "❔", desc: "Une silhouette, le plus rapide gagne.", bridge: "__whoisBridge" },
    wordle: { label: "Pokédex Wordle",  icon: "🟩", desc: "Course au Pokémon secret commun.", bridge: "__wordleBridge" }
  };

  var G = { code: null, pid: null, state: null, handled: -1, subMode: null, epoch: 0, timer: null, busy: false, inflight: false, ui: null, inviteCode: "" };

  // ---------- Utilitaires ----------
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function toast(text, kind) { if (window.toast) { try { window.toast(text, { kind: kind || "ok", ttl: 3200 }); return; } catch (e) {} } }
  function profile() { return window.PokeProfile ? window.PokeProfile.get() : null; }
  function myName() { var pr = profile(); return pr && pr.name ? pr.name : (load(NAME_KEY) || ""); }
  function avatarId() { var pr = profile(); return pr && pr.favId ? pr.favId : null; }
  function cardOf() { return profile() && window.PokeProfile.card ? window.PokeProfile.card() : null; }
  function sleep(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  function api(method, body, query) {
    var opt = { method: method };
    if (body) { opt.headers = { "Content-Type": "application/json" }; opt.body = JSON.stringify(body); }
    return fetch(API + (query ? "?" + query : ""), opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || "Erreur"); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function post(action, extra) { return api("POST", Object.assign({ action: action, code: G.code, playerId: G.pid }, extra || {})); }

  function saveSession() {
    if (!G.code) { store(SESSION_KEY, null); return; }
    store(SESSION_KEY, JSON.stringify({ code: G.code, pid: G.pid, handled: G.handled, subMode: G.subMode }));
  }
  function isHost() { return !!(G.state && G.state.hostId === G.pid); }

  // ---------- Pilotage des modes ----------
  function ensureBridge(mode) {
    var key = MODES[mode].bridge;
    if (window[key]) return Promise.resolve(window[key]);
    if (window.PokeTabs) window.PokeTabs.load(mode);
    return new Promise(function (ok, ko) {
      var t0 = Date.now();
      (function wait() {
        if (window[key]) return ok(window[key]);
        if (Date.now() - t0 > 10000) return ko(new Error("Le mode « " + MODES[mode].label + " » n'a pas pu se charger."));
        setTimeout(wait, 100);
      })();
    });
  }
  function bridgeNow(mode) { return mode && MODES[mode] ? window[MODES[mode].bridge] || null : null; }
  function goTab(name) { if (window.PokeTabs) window.PokeTabs.set(name); }
  // null = inconnu (mode pas encore chargé), true/false sinon
  function inRoom(st) {
    if (!st || st.phase !== "live") return null;
    var b = bridgeNow(st.mode); if (!b) return null;
    return b.code() === st.sub;
  }
  async function leaveSub() {
    var m = G.subMode; G.subMode = null; saveSession();
    var b = bridgeNow(m);
    if (b) { try { await b.leave(); } catch (e) {} }
  }

  // ---------- Suivi de l'état du groupe ----------
  function startPolling() { stopPolling(); tick(); }
  function stopPolling() { clearTimeout(G.timer); G.timer = null; }
  function tick() {
    clearTimeout(G.timer);
    if (!G.code || G.inflight) return;
    G.inflight = true;
    var e = G.epoch, delay = document.hidden ? 4000 : 1500;
    api("GET", null, "code=" + encodeURIComponent(G.code) + "&playerId=" + encodeURIComponent(G.pid))
      .then(function (st) { if (e === G.epoch && G.code) return onState(st); })
      .catch(function (err) {
        if (err.status === 404 || err.status === 403) { toast("Tu n'es plus dans ce groupe.", "ko"); return dropGroup(true); }
      })
      .then(function () { G.inflight = false; if (G.code) { clearTimeout(G.timer); G.timer = setTimeout(tick, delay); } });
  }
  async function onState(st) {
    G.state = st;
    if (!isHost() && !G.busy) await follow(st);
    render();
  }
  // Les membres suivent l'hôte : nouvelle salle « live » -> on la rejoint ; retour au groupe -> on quitte la salle.
  async function follow(st) {
    if (st.seq === G.handled) return;
    G.busy = true;
    try {
      if (st.phase === "live") {
        G.handled = st.seq; saveSession();
        await joinSub(st);
      } else if (st.phase === "idle") {
        G.handled = st.seq; saveSession();
        var had = !!G.subMode;
        await leaveSub();
        if (had) { toast("L'hôte a ramené le groupe.", "ok"); goTab("group"); }
      } else {
        G.handled = st.seq; saveSession();
      }
    } finally { G.busy = false; }
  }
  async function joinSub(st, manual) {
    var name = myName();
    if (!name) { toast("Choisis un pseudo (onglet Groupe) pour rejoindre.", "ko"); return; }
    try {
      var b = await ensureBridge(st.mode);
      // Quitte une éventuelle salle d'un autre mode avant d'en rejoindre une nouvelle.
      if (G.subMode && G.subMode !== st.mode) { var ob = bridgeNow(G.subMode); if (ob) { try { await ob.leave(); } catch (e) {} } }
      await b.join(st.sub, name);
      G.subMode = st.mode; saveSession();
      goTab(st.mode);
      toast("C'est parti : " + MODES[st.mode].label + " !", "ok");
    } catch (e) {
      toast("Impossible de rejoindre la salle : " + (e && e.message || e), "ko");
    }
    if (manual) render();
  }

  function dropGroup(silent) {
    stopPolling(); G.epoch++;
    var m = G.subMode;
    G.code = G.pid = G.state = null; G.handled = -1; G.subMode = null; saveSession();
    var b = bridgeNow(m); if (b) { try { b.leave(); } catch (e) {} }
    render();
  }

  // ---------- Actions ----------
  function enter(code, pid) {
    G.code = code; G.pid = pid; G.state = null; G.handled = -1; G.subMode = null; G.epoch++;
    saveSession();
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    startPolling();
  }
  function needName() {
    var n = myName();
    if (n) return n;
    var inp = G.ui && G.ui.nameIn; var v = inp ? inp.value.trim() : "";
    if (!v) { if (G.ui) { G.ui.err.textContent = "Choisis un pseudo (ou crée ton profil)."; inp && inp.focus(); } return null; }
    store(NAME_KEY, v); return v;
  }
  function doCreate() {
    var n = needName(); if (!n) return;
    api("POST", { action: "create", name: n, avatar: avatarId(), card: cardOf() })
      .then(function (r) { enter(r.code, r.playerId); })
      .catch(function (e) { G.ui.err.textContent = e.message; });
  }
  function doJoin() {
    var n = needName(); if (!n) return;
    var c = G.ui.codeIn.value.trim().toUpperCase();
    if (!c) { G.ui.err.textContent = "Entre le code du groupe."; return; }
    api("POST", { action: "join", code: c, name: n, avatar: avatarId(), card: cardOf() })
      .then(function (r) { enter(r.code, r.playerId); })
      .catch(function (e) { G.ui.err.textContent = e.message; });
  }
  function doLeave() {
    var c = G.code, p = G.pid;
    api("POST", { action: "leave", code: c, playerId: p }).catch(function () {});
    dropGroup(true);
  }
  // L'hôte choisit un mode : crée sa salle, va dans l'onglet du jeu pour la configurer. Les membres attendent.
  async function doPrep(mode) {
    if (G.busy) return; G.busy = true; G.epoch++;
    var n = myName();
    if (!n) { G.busy = false; toast("Pseudo manquant.", "ko"); return; }
    try {
      var b = await ensureBridge(mode);
      await leaveSub();
      await b.create(n);
      G.subMode = mode; saveSession();
      // Le groupe est envoyé tout de suite dans le salon du jeu ; l'hôte y règle la partie puis la lance.
      var r = await post("live", { mode: mode, sub: b.code() });
      G.handled = r.seq; saveSession();
      G.state = Object.assign({}, G.state, { phase: "live", mode: mode, sub: b.code(), seq: r.seq });
      goTab(mode);
      if (mode === "guess" && b.open) b.open();
      toast("Groupe envoyé dans " + MODES[mode].label + ". Règle la partie puis lance-la.", "ok");
    } catch (e) {
      toast("Impossible de préparer ce jeu : " + (e && e.message || e), "ko");
    }
    G.busy = false; render();
  }
  async function doSend() {
    var st = G.state; if (!st || st.phase !== "prep") return;
    var b = bridgeNow(st.mode); var sub = b && b.code();
    if (!sub) { toast("Ta salle n'est pas prête.", "ko"); return; }
    G.epoch++;
    try {
      var r = await post("live", { sub: sub });
      G.handled = r.seq; saveSession();
      G.state = Object.assign({}, st, { phase: "live", sub: sub, seq: r.seq });
      toast("Groupe envoyé ! Lance la partie quand tout le monde est là.", "ok");
    } catch (e) { toast("Envoi impossible : " + e.message, "ko"); }
    render();
  }
  async function doEnd() {
    G.epoch++;
    try {
      var r = await post("end");
      G.handled = r.seq; saveSession();
      G.state = Object.assign({}, G.state, { phase: "idle", mode: null, sub: null, seq: r.seq });
      await leaveSub();
      goTab("group");
    } catch (e) { toast("Impossible : " + e.message, "ko"); }
    render();
  }
  async function doCancel() { await doEnd(); }
  function doKick(id) { post("kick", { target: id }).then(function () { tick(); }).catch(function () {}); }
  function invite() {
    var url = location.origin + location.pathname + "?group=" + G.code;
    if (navigator.share) navigator.share({ title: "Groupe Pokédex", text: "Rejoins mon groupe ! Code : " + G.code, url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("Lien d'invitation copié", "ok"); });
  }

  // ---------- Barre de groupe (visible dans tous les onglets) ----------
  function renderBar() {
    var bar = document.getElementById("grpBar"); if (!bar) return;
    var st = G.state, cur = window.PokeTabs ? window.PokeTabs.current() : "";
    if (!G.code || !st || cur === "group") { bar.style.display = "none"; bar.textContent = ""; return; }
    bar.textContent = "";
    var host = isHost(), msg = "", btns = [];
    var m = st.mode && MODES[st.mode] ? MODES[st.mode] : null;
    if (st.phase === "prep") {
      if (host) {
        msg = "🛠 Configure " + m.label + ", puis envoie le groupe.";
        btns.push(["Envoyer le groupe →", "go", doSend], ["Annuler", "alt", doCancel]);
      } else msg = "⏳ L'hôte prépare " + m.label + "…";
    } else if (st.phase === "live") {
      msg = "▶ Groupe en jeu : " + m.label;
      if (host) btns.push(["Terminer le jeu", "alt", doEnd]);
      else if (inRoom(st) === false) btns.push(["Rejoindre", "go", function () { joinSub(st, true); }]);
    } else {
      msg = "👥 Groupe " + st.code + " · " + st.members.length + " joueur" + (st.members.length > 1 ? "s" : "");
      btns.push(["Ouvrir", "alt", function () { goTab("group"); }]);
    }
    bar.appendChild(el("span", "gtxt", msg));
    btns.forEach(function (b) { var x = el("button", "gbtn " + b[1], b[0]); x.type = "button"; x.onclick = b[2]; bar.appendChild(x); });
    bar.style.display = "flex";
  }

  // ---------- Interface de l'onglet ----------
  var CSS = [
    ":host{all:initial;display:block;font-family:'Nunito',system-ui,sans-serif;color:#1d1d1f;}",
    ".wrap{max-width:560px;margin:0 auto;padding:14px 12px 40px;}",
    ".card{background:#fff;border-radius:20px;padding:16px;box-shadow:0 6px 24px rgba(0,0,0,.12);margin-bottom:12px;}",
    ":host(.dark) .card{background:#252a36;color:#f2f3f7;}",
    "h2{margin:0 0 6px;font-size:22px;font-weight:900;} h3{margin:14px 0 8px;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;opacity:.65;}",
    "p.sub{margin:4px 0 10px;font-size:14px;line-height:1.45;opacity:.8;}",
    "label{display:block;margin:10px 0 4px;font-weight:800;font-size:13px;}",
    "input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:2px solid #d7dae2;font:800 16px 'Nunito',sans-serif;background:#fff;color:#1d1d1f;}",
    ":host(.dark) input{background:#1b1f29;color:#f2f3f7;border-color:#3a4152;}",
    ".row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;} .row>*{flex:1;}",
    ".btn{border:0;border-radius:14px;padding:12px 14px;font:900 15px 'Nunito',sans-serif;cursor:pointer;background:#e23b30;color:#fff;box-shadow:0 3px 0 rgba(0,0,0,.2);}",
    ".btn.alt{background:#e9ebf1;color:#1d1d1f;} :host(.dark) .btn.alt{background:#3a4152;color:#f2f3f7;}",
    ".btn.small{padding:8px 10px;font-size:13px;} .btn:active{transform:translateY(2px);box-shadow:none;}",
    ".err{color:#d12a20;font-weight:800;font-size:13px;min-height:18px;margin-top:6px;}",
    ".code{font:900 34px 'Nunito',monospace;letter-spacing:.25em;text-align:center;margin:6px 0;}",
    ".members{list-style:none;margin:0;padding:0;display:grid;gap:8px;}",
    ".mem{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:14px;background:rgba(127,127,127,.12);}",
    ".mem .av{width:40px;height:40px;border-radius:50%;border:3px solid #bbb;background:#fff;object-fit:contain;image-rendering:pixelated;flex:none;}",
    ".mem .nm{flex:1;font-weight:900;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".mem .dot{width:10px;height:10px;border-radius:50%;background:#3cb54a;flex:none;} .mem .dot.off{background:#aaa;}",
    ".mem .me{font-size:11px;opacity:.6;font-weight:800;}",
    ".modes{display:grid;gap:10px;}",
    ".mode{display:flex;gap:12px;align-items:center;text-align:left;width:100%;border:2px solid transparent;border-radius:16px;padding:12px;background:rgba(127,127,127,.12);color:inherit;font:inherit;cursor:pointer;}",
    ".mode:hover{border-color:#e23b30;} .mode .ic{font-size:28px;} .mode b{display:block;font-size:16px;font-weight:900;} .mode small{opacity:.75;font-weight:700;}",
    ".status{padding:12px;border-radius:14px;background:rgba(226,59,48,.12);font-weight:800;line-height:1.45;margin-bottom:10px;}",
    ".hint{font-size:12.5px;opacity:.7;font-weight:700;margin-top:8px;line-height:1.4;}",
    ".hidden{display:none !important;}"
  ].join("\n");

  function build(host) {
    var root = host.attachShadow ? (host.shadowRoot || host.attachShadow({ mode: "open" })) : host;
    var style = el("style"); style.textContent = CSS; root.appendChild(style);
    var wrap = el("div", "wrap"); root.appendChild(wrap);
    function syncTheme() { host.classList.toggle("dark", document.documentElement.getAttribute("data-theme") === "dark"); }
    new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    syncTheme();
    G.ui = { root: root, wrap: wrap, host: host };
    return wrap;
  }

  function memberRow(m) {
    var li = el("li", "mem");
    var av = el("img", "av"); av.alt = ""; av.draggable = false;
    if (m.avatar && window.PokeProfile) {
      av.src = window.PokeProfile.sprite(m.avatar, m.card && m.card.s);
      if (m.card) { av.style.borderColor = window.PokeProfile.frame(m.card.c); if (m.card.s === 2) av.style.imageRendering = "auto"; }
    } else av.style.visibility = "hidden";
    li.appendChild(av);
    var nm = el("span", "nm", (m.host ? "👑 " : "") + m.name);
    li.appendChild(nm);
    if (m.id === G.pid) li.appendChild(el("span", "me", "toi"));
    li.appendChild(el("span", "dot" + (m.online ? "" : " off")));
    if (isHost() && m.id !== G.pid) {
      var k = el("button", "btn alt small", "✕"); k.type = "button"; k.title = "Retirer";
      k.onclick = function () { if (window.confirm("Retirer " + m.name + " du groupe ?")) doKick(m.id); };
      li.appendChild(k);
    }
    if (m.card && window.PokeCard && m.id !== G.pid) {
      nm.style.cursor = "pointer";
      nm.onclick = function () { try { window.PokeCard.show({ name: m.name, avatar: m.avatar, card: m.card, me: false }); } catch (e) {} };
    }
    return li;
  }

  function render() {
    renderBar();
    if (!G.ui) return;
    var w = G.ui.wrap; w.textContent = "";
    var st = G.state;

    if (!G.code) { renderHome(w); return; }
    var c = el("div", "card");
    c.appendChild(el("h2", "", "👥 Mon groupe"));
    c.appendChild(el("div", "code", G.code));
    var row = el("div", "row");
    var b1 = el("button", "btn alt small", "📋 Copier le code"); b1.type = "button";
    b1.onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(G.code).then(function () { toast("Code copié", "ok"); }); };
    var b2 = el("button", "btn alt small", "🔗 Inviter"); b2.type = "button"; b2.onclick = invite;
    row.appendChild(b1); row.appendChild(b2); c.appendChild(row);

    if (!st) { c.appendChild(el("p", "sub", "Connexion au groupe…")); w.appendChild(c); return; }

    c.appendChild(el("h3", "", "Joueurs (" + st.members.length + ")"));
    var ul = el("ul", "members");
    st.members.forEach(function (m) { ul.appendChild(memberRow(m)); });
    c.appendChild(ul);
    w.appendChild(c);

    var g = el("div", "card");
    var host = isHost();
    var m = st.mode && MODES[st.mode] ? MODES[st.mode] : null;
    if (st.phase === "idle") {
      if (host) {
        g.appendChild(el("h2", "", "Choisis un jeu"));
        g.appendChild(el("p", "sub", "Tout le groupe est envoyé directement dans le salon du jeu ; tu règles la partie puis tu la lances. Les scores repartent de zéro."));
        var list = el("div", "modes");
        Object.keys(MODES).forEach(function (k) {
          var x = el("button", "mode"); x.type = "button";
          x.appendChild(el("span", "ic", MODES[k].icon));
          var d = el("span"); d.appendChild(el("b", "", MODES[k].label)); d.appendChild(el("small", "", MODES[k].desc)); x.appendChild(d);
          x.onclick = function () { doPrep(k); };
          list.appendChild(x);
        });
        g.appendChild(list);
      } else {
        g.appendChild(el("div", "status", "⏳ En attente de l'hôte, qui choisit le prochain jeu. Tu seras envoyé automatiquement."));
      }
    } else if (st.phase === "prep") {
      if (host) {
        g.appendChild(el("div", "status", "🛠 " + m.icon + " " + m.label + " : ta salle est créée. Règle la partie, puis envoie le groupe."));
        var r2 = el("div", "row");
        var go = el("button", "btn", "Aller régler " + m.label); go.type = "button"; go.onclick = function () { goTab(st.mode); if (st.mode === "guess") { var b = bridgeNow("guess"); if (b && b.open) b.open(); } };
        var snd = el("button", "btn", "Envoyer le groupe →"); snd.type = "button"; snd.onclick = doSend;
        var cn = el("button", "btn alt", "Annuler"); cn.type = "button"; cn.onclick = doCancel;
        r2.appendChild(go); r2.appendChild(snd); r2.appendChild(cn); g.appendChild(r2);
        g.appendChild(el("p", "hint", "Les autres ne voient rien tant que tu n'as pas envoyé le groupe."));
      } else {
        g.appendChild(el("div", "status", "⏳ L'hôte configure " + m.icon + " " + m.label + "… tu seras envoyé dès qu'il est prêt."));
      }
    } else {
      g.appendChild(el("div", "status", "▶ " + m.icon + " " + m.label + " est en cours pour le groupe."));
      var r3 = el("div", "row");
      var back = el("button", "btn", "Aller au jeu"); back.type = "button";
      back.onclick = function () { if (inRoom(st) === false) joinSub(st, true); else goTab(st.mode); };
      r3.appendChild(back);
      if (host) { var e = el("button", "btn alt", "Terminer le jeu"); e.type = "button"; e.onclick = doEnd; r3.appendChild(e); }
      g.appendChild(r3);
      if (host) g.appendChild(el("p", "hint", "« Terminer le jeu » ramène tout le monde ici pour choisir le prochain mode."));
    }
    w.appendChild(g);

    var lv = el("div", "row");
    var l = el("button", "btn alt small", "Quitter le groupe"); l.type = "button"; l.onclick = function () { if (window.confirm("Quitter le groupe ?")) doLeave(); };
    lv.appendChild(l); w.appendChild(lv);
  }

  function renderHome(w) {
    var c = el("div", "card");
    c.appendChild(el("h2", "", "👥 Groupe"));
    c.appendChild(el("p", "sub", "Crée un groupe une fois, puis enchaîne les jeux sans recréer de salle : l'hôte choisit le mode, tout le monde le suit."));
    var ui = G.ui;
    if (!profile()) {
      c.appendChild(el("label", "", "Ton pseudo"));
      var ni = el("input"); ni.type = "text"; ni.maxLength = 16; ni.autocomplete = "off"; ni.placeholder = "Sacha"; ni.value = load(NAME_KEY) || "";
      ui.nameIn = ni; c.appendChild(ni);
    } else {
      ui.nameIn = null;
      c.appendChild(el("p", "sub", "Tu joues en tant que « " + profile().name + " » (ton profil)."));
    }
    var r = el("div", "row");
    var cb = el("button", "btn", "Créer un groupe"); cb.type = "button"; cb.onclick = doCreate; r.appendChild(cb); c.appendChild(r);
    c.appendChild(el("label", "", "Ou rejoindre avec un code"));
    var r2 = el("div", "row");
    var ci = el("input"); ci.type = "text"; ci.maxLength = 5; ci.autocomplete = "off"; ci.placeholder = "ABCDE"; ci.style.cssText = "text-transform:uppercase;letter-spacing:.2em;";
    ci.value = G.inviteCode || ""; ui.codeIn = ci;
    var jb = el("button", "btn alt", "Rejoindre"); jb.type = "button"; jb.style.flex = "0 0 120px"; jb.onclick = doJoin;
    r2.appendChild(ci); r2.appendChild(jb); c.appendChild(r2);
    var err = el("div", "err"); ui.err = err; c.appendChild(err);
    w.appendChild(c);
  }

  // ---------- Démarrage ----------
  var mounted = false;
  function mount(host) {
    if (mounted) return; mounted = true;
    try {
      var q = new URLSearchParams(location.search);
      var inv = (q.get("group") || "").toUpperCase();
      if (/^[A-Z0-9]{5}$/.test(inv)) G.inviteCode = inv;
    } catch (e) {}
    build(host);

    var saved = null;
    try { saved = JSON.parse(load(SESSION_KEY) || "null"); } catch (e) {}
    if (saved && saved.code && saved.pid && !G.inviteCode) {
      G.code = saved.code; G.pid = saved.pid;
      G.handled = typeof saved.handled === "number" ? saved.handled : -1;
      G.subMode = saved.subMode || null;
      startPolling();
    }
    render();

    // Garde ta carte à jour chez les autres membres.
    var cardTimer = null;
    function pushCard() {
      clearTimeout(cardTimer);
      cardTimer = setTimeout(function () { if (G.code && G.pid && profile()) post("card", { card: cardOf(), avatar: avatarId() }).catch(function () {}); }, 800);
    }
    window.addEventListener("statschange", pushCard);
    window.addEventListener("profilechange", function () { pushCard(); if (!G.code) render(); });
    window.addEventListener("modetab", renderBar);
    document.addEventListener("visibilitychange", function () { if (!document.hidden && G.code) tick(); });
  }

  window.GroupTab = { mount: mount };
})();
