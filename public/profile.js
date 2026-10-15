/* profile.js — onglet « Profil » : pseudo + Pokémon préféré (sa photo de profil = son sprite).
   Shadow DOM : HTML/CSS/ids isolés du reste du site. Le profil est mémorisé sur cet appareil
   (window.PokeProfile, défini dans index.html) et réutilisé dans les deux modes de jeu. */
(function () {
  "use strict";
  var CSS = [
    ":host{display:block; font-family:'Nunito',sans-serif; color:#fff;",
    "  --ink:#221d17; --paper:#FCF9F1; --card:#fff; --line:rgba(34,29,23,.12); --muted:#7b6f60; --ok:#2fa84f; --ko:#c8372d;",
    "  --gold:#FFC93C; --gold-deep:#D99A12; --ease:cubic-bezier(.2,.8,.2,1);}",
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
    ".panel{background:var(--paper); color:var(--ink); border-radius:20px; padding:16px; box-shadow:0 8px 20px -8px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.6);}",
    ":host(.dark) .panel{box-shadow:0 8px 20px -8px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.05);}",
    "h2{font-family:'Baloo 2',sans-serif; margin:0 0 4px; font-size:20px;}",
    "p.sub{margin:0 0 12px; color:var(--muted); font-size:14px; line-height:1.4;}",
    ".avatarbox{display:flex; align-items:center; gap:14px; margin:8px 0 6px;}",
    ".avatar{width:96px; height:96px; flex-shrink:0; border-radius:50%; display:flex; align-items:center; justify-content:center; overflow:hidden;",
    "  background:radial-gradient(circle at 50% 40%, rgba(143,240,164,.28), transparent 70%), #0e1a12; border:5px solid #070d08; box-shadow:0 0 0 3px var(--gold), 0 8px 18px -6px rgba(0,0,0,.6);}",
    ".avatar img{width:88%; height:88%; image-rendering:pixelated; object-fit:contain;}",
    ".avatar span{font-family:'Silkscreen',monospace; font-size:30px; color:#8ff0a4;}",
    ".who{min-width:0;}",
    ".who .nm{font-family:'Baloo 2',sans-serif; font-weight:800; font-size:22px; line-height:1.1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}",
    ".who .fv{color:var(--muted); font-weight:700; font-size:13px; margin-top:2px;}",
    "label{display:block; font-weight:800; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin:14px 0 4px;}",
    "input{width:100%; font:inherit; font-size:16px; font-weight:700; color:var(--ink); padding:13px 16px; border-radius:14px; border:2px solid var(--line); background:var(--card); outline:none;}",
    "input:focus{border-color:var(--gold-deep);}",
    ".sugg{display:flex; flex-direction:column; gap:6px; margin-top:8px;}",
    ".sugg button{display:flex; align-items:center; gap:10px; width:100%; text-align:left; border:2px solid var(--line); border-radius:14px; padding:6px 12px; min-height:48px;",
    "  font:inherit; font-weight:800; font-size:14px; color:var(--ink); background:var(--card); cursor:pointer;}",
    ".sugg button.on{border-color:var(--gold-deep); background:rgba(255,201,60,.18);}",
    ".sugg img{width:40px; height:40px; image-rendering:pixelated;}",
    ".sugg small{margin-left:auto; color:var(--muted); font-weight:700; font-size:12px;}",
    ".btn{width:100%; min-height:50px; border:0; border-radius:16px; cursor:pointer; margin-top:16px; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:17px; color:#221d17;",
    "  background:linear-gradient(180deg,#ffd96b,var(--gold) 55%,#f0b21f); box-shadow:0 5px 0 var(--gold-deep), 0 12px 20px -8px rgba(0,0,0,.4); transition:transform .15s var(--ease), box-shadow .15s var(--ease);}",
    ".btn:active{transform:translateY(3px); box-shadow:0 2px 0 var(--gold-deep);}",
    ".btn.alt{background:var(--card); color:var(--ink); box-shadow:0 4px 0 rgba(0,0,0,.15); border:1px solid var(--line); min-height:42px; font-size:14px; margin-top:12px;}",
    ".msg{min-height:20px; margin-top:10px; font-weight:800; font-size:13px; text-align:center;}",
    ".msg.ok{color:var(--ok);} .msg.ko{color:var(--ko);}",
    ".hidden{display:none !important;}",
    "@media (prefers-reduced-motion:reduce){*{transition-duration:.001ms !important;}}"
  ].join("\n");

  var HTML = [
    '<div class="device">',
    '  <div class="top"><span class="lens"></span><span class="brand">MON PROFIL</span><button type="button" class="themebtn" id="themeBtn" aria-label="Mode sombre">🌙</button></div>',
    '  <section class="panel">',
    '    <h2>Mon profil</h2>',
    '    <p class="sub">Ton pseudo et ta photo seront utilisés automatiquement dans tous les modes de jeu.</p>',
    '    <div class="avatarbox"><div class="avatar" id="avatar"><span>?</span></div><div class="who"><div class="nm" id="avName">Sans pseudo</div><div class="fv" id="avFav">Pokémon préféré : à choisir</div></div></div>',
    '    <label for="pName">Ton pseudo</label>',
    '    <input type="text" id="pName" maxlength="16" autocomplete="off" placeholder="Sacha">',
    '    <label for="pFav">Ton Pokémon préféré</label>',
    '    <input type="text" id="pFav" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Cherche un nom ou un numéro…">',
    '    <div class="sugg" id="sugg"></div>',
    '    <button type="button" class="btn" id="save">Enregistrer mon profil</button>',
    '    <div class="msg" id="msg"></div>',
    '    <button type="button" class="btn alt hidden" id="clear">Effacer mon profil</button>',
    '  </section>',
    '</div>'
  ].join("\n");

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
    var names = [];            // names[i] = nom français du Pokémon n° i+1 ('' si inconnu)
    var folded = [];
    var draft = { favId: null, favName: "" };

    function fold(s) { return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/[\s\-.]+/g, " ").trim(); }
    function nameOf(id) { return names[id - 1] || ("Pokémon n°" + id); }
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function say(text, kind) { var m = $("msg"); m.textContent = text || ""; m.className = "msg" + (kind ? " " + kind : ""); }

    // ---- Thème : suit celui du site, le bouton agit sur tout le site ----
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

    // ---- Aperçu ----
    function renderPreview() {
      var av = $("avatar"); av.textContent = "";
      if (draft.favId) {
        var img = document.createElement("img"); img.alt = ""; img.src = P.sprite(draft.favId); av.appendChild(img);
      } else av.appendChild(el("span", "", "?"));
      var nm = $("pName").value.trim();
      $("avName").textContent = nm || "Sans pseudo";
      $("avFav").textContent = draft.favId ? "Préféré : " + nameOf(draft.favId) + " · n°" + draft.favId : "Pokémon préféré : à choisir";
    }

    // ---- Recherche du Pokémon préféré ----
    function renderSugg() {
      var q = fold($("pFav").value), box = $("sugg"); box.textContent = "";
      if (!q) return;
      var out = [];
      if (/^\d{1,4}$/.test(q)) {
        var n = Number(q); if (n >= 1 && n <= 1025) out.push(n);
      }
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

    // ---- Enregistrer / effacer ----
    $("save").addEventListener("click", function () {
      var name = $("pName").value.trim().slice(0, 16);
      if (!name) { say("Choisis un pseudo.", "ko"); $("pName").focus(); return; }
      if (!draft.favId) { say("Choisis ton Pokémon préféré : son sprite sera ta photo.", "ko"); $("pFav").focus(); return; }
      P.set({ name: name, favId: draft.favId, favName: nameOf(draft.favId) });
      say("Profil enregistré ✓ Il sera utilisé dans tous les modes de jeu.", "ok");
      $("clear").classList.remove("hidden");
      renderPreview();
    });
    $("clear").addEventListener("click", function () {
      if (!window.confirm("Effacer ton profil ?")) return;
      P.clear(); draft = { favId: null, favName: "" };
      $("pName").value = ""; $("pFav").value = ""; $("sugg").textContent = ""; $("clear").classList.add("hidden");
      say("Profil effacé.", ""); renderPreview();
    });

    // ---- Chargement : profil existant + liste des noms ----
    var cur = P.get();
    if (cur) {
      $("pName").value = cur.name; draft.favId = cur.favId || null; draft.favName = cur.favName || "";
      if (cur.favName) $("pFav").value = cur.favName;
      $("clear").classList.remove("hidden");
    }
    renderPreview();
    fetch("/api/whois?action=names").then(function (r) { return r.json(); }).then(function (j) {
      var list = j.byId || j.names || [];
      names = list; folded = list.map(fold);
      renderPreview(); if ($("pFav").value) renderSugg();
    }).catch(function () {});
  }
})();
