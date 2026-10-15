/* whois.js — onglet « Qui est ce Pokémon ? » intégré au site.
   Tourne dans un Shadow DOM : son HTML, son CSS et ses ids sont isolés du jeu de
   devinettes, les deux modes ne peuvent donc pas se marcher dessus. */
(function(){
  "use strict";
  var CSS = "\n  :host{display:block; font-family:'Nunito',sans-serif; color:#fff; \n    --red:#E23B30; --red-dark:#A3231A; --gold:#FFC93C; --gold-deep:#D99A12;\n    --ink:#221d17; --paper:#FCF9F1; --card:#fff; --line:rgba(34,29,23,.12);\n    --muted:#7b6f60; --ok:#2fa84f; --ko:#c8372d;\n    --ease:cubic-bezier(.2,.8,.2,1);\n  }\n  *{box-sizing:border-box; -webkit-tap-highlight-color:transparent;}\n  .wrap{max-width:520px; margin:0 auto;}\n  .device{\n    background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,0) 22%),\n               linear-gradient(160deg,var(--red),#cf2f25 55%,var(--red-dark));\n    border:1px solid rgba(0,0,0,.35); border-radius:30px; padding:16px 16px 20px;\n    box-shadow:0 30px 60px -15px rgba(0,0,0,.65), inset 0 2px 0 rgba(255,255,255,.35), inset 0 -6px 0 rgba(0,0,0,.18);\n    animation:in .5s var(--ease) both;\n  }\n  @keyframes in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}\n  .top{display:flex; align-items:center; gap:10px; margin-bottom:12px;}\n  .lens{width:22px;height:22px;border-radius:50%;flex-shrink:0;\n    background:radial-gradient(circle at 35% 30%,#bfe9ff,#3b8fd6 55%,#1b5a9c);\n    box-shadow:0 0 0 3px rgba(255,255,255,.55),0 0 14px rgba(120,200,255,.8);}\n  .brand{font-family:'Silkscreen',monospace; font-size:12px; letter-spacing:.12em; flex:1;}\n  .back{color:#fff; text-decoration:none; font-family:'Silkscreen',monospace; font-size:10px;\n    background:rgba(0,0,0,.25); padding:7px 10px; border-radius:999px;}\n\n  .panel{background:var(--paper); color:var(--ink); border-radius:20px; padding:16px; margin-top:12px;\n    box-shadow:0 8px 20px -8px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.6);}\n  h2{font-family:'Baloo 2',sans-serif; margin:0 0 8px; font-size:20px;}\n  p.sub{margin:0 0 12px; color:var(--muted); font-size:14px; line-height:1.4;}\n  label{display:block; font-weight:800; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin:10px 0 4px;}\n  input[type=text], select{\n    width:100%; font:inherit; font-size:16px; font-weight:700; color:var(--ink);\n    padding:13px 16px; border-radius:14px; border:2px solid var(--line); background:#fff; outline:none;\n  }\n  input[type=text]:focus, select:focus{border-color:var(--gold-deep);}\n  .btn{\n    width:100%; min-height:50px; border:0; border-radius:16px; cursor:pointer;\n    font-family:'Baloo 2',sans-serif; font-weight:800; font-size:17px; color:var(--ink);\n    background:linear-gradient(180deg,#ffd96b,var(--gold) 55%,#f0b21f);\n    box-shadow:0 5px 0 var(--gold-deep), 0 12px 20px -8px rgba(0,0,0,.4);\n    transition:transform .15s var(--ease), box-shadow .15s var(--ease);\n  }\n  .btn:active{transform:translateY(3px); box-shadow:0 2px 0 var(--gold-deep);}\n  .btn:disabled{opacity:.5; cursor:default;}\n  .btn.alt{background:#fff; box-shadow:0 4px 0 rgba(0,0,0,.15); border:1px solid var(--line);}\n  .btn.small{min-height:40px; font-size:14px; width:auto; padding:0 16px;}\n  .row{display:flex; gap:10px; margin-top:12px;}\n  .row > *{flex:1;}\n  .err{color:var(--ko); font-weight:700; font-size:13px; margin-top:8px; min-height:18px;}\n\n  .code{font-family:'Silkscreen',monospace; font-size:28px; letter-spacing:.18em; text-align:center;\n    background:#fff; border:2px dashed var(--line); border-radius:16px; padding:12px; margin:6px 0 10px;}\n  .players{list-style:none; padding:0; margin:0;}\n  .players li{display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:14px; background:#fff;\n    border:1px solid var(--line); margin-bottom:8px; font-weight:800;}\n  .players li .nm{flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}\n  .players li .sc{font-family:'Silkscreen',monospace; font-size:13px;}\n  .players li.me{border-color:var(--gold-deep); box-shadow:inset 0 0 0 1px var(--gold-deep);}\n  .players li.won{background:#e9f8ec; border-color:var(--ok);}\n  .tag{font-size:11px; font-weight:800; background:var(--gold); padding:2px 8px; border-radius:999px;}\n  .kick{border:0; background:transparent; font-size:16px; cursor:pointer; color:var(--ko);}\n\n  /* \u00c9cran du Pok\u00e9mon */\n  .screen{\n    position:relative; margin-top:12px; border:7px solid #070d08; border-radius:22px; overflow:hidden;\n    background:radial-gradient(circle at 50% 42%, rgba(143,240,164,.22), transparent 65%), #0e1a12;\n    box-shadow:inset 0 0 0 2px rgba(143,240,164,.18), inset 0 14px 36px rgba(0,0,0,.7);\n    aspect-ratio:1/1; display:flex; align-items:center; justify-content:center;\n  }\n  .screen img{width:84%; height:84%; object-fit:contain; transition:filter .6s var(--ease), transform .6s var(--ease);}\n  .screen img.sil{filter:brightness(0) drop-shadow(0 0 14px rgba(143,240,164,.5));}\n  .screen img.reveal{animation:pop .6s var(--ease) both;}\n  @keyframes pop{from{transform:scale(.85)}to{transform:scale(1)}}\n  .badge{position:absolute; top:10px; left:12px; font-family:'Silkscreen',monospace; font-size:11px;\n    color:#8ff0a4; background:rgba(0,0,0,.45); padding:5px 9px; border-radius:999px;}\n  .bar{height:10px; background:rgba(0,0,0,.3); border-radius:8px; overflow:hidden; margin-top:12px;}\n  .bar > i{display:block; height:100%; width:100%; background:linear-gradient(90deg,var(--gold),#ff8a3c); transform-origin:left; border-radius:8px;}\n  .hint{margin-top:10px; text-align:center; font-family:'Silkscreen',monospace; font-size:13px; letter-spacing:.12em; min-height:20px; color:#fff;}\n  .answer{\n    margin-top:10px; background:var(--paper); color:var(--ink); border-radius:16px; padding:12px; text-align:center;\n    font-family:'Baloo 2',sans-serif; font-weight:800; font-size:22px;\n  }\n  .answer small{display:block; font-family:'Nunito',sans-serif; font-weight:700; font-size:13px; color:var(--muted);}\n  .guess{position:relative; margin-top:12px;}\n  .guess form{display:flex; gap:8px;}\n  .guess input{flex:1;}\n  .guess .btn{width:auto; padding:0 20px;}\n  .shake{animation:shake .4s;}\n  @keyframes shake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}\n  .sugg{display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; min-height:0;}\n  .sugg button{border:0; border-radius:999px; padding:7px 12px; font:inherit; font-weight:800; font-size:13px;\n    background:rgba(255,255,255,.92); color:var(--ink); cursor:pointer;}\n  .score-panel{margin-top:12px;}\n  .score-panel .players li{padding:8px 12px; margin-bottom:6px;}\n  .podium{font-family:'Baloo 2',sans-serif; text-align:center; font-size:26px; font-weight:800; margin:4px 0 10px;}\n\n  .toast{position:fixed; left:50%; top:14px; transform:translateX(-50%); z-index:50; max-width:92vw;\n    background:rgba(28,22,17,.95); border:1px solid rgba(255,255,255,.15); padding:11px 16px; border-radius:14px;\n    font-weight:800; font-size:14px; animation:in .3s var(--ease) both;}\n  .toast.ok{border-color:var(--ok);} .toast.ko{border-color:var(--ko);}\n  .hidden{display:none !important;}\n  @media (prefers-reduced-motion:reduce){*{animation-duration:.001ms !important; transition-duration:.001ms !important;}}\n";
  var HTML = "<div class=\"wrap\">\n  <div class=\"device\">\n    <div class=\"top\">\n      <span class=\"lens\"></span>\n      <span class=\"brand\">QUI EST CE POK\u00c9MON ?</span>\n      \n    </div>\n\n    <!-- Accueil -->\n    <section id=\"vHome\" class=\"panel hidden\">\n      <h2>Qui est ce Pok\u00e9mon ?</h2>\n      <p class=\"sub\">Une silhouette, tout le monde la voit en m\u00eame temps : le plus rapide \u00e0 taper le bon nom gagne les points. Les 1025 Pok\u00e9mon sont dans le tirage.</p>\n      <label for=\"name\">Ton pseudo</label>\n      <input type=\"text\" id=\"name\" maxlength=\"16\" autocomplete=\"off\" placeholder=\"Sacha\">\n      <div class=\"row\"><button class=\"btn\" id=\"btnCreate\">Cr\u00e9er une partie</button></div>\n      <label for=\"codeIn\">Ou rejoindre avec un code</label>\n      <div class=\"row\" style=\"margin-top:0\">\n        <input type=\"text\" id=\"codeIn\" maxlength=\"5\" autocomplete=\"off\" placeholder=\"ABCDE\" style=\"text-transform:uppercase; letter-spacing:.2em;\">\n        <button class=\"btn alt\" id=\"btnJoin\" style=\"flex:0 0 120px\">Rejoindre</button>\n      </div>\n      <div class=\"err\" id=\"homeErr\"></div>\n    </section>\n\n    <!-- Salon -->\n    <section id=\"vLobby\" class=\"panel hidden\">\n      <h2>Salon</h2>\n      <div class=\"code\" id=\"lobbyCode\">-----</div>\n      <div class=\"row\" style=\"margin-top:0\">\n        <button class=\"btn alt small\" id=\"btnCopy\">\ud83d\udccb Copier le code</button>\n        <button class=\"btn alt small\" id=\"btnShare\">\ud83d\udd17 Inviter</button>\n      </div>\n      <label>Joueurs</label>\n      <ul class=\"players\" id=\"lobbyPlayers\"></ul>\n      <div id=\"hostBox\" class=\"hidden\">\n        <label for=\"rounds\">Nombre de manches</label>\n        <select id=\"rounds\"><option>5</option><option selected>10</option><option>15</option><option>20</option><option>30</option></select>\n        <div class=\"row\"><button class=\"btn\" id=\"btnStart\">Lancer la partie</button></div>\n      </div>\n      <p class=\"sub hidden\" id=\"waitHost\" style=\"margin-top:12px\">En attente que l'h\u00f4te lance la partie\u2026</p>\n      <div class=\"row\"><button class=\"btn alt small\" id=\"btnLeave1\">Quitter</button></div>\n      <div class=\"err\" id=\"lobbyErr\"></div>\n    </section>\n\n    <!-- Jeu -->\n    <section id=\"vGame\" class=\"hidden\">\n      <div class=\"screen\">\n        <span class=\"badge\" id=\"roundBadge\">MANCHE 1/10</span>\n        <img id=\"pkImg\" alt=\"Pok\u00e9mon myst\u00e8re\" class=\"sil\" draggable=\"false\">\n      </div>\n      <div class=\"bar\"><i id=\"bar\"></i></div>\n      <div class=\"hint\" id=\"hint\"></div>\n      <div class=\"answer hidden\" id=\"answerBox\"></div>\n      <div class=\"guess\" id=\"guessBox\">\n        <form id=\"guessForm\" autocomplete=\"off\">\n          <input type=\"text\" id=\"guessIn\" placeholder=\"Tape un nom\u2026\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\" enterkeyhint=\"send\">\n          <button class=\"btn\" type=\"submit\">OK</button>\n        </form>\n        <div class=\"sugg\" id=\"sugg\"></div>\n      </div>\n      <div class=\"panel score-panel\"><ul class=\"players\" id=\"gamePlayers\"></ul></div>\n      <div class=\"row hidden\" id=\"hostGameBox\"><button class=\"btn alt small\" id=\"btnSkip\">Passer la manche</button></div>\n    </section>\n\n    <!-- Fin -->\n    <section id=\"vEnd\" class=\"panel hidden\">\n      <div class=\"podium\" id=\"podium\">\ud83c\udfc6</div>\n      <ul class=\"players\" id=\"endPlayers\"></ul>\n      <div class=\"row hidden\" id=\"hostEndBox\">\n        <button class=\"btn\" id=\"btnAgain\">Rejouer</button>\n        <button class=\"btn alt\" id=\"btnToLobby\">Salon</button>\n      </div>\n      <p class=\"sub hidden\" id=\"waitHost2\" style=\"margin-top:12px\">L'h\u00f4te peut relancer une partie.</p>\n      <div class=\"row\"><button class=\"btn alt small\" id=\"btnLeave2\">Quitter</button></div>\n    </section>\n  </div>\n</div>";
  var mounted = false;
  window.WhoIsTab = {
    mount: function(host){
      if (mounted) return; mounted = true;
      var root = host.attachShadow({ mode: "open" });
      var style = document.createElement("style"); style.textContent = CSS;
      var box = document.createElement("div"); box.innerHTML = HTML;
      root.appendChild(style);
      while (box.firstChild) root.appendChild(box.firstChild);
      window.__whoisRoot = root;
      (function(){
(function(root){
  "use strict";
  var API = "/api/whois";
  var $ = function(id){ return root.getElementById(id); };
  var S = { code:null, playerId:null, state:null, offset:0, names:[], folded:[], lastToken:null, polling:null, busy:false };

  // ---------- Utilitaires ----------
  function fold(s){ return String(s||"").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[’']/g,"'").replace(/[\s\-.]+/g," ").trim(); }
  function store(k,v){ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v);}catch(e){} }
  function load(k){ try{ return localStorage.getItem(k);}catch(e){ return null; } }
  function toast(msg, kind){
    var t = document.createElement("div"); t.className = "toast " + (kind||""); t.textContent = msg;
    root.appendChild(t); setTimeout(function(){ t.remove(); }, 2600);
  }
  function show(id){ ["vHome","vLobby","vGame","vEnd"].forEach(function(v){ $(v).classList.toggle("hidden", v!==id); }); }
  function api(method, body, query){
    var url = API + (query ? "?" + query : "");
    var opt = { method: method };
    if (body){ opt.headers = {"Content-Type":"application/json"}; opt.body = JSON.stringify(body); }
    return fetch(url, opt).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if (!r.ok) { var e = new Error(j.error || "Erreur"); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function post(action, extra){
    return api("POST", Object.assign({ action:action, code:S.code, playerId:S.playerId }, extra||{}));
  }
  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text!=null) e.textContent = text; return e; }

  // ---------- Session ----------
  function saveSession(){ store("whois_code", S.code); store("whois_pid", S.playerId); }
  function leaveLocal(){
    S.code = S.playerId = S.state = S.lastToken = null; saveSession();
    clearInterval(S.polling); S.polling = null; show("vHome");
  }
  function enter(code, pid){
    S.code = code; S.playerId = pid; saveSession();
    history.replaceState(null, "", location.pathname);
    startPolling();
  }

  // ---------- Accueil ----------
  $("name").value = load("whois_name") || "";
  var qs = new URLSearchParams(location.search);
  var inviteCode = (qs.get("whois")||"").toUpperCase();
  if (/^[A-Z0-9]{5}$/.test(inviteCode)) $("codeIn").value = inviteCode;

  function pseudo(){
    var n = $("name").value.trim();
    if (!n){ $("homeErr").textContent = "Choisis un pseudo."; $("name").focus(); return null; }
    store("whois_name", n); $("homeErr").textContent = ""; return n;
  }
  $("btnCreate").onclick = function(){
    var n = pseudo(); if(!n) return;
    api("POST",{action:"create",name:n}).then(function(r){ enter(r.code, r.playerId); })
      .catch(function(e){ $("homeErr").textContent = e.message; });
  };
  $("btnJoin").onclick = function(){
    var n = pseudo(); if(!n) return;
    var c = $("codeIn").value.trim().toUpperCase();
    if (!c){ $("homeErr").textContent = "Entre le code de la partie."; return; }
    api("POST",{action:"join",name:n,code:c}).then(function(r){ enter(r.code, r.playerId); })
      .catch(function(e){ $("homeErr").textContent = e.message; });
  };

  // ---------- Noms (suggestions) ----------
  api("GET", null, "action=names").then(function(r){
    S.names = r.names || []; S.folded = S.names.map(fold);
  }).catch(function(){});

  // ---------- Sondage ----------
  function startPolling(){
    clearInterval(S.polling);
    refresh();
    S.polling = setInterval(refresh, 1000);
  }
  function refresh(){
    if (!S.code || S.busy || document.hidden) return;
    S.busy = true;
    api("GET", null, "code="+encodeURIComponent(S.code)+"&playerId="+encodeURIComponent(S.playerId))
      .then(function(st){ S.busy = false; S.state = st; S.offset = st.now - Date.now(); render(); })
      .catch(function(e){
        S.busy = false;
        if (e.status === 404 || e.status === 403) { toast("Tu n'es plus dans cette partie.", "ko"); leaveLocal(); }
      });
  }

  // ---------- Rendu ----------
  function playersList(ul, st, opts){
    ul.textContent = "";
    var medals = ["🥇","🥈","🥉"];
    st.players.forEach(function(p, i){
      var li = el("li", (p.id===S.playerId?"me ":"") + (p.solved?"won":""));
      if (opts.rank) li.appendChild(el("span", "", medals[i] || (i+1)+"."));
      li.appendChild(el("span","nm", p.name));
      if (p.id === st.hostId) li.appendChild(el("span","tag","hôte"));
      li.appendChild(el("span","sc", String(p.score)));
      if (opts.kick && st.isHost && p.id !== S.playerId){
        var k = el("button","kick","✕"); k.title = "Exclure";
        k.onclick = function(){ post("kick",{targetPlayerId:p.id}).then(function(s){ S.state = s; render(); }).catch(function(e){ toast(e.message,"ko"); }); };
        li.appendChild(k);
      }
      ul.appendChild(li);
    });
  }

  function render(){
    var st = S.state; if(!st) return;
    if (st.status === "lobby"){
      show("vLobby");
      $("lobbyCode").textContent = st.code;
      playersList($("lobbyPlayers"), st, {kick:true});
      $("hostBox").classList.toggle("hidden", !st.isHost);
      $("waitHost").classList.toggle("hidden", st.isHost);
      return;
    }
    if (st.status === "finished"){
      show("vEnd");
      var top = st.players[0];
      $("podium").textContent = top ? "🏆 " + top.name + " gagne !" : "🏆";
      playersList($("endPlayers"), st, {rank:true});
      $("hostEndBox").classList.toggle("hidden", !st.isHost);
      $("waitHost2").classList.toggle("hidden", st.isHost);
      return;
    }
    renderGame(st);
  }

  function renderGame(st){
    show("vGame");
    var r = st.round; if(!r) return;
    $("roundBadge").textContent = "MANCHE " + r.number + "/" + st.totalRounds;
    var img = $("pkImg");
    if (S.lastToken !== r.imgToken){
      S.lastToken = r.imgToken;
      img.className = "sil";
      img.src = API + "?action=img&code=" + encodeURIComponent(S.code) + "&playerId=" + encodeURIComponent(S.playerId) + "&t=" + r.imgToken;
      $("guessIn").value = ""; $("sugg").textContent = "";
    }
    if (r.revealed){
      if (img.className !== "reveal") img.className = "reveal";
      var a = $("answerBox"); a.classList.remove("hidden"); a.textContent = "";
      a.appendChild(document.createTextNode(r.answer));
      a.appendChild(el("small","", r.winnerName ? "✅ " + r.winnerName + " (+" + r.points + ")" : "⏱️ Personne n'a trouvé"));
      $("guessBox").classList.add("hidden");
      $("hint").textContent = "";
    } else {
      if (img.className !== "sil") img.className = "sil";
      $("answerBox").classList.add("hidden");
      $("guessBox").classList.remove("hidden");
      var h = [];
      if (r.letters != null) h.push(r.letters + " lettres");
      if (r.firstLetter) h.push("commence par « " + r.firstLetter + " »");
      $("hint").textContent = h.join(" · ");
    }
    playersList($("gamePlayers"), st, {});
    $("hostGameBox").classList.toggle("hidden", !st.isHost || r.revealed);
  }

  // Barre de temps fluide (hors sondage)
  (function frame(){
    var st = S.state;
    if (st && st.status === "playing" && st.round){
      var elapsed = Date.now() + S.offset - st.round.startedAt;
      var left = Math.max(0, 1 - elapsed / st.roundMs);
      $("bar").style.transform = "scaleX(" + left + ")";
    } else if (st && st.status === "reveal"){
      $("bar").style.transform = "scaleX(0)";
    }
    requestAnimationFrame(frame);
  })();

  // ---------- Salon : actions ----------
  $("btnCopy").onclick = function(){
    if (navigator.clipboard) navigator.clipboard.writeText(S.code).then(function(){ toast("Code copié","ok"); });
  };
  $("btnShare").onclick = function(){
    var url = location.origin + location.pathname + "?whois=" + S.code;
    if (navigator.share) navigator.share({ title:"Qui est ce Pokémon ?", text:"Rejoins ma partie ! Code : " + S.code, url:url }).catch(function(){});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function(){ toast("Lien copié","ok"); });
  };
  $("btnStart").onclick = function(){
    $("btnStart").disabled = true;
    post("start",{rounds:Number($("rounds").value)})
      .then(function(s){ S.state = s; S.lastToken = null; render(); })
      .catch(function(e){ $("lobbyErr").textContent = e.message; })
      .then(function(){ $("btnStart").disabled = false; });
  };
  function leave(){ post("leave").catch(function(){}).then(leaveLocal); }
  $("btnLeave1").onclick = leave; $("btnLeave2").onclick = leave;
  $("btnSkip").onclick = function(){ post("skip").then(function(s){ S.state = s; render(); }).catch(function(e){ toast(e.message,"ko"); }); };
  $("btnAgain").onclick = function(){
    post("start",{rounds:S.state.totalRounds}).then(function(s){ S.state = s; S.lastToken = null; render(); })
      .catch(function(e){ toast(e.message,"ko"); });
  };
  $("btnToLobby").onclick = function(){ post("lobby").then(function(s){ S.state = s; render(); }).catch(function(e){ toast(e.message,"ko"); }); };

  // ---------- Proposer un nom ----------
  function submitGuess(value){
    value = (value || "").trim(); if (!value) return;
    post("guess",{guess:value}).then(function(r){
      if (r.correct){ toast("Bravo ! +" + r.points + " pts", "ok"); if (navigator.vibrate) navigator.vibrate([40,30,80]); refresh(); }
      else if (r.tooFast){ /* ignoré */ }
      else if (r.closed){ refresh(); }
      else {
        var i = $("guessIn"); i.classList.remove("shake"); void i.offsetWidth; i.classList.add("shake");
        if (navigator.vibrate) navigator.vibrate(120);
        i.select();
      }
    }).catch(function(e){ toast(e.message,"ko"); });
  }
  $("guessForm").addEventListener("submit", function(ev){ ev.preventDefault(); submitGuess($("guessIn").value); $("sugg").textContent = ""; });
  $("guessIn").addEventListener("input", function(){
    var q = fold(this.value), box = $("sugg"); box.textContent = "";
    if (q.length < 2 || !S.names.length) return;
    var out = [];
    for (var i = 0; i < S.folded.length && out.length < 5; i++){
      if (S.folded[i].indexOf(q) === 0) out.push(S.names[i]);
    }
    out.forEach(function(n){
      var b = el("button","",n); b.type = "button";
      b.onclick = function(){ $("guessIn").value = n; submitGuess(n); box.textContent = ""; };
      box.appendChild(b);
    });
  });

  // ---------- Démarrage ----------
  var savedCode = load("whois_code"), savedPid = load("whois_pid");
  if (savedCode && savedPid && !inviteCode){
    S.code = savedCode; S.playerId = savedPid; startPolling(); show("vHome");
    // si la partie n'existe plus, refresh() renvoie vers l'accueil ; en attendant on affiche l'accueil
  } else {
    show("vHome");
  }
})(window.__whoisRoot);

      })();
    }
  };
})();
