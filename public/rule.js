/* rule.js — onglet « Devine la règle » intégré au site.
   Chacun reçoit une règle secrète ; on cite des Pokémon à l'oral, les autres répondent oui/non selon leur règle, et
   le but est de deviner la règle des autres. Shadow DOM : HTML/CSS/ids isolés du reste du site. */
(function () {
  "use strict";

  var CSS = `
  :host{display:block; font-family:'Nunito',sans-serif; color:#fff;
    --red:#E23B30; --red-dark:#A3231A; --gold:#FFC93C; --gold-deep:#D99A12;
    --ink:#221d17; --paper:#FCF9F1; --card:#fff; --won:#e9f8ec; --line:rgba(34,29,23,.12);
    --muted:#7b6f60; --ok:#2fa84f; --ko:#c8372d; --warn:#e08a12; --sugg:#fff;
    --ease:cubic-bezier(.2,.8,.2,1);}
  :host(.dark){--ink:#f3ebdd; --paper:#241e1a; --card:#322a24; --line:rgba(255,255,255,.16); --muted:#b5a891;
    --won:#1d3a26; --ok:#3fbf62; --ko:#d9483d; --sugg:#3b322b; color-scheme:dark;}
  *{box-sizing:border-box; -webkit-tap-highlight-color:transparent;}
  .wrap{max-width:520px; margin:0 auto;}
  .device{background:var(--skin-device,linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,0) 22%),linear-gradient(160deg,var(--red),#cf2f25 55%,var(--red-dark)));
    border:1px solid rgba(0,0,0,.35); border-radius:30px; padding:16px 16px 20px;
    box-shadow:0 30px 60px -15px rgba(0,0,0,.65), inset 0 2px 0 rgba(255,255,255,.35), inset 0 -6px 0 rgba(0,0,0,.18);
    animation:in .5s var(--ease) both;}
  :host(.dark) .device{background:var(--skin-device-dark,linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,0) 22%),linear-gradient(160deg,#a82a21,#8a1f18 55%,#4a0f09));}
  @keyframes in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  .top{display:flex; align-items:center; gap:10px; margin-bottom:12px;}
  .lens{width:22px;height:22px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 35% 30%,#bfe9ff,#3b8fd6 55%,#1b5a9c);box-shadow:0 0 0 3px rgba(255,255,255,.55),0 0 14px rgba(120,200,255,.8);}
  .brand{font-family:'Silkscreen',monospace; font-size:12px; letter-spacing:.12em; flex:1;}
  .themebtn{border:0; width:34px; height:34px; border-radius:50%; cursor:pointer; font-size:15px; background:rgba(0,0,0,.25); color:#fff;}
  .panel{background:var(--paper); color:var(--ink); border-radius:20px; padding:16px; margin-top:12px;
    box-shadow:0 8px 20px -8px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.6);}
  h2{font-family:'Baloo 2',sans-serif; margin:0 0 8px; font-size:20px;}
  p.sub{margin:0 0 12px; color:var(--muted); font-size:14px; line-height:1.4;}
  label{display:block; font-weight:800; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin:10px 0 4px;}
  input[type=text], select{width:100%; font:inherit; font-size:16px; font-weight:700; color:var(--ink); padding:13px 16px; border-radius:14px; border:2px solid var(--line); background:var(--card); outline:none;}
  input[type=text]:focus, select:focus{border-color:var(--gold-deep);}
  select option{background:var(--card); color:var(--ink);}
  .btn{width:100%; min-height:50px; border:0; border-radius:16px; cursor:pointer; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:17px; color:#221d17;
    background:linear-gradient(180deg,#ffd96b,var(--gold) 55%,#f0b21f); box-shadow:0 5px 0 var(--gold-deep), 0 12px 20px -8px rgba(0,0,0,.4);
    transition:transform .15s var(--ease), box-shadow .15s var(--ease);}
  .btn:active{transform:translateY(3px); box-shadow:0 2px 0 var(--gold-deep);}
  .btn:disabled{opacity:.5; cursor:default;}
  .btn.alt{background:var(--card); color:var(--ink); box-shadow:0 4px 0 rgba(0,0,0,.15); border:1px solid var(--line);}
  .btn.small{min-height:40px; font-size:14px; width:auto; padding:0 16px;}
  .row{display:flex; gap:10px; margin-top:12px;}
  .row > *{flex:1;}
  .err{color:var(--ko); font-weight:700; font-size:13px; margin-top:8px; min-height:18px;}
  .hidden{display:none !important;}
  .code{font-family:'Silkscreen',monospace; font-size:28px; letter-spacing:.18em; text-align:center; background:var(--card); border:2px dashed var(--line); border-radius:16px; padding:12px; margin:6px 0 10px;}

  .players{list-style:none; padding:0; margin:0;}
  .players li{display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:14px; background:var(--card); border:1px solid var(--line); margin-bottom:6px; font-weight:800;}
  .players li .nm{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .players li .sc{font-family:'Silkscreen',monospace; font-size:13px;}
  .players li.me{border-color:var(--gold-deep); box-shadow:inset 0 0 0 1px var(--gold-deep);}
  .players li.won{background:var(--won); border-color:var(--ok);}
  .players li small{color:var(--muted); font-weight:700; font-size:12px; white-space:nowrap;}
  .pips{display:inline-flex; gap:2px;}
  .pips i{width:7px; height:12px; border-radius:2px; background:var(--line);}
  .pips i.on{background:var(--ok);}
  .tag{font-size:11px; font-weight:800; background:var(--gold); color:#221d17; padding:2px 8px; border-radius:999px;}
  .kick{border:0; background:transparent; font-size:16px; cursor:pointer; color:var(--ko);}
  .av{width:34px; height:34px; flex-shrink:0; image-rendering:pixelated; border-radius:50%; background:#0e1a12; border:2px solid #070d08; object-fit:contain;}
  .profcard{display:flex; align-items:center; gap:12px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:10px 12px; margin-top:4px;}
  .profcard img{width:52px; height:52px; image-rendering:pixelated; border-radius:50%; background:#0e1a12; border:3px solid #070d08; box-shadow:0 0 0 2px var(--gold); object-fit:contain; display:block;}
  .profcard .noav{width:52px; height:52px; border-radius:50%; background:#0e1a12; color:#8ff0a4; display:flex; align-items:center; justify-content:center; font-family:'Silkscreen',monospace; font-size:20px;}
  .profcard .pn{flex:1; min-width:0; display:flex; flex-direction:column;}
  .profcard .pn b{font-family:'Baloo 2',sans-serif; font-size:18px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .profcard .pn small{color:var(--muted); font-weight:700; font-size:12px;}

  .gens{display:grid; grid-template-columns:repeat(3,1fr); gap:6px;}
  .gens button{min-height:44px; border-radius:12px; cursor:pointer; font:inherit; font-weight:800; font-size:13px; line-height:1.15; color:var(--ink); background:var(--card); border:2px solid var(--line); padding:4px 2px;}
  .gens button small{display:block; font-weight:700; font-size:10.5px; color:var(--muted);}
  .gens button.on{background:linear-gradient(180deg,#ffd96b,var(--gold) 60%,#f0b21f); border-color:var(--gold-deep); color:#221d17;}
  .gens button.on small{color:#5a4310;}
  .gens button:disabled{cursor:default; opacity:.9;}
  .gens-meta{display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; font-size:13px; font-weight:700; color:var(--muted);}
  .gens-meta button{border:0; background:transparent; font:inherit; font-weight:800; color:var(--ink); text-decoration:underline; cursor:pointer; padding:6px;}

  
  .myrule{background:linear-gradient(150deg,#2b2118,#1a1411); color:#fff; border:3px solid var(--gold); border-radius:20px; padding:14px; margin-top:12px; text-align:center;}
  .myrule small{display:block; font-weight:800; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--gold);}
  .myrule b{display:block; font-family:'Baloo 2',sans-serif; font-size:24px; line-height:1.15; margin-top:4px;}
  .myrule.hide b{filter:blur(9px); user-select:none;}
  .myrule button{margin-top:8px; border:0; border-radius:999px; padding:6px 14px; font:inherit; font-weight:800; font-size:12px; cursor:pointer; background:rgba(255,255,255,.15); color:#fff;}
  .speaker{margin-top:12px; background:rgba(0,0,0,.28); border-radius:14px; padding:10px 12px; text-align:center; font-weight:800; font-size:14px;}
  .speaker.me{background:var(--gold); color:#221d17;}
  .chk{display:flex; gap:8px; margin-top:6px;} .chk input{flex:1;} .chk .btn{width:auto; padding:0 18px;}
  .verdict{margin-top:8px; border-radius:12px; padding:10px; text-align:center; font-weight:800; font-size:15px;}
  .verdict.y{background:var(--ok); color:#fff;} .verdict.n{background:var(--ko); color:#fff;}
  .tcard{background:var(--card); border:1px solid var(--line); border-radius:14px; padding:10px 12px; margin-bottom:8px;}
  .tcard.done{background:var(--won); border-color:var(--ok);}
  .tcard .hd{display:flex; align-items:center; gap:8px;} .tcard .hd b{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:'Baloo 2',sans-serif; font-size:16px;}
  .tcard .hd small{color:var(--muted); font-weight:800; font-size:12px;}
  .tcard .rl{margin-top:6px; font-weight:800; color:var(--ok);}
  .tcard select{margin-top:8px; padding:10px 12px; font-size:15px;}
  .tcard .btn{margin-top:8px; min-height:40px; font-size:15px;}
  .podium{font-family:'Baloo 2',sans-serif; text-align:center; font-size:26px; font-weight:800; margin:4px 0 10px;}
  .toast{position:fixed; left:50%; top:14px; transform:translateX(-50%); z-index:50; max-width:92vw; background:rgba(28,22,17,.95); color:#fff; border:1px solid rgba(255,255,255,.15); padding:11px 16px; border-radius:14px; font-weight:800; font-size:14px; animation:in .3s var(--ease) both;}
  .toast.ok{border-color:var(--ok);} .toast.ko{border-color:var(--ko);}
  .shake{animation:shake .4s;} @keyframes shake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}
  @media (prefers-reduced-motion:reduce){*{animation-duration:.001ms !important; transition-duration:.001ms !important;}}
  `;

  var HTML = `
  <div class="wrap"><div class="device">
    <div class="top"><span class="lens"></span><span class="brand">DEVINE LA RÈGLE</span>
      <button type="button" class="themebtn" id="themeBtn" aria-label="Mode sombre">🌙</button></div>

    <section id="vHome" class="panel hidden">
      <h2>Devine la règle</h2>
      <p class="sub">Chacun reçoit en secret une règle (« monotype », « Type Feu », « famille de 3 », « évolué »…). À tour de rôle, un joueur cite un Pokémon <b>à l'oral</b> ; les autres répondent oui ou non selon <b>leur</b> règle. Devine celle des autres !</p>
      <div id="profCard" class="profcard hidden"><span id="profAv"></span><span class="pn"><b id="profName"></b><small>Ton profil</small></span>
        <button type="button" class="btn alt small" id="profEdit">Modifier</button></div>
      <div id="nameField"><label for="name">Ton pseudo</label><input type="text" id="name" maxlength="16" autocomplete="off" placeholder="Sacha"></div>
      <div class="row"><button class="btn" id="btnCreate">👥 Créer une partie</button></div>
      <label for="codeIn">Ou rejoindre avec un code</label>
      <div class="row" style="margin-top:0"><input type="text" id="codeIn" maxlength="5" autocomplete="off" placeholder="ABCDE" style="text-transform:uppercase; letter-spacing:.2em;">
        <button class="btn alt" id="btnJoin" style="flex:0 0 120px">Rejoindre</button></div>
      <div class="err" id="homeErr"></div>
    </section>

    <section id="vLobby" class="panel hidden">
      <h2>Salon</h2>
      <div class="code" id="lobbyCode">-----</div>
      <div class="row" style="margin-top:0"><button class="btn alt small" id="btnCopy">📋 Copier le code</button><button class="btn alt small" id="btnShare">🔗 Inviter</button></div>
      <label>Joueurs (2 à 8)</label><ul class="players" id="lobbyPlayers"></ul>
      <div id="hostBox" class="hidden"><div class="row"><button class="btn" id="btnStart">Lancer la partie</button></div></div>
      <p class="sub hidden" id="waitHost" style="margin-top:12px">En attente que l'hôte lance la partie…</p>
      <div class="row"><button class="btn alt small" id="btnLeave1">Quitter</button></div>
      <div class="err" id="lobbyErr"></div>
    </section>

    <section id="vGame" class="hidden">
      <div class="myrule" id="myRule"><small>Ta règle (secrète !)</small><b id="myRuleTxt">…</b><button type="button" id="btnHide">🙈 Masquer</button></div>
      <div class="speaker" id="speaker"></div>
      <div class="panel">
        <h2>🔎 Ce Pokémon est dans ma règle ?</h2>
        <p class="sub" style="margin-bottom:6px">Un Pokémon vient d'être cité ? Vérifie la réponse (visible par toi seul).</p>
        <form class="chk" id="chkForm" autocomplete="off"><input type="text" id="chkIn" list="dexNames" placeholder="Nom du Pokémon…" autocapitalize="off" spellcheck="false"><button class="btn" type="submit">OK</button></form>
        <datalist id="dexNames"></datalist>
        <div class="verdict hidden" id="verdict"></div>
      </div>
      <div class="panel"><h2>🎯 Devine leurs règles</h2><div id="targets"></div></div>
      <div class="panel score-panel"><ul class="players" id="gamePlayers"></ul></div>
      <div class="row"><button class="btn alt small" id="btnNext">🗣️ Passer la parole</button></div>
      <div class="row hidden" id="hostGameBox"><button class="btn alt small" id="btnEnd">🏁 Terminer (hôte)</button></div>
      <div class="row"><button class="btn alt small" id="btnLeave3">🚪 Quitter la partie</button></div>
    </section>

    <section id="vEnd" class="panel hidden">
      <div class="podium" id="podium">🏆</div>
      <label>Les règles de chacun</label><div id="endRules"></div>
      <ul class="players" id="endPlayers" style="margin-top:10px"></ul>
      <div class="row hidden" id="hostEndBox"><button class="btn" id="btnAgain">Rejouer</button><button class="btn alt" id="btnToLobby">Salon</button></div>
      <p class="sub hidden" id="waitHost2" style="margin-top:12px">L'hôte peut relancer une partie.</p>
      <div class="row"><button class="btn alt small" id="btnLeave2">Quitter</button></div>
    </section>
  </div></div>`;

  var mounted = false;
  window.RuleTab = {
    mount: function (host) {
      if (mounted) return; mounted = true;
      var root = host.attachShadow({ mode: "open" });
      var style = document.createElement("style"); style.textContent = CSS;
      var box = document.createElement("div"); box.innerHTML = HTML;
      root.appendChild(style); while (box.firstChild) root.appendChild(box.firstChild);
      run(root, host);
    }
  };

  function run(root, host) {
    var API = "/api/rule";
    var $ = function (id) { return root.getElementById(id); };
    var S = { code: null, playerId: null, state: null, rules: [], polling: null, busy: false, hidden: false, lastRound: 0 };
    function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
    function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function toast(msg, kind) { var t = el("div", "toast " + (kind || ""), msg); root.appendChild(t); setTimeout(function () { t.remove(); }, 2800); }
    function profile() { return window.PokeProfile ? window.PokeProfile.get() : null; }
    function cardOf() { return profile() ? window.PokeProfile.card() : null; }
    function avatarId() { var pr = profile(); return pr && pr.favId ? pr.favId : null; }
    function show(id) { ["vHome", "vLobby", "vGame", "vEnd"].forEach(function (v) { $(v).classList.toggle("hidden", v !== id); }); }
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
    function post(action, extra) { return api("POST", Object.assign({ action: action, code: S.code, playerId: S.playerId }, extra || {})); }
    function setState(s) { S.state = s; render(); }
    function fail(e) { toast(e.message, "ko"); }

    // Thème
    var docEl = document.documentElement;
    function syncTheme() { var dark = docEl.getAttribute("data-theme") === "dark"; host.classList.toggle("dark", dark); $("themeBtn").textContent = dark ? "☀️" : "🌙"; }
    new MutationObserver(syncTheme).observe(docEl, { attributes: true, attributeFilter: ["data-theme"] });
    $("themeBtn").addEventListener("click", function () { var b = document.getElementById("themeToggleBtn"); if (b) b.click(); });
    syncTheme();

    // Session
    function saveSession() { store("rule_code", S.code); store("rule_pid", S.playerId); }
    function leaveLocal() { S.code = S.playerId = S.state = null; saveSession(); clearInterval(S.polling); S.polling = null; show("vHome"); }
    function enter(code, pid) { S.code = code; S.playerId = pid; saveSession(); try { history.replaceState(null, "", location.pathname); } catch (e) {} startPolling(); }

    // Accueil
    $("name").value = load("rule_name") || "";
    var inviteCode = (new URLSearchParams(location.search).get("rule") || "").toUpperCase();
    if (/^[A-Z0-9]{5}$/.test(inviteCode)) $("codeIn").value = inviteCode; else inviteCode = "";
    function renderProfile() {
      var pr = profile(); $("profCard").classList.toggle("hidden", !pr); $("nameField").classList.toggle("hidden", !!pr);
      if (!pr) return; $("profName").textContent = pr.name;
      var av = $("profAv"); av.textContent = "";
      if (pr.favId) { var im = document.createElement("img"); im.alt = ""; im.src = window.PokeProfile.sprite(pr.favId, pr.style); if (pr.style === 2) im.style.imageRendering = "auto"; av.appendChild(im); }
      else av.appendChild(el("span", "noav", "?"));
    }
    renderProfile(); window.addEventListener("profilechange", renderProfile);
    var cardTimer = null;
    function pushCard() { clearTimeout(cardTimer); cardTimer = setTimeout(function () { if (S.code && S.playerId && profile()) post("card", { card: cardOf() }).catch(function () {}); }, 800); }
    window.addEventListener("statschange", pushCard); window.addEventListener("profilechange", pushCard);
    $("profEdit").onclick = function () { var t = document.getElementById("tabProfile"); if (t) t.click(); };
    function pseudo() {
      var pr = profile(); if (pr) { $("homeErr").textContent = ""; return pr.name; }
      var n = $("name").value.trim(); if (!n) { $("homeErr").textContent = "Choisis un pseudo (ou crée ton profil)."; $("name").focus(); return null; }
      store("rule_name", n); $("homeErr").textContent = ""; return n;
    }
    $("btnCreate").onclick = function () {
      var n = pseudo(); if (!n) return;
      api("POST", { action: "create", name: n, avatar: avatarId(), card: cardOf() }).then(function (r) { enter(r.code, r.playerId); }).catch(function (e) { $("homeErr").textContent = e.message; });
    };
    $("btnJoin").onclick = function () {
      var n = pseudo(); if (!n) return; var c = $("codeIn").value.trim().toUpperCase();
      if (!/^[A-Z0-9]{5}$/.test(c)) { $("homeErr").textContent = "Le code fait 5 caractères."; return; }
      api("POST", { action: "join", name: n, code: c, avatar: avatarId(), card: cardOf() }).then(function (r) { enter(r.code, r.playerId); }).catch(function (e) { $("homeErr").textContent = e.message; });
    };

    // Données statiques : règles + noms (pour l'autocomplétion)
    api("GET", null, "action=rules").then(function (r) { S.rules = r.rules || []; if (S.state) render(); }).catch(function () {});
    api("GET", null, "action=names").then(function (r) {
      var dl = $("dexNames"); (r.byId || []).forEach(function (n) { if (n) { var o = document.createElement("option"); o.value = n; dl.appendChild(o); } });
    }).catch(function () {});

    // Sondage
    function startPolling() { clearInterval(S.polling); refresh(); S.polling = setInterval(refresh, 1500); }
    function refresh() {
      if (!S.code || S.busy || document.hidden) return; S.busy = true;
      api("GET", null, "code=" + encodeURIComponent(S.code) + "&playerId=" + encodeURIComponent(S.playerId))
        .then(function (st) { S.busy = false; setState(st); })
        .catch(function (e) { S.busy = false; if (e.status === 404 || e.status === 403) { toast("Tu n'es plus dans cette partie.", "ko"); leaveLocal(); } });
    }

    // Rendu
    function playersList(ul, st, opts) {
      ul.textContent = ""; var medals = ["🥇", "🥈", "🥉"];
      st.players.forEach(function (p, i) {
        var li = el("li", p.id === S.playerId ? "me" : "");
        if (opts.rank) li.appendChild(el("span", "", medals[i] || (i + 1) + "."));
        if (p.avatar && window.PokeProfile) { var ai = document.createElement("img"); ai.className = "av"; ai.alt = ""; ai.loading = "lazy"; ai.src = window.PokeProfile.sprite(p.avatar, p.card && p.card.s); li.appendChild(ai); }
        li.appendChild(el("span", "nm", p.name));
        if (p.host && st.players.length > 1) li.appendChild(el("span", "tag", "hôte"));
        if (opts.turn && p.id === st.speaker) li.appendChild(el("span", "tag", "🗣️ parle"));
        li.appendChild(el("span", "sc", String(p.score)));
        if (opts.kick && st.isHost && p.id !== S.playerId) {
          var k = el("button", "kick", "✕"); k.title = "Exclure";
          k.onclick = function () { post("kick", { targetPlayerId: p.id }).then(setState).catch(fail); }; li.appendChild(k);
        }
        li.style.cursor = "pointer";
        li.addEventListener("click", function (ev) { if ((ev.target.closest && ev.target.closest("button")) || !window.PokeCard) return; window.PokeCard.show({ name: p.name, avatar: p.avatar, card: p.card, me: p.id === S.playerId }); });
        ul.appendChild(li);
      });
    }
    function me(st) { return st.players.filter(function (p) { return p.id === S.playerId; })[0]; }
    function ruleOptions(sel) {
      var groups = {}; S.rules.forEach(function (r) { (groups[r.group] = groups[r.group] || []).push(r); });
      sel.appendChild(Object.assign(document.createElement("option"), { value: "", textContent: "Quelle est sa règle ?" }));
      Object.keys(groups).forEach(function (g) {
        var og = document.createElement("optgroup"); og.label = g;
        groups[g].forEach(function (r) { var o = document.createElement("option"); o.value = r.id; o.textContent = r.label; og.appendChild(o); });
        sel.appendChild(og);
      });
    }
    var targetsKey = "";
    function renderTargets(st) {
      var key = st.round + ":" + st.players.map(function (p) { return p.id + (p.found ? "1" : "0") + p.wrong; }).join(",") + ":" + S.rules.length;
      if (key === targetsKey) return; targetsKey = key;
      var box = $("targets"); box.textContent = "";
      st.players.forEach(function (p) {
        if (p.id === S.playerId) return;
        var c = el("div", "tcard" + (p.found ? " done" : "")), hd = el("div", "hd");
        hd.appendChild(el("b", "", p.name)); hd.appendChild(el("small", "", p.found ? "✅ trouvée" : (p.wrong ? p.wrong + " essai" + (p.wrong > 1 ? "s" : "") + " raté" + (p.wrong > 1 ? "s" : "") : "")));
        c.appendChild(hd);
        if (p.found && p.rule) c.appendChild(el("div", "rl", p.rule.label));
        else {
          var sel = document.createElement("select"); ruleOptions(sel); c.appendChild(sel);
          var b = el("button", "btn", "Proposer"); b.type = "button";
          b.onclick = function () {
            if (!sel.value) { c.classList.add("shake"); setTimeout(function () { c.classList.remove("shake"); }, 400); return; }
            b.disabled = true;
            post("guess", { target: p.id, rule: sel.value }).then(function (r) {
              if (r.correct) { toast("Bien vu ! +" + r.points + " pts", "ok"); if (window.PokeStats) { /* xp : non comptabilisé pour ce mode */ } }
              else toast("Raté pour " + p.name + " 😅", "ko");
              targetsKey = ""; setState(r.state);
            }).catch(function (e) { b.disabled = false; fail(e); });
          };
          c.appendChild(b);
        }
        box.appendChild(c);
      });
    }
    function render() {
      var st = S.state; if (!st) return;
      if (st.status === "lobby") {
        show("vLobby"); $("lobbyCode").textContent = st.code; playersList($("lobbyPlayers"), st, { kick: true });
        $("hostBox").classList.toggle("hidden", !st.isHost); $("waitHost").classList.toggle("hidden", st.isHost); return;
      }
      if (st.status === "ended") {
        show("vEnd"); var top = st.players[0];
        $("podium").textContent = top ? "🏆 " + top.name + " gagne !" : "🏆";
        var er = $("endRules"); er.textContent = "";
        st.players.forEach(function (p) { var c = el("div", "tcard"), hd = el("div", "hd"); hd.appendChild(el("b", "", p.name)); hd.appendChild(el("small", "", p.rule ? p.rule.label : "")); c.appendChild(hd); er.appendChild(c); });
        playersList($("endPlayers"), st, { rank: true });
        $("hostEndBox").classList.toggle("hidden", !st.isHost); $("waitHost2").classList.toggle("hidden", st.isHost); return;
      }
      show("vGame");
      if (S.lastRound !== st.round) { S.lastRound = st.round; S.hidden = false; targetsKey = ""; $("verdict").classList.add("hidden"); $("chkIn").value = ""; }
      var m = me(st); $("myRuleTxt").textContent = m && m.rule ? m.rule.label : "…";
      $("myRule").classList.toggle("hide", S.hidden); $("btnHide").textContent = S.hidden ? "👁️ Afficher" : "🙈 Masquer";
      var sp = st.players.filter(function (p) { return p.id === st.speaker; })[0], mine = st.speaker === S.playerId;
      var sd = $("speaker"); sd.className = "speaker" + (mine ? " me" : "");
      sd.textContent = mine ? "🗣️ C'est à toi : cite un Pokémon à voix haute !" : "🗣️ " + (sp ? sp.name : "?") + " cite un Pokémon…";
      $("btnNext").classList.toggle("hidden", !(mine || st.isHost));
      $("hostGameBox").classList.toggle("hidden", !st.isHost);
      renderTargets(st); playersList($("gamePlayers"), st, { turn: true });
    }
    $("btnHide").onclick = function () { S.hidden = !S.hidden; render(); };
    $("chkForm").addEventListener("submit", function (ev) {
      ev.preventDefault(); var v = $("chkIn").value.trim(); if (!v) return;
      api("GET", null, "action=check&code=" + encodeURIComponent(S.code) + "&playerId=" + encodeURIComponent(S.playerId) + "&name=" + encodeURIComponent(v)).then(function (r) {
        var d = $("verdict"); d.className = "verdict " + (r.yes ? "y" : "n");
        d.textContent = r.name + " : " + (r.yes ? "✅ OUI, il est dans ta règle" : "❌ NON, il n'est pas dans ta règle"); $("chkIn").select();
      }).catch(function (e) { var d = $("verdict"); d.className = "verdict n"; d.textContent = e.message; });
    });

    // Boutons
    $("btnCopy").onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(S.code).then(function () { toast("Code copié", "ok"); }); };
    $("btnShare").onclick = function () {
      var url = location.origin + location.pathname + "?rule=" + encodeURIComponent(S.code);
      if (navigator.share) navigator.share({ title: "Devine la règle", text: "Rejoins ma partie ! Code : " + S.code, url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("Lien copié", "ok"); });
    };
    $("btnStart").onclick = function () { $("btnStart").disabled = true; post("start").then(setState).catch(function (e) { $("lobbyErr").textContent = e.message; }).then(function () { $("btnStart").disabled = false; }); };
    function leave() { post("leave").catch(function () {}).then(leaveLocal); }
    $("btnLeave1").onclick = leave; $("btnLeave2").onclick = leave;
    $("btnLeave3").onclick = function () { if (window.confirm("Quitter la partie en cours ?")) leave(); };
    $("btnNext").onclick = function () { post("next").then(setState).catch(fail); };
    $("btnEnd").onclick = function () { if (window.confirm("Terminer la partie et révéler les règles ?")) post("end").then(setState).catch(fail); };
    $("btnAgain").onclick = function () { post("start").then(setState).catch(fail); };
    $("btnToLobby").onclick = function () { post("lobby").then(setState).catch(fail); };

    // Passerelle pour l'onglet « Groupe »
    window.__ruleBridge = {
      code: function () { return S.code; },
      create: function (name) { return api("POST", { action: "create", name: name, avatar: avatarId(), card: cardOf() }).then(function (r) { enter(r.code, r.playerId); return r.code; }); },
      join: function (code, name) {
        if (S.code === code) return Promise.resolve(code);
        return api("POST", { action: "join", name: name, code: code, avatar: avatarId(), card: cardOf() }).then(function (r) { enter(r.code, r.playerId); return r.code; });
      },
      leave: function () { if (!S.code) return Promise.resolve(); return post("leave").catch(function () {}).then(leaveLocal); }
    };

    // Démarrage
    show("vHome");
    var sc = load("rule_code"), sp = load("rule_pid");
    if (sc && sp && !inviteCode) { S.code = sc; S.playerId = sp; startPolling(); }
  }
})();
