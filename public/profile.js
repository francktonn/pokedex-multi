/* profile.js — onglet « Profil » : pseudo, Pokémon préféré (sa photo = son sprite), carte personnalisable
   (style du sprite, couleur du cadre, type préféré, devise) et statistiques personnelles.
   Shadow DOM : HTML/CSS/ids isolés du reste du site. Le profil et les stats sont mémorisés sur cet appareil
   (window.PokeProfile / window.PokeStats, définis dans index.html) et partagés par les modes de jeu. */
(function () {
  "use strict";
  var CSS = [
    ":host{display:block; font-family:'Nunito',sans-serif; color:#fff;",
    "  --ink:#221d17; --paper:#FCF9F1; --card:#fff; --line:rgba(34,29,23,.12); --muted:#7b6f60; --ok:#2fa84f; --ko:#c8372d;",
    "  --gold:#FFC93C; --gold-deep:#D99A12; --frame:#FFC93C; --accent:#D99A12; --ease:cubic-bezier(.2,.8,.2,1);}",
    ":host(.dark){--ink:#f3ebdd; --paper:#241e1a; --card:#322a24; --line:rgba(255,255,255,.16); --muted:#b5a891; --ok:#5ee06a; --ko:#ff7a6e; color-scheme:dark;}",
    "*{box-sizing:border-box; -webkit-tap-highlight-color:transparent;}",
    ".device{background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,0) 22%),linear-gradient(160deg,#E23B30,#cf2f25 55%,#A3231A);",
    "  border:1px solid rgba(0,0,0,.35); border-radius:30px; padding:16px 16px 20px;",
    "  box-shadow:0 30px 60px -15px rgba(0,0,0,.65), inset 0 2px 0 rgba(255,255,255,.35), inset 0 -6px 0 rgba(0,0,0,.18);}",
    ":host(.dark) .device{background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,0) 22%),linear-gradient(160deg,#a82a21,#8a1f18 55%,#4a0f09);}",
    ".top{display:flex; align-items:center; gap:10px; margin-bottom:12px;}",
    ".lens{width:22px;height:22px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 35% 30%,#bfe9ff,#3b8fd6 55%,#1b5a9c);box-shadow:0 0 0 3px rgba(255,255,255,.55),0 0 14px rgba(120,200,255,.8);}",
    ".brand{font-family:'Silkscreen',monospace; font-size:12px; letter-spacing:.12em; flex:1;}",
    ".themebtn{border:0; width:34px; height:34px; border-radius:50%; cursor:pointer; font-size:15px; background:rgba(0,0,0,.25); color:#fff;}",
    ".panel{background:var(--paper); color:var(--ink); border-radius:20px; padding:16px; margin-bottom:12px; box-shadow:0 8px 20px -8px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.6);}",
    ".panel:last-child{margin-bottom:0;}",
    ":host(.dark) .panel{box-shadow:0 8px 20px -8px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.05);}",
    "h2{font-family:'Baloo 2',sans-serif; margin:0 0 4px; font-size:20px;}",
    "h3{font-family:'Baloo 2',sans-serif; margin:16px 0 6px; font-size:16px;}",
    "p.sub{margin:0 0 12px; color:var(--muted); font-size:14px; line-height:1.4;}",
    /* carte */
    ".card{border-radius:20px; padding:14px; margin:8px 0 6px; color:#fff; position:relative; overflow:hidden;",
    "  background:linear-gradient(150deg, color-mix(in srgb, var(--accent) 55%, #1a1411), #1a1411 85%); border:3px solid var(--frame);}",
    ".avatarbox{display:flex; align-items:center; gap:14px;}",
    ".avatar{width:96px; height:96px; flex-shrink:0; border-radius:50%; display:flex; align-items:center; justify-content:center; overflow:hidden;",
    "  background:radial-gradient(circle at 50% 40%, rgba(143,240,164,.28), transparent 70%), #0e1a12; border:5px solid #070d08; box-shadow:0 0 0 3px var(--frame), 0 8px 18px -6px rgba(0,0,0,.6);}",
    ".avatar img{width:88%; height:88%; image-rendering:pixelated; object-fit:contain;}",
    ".avatar img.art{image-rendering:auto;}",
    ".avatar span{font-family:'Silkscreen',monospace; font-size:30px; color:#8ff0a4;}",
    ".who{min-width:0; flex:1;}",
    ".who .nm{font-family:'Baloo 2',sans-serif; font-weight:800; font-size:22px; line-height:1.1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}",
    ".who .fv{opacity:.8; font-weight:700; font-size:13px; margin-top:2px;}",
    ".tchip{display:inline-block; margin-top:6px; padding:2px 10px; border-radius:999px; font-size:12px; font-weight:800; color:#fff; background:var(--accent); text-shadow:0 1px 2px rgba(0,0,0,.4);}",
    ".motto{margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,.18); font-style:italic; font-weight:700; font-size:14px; opacity:.92; min-height:20px;}",
    "label{display:block; font-weight:800; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin:14px 0 4px;}",
    "input{width:100%; font:inherit; font-size:16px; font-weight:700; color:var(--ink); padding:13px 16px; border-radius:14px; border:2px solid var(--line); background:var(--card); outline:none;}",
    "input:focus{border-color:var(--gold-deep);}",
    ".sugg{display:flex; flex-direction:column; gap:6px; margin-top:8px;}",
    ".sugg button{display:flex; align-items:center; gap:10px; width:100%; text-align:left; border:2px solid var(--line); border-radius:14px; padding:6px 12px; min-height:48px;",
    "  font:inherit; font-weight:800; font-size:14px; color:var(--ink); background:var(--card); cursor:pointer;}",
    ".sugg button.on{border-color:var(--gold-deep); background:rgba(255,201,60,.18);}",
    ".sugg img{width:40px; height:40px; image-rendering:pixelated;}",
    ".sugg small{margin-left:auto; color:var(--muted); font-weight:700; font-size:12px;}",
    /* options de personnalisation */
    ".seg{display:grid; grid-template-columns:repeat(3,1fr); gap:6px;}",
    ".seg button, .types button{min-height:44px; border-radius:12px; cursor:pointer; font:inherit; font-weight:800; font-size:13px; color:var(--ink); background:var(--card); border:2px solid var(--line); padding:4px 6px;}",
    ".seg button.on, .types button.on{border-color:var(--gold-deep); background:rgba(255,201,60,.22);}",
    ".swatches{display:flex; flex-wrap:wrap; gap:10px;}",
    ".swatches button{width:40px; height:40px; border-radius:50%; cursor:pointer; border:3px solid transparent; box-shadow:inset 0 0 0 2px rgba(0,0,0,.25);}",
    ".swatches button.on{border-color:var(--ink); box-shadow:inset 0 0 0 2px #fff;}",
    ".types{display:grid; grid-template-columns:repeat(3,1fr); gap:6px;}",
    ".types button{min-height:38px; font-size:12.5px; border-left-width:6px;}",
    ".btn{width:100%; min-height:50px; border:0; border-radius:16px; cursor:pointer; margin-top:16px; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:17px; color:#221d17;",
    "  background:linear-gradient(180deg,#ffd96b,var(--gold) 55%,#f0b21f); box-shadow:0 5px 0 var(--gold-deep), 0 12px 20px -8px rgba(0,0,0,.4); transition:transform .15s var(--ease), box-shadow .15s var(--ease);}",
    ".btn:active{transform:translateY(3px); box-shadow:0 2px 0 var(--gold-deep);}",
    ".btn.alt{background:var(--card); color:var(--ink); box-shadow:0 4px 0 rgba(0,0,0,.15); border:1px solid var(--line); min-height:42px; font-size:14px; margin-top:12px;}",
    ".msg{min-height:20px; margin-top:10px; font-weight:800; font-size:13px; text-align:center;}",
    ".msg.ok{color:var(--ok);} .msg.ko{color:var(--ko);}",
    /* stats */
    ".tiles{display:grid; grid-template-columns:repeat(3,1fr); gap:8px;}",
    ".tile{background:var(--card); border:1px solid var(--line); border-radius:14px; padding:10px 6px; text-align:center;}",
    ".tile b{display:block; font-family:'Baloo 2',sans-serif; font-size:22px; line-height:1.1;}",
    ".tile small{display:block; margin-top:2px; color:var(--muted); font-weight:700; font-size:11px; line-height:1.2;}",
    ".hidden{display:none !important;}",
    "@media (prefers-reduced-motion:reduce){*{transition-duration:.001ms !important;}}"
  ].join("\n");

  var HTML = [
    '<div class="device">',
    '  <div class="top"><span class="lens"></span><span class="brand">MON PROFIL</span><button type="button" class="themebtn" id="themeBtn" aria-label="Mode sombre">🌙</button></div>',
    '  <section class="panel" id="cardPanel">',
    '    <h2>Ma carte</h2>',
    '    <p class="sub">Ton pseudo, ta photo et ton style seront utilisés automatiquement dans tous les modes de jeu.</p>',
    '    <div class="card" id="card">',
    '      <div class="avatarbox"><div class="avatar" id="avatar"><span>?</span></div><div class="who"><div class="nm" id="avName">Sans pseudo</div><div class="fv" id="avFav">Pokémon préféré : à choisir</div><span class="tchip hidden" id="avType"></span></div></div>',
    '      <div class="motto" id="avMotto"></div>',
    '    </div>',
    '    <label for="pName">Ton pseudo</label>',
    '    <input type="text" id="pName" maxlength="16" autocomplete="off" placeholder="Sacha">',
    '    <label for="pFav">Ton Pokémon préféré</label>',
    '    <input type="text" id="pFav" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Cherche un nom ou un numéro…">',
    '    <div class="sugg" id="sugg"></div>',
    '    <h3>🎨 Personnaliser ma carte</h3>',
    '    <label>Style du sprite</label><div class="seg" id="styles"></div>',
    '    <label>Couleur du cadre</label><div class="swatches" id="swatches"></div>',
    '    <label>Type préféré</label><div class="types" id="types"></div>',
    '    <label for="pMotto">Ma devise</label>',
    '    <input type="text" id="pMotto" maxlength="40" autocomplete="off" placeholder="Attrapez-les tous !">',
    '    <button type="button" class="btn" id="save">Enregistrer mon profil</button>',
    '    <div class="msg" id="msg"></div>',
    '    <button type="button" class="btn alt hidden" id="clear">Effacer mon profil</button>',
    '  </section>',
    '  <section class="panel" id="statsPanel">',
    '    <h2>📊 Mes statistiques</h2>',
    '    <p class="sub" id="statsSub">Elles se remplissent au fil de tes parties, sur cet appareil.</p>',
    '    <div id="statsBody"></div>',
    '    <button type="button" class="btn alt" id="resetStats">Réinitialiser mes statistiques</button>',
    '  </section>',
    '</div>'
  ].join("\n");

  var TYPES = [["normal","Normal","#A8A77A"],["fire","Feu","#EE8130"],["water","Eau","#6390F0"],["grass","Plante","#7AC74C"],["electric","Électrik","#E5B90F"],
    ["ice","Glace","#6FC7C3"],["fighting","Combat","#C22E28"],["poison","Poison","#A33EA1"],["ground","Sol","#C9A23F"],["flying","Vol","#8D74E8"],
    ["psychic","Psy","#F95587"],["bug","Insecte","#8FA015"],["rock","Roche","#A28F2C"],["ghost","Spectre","#735797"],["dragon","Dragon","#6F35FC"],
    ["dark","Ténèbres","#705746"],["steel","Acier","#8E8EAA"],["fairy","Fée","#D685AD"]];
  var STYLES = ["Normal", "✨ Shiny", "🖼️ Artwork"];
  var FRAME_NAMES = ["Or", "Rouge", "Bleu", "Vert", "Rose", "Violet", "Orange", "Argent"];

  var mounted = false;
  window.ProfileTab = {
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
    var $ = function (id) { return root.getElementById(id); };
    var P = window.PokeProfile;
    var names = [], folded = [];
    var draft = { favId: null, favName: "", style: 0, color: 0, type: "" };

    function fold(s) { return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/[\s\-.]+/g, " ").trim(); }
    function nameOf(id) { return names[id - 1] || ("Pokémon n°" + id); }
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function say(text, kind) { var m = $("msg"); m.textContent = text || ""; m.className = "msg" + (kind ? " " + kind : ""); }
    function typeInfo(key) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i][0] === key) return TYPES[i]; return null; }

    // ---- Thème : suit celui du site ----
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
      else { var d = docEl.getAttribute("data-theme") === "dark"; if (d) docEl.removeAttribute("data-theme"); else docEl.setAttribute("data-theme", "dark"); try { localStorage.setItem("pokedexTheme", d ? "light" : "dark"); } catch (e) {} }
    });
    syncTheme();

    // ---- Aperçu de la carte ----
    function renderPreview() {
      var av = $("avatar"); av.textContent = "";
      if (draft.favId) {
        var img = document.createElement("img"); img.alt = ""; img.src = P.sprite(draft.favId, draft.style);
        if (draft.style === 2) img.className = "art"; av.appendChild(img);
      } else av.appendChild(el("span", "", "?"));
      host.style.setProperty("--frame", P.frame(draft.color));
      var ti = typeInfo(draft.type);
      host.style.setProperty("--accent", ti ? ti[2] : "#D99A12");
      var chip = $("avType"); chip.classList.toggle("hidden", !ti); if (ti) chip.textContent = "Type " + ti[1];
      var nm = $("pName").value.trim();
      $("avName").textContent = nm || "Sans pseudo";
      $("avFav").textContent = draft.favId ? "Préféré : " + nameOf(draft.favId) + " · n°" + draft.favId : "Pokémon préféré : à choisir";
      $("avMotto").textContent = $("pMotto").value.trim() ? "« " + $("pMotto").value.trim() + " »" : "";
    }

    // ---- Options de personnalisation ----
    function renderOptions() {
      var st = $("styles"); st.textContent = "";
      STYLES.forEach(function (label, i) {
        var b = el("button", i === draft.style ? "on" : "", label); b.type = "button";
        b.onclick = function () { draft.style = i; say(""); renderOptions(); renderPreview(); };
        st.appendChild(b);
      });
      var sw = $("swatches"); sw.textContent = "";
      P.frames.forEach(function (c, i) {
        var b = el("button", i === draft.color ? "on" : ""); b.type = "button"; b.style.background = c; b.title = FRAME_NAMES[i]; b.setAttribute("aria-label", "Cadre " + FRAME_NAMES[i]);
        b.onclick = function () { draft.color = i; say(""); renderOptions(); renderPreview(); };
        sw.appendChild(b);
      });
      var ty = $("types"); ty.textContent = "";
      var none = el("button", draft.type === "" ? "on" : "", "Aucun"); none.type = "button";
      none.onclick = function () { draft.type = ""; say(""); renderOptions(); renderPreview(); };
      ty.appendChild(none);
      TYPES.forEach(function (t) {
        var b = el("button", t[0] === draft.type ? "on" : "", t[1]); b.type = "button"; b.style.borderLeftColor = t[2];
        b.onclick = function () { draft.type = t[0]; say(""); renderOptions(); renderPreview(); };
        ty.appendChild(b);
      });
    }

    // ---- Recherche du Pokémon préféré ----
    function renderSugg() {
      var q = fold($("pFav").value), box = $("sugg"); box.textContent = "";
      if (!q) return;
      var out = [];
      if (/^\d{1,4}$/.test(q)) { var n = Number(q); if (n >= 1 && n <= 1025) out.push(n); }
      if (names.length) {
        for (var i = 0; i < folded.length && out.length < 6; i++) if (folded[i] && folded[i].indexOf(q) === 0 && out.indexOf(i + 1) < 0) out.push(i + 1);
        for (var j = 0; j < folded.length && out.length < 6; j++) if (folded[j] && folded[j].indexOf(q) > 0 && out.indexOf(j + 1) < 0) out.push(j + 1);
      }
      out.forEach(function (id) {
        var b = el("button", id === draft.favId ? "on" : ""); b.type = "button";
        var img = document.createElement("img"); img.alt = ""; img.loading = "lazy"; img.src = P.sprite(id);
        b.appendChild(img); b.appendChild(document.createTextNode(nameOf(id))); b.appendChild(el("small", "", "n°" + id));
        b.onclick = function () { draft.favId = id; draft.favName = nameOf(id); $("pFav").value = nameOf(id); box.textContent = ""; say(""); renderPreview(); };
        box.appendChild(b);
      });
      if (!out.length) box.appendChild(el("small", "", names.length ? "Aucun Pokémon trouvé." : "Liste des noms indisponible : tape le numéro du Pokédex."));
    }
    $("pFav").addEventListener("input", renderSugg);
    $("pName").addEventListener("input", function () { say(""); renderPreview(); });
    $("pMotto").addEventListener("input", function () { say(""); renderPreview(); });

    // ---- Enregistrer / effacer ----
    $("save").addEventListener("click", function () {
      var name = $("pName").value.trim().slice(0, 16);
      if (!name) { say("Choisis un pseudo.", "ko"); $("pName").focus(); return; }
      if (!draft.favId) { say("Choisis ton Pokémon préféré : son sprite sera ta photo.", "ko"); $("pFav").focus(); return; }
      P.set({ name: name, favId: draft.favId, favName: nameOf(draft.favId), style: draft.style, color: draft.color, type: draft.type, motto: $("pMotto").value });
      say("Profil enregistré ✓ Ta carte sera utilisée dans tous les modes de jeu.", "ok");
      $("clear").classList.remove("hidden");
      renderPreview();
    });
    $("clear").addEventListener("click", function () {
      if (!window.confirm("Effacer ton profil ?")) return;
      P.clear(); draft = { favId: null, favName: "", style: 0, color: 0, type: "" };
      $("pName").value = ""; $("pFav").value = ""; $("pMotto").value = ""; $("sugg").textContent = ""; $("clear").classList.add("hidden");
      say("Profil effacé.", ""); renderOptions(); renderPreview();
    });

    // ---- Statistiques ----
    function tile(value, label) { var t = el("div", "tile"); t.appendChild(el("b", "", String(value))); t.appendChild(el("small", "", label)); return t; }
    function pct(a, b) { return b ? Math.round(100 * a / b) + " %" : "–"; }
    function secs(ms) { return ms ? (Math.round(ms / 100) / 10).toString().replace(".", ",") + " s" : "–"; }
    function section(title, tiles) {
      var box = el("div"); box.appendChild(el("h3", "", title));
      var g = el("div", "tiles"); tiles.forEach(function (t) { g.appendChild(t); }); box.appendChild(g); return box;
    }
    function renderStats() {
      var S = window.PokeStats ? window.PokeStats.get() : null, body = $("statsBody"); body.textContent = "";
      if (!S) { body.appendChild(el("p", "sub", "Statistiques indisponibles.")); return; }
      var w = S.wordle, q = S.whois, g = S.guess;
      var total = w.played + q.played + g.found + g.missed;
      $("statsSub").textContent = total ? "Sur cet appareil, tous modes confondus." : "Elles se remplissent au fil de tes parties, sur cet appareil.";
      body.appendChild(section("🟩 Pokédex Wordle", [
        tile(w.played, "Manches jouées"), tile(w.won, "Victoires"), tile(pct(w.won, w.played), "Taux de victoire"),
        tile(w.won ? (Math.round(10 * w.triesSum / w.won) / 10).toString().replace(".", ",") : "–", "Essais en moyenne"), tile(w.best || "–", "Meilleur (essais)"), tile(w.streak + " / " + w.bestStreak, "Série / record")
      ]));
      body.appendChild(section("❔ Qui est-ce ?", [
        tile(q.played, "Manches jouées"), tile(q.correct, "Bonnes réponses"), tile(pct(q.correct, q.played), "Réussite"),
        tile(secs(q.bestMs), "Meilleur temps"), tile(secs(q.correct ? q.msSum / q.correct : 0), "Temps moyen")
      ]));
      body.appendChild(section("🔴 Devinette", [
        tile(g.found, "Pokémon devinés"), tile(g.missed, "Essais ratés"), tile(pct(g.found, g.found + g.missed), "Précision")
      ]));
    }
    $("resetStats").addEventListener("click", function () {
      if (window.confirm("Réinitialiser toutes tes statistiques ? Cette action est définitive.") && window.PokeStats) window.PokeStats.reset();
    });
    window.addEventListener("statschange", renderStats);
    renderStats();

    // ---- Chargement : profil existant + liste des noms ----
    var cur = P.get();
    if (cur) {
      $("pName").value = cur.name; draft.favId = cur.favId || null; draft.favName = cur.favName || "";
      draft.style = cur.style; draft.color = cur.color; draft.type = cur.type; $("pMotto").value = cur.motto;
      if (cur.favName) $("pFav").value = cur.favName;
      $("clear").classList.remove("hidden");
    }
    renderOptions(); renderPreview();
    fetch("/api/whois?action=names").then(function (r) { return r.json(); }).then(function (j) {
      var list = j.byId || j.names || [];
      names = list; folded = list.map(fold);
      renderPreview(); if ($("pFav").value) renderSugg();
    }).catch(function () {});
  }
})();
