/* wordle.js — onglet « Pokédex Wordle » intégré au site.
   Un Pokémon secret commun ; chaque proposition renvoie des indices en couleur
   (type, génération, taille, poids, stade d'évolution). Le plus rapide / le plus
   économe en essais gagne la manche. Shadow DOM : HTML/CSS/ids isolés du reste du site. */
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
  .device{background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,0) 22%),linear-gradient(160deg,var(--red),#cf2f25 55%,var(--red-dark));
    border:1px solid rgba(0,0,0,.35); border-radius:30px; padding:16px 16px 20px;
    box-shadow:0 30px 60px -15px rgba(0,0,0,.65), inset 0 2px 0 rgba(255,255,255,.35), inset 0 -6px 0 rgba(0,0,0,.18);
    animation:in .5s var(--ease) both;}
  :host(.dark) .device{background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,0) 22%),linear-gradient(160deg,#a82a21,#8a1f18 55%,#4a0f09);}
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

  /* ---- Jeu ---- */
  .gamehead{display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:12px;}
  .badge{font-family:'Silkscreen',monospace; font-size:11px; color:#8ff0a4; background:rgba(0,0,0,.45); padding:6px 10px; border-radius:999px;}
  .tries{font-family:'Silkscreen',monospace; font-size:11px; background:rgba(0,0,0,.25); padding:6px 10px; border-radius:999px;}
  .bar{height:10px; background:rgba(0,0,0,.3); border-radius:8px; overflow:hidden; margin-top:10px;}
  .bar > i{display:block; height:100%; width:100%; background:linear-gradient(90deg,var(--gold),#ff8a3c); transform-origin:left; border-radius:8px;}
  .legend{margin-top:10px; font-size:12px; font-weight:700; line-height:1.5; color:#fff; opacity:.92; display:flex; flex-wrap:wrap; gap:4px 12px;}
  .legend span{display:inline-flex; align-items:center; gap:5px;}
  .legend i{width:12px; height:12px; border-radius:4px; display:inline-block;}
  .legend .g{background:var(--ok);} .legend .o{background:var(--warn);} .legend .r{background:var(--ko);}
  .guess{margin-top:12px; position:relative;}
  .guess form{display:flex; gap:8px;}
  .guess input{flex:1;}
  .guess .btn{width:auto; padding:0 20px;}
  .sugg{display:flex; flex-direction:column; gap:4px; margin-top:8px;}
  .sugg button{display:flex; align-items:center; gap:10px; width:100%; text-align:left; border:0; border-radius:12px; padding:4px 12px; min-height:46px; font:inherit; font-weight:800; font-size:14px; background:var(--sugg); color:var(--ink); cursor:pointer;}
  .sugg img{width:38px; height:38px; image-rendering:pixelated;}
  .sugg small{margin-left:auto; color:var(--muted); font-weight:700; font-size:12px;}
  .shake{animation:shake .4s;}
  @keyframes shake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}
  .note{margin-top:10px; background:rgba(0,0,0,.28); border-radius:14px; padding:10px 12px; text-align:center; font-weight:800; font-size:14px;}

  .grid{margin-top:12px; display:flex; flex-direction:column; gap:8px;}
  .grow{background:var(--paper); color:var(--ink); border-radius:16px; padding:8px; box-shadow:0 6px 14px -8px rgba(0,0,0,.5);}
  .ghead{display:flex; align-items:center; gap:8px; padding:0 4px 6px;}
  .ghead img{width:40px; height:40px; image-rendering:pixelated; flex-shrink:0;}
  .ghead b{font-family:'Baloo 2',sans-serif; font-size:17px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .ghead small{color:var(--muted); font-weight:800; font-size:12px;}
  .cells{display:grid; grid-template-columns:repeat(5,1fr); gap:5px;}
  .cell{border-radius:10px; min-height:62px; padding:5px 2px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; color:#fff; font-weight:800; font-size:13px; line-height:1.15; position:relative; overflow:hidden;}
  .cell small{font-size:9.5px; letter-spacing:.05em; text-transform:uppercase; opacity:.85; margin-bottom:2px; font-weight:800;}
  .cell .arr{font-size:11px; opacity:.95; margin-top:1px;}
  .cell.g{background:var(--ok);} .cell.o{background:var(--warn);} .cell.r{background:var(--ko);}
  .grow.new .cell{animation:flip .55s var(--ease) both; animation-delay:calc(var(--i) * .13s);}
  @keyframes flip{0%{transform:rotateX(90deg); opacity:0}100%{transform:none; opacity:1}}
  .answer{margin-top:12px; background:var(--paper); color:var(--ink); border-radius:16px; padding:12px; text-align:center; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:20px;}
  .answer small{display:block; font-family:'Nunito',sans-serif; font-weight:700; font-size:13px; color:var(--muted);}
  .podium{font-family:'Baloo 2',sans-serif; text-align:center; font-size:26px; font-weight:800; margin:4px 0 10px;}
  .score-panel{margin-top:12px;}

  .toast{position:fixed; left:50%; top:14px; transform:translateX(-50%); z-index:50; max-width:92vw; background:rgba(28,22,17,.95); color:#fff; border:1px solid rgba(255,255,255,.15); padding:11px 16px; border-radius:14px; font-weight:800; font-size:14px; animation:in .3s var(--ease) both;}
  .toast.ok{border-color:var(--ok);} .toast.ko{border-color:var(--ko);}
  @media (max-width:380px){.cell{font-size:12px; min-height:58px;} .cell small{font-size:8.5px;}}
  @media (prefers-reduced-motion:reduce){*{animation-duration:.001ms !important; transition-duration:.001ms !important;}}
  `;

  var HTML = `
  <div class="wrap"><div class="device">
    <div class="top"><span class="lens"></span><span class="brand">POKÉDEX WORDLE</span>
      <button type="button" class="themebtn" id="themeBtn" aria-label="Mode sombre">🌙</button></div>

    <section id="vHome" class="panel hidden">
      <h2>Pokédex Wordle</h2>
      <p class="sub">Un Pokémon secret, le même pour tous. À chaque proposition, des indices en couleur : type, génération, taille, poids, stade d'évolution. Trouve-le en le moins d'essais possible, et avant les autres !</p>
      <div id="profCard" class="profcard hidden"><span id="profAv"></span>
        <span class="pn"><b id="profName"></b><small>Ton profil</small></span>
        <button type="button" class="btn alt small" id="profEdit">Modifier</button></div>
      <div id="nameField"><label for="name">Ton pseudo</label>
        <input type="text" id="name" maxlength="16" autocomplete="off" placeholder="Sacha">
        <p class="sub" style="margin:8px 0 0">💡 Crée ton profil (onglet 👤 Profil) pour garder ton pseudo et ta photo.</p></div>
      <div class="row"><button class="btn" id="btnSolo">🎯 Jouer seul</button></div>
      <div class="row"><button class="btn alt" id="btnCreate">👥 Créer une partie à plusieurs</button></div>
      <label for="codeIn">Ou rejoindre avec un code</label>
      <div class="row" style="margin-top:0">
        <input type="text" id="codeIn" maxlength="5" autocomplete="off" placeholder="ABCDE" style="text-transform:uppercase; letter-spacing:.2em;">
        <button class="btn alt" id="btnJoin" style="flex:0 0 120px">Rejoindre</button></div>
      <div class="err" id="homeErr"></div>
    </section>

    <section id="vLobby" class="panel hidden">
      <h2>Salon</h2>
      <div class="code" id="lobbyCode">-----</div>
      <div class="row" style="margin-top:0">
        <button class="btn alt small" id="btnCopy">📋 Copier le code</button>
        <button class="btn alt small" id="btnShare">🔗 Inviter</button></div>
      <label>Joueurs</label>
      <ul class="players" id="lobbyPlayers"></ul>
      <label>Le secret est tiré parmi</label>
      <div class="gens" id="gens"></div>
      <div class="gens-meta"><span id="poolInfo"></span><button type="button" id="gensAll" class="hidden">Toutes</button></div>
      <div id="hostBox" class="hidden">
        <label for="rounds">Nombre de manches</label>
        <select id="rounds"><option>1</option><option>3</option><option>5</option><option>10</option></select>
        <div class="row"><button class="btn" id="btnStart">Lancer la partie</button></div></div>
      <p class="sub hidden" id="waitHost" style="margin-top:12px">En attente que l'hôte lance la partie…</p>
      <div class="row"><button class="btn alt small" id="btnLeave1">Quitter</button></div>
      <div class="err" id="lobbyErr"></div>
    </section>

    <section id="vGame" class="hidden">
      <div class="gamehead"><span class="badge" id="roundBadge">MANCHE 1/3</span><span class="tries" id="triesBadge">ESSAI 0/10</span></div>
      <div class="bar"><i id="bar"></i></div>
      <div class="legend"><span><i class="g"></i>Exact</span><span><i class="o"></i>Proche / un type en commun</span><span><i class="r"></i>Faux</span><span>▲ le secret est plus haut / grand / lourd / évolué</span></div>
      <div class="answer hidden" id="answerBox"></div>
      <div class="guess" id="guessBox">
        <form id="guessForm" autocomplete="off">
          <input type="text" id="guessIn" placeholder="Propose un Pokémon…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send">
          <button class="btn" type="submit">OK</button></form>
        <div class="sugg" id="sugg"></div></div>
      <div class="note hidden" id="note"></div>
      <div class="grid" id="grid"></div>
      <div class="panel score-panel"><ul class="players" id="gamePlayers"></ul></div>
      <div class="row hidden" id="giveUpBox"><button class="btn alt small" id="btnGiveUp">🏳️ Abandonner la manche</button></div>
      <div class="row hidden" id="hostGameBox"><button class="btn alt small" id="btnSkip">⏭️ Passer la manche (hôte)</button></div>
      <div class="row"><button class="btn alt small" id="btnLeave3">🚪 Quitter la partie</button></div>
    </section>

    <section id="vEnd" class="panel hidden">
      <div class="podium" id="podium">🏆</div>
      <ul class="players" id="endPlayers"></ul>
      <div class="row hidden" id="hostEndBox"><button class="btn" id="btnAgain">Rejouer</button><button class="btn alt" id="btnToLobby">Salon</button></div>
      <p class="sub hidden" id="waitHost2" style="margin-top:12px">L'hôte peut relancer une partie.</p>
      <div class="row"><button class="btn alt small" id="btnLeave2">Quitter</button></div>
    </section>
  </div></div>`;

  var TYPES_FR = { normal:"Normal", fire:"Feu", water:"Eau", grass:"Plante", electric:"Électrik", ice:"Glace", fighting:"Combat",
    poison:"Poison", ground:"Sol", flying:"Vol", psychic:"Psy", bug:"Insecte", rock:"Roche", ghost:"Spectre", dragon:"Dragon",
    dark:"Ténèbres", steel:"Acier", fairy:"Fée" };
  var GEN_NAMES = ["Kanto","Johto","Hoenn","Sinnoh","Unys","Kalos","Alola","Galar","Paldea"];
  var GEN_ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX"];

  var mounted = false;
  window.WordleTab = {
    mount: function (host) {
      if (mounted) return; mounted = true;
      var root = host.attachShadow({ mode: "open" });
      var style = document.createElement("style"); style.textContent = CSS;
      var box = document.createElement("div"); box.innerHTML = HTML;
      root.appendChild(style);
      while (box.firstChild) root.appendChild(box.firstChild);
      run(root, host);
    }
  };

  function run(root, host) {
    var API = "/api/wordle";
    var $ = function (id) { return root.getElementById(id); };
    var S = { code: null, playerId: null, state: null, offset: 0, names: [], folded: [], polling: null, busy: false, gridKey: null, gridCount: 0, solved: false };

    // ---------- Utilitaires ----------
    function fold(s) { return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/[\s\-.]+/g, " ").trim(); }
    function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
    function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function toast(msg, kind) { var t = el("div", "toast " + (kind || ""), msg); root.appendChild(t); setTimeout(function () { t.remove(); }, 2800); }
    function cardOf() { return profile() ? window.PokeProfile.card() : null; }
    function sprite(id) { return "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/" + id + ".png"; }
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

    // ---------- Thème (suit celui du site) ----------
    var docEl = document.documentElement;
    function syncTheme() {
      var dark = docEl.getAttribute("data-theme") === "dark";
      host.classList.toggle("dark", dark);
      $("themeBtn").textContent = dark ? "☀️" : "🌙";
    }
    new MutationObserver(syncTheme).observe(docEl, { attributes: true, attributeFilter: ["data-theme"] });
    $("themeBtn").addEventListener("click", function () {
      var main = document.getElementById("themeToggleBtn");
      if (main) main.click();
      else { var d = docEl.getAttribute("data-theme") === "dark"; if (d) docEl.removeAttribute("data-theme"); else docEl.setAttribute("data-theme", "dark"); store("pokedexTheme", d ? "light" : "dark"); }
    });
    syncTheme();

    // ---------- Session ----------
    function saveSession() { store("wordle_code", S.code); store("wordle_pid", S.playerId); }
    function leaveLocal() {
      S.code = S.playerId = S.state = null; S.gridKey = null; saveSession();
      clearInterval(S.polling); S.polling = null; show("vHome");
    }
    function enter(code, pid) {
      S.code = code; S.playerId = pid; S.gridKey = null; saveSession();
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
      startPolling();
    }

    // ---------- Accueil / profil ----------
    $("name").value = load("wordle_name") || "";
    var inviteCode = (new URLSearchParams(location.search).get("wordle") || "").toUpperCase();
    if (/^[A-Z0-9]{5}$/.test(inviteCode)) $("codeIn").value = inviteCode; else inviteCode = "";
    function profile() { return window.PokeProfile ? window.PokeProfile.get() : null; }
    function renderProfile() {
      var pr = profile();
      $("profCard").classList.toggle("hidden", !pr);
      $("nameField").classList.toggle("hidden", !!pr);
      if (!pr) return;
      $("profName").textContent = pr.name;
      var av = $("profAv"); av.textContent = "";
      if (pr.favId) { var im = document.createElement("img"); im.alt = ""; im.src = window.PokeProfile.sprite(pr.favId, pr.style); if (pr.style === 2) im.style.imageRendering = "auto"; av.appendChild(im); }
      else av.appendChild(el("span", "noav", "?"));
    }
    renderProfile();
    window.addEventListener("profilechange", renderProfile);
  // Garde ta carte à jour chez les autres joueurs (profil ou statistiques modifiés pendant la partie).
  var cardTimer = null;
  function pushCard() {
    clearTimeout(cardTimer);
    cardTimer = setTimeout(function () { if (S.code && S.playerId && profile()) post("card", { card: cardOf() }).catch(function () {}); }, 800);
  }
  window.addEventListener("statschange", pushCard);
  window.addEventListener("profilechange", pushCard);
    $("profEdit").onclick = function () { var t = document.getElementById("tabProfile"); if (t) t.click(); };
    function pseudo() {
      var pr = profile();
      if (pr) { $("homeErr").textContent = ""; return pr.name; }
      var n = $("name").value.trim();
      if (!n) { $("homeErr").textContent = "Choisis un pseudo (ou crée ton profil)."; $("name").focus(); return null; }
      store("wordle_name", n); $("homeErr").textContent = ""; return n;
    }
    function avatarId() { var pr = profile(); return pr && pr.favId ? pr.favId : null; }
    function create(thenStart) {
      var n = pseudo(); if (!n) return;
      api("POST", { action: "create", name: n, avatar: avatarId(), card: cardOf() }).then(function (r) {
        enter(r.code, r.playerId);
        if (thenStart) return post("start", { rounds: 3 }).then(function (s) { S.state = s; S.offset = s.now - Date.now(); render(); });
      }).catch(function (e) { $("homeErr").textContent = e.message; });
    }
    $("btnSolo").onclick = function () { create(true); };
    $("btnCreate").onclick = function () { create(false); };
    $("btnJoin").onclick = function () {
      var n = pseudo(); if (!n) return;
      var c = $("codeIn").value.trim().toUpperCase();
      if (!c) { $("homeErr").textContent = "Entre le code de la partie."; return; }
      api("POST", { action: "join", name: n, code: c, avatar: avatarId(), card: cardOf() }).then(function (r) { enter(r.code, r.playerId); })
        .catch(function (e) { $("homeErr").textContent = e.message; });
    };

    // ---------- Noms (autocomplétion) ----------
    api("GET", null, "action=names").then(function (r) { S.names = r.byId || []; S.folded = S.names.map(fold); }).catch(function () {});

    // ---------- Sondage ----------
    function startPolling() { clearInterval(S.polling); refresh(); S.polling = setInterval(refresh, 1500); }
    function refresh() {
      if (!S.code || S.busy || document.hidden) return;
      S.busy = true;
      api("GET", null, "code=" + encodeURIComponent(S.code) + "&playerId=" + encodeURIComponent(S.playerId))
        .then(function (st) { S.busy = false; S.state = st; S.offset = st.now - Date.now(); render(); })
        .catch(function (e) {
          S.busy = false;
          if (e.status === 404 || e.status === 403) { toast("Tu n'es plus dans cette partie.", "ko"); leaveLocal(); }
        });
    }

    // ---------- Rendu : listes de joueurs ----------
    function playersList(ul, st, opts) {
      ul.textContent = "";
      var medals = ["🥇", "🥈", "🥉"];
      st.players.forEach(function (p, i) {
        var li = el("li", (p.id === S.playerId ? "me " : "") + (p.solved ? "won" : ""));
        if (opts.rank) li.appendChild(el("span", "", medals[i] || (i + 1) + "."));
        if (p.avatar) { var ai = document.createElement("img"); ai.className = "av"; ai.alt = ""; ai.loading = "lazy"; ai.src = window.PokeProfile.sprite(p.avatar, p.card && p.card.s); if (p.card) { ai.style.borderColor = window.PokeProfile.frame(p.card.c); if (p.card.s === 2) ai.style.imageRendering = "auto"; } li.appendChild(ai); }
        li.appendChild(el("span", "nm", p.name));
        if (p.id === st.hostId && st.players.length > 1) li.appendChild(el("span", "tag", "hôte"));
        if (opts.progress) {
          var pips = el("span", "pips");
          for (var k = 0; k < 5; k++) pips.appendChild(el("i", k < p.best ? "on" : ""));
          li.appendChild(pips);
          li.appendChild(el("small", "", p.solved ? "✅ " + p.attempts : p.attempts + "/" + st.maxTries + (p.done ? " ⛔" : "")));
        }
        li.appendChild(el("span", "sc", String(p.score)));
        if (opts.kick && st.isHost && p.id !== S.playerId) {
          var k2 = el("button", "kick", "✕"); k2.title = "Exclure";
          k2.onclick = function () { post("kick", { targetPlayerId: p.id }).then(function (s) { S.state = s; render(); }).catch(function (e) { toast(e.message, "ko"); }); };
          li.appendChild(k2);
        }
        li.style.cursor = "pointer"; li.title = "Voir le profil";
      li.addEventListener("click", function (ev) {
        if (ev.target.closest && ev.target.closest("button") || !window.PokeCard) return;
        window.PokeCard.show({ name: p.name, avatar: p.avatar, card: p.card, me: p.id === S.playerId });
      });
      ul.appendChild(li);
      });
    }

    function render() {
      var st = S.state; if (!st) return;
      if (st.status === "lobby") {
        show("vLobby");
        $("lobbyCode").textContent = st.code;
        playersList($("lobbyPlayers"), st, { kick: true });
        renderConfig(st);
        $("hostBox").classList.toggle("hidden", !st.isHost);
        $("waitHost").classList.toggle("hidden", st.isHost);
        return;
      }
      if (st.status === "finished") {
        show("vEnd");
        var top = st.players[0];
        $("podium").textContent = top ? (st.players.length > 1 ? "🏆 " + top.name + " gagne !" : "🏁 " + top.score + " points") : "🏆";
        playersList($("endPlayers"), st, { rank: st.players.length > 1 });
        $("hostEndBox").classList.toggle("hidden", !st.isHost);
        $("waitHost2").classList.toggle("hidden", st.isHost);
        return;
      }
      renderGame(st);
    }

    // ---------- Rendu : grille d'indices ----------
    function arrow(d) { return d > 0 ? "▲" : d < 0 ? "▼" : ""; }
    function cell(label, lines, c, d, i) {
      var e = el("div", "cell " + c); e.style.setProperty("--i", i);
      e.appendChild(el("small", "", label));
      lines.forEach(function (l) { e.appendChild(el("span", "", l)); });
      if (d) e.appendChild(el("span", "arr", arrow(d)));
      return e;
    }
    function num(n) { return String(Math.round(n * 10) / 10).replace(".", ","); }
    function buildRow(row, n, isNew) {
      var g = el("div", "grow" + (isNew ? " new" : ""));
      var h = el("div", "ghead");
      var im = document.createElement("img"); im.alt = ""; im.src = sprite(row.id); h.appendChild(im);
      h.appendChild(el("b", "", row.name)); h.appendChild(el("small", "", n ? "n°" + row.id + " · essai " + n : "n°" + row.id));
      g.appendChild(h);
      var cs = el("div", "cells");
      cs.appendChild(cell("Type", row.types.map(function (t) { return TYPES_FR[t] || t; }), row.c.types, 0, 0));
      cs.appendChild(cell("Gén.", [GEN_ROMAN[row.gen - 1] || String(row.gen)], row.c.gen, row.d.gen, 1));
      cs.appendChild(cell("Taille", [num(row.height) + " m"], row.c.height, row.d.height, 2));
      cs.appendChild(cell("Poids", [num(row.weight) + " kg"], row.c.weight, row.d.weight, 3));
      cs.appendChild(cell("Évol.", ["Stade " + row.stage], row.c.stage, row.d.stage, 4));
      g.appendChild(cs);
      return g;
    }

    function renderGame(st) {
      show("vGame");
      var r = st.round; if (!r) return;
      $("roundBadge").textContent = "MANCHE " + r.number + "/" + st.totalRounds;
      $("triesBadge").textContent = "ESSAI " + Math.min(r.mine.length + (r.myDone || r.revealed ? 0 : 1), st.maxTries) + "/" + st.maxTries;

      // Grille : reconstruite seulement si la manche ou le nombre d'essais change (la dernière ligne s'anime).
      var key = r.number + ":" + r.startedAt;
      if (S.gridKey !== key) { S.gridKey = key; S.gridCount = 0; S.solved = false; $("grid").textContent = ""; $("guessIn").value = ""; $("sugg").textContent = ""; }
      var grid = $("grid");
      if (r.mine.length !== S.gridCount) {
        var animate = S.gridCount > 0 || r.mine.length === 1;
        grid.textContent = "";
        for (var i = r.mine.length - 1; i >= 0; i--) grid.appendChild(buildRow(r.mine[i], i + 1, animate && i === r.mine.length - 1));
        S.gridCount = r.mine.length;
      }

      // Fin de manche / état du joueur
      var note = $("note"), ans = $("answerBox");
      if (r.revealed) {
        var recTok = S.code + ":" + key;
        if (S.recorded !== recTok && load("wordle_rec") !== recTok) {
          S.recorded = recTok; store("wordle_rec", recTok);
          if (r.mine.length > 0 && window.PokeStats) window.PokeStats.record("wordle", { won: !!r.iWon, tries: r.mine.length });
        }
        ans.classList.remove("hidden"); ans.textContent = "";
        var im = document.createElement("img"); im.alt = ""; im.src = sprite(r.answer.id); im.style.cssText = "width:96px;height:96px;image-rendering:pixelated;display:block;margin:0 auto";
        ans.appendChild(im);
        ans.appendChild(document.createTextNode(r.answer.name));
        ans.appendChild(el("small", "", r.winnerName ? "✅ " + r.winnerName + " a trouvé (+" + r.points + ")" : "⏱️ Personne n'a trouvé"));
        $("guessBox").classList.add("hidden"); note.classList.add("hidden");
        $("giveUpBox").classList.add("hidden"); $("hostGameBox").classList.add("hidden");
      } else {
        ans.classList.add("hidden");
        $("guessBox").classList.toggle("hidden", r.myDone);
        note.classList.toggle("hidden", !r.myDone);
        if (r.myDone) note.textContent = r.mine.length >= st.maxTries ? "Plus d'essais ! Attends la fin de la manche…" : "Tu as abandonné. Attends la fin de la manche…";
        $("giveUpBox").classList.toggle("hidden", r.myDone);
        $("hostGameBox").classList.toggle("hidden", !st.isHost || st.players.length < 2);
      }
      playersList($("gamePlayers"), st, { progress: true });
    }

    // Barre de temps fluide
    (function frame() {
      var st = S.state;
      if (st && st.status === "playing" && st.round) $("bar").style.transform = "scaleX(" + Math.max(0, 1 - (Date.now() + S.offset - st.round.startedAt) / st.roundMs) + ")";
      else if (st && st.status === "reveal") $("bar").style.transform = "scaleX(0)";
      requestAnimationFrame(frame);
    })();

    // ---------- Réglages ----------
    function renderConfig(st) {
      var box = $("gens"), sel = st.config.generations; box.textContent = "";
      GEN_NAMES.forEach(function (name, i) {
        var g = i + 1, b = el("button", sel.indexOf(g) >= 0 ? "on" : ""); b.type = "button"; b.disabled = !st.isHost;
        b.appendChild(document.createTextNode("Gén. " + GEN_ROMAN[i])); b.appendChild(el("small", "", name));
        b.onclick = function () {
          var next = sel.indexOf(g) >= 0 ? sel.filter(function (x) { return x !== g; }) : sel.concat([g]);
          if (!next.length) { toast("Garde au moins une génération.", "ko"); return; }
          saveConfig({ generations: next });
        };
        box.appendChild(b);
      });
      $("poolInfo").textContent = st.poolSize + " Pokémon possibles (tu peux proposer les 1025)";
      $("gensAll").classList.toggle("hidden", !st.isHost || sel.length === 9);
      var r = $("rounds"); if (root.activeElement !== r) r.value = String(st.totalRounds);
    }
    function saveConfig(patch) {
      post("config", patch).then(function (s) { S.state = s; S.offset = s.now - Date.now(); render(); }).catch(function (e) { toast(e.message, "ko"); refresh(); });
    }
    $("gensAll").onclick = function () { saveConfig({ generations: [1, 2, 3, 4, 5, 6, 7, 8, 9] }); };
    $("rounds").onchange = function () { saveConfig({ rounds: Number($("rounds").value) }); };

    // ---------- Actions ----------
    $("btnCopy").onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(S.code).then(function () { toast("Code copié", "ok"); }); };
    $("btnShare").onclick = function () {
      var url = location.origin + location.pathname + "?wordle=" + S.code;
      if (navigator.share) navigator.share({ title: "Pokédex Wordle", text: "Rejoins ma course ! Code : " + S.code, url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("Lien copié", "ok"); });
    };
    $("btnStart").onclick = function () {
      $("btnStart").disabled = true;
      post("start", {}).then(function (s) { S.state = s; S.gridKey = null; render(); })
        .catch(function (e) { $("lobbyErr").textContent = e.message; })
        .then(function () { $("btnStart").disabled = false; });
    };
    function leave() { post("leave").catch(function () {}).then(leaveLocal); }
    $("btnLeave1").onclick = leave; $("btnLeave2").onclick = leave;
    $("btnLeave3").onclick = function () { if (window.confirm("Quitter la partie en cours ?")) leave(); };
    $("btnSkip").onclick = function () { post("skip").then(function (s) { S.state = s; render(); }).catch(function (e) { toast(e.message, "ko"); }); };
    $("btnGiveUp").onclick = function () { if (window.confirm("Abandonner cette manche ?")) post("giveup").then(function (s) { S.state = s; render(); }).catch(function (e) { toast(e.message, "ko"); }); };
    $("btnAgain").onclick = function () { post("start", { rounds: S.state.totalRounds }).then(function (s) { S.state = s; S.gridKey = null; render(); }).catch(function (e) { toast(e.message, "ko"); }); };
    $("btnToLobby").onclick = function () { post("lobby").then(function (s) { S.state = s; render(); }).catch(function (e) { toast(e.message, "ko"); }); };

    // ---------- Proposer un Pokémon ----------
    var sending = false;
    function submitGuess(value) {
      value = (value || "").trim(); if (!value || sending) return;
      sending = true;
      post("guess", { guess: value }).then(function (r) {
        sending = false;
        var inp = $("guessIn");
        if (r.unknown) { toast("Ce Pokémon n'existe pas (vérifie l'orthographe).", "ko"); inp.classList.remove("shake"); void inp.offsetWidth; inp.classList.add("shake"); inp.select(); return; }
        if (r.duplicate) { toast("Tu l'as déjà proposé.", "ko"); inp.select(); return; }
        if (r.closed) { refresh(); return; }
        inp.value = ""; $("sugg").textContent = "";
        if (r.correct) { toast("Trouvé en " + r.tries + " essai" + (r.tries > 1 ? "s" : "") + " ! +" + r.points + " pts", "ok"); if (navigator.vibrate) navigator.vibrate([40, 30, 80]); }
        S.busy = false; refresh();
      }).catch(function (e) { sending = false; toast(e.message, "ko"); });
    }
    $("guessForm").addEventListener("submit", function (ev) { ev.preventDefault(); submitGuess($("guessIn").value); });
    $("guessIn").addEventListener("input", function () {
      var q = fold(this.value), box = $("sugg"); box.textContent = "";
      if (q.length < 2 || !S.names.length) return;
      var tried = {}; ((S.state && S.state.round && S.state.round.mine) || []).forEach(function (m) { tried[m.id] = 1; });
      var out = [], i;
      for (i = 0; i < S.folded.length && out.length < 5; i++) if (S.folded[i] && !tried[i + 1] && S.folded[i].indexOf(q) === 0) out.push(i + 1);
      for (i = 0; i < S.folded.length && out.length < 5; i++) if (S.folded[i] && !tried[i + 1] && S.folded[i].indexOf(q) > 0 && out.indexOf(i + 1) < 0) out.push(i + 1);
      out.forEach(function (id) {
        var b = el("button"); b.type = "button";
        var im = document.createElement("img"); im.alt = ""; im.loading = "lazy"; im.src = sprite(id);
        b.appendChild(im); b.appendChild(document.createTextNode(S.names[id - 1])); b.appendChild(el("small", "", "n°" + id));
        b.onclick = function () { submitGuess(S.names[id - 1]); };
        box.appendChild(b);
      });
    });

    // Pilotage par le groupe (party.js) : entrer dans / quitter une salle sans passer par l'écran d'accueil.
    window.WordleCtl = {
      code: function () { return S.code; },
      enter: function (c, p) { S.state = null; S.lastToken = null; S.gridKey = null; enter(c, p); },
      leave: function () { if (S.code) leave(); }
    };

    // ---------- Démarrage ----------
    show("vHome");
    var savedCode = load("wordle_code"), savedPid = load("wordle_pid");
    if (savedCode && savedPid && !inviteCode) { S.code = savedCode; S.playerId = savedPid; startPolling(); }
  }
})();
