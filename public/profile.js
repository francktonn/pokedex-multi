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
    "  background:var(--bg, linear-gradient(150deg, color-mix(in srgb, var(--accent) 55%, #1a1411), #1a1411 85%)); border:3px solid var(--frame);}",
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
    ".head{display:flex; align-items:center; justify-content:space-between; gap:10px;}",
    ".gear{border:0; width:40px; height:40px; border-radius:50%; cursor:pointer; font-size:18px; background:var(--card); border:1px solid var(--line); transition:transform .25s var(--ease), background .2s;}",
    ".gear:hover{transform:rotate(45deg);} .gear.on{background:rgba(255,201,60,.3); border-color:var(--gold-deep); transform:rotate(90deg);}",
    ".ttl{font-weight:800; font-size:12px; letter-spacing:.03em; opacity:.9; margin-top:2px; color:var(--gold);}",
    ".team{display:flex; gap:4px; margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,.18);}",
    ".team span{flex:1; min-width:0; aspect-ratio:1; border-radius:12px; background:rgba(0,0,0,.28); display:flex; align-items:center; justify-content:center;}",
    ".team img{width:92%; height:92%; object-fit:contain; image-rendering:pixelated;}",
    /* options supplémentaires */
    ".bgs{display:grid; grid-template-columns:repeat(3,1fr); gap:6px;}",
    ".bgs button, .titles button{min-height:44px; border-radius:12px; cursor:pointer; font:inherit; font-weight:800; font-size:12.5px; color:var(--ink); background:var(--card); border:2px solid var(--line); padding:4px 6px;}",
    ".bgs button.on, .titles button.on{border-color:var(--gold-deep); background:rgba(255,201,60,.22);}",
    ".bgs button:disabled, .titles button:disabled{opacity:.5; cursor:not-allowed;}",
    ".titles{display:grid; grid-template-columns:repeat(2,1fr); gap:6px;}",
    ".teamEdit{display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin-bottom:8px;}",
    ".teamEdit button{aspect-ratio:1; border-radius:12px; border:2px dashed var(--line); background:var(--card); color:var(--muted); cursor:pointer; font:inherit; font-weight:800; padding:0; position:relative;}",
    ".teamEdit button.fill{border-style:solid;} .teamEdit img{width:100%; height:100%; object-fit:contain; image-rendering:pixelated;}",
    ".teamEdit button.fill::after{content:'×'; position:absolute; top:-6px; right:-6px; width:18px; height:18px; line-height:16px; border-radius:50%; background:var(--ko); color:#fff; font-size:13px;}",
    /* éléments verrouillés (aperçu possible) + nouvelles options */
    ".locked{opacity:.62; border-style:dashed !important;}",
    ".bgs button small, .titles button small{display:block; font-weight:700; font-size:10.5px; color:var(--muted); margin-top:1px;}",
    ".badges{display:grid; grid-template-columns:repeat(6,1fr); gap:6px;}",
    ".badges button{min-height:44px; border-radius:12px; cursor:pointer; font:inherit; font-size:20px; color:var(--ink); background:var(--card); border:2px solid var(--line); padding:0; position:relative;}",
    ".badges button.on{border-color:var(--gold-deep); background:rgba(255,201,60,.22);}",
    ".badges button small{position:absolute; right:2px; bottom:0; font-size:9px; font-weight:800; color:var(--muted);}",
    ".swatches button{position:relative;}",
    ".swatches button.locked::after{content:'🔒'; position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:15px;}",
    ".pvnote{margin-top:10px; padding:9px 12px; border-radius:12px; font-weight:700; font-size:13px; line-height:1.35; color:var(--ink); background:rgba(255,201,60,.2); border:1px dashed var(--gold-deep);}",
    ".hint2{margin:6px 0 0; color:var(--muted); font-size:12.5px; font-weight:700; line-height:1.35;}",
    /* historique */
    ".hist{display:flex; flex-direction:column; gap:6px;}",
    ".hrow{display:flex; align-items:center; gap:10px; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:6px 10px; min-height:52px;}",
    ".hrow img{width:40px; height:40px; image-rendering:pixelated; flex-shrink:0;} .hrow .hi{width:40px; text-align:center; font-size:22px; flex-shrink:0;}",
    ".hrow .ht{min-width:0; flex:1;} .hrow .ht b{display:block; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}",
    ".hrow .ht small{color:var(--muted); font-weight:700; font-size:11.5px;}",
    ".hrow .hx{font-family:'Baloo 2',sans-serif; font-weight:800; font-size:14px; color:var(--ok); flex-shrink:0;} .hrow.lost .hx{color:var(--muted);}",
    ".hidden{display:none !important;}",
    "@media (prefers-reduced-motion:reduce){*{transition-duration:.001ms !important;}}"
  ].join("\n");

  var HTML = [
    '<div class="device">',
    '  <div class="top"><span class="lens"></span><span class="brand">MON PROFIL</span><button type="button" class="themebtn" id="themeBtn" aria-label="Mode sombre">🌙</button></div>',
    '  <section class="panel" id="cardPanel">',
    '    <div class="head"><h2>Ma carte</h2><button type="button" class="gear" id="gear" aria-label="Modifier ma carte" aria-expanded="false" title="Modifier ma carte">⚙️</button></div>',
    '    <div class="card" id="card">',
    '      <div class="avatarbox"><div class="avatar" id="avatar"><span>?</span></div><div class="who"><div class="nm" id="avName">Sans pseudo</div><div class="ttl hidden" id="avTitle"></div><div class="fv" id="avFav">Pokémon préféré : à choisir</div><span class="tchip hidden" id="avType"></span></div></div>',
    '      <div class="motto" id="avMotto"></div>',
    '      <div class="team hidden" id="avTeam"></div>',
    '    </div>',
    '    <div class="pvnote hidden" id="pvNote"></div>',
    '    <div id="editor" class="hidden">',
    '    <p class="sub" style="margin-top:12px">Ton pseudo, ta photo et ton style seront utilisés automatiquement dans tous les modes de jeu.</p>',
    '    <p class="hint2">👁️ Les éléments marqués 🔒 sont déjà prévisualisables sur ta carte : ils seront enregistrés dès que tu les auras obtenus dans une crate (onglet 🎁 Crates).</p>',
    '    <label for="pName">Ton pseudo</label>',
    '    <input type="text" id="pName" maxlength="16" autocomplete="off" placeholder="Sacha">',
    '    <label for="pFav">Ton Pokémon préféré</label>',
    '    <input type="text" id="pFav" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Cherche un nom ou un numéro…">',
    '    <div class="sugg" id="sugg"></div>',
    '    <h3>🎨 Personnaliser ma carte</h3>',
    '    <label>Style du sprite</label><div class="seg" id="styles"></div>',
    '    <label>Couleur du cadre</label><div class="swatches" id="swatches"></div>',
    '    <label>Type préféré</label><div class="types" id="types"></div>',
    '    <label>Fond de carte</label><div class="bgs" id="bgs"></div>',
    '    <label>Titre</label><div class="titles" id="titles"></div>',
    '    <label>Style du cadre</label><div class="bgs" id="frameStyles"></div>',
    '    <label>Forme de la photo</label><div class="bgs" id="shapes"></div>',
    '    <label>Effet animé</label><div class="bgs" id="effects"></div>',
    '    <label>Badge à côté du pseudo</label><div class="badges" id="badges"></div>',
    '    <label>Police du pseudo</label><div class="bgs" id="nameFonts"></div>',
    '    <label>Couleur du pseudo</label><div class="swatches" id="nameColors"></div>',
    '    <label for="pTeam">Mon équipe (6 Pokémon max)</label><div class="teamEdit" id="teamEdit"></div>',
    '    <input type="text" id="pTeam" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Ajoute un Pokémon à ton équipe…">',
    '    <div class="sugg" id="teamSugg"></div>',
    '    <label for="pMotto">Ma devise</label>',
    '    <input type="text" id="pMotto" maxlength="40" autocomplete="off" placeholder="Attrapez-les tous !">',
    '    <button type="button" class="btn" id="save">Enregistrer mon profil</button>',
    '    <div class="msg" id="msg"></div>',
    '    <button type="button" class="btn alt" id="cancel">Annuler</button>',
    '    <button type="button" class="btn alt hidden" id="clear">Effacer mon profil</button>',
    '    </div>',
    '  </section>',
    '  <section class="panel" id="statsPanel">',
    '    <h2>📊 Mes statistiques</h2>',
    '    <p class="sub" id="statsSub">Elles se remplissent au fil de tes parties, sur cet appareil.</p>',
    '    <div id="statsBody"></div>',
    '    <button type="button" class="btn alt" id="resetStats">Réinitialiser mes statistiques</button>',
    '  </section>',
    '  <section class="panel" id="histPanel">',
    '    <h2>🕘 Dernières parties</h2>',
    '    <p class="sub" id="histSub">Tes 20 dernières manches apparaissent ici.</p>',
    '    <div class="hist" id="histBody"></div>',
    '    <button type="button" class="btn alt" id="clearHist">Vider l\'historique</button>',
    '  </section>',
    '</div>'
  ].join("\n");

  var TYPES = [["normal","Normal","#A8A77A"],["fire","Feu","#EE8130"],["water","Eau","#6390F0"],["grass","Plante","#7AC74C"],["electric","Électrik","#E5B90F"],
    ["ice","Glace","#6FC7C3"],["fighting","Combat","#C22E28"],["poison","Poison","#A33EA1"],["ground","Sol","#C9A23F"],["flying","Vol","#8D74E8"],
    ["psychic","Psy","#F95587"],["bug","Insecte","#8FA015"],["rock","Roche","#A28F2C"],["ghost","Spectre","#735797"],["dragon","Dragon","#6F35FC"],
    ["dark","Ténèbres","#705746"],["steel","Acier","#8E8EAA"],["fairy","Fée","#D685AD"]];
  var STYLES = ["Normal", "✨ Shiny", "🖼️ Artwork"];
  var FRAME_NAMES = ["Or", "Rouge", "Bleu", "Vert", "Rose", "Violet", "Orange", "Argent", "Turquoise", "Citron vert", "Corail", "Ciel", "Lilas", "Bronze", "Ardoise", "Champagne"];
  // [clé du brouillon, liste dans PokeProfile, libellé, nom pour l'indice de déblocage]
  var LOCKS = [["bg", "bgs", "Fond", "fond"], ["title", "titles", "Titre", "titre"], ["frameStyle", "frameStyles", "Style de cadre", "style de cadre"], ["shape", "shapes", "Forme", "forme de photo"],
    ["effect", "effects", "Effet", "effet"], ["badge", "badges", "Badge", "badge"], ["nameFont", "nameFonts", "Police du pseudo", "police de pseudo"], ["nameColor", "nameColors", "Couleur du pseudo", "couleur de pseudo"]];
  function newDraft() { return { favId: null, favName: "", style: 0, color: 0, type: "", bg: 0, title: 0, team: [], frameStyle: 0, shape: 0, effect: 0, badge: 0, nameFont: 0, nameColor: 0 }; }

  var mounted = false;
  window.ProfileTab = {
    mount: function (host) {
      if (mounted) return; mounted = true;
      var root = host.attachShadow({ mode: "open" });
      var style = document.createElement("style"); style.textContent = CSS + "\n" + (window.PokeProfile && window.PokeProfile.cardCss || "");
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
    var draft = newDraft();
    // Objets de crate : les éléments avec min > 0 ne sont débloqués que si tu les as obtenus dans une crate.
    var C = window.PokeCrates, LISTOF = {};
    LOCKS.forEach(function (k) { LISTOF[k[0]] = k[1]; });
    function owned(list, i) { return !!(C && C.owns(list, i)); }
    function isLocked(list, i) { var it = P[list][i]; return !!it && it.min > 0 && !owned(list, i); }

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
      P.paint({ card: $("card"), avatar: $("avatar"), name: $("avName") },
        { f: draft.frameStyle, h: draft.shape, e: draft.effect, j: draft.badge, nf: draft.nameFont, nc: draft.nameColor }, nm || "Sans pseudo");
      $("avFav").textContent = draft.favId ? "Préféré : " + nameOf(draft.favId) + " · n°" + draft.favId : "Pokémon préféré : à choisir";
      var bgd = P.bgs[draft.bg] || P.bgs[0];
      host.style.setProperty("--bg", bgd.css);
      var tt = $("avTitle"); tt.classList.toggle("hidden", !draft.title); tt.textContent = draft.title ? P.titles[draft.title].name : "";
      var tm = $("avTeam"); tm.textContent = ""; tm.classList.toggle("hidden", !draft.team.length);
      draft.team.forEach(function (id) {
        var sp = el("span"), im = document.createElement("img"); im.alt = nameOf(id); im.loading = "lazy"; im.src = P.sprite(id, 0); sp.appendChild(im); tm.appendChild(sp);
      });
      renderLockNote();
      $("avMotto").textContent = $("pMotto").value.trim() ? "« " + $("pMotto").value.trim() + " »" : "";
    }

    // ---- Éléments verrouillés : aperçu autorisé, enregistrement refusé ----
    function lockedPicks() {
      var out = [];
      LOCKS.forEach(function (k) { var it = P[k[1]][draft[k[0]]]; if (it && isLocked(k[1], draft[k[0]])) out.push({ key: k[0], list: k[1], label: k[2], name: it.name, min: it.min }); });
      return out;
    }
    function renderLockNote() {
      var n = $("pvNote"), lk = lockedPicks();
      n.classList.toggle("hidden", !lk.length);
      if (lk.length) n.textContent = "👁️ Aperçu uniquement : " + lk.map(function (x) { return "« " + x.name + " »"; }).join(", ") + ". Ces éléments ne seront pas enregistrés tant que tu ne les auras pas débloqués.";
    }
    function optBtn(label, i, key, list) {
      var locked = isLocked(LISTOF[key], i);
      var b = el("button", (i === draft[key] ? "on" : "") + (locked ? " locked" : ""), label); b.type = "button";
      if (locked) { b.appendChild(el("small", "", "🔒 Crate")); b.title = "À obtenir dans une crate (aperçu possible)"; }
      b.onclick = function () { draft[key] = i; say(""); renderOptions(); renderPreview(); };
      return b;
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
      function fill(id, key, list, labelOf) { var box = $(id); box.textContent = ""; list.forEach(function (it, i) { box.appendChild(optBtn(labelOf(it), i, key, list)); }); }
      fill("bgs", "bg", P.bgs, function (it) { return it.name; });
      fill("titles", "title", P.titles, function (it) { return it.name; });
      fill("frameStyles", "frameStyle", P.frameStyles, function (it) { return it.name; });
      fill("shapes", "shape", P.shapes, function (it) { return it.name; });
      fill("effects", "effect", P.effects, function (it) { return it.name; });
      fill("nameFonts", "nameFont", P.nameFonts, function (it) { return it.name; });
      var bd = $("badges"); bd.textContent = "";
      P.badges.forEach(function (it, i) {
        var locked = isLocked("badges", i), b = el("button", (i === draft.badge ? "on" : "") + (locked ? " locked" : ""), it.e || "∅"); b.type = "button";
        b.title = it.name + (locked ? " — à obtenir dans une crate (aperçu)" : ""); b.setAttribute("aria-label", "Badge " + it.name);
        if (locked) b.appendChild(el("small", "", "🔒"));
        b.onclick = function () { draft.badge = i; say(""); renderOptions(); renderPreview(); };
        bd.appendChild(b);
      });
      var nc = $("nameColors"); nc.textContent = "";
      P.nameColors.forEach(function (c, i) {
        var locked = isLocked("nameColors", i), b = el("button", (i === draft.nameColor ? "on" : "") + (locked ? " locked" : "")); b.type = "button"; b.style.background = c.css;
        b.title = c.name + (locked ? " — à obtenir dans une crate (aperçu)" : ""); b.setAttribute("aria-label", "Couleur du pseudo " + c.name);
        b.onclick = function () { draft.nameColor = i; say(""); renderOptions(); renderPreview(); };
        nc.appendChild(b);
      });
      var te = $("teamEdit"); te.textContent = "";
      for (var k = 0; k < 6; k++) {
        (function (k) {
          var id = draft.team[k], btn = el("button", id ? "fill" : "", id ? "" : "+"); btn.type = "button";
          if (id) {
            var im = document.createElement("img"); im.alt = nameOf(id); im.src = P.sprite(id, 0); btn.appendChild(im); btn.title = "Retirer " + nameOf(id);
            btn.onclick = function () { draft.team.splice(k, 1); renderOptions(); renderPreview(); };
          } else btn.onclick = function () { $("pTeam").focus(); };
          te.appendChild(btn);
        })(k);
      }
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
    function renderSugg() { suggest("pFav", "sugg", function (id) { draft.favId = id; draft.favName = nameOf(id); $("pFav").value = nameOf(id); }, function (id) { return id === draft.favId; }); }
    function renderTeamSugg() {
      suggest("pTeam", "teamSugg", function (id) {
        if (draft.team.length >= 6) { say("Ton équipe est complète (6 max).", "ko"); return; }
        if (draft.team.indexOf(id) >= 0) return;
        draft.team.push(id); $("pTeam").value = ""; renderOptions();
      }, function (id) { return draft.team.indexOf(id) >= 0; });
    }
    function suggest(inputId, boxId, onPick, isOn) {
      var q = fold($(inputId).value), box = $(boxId); box.textContent = "";
      if (!q) return;
      var out = [];
      if (/^\d{1,4}$/.test(q)) { var n = Number(q); if (n >= 1 && n <= 1025) out.push(n); }
      if (names.length) {
        for (var i = 0; i < folded.length && out.length < 6; i++) if (folded[i] && folded[i].indexOf(q) === 0 && out.indexOf(i + 1) < 0) out.push(i + 1);
        for (var j = 0; j < folded.length && out.length < 6; j++) if (folded[j] && folded[j].indexOf(q) > 0 && out.indexOf(j + 1) < 0) out.push(j + 1);
      }
      out.forEach(function (id) {
        var b = el("button", isOn(id) ? "on" : ""); b.type = "button";
        var img = document.createElement("img"); img.alt = ""; img.loading = "lazy"; img.src = P.sprite(id);
        b.appendChild(img); b.appendChild(document.createTextNode(nameOf(id))); b.appendChild(el("small", "", "n°" + id));
        b.onclick = function () { onPick(id); box.textContent = ""; say(""); renderPreview(); };
        box.appendChild(b);
      });
      if (!out.length) box.appendChild(el("small", "", names.length ? "Aucun Pokémon trouvé." : "Liste des noms indisponible : tape le numéro du Pokédex."));
    }
    $("pFav").addEventListener("input", renderSugg);
    $("pTeam").addEventListener("input", renderTeamSugg);
    $("pName").addEventListener("input", function () { say(""); renderPreview(); });
    $("pMotto").addEventListener("input", function () { say(""); renderPreview(); });

    // ---- Enregistrer / effacer ----
    $("save").addEventListener("click", function () {
      var name = $("pName").value.trim().slice(0, 16);
      if (!name) { say("Choisis un pseudo.", "ko"); $("pName").focus(); return; }
      if (!draft.favId) { say("Choisis ton Pokémon préféré : son sprite sera ta photo.", "ko"); $("pFav").focus(); return; }
      // Éléments encore verrouillés : on garde la valeur déjà enregistrée (si elle est débloquée), sinon la valeur par défaut.
      var saved = P.get(), reverted = [];
      LOCKS.forEach(function (k) {
        var list = P[k[1]];
        if (isLocked(k[1], draft[k[0]])) {
          var old = saved ? saved[k[0]] : 0;
          draft[k[0]] = list[old] && !isLocked(k[1], old) ? old : 0;
          reverted.push(k[2]);
        }
      });
      P.set({ name: name, favId: draft.favId, favName: nameOf(draft.favId), style: draft.style, color: draft.color, type: draft.type, motto: $("pMotto").value, bg: draft.bg, title: draft.title, team: draft.team,
        frameStyle: draft.frameStyle, shape: draft.shape, effect: draft.effect, badge: draft.badge, nameFont: draft.nameFont, nameColor: draft.nameColor });
      if (reverted.length && window.toast) window.toast("Profil enregistré. Encore verrouillé, donc non appliqué : " + reverted.join(", ") + ".", { kind: "warn", icon: "🔒", ttl: 6000 });
      $("clear").classList.remove("hidden");
      renderPreview();
      setEditor(false);
      say("");
    });
    $("clear").addEventListener("click", function () {
      if (!window.confirm("Effacer ton profil ?")) return;
      P.clear(); draft = newDraft();
      $("pName").value = ""; $("pFav").value = ""; $("pTeam").value = ""; $("pMotto").value = ""; $("sugg").textContent = ""; $("teamSugg").textContent = ""; $("clear").classList.add("hidden");
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
      if (window.confirm("Réinitialiser toutes tes statistiques ? Ton historique est conservé.") && window.PokeStats) window.PokeStats.reset();
    });
    // ---- Historique des dernières parties ----
    var MODES = { wordle: ["🟩", "Wordle"], whois: ["❔", "Qui est-ce ?"], guess: ["🔴", "Devinette"] };
    function ago(t) {
      var s = Math.max(0, Math.round((Date.now() - t) / 1000));
      if (s < 60) return "à l'instant"; if (s < 3600) return "il y a " + Math.floor(s / 60) + " min";
      if (s < 86400) return "il y a " + Math.floor(s / 3600) + " h"; var d = Math.floor(s / 86400); return "il y a " + d + " j";
    }
    function renderHistory() {
      var h = window.PokeStats ? window.PokeStats.history() : [], body = $("histBody"); body.textContent = "";
      $("clearHist").classList.toggle("hidden", !h.length);
      $("histSub").textContent = h.length ? "Tes " + h.length + " dernières manches, tous modes confondus." : "Tes 20 dernières manches apparaissent ici.";
      h.forEach(function (e) {
        var m = MODES[e.m] || ["🎮", e.m], row = el("div", "hrow" + (e.w ? "" : " lost"));
        var id = e.id || (e.n && folded.length ? folded.indexOf(fold(e.n)) + 1 : 0);
        if (id > 0) { var im = document.createElement("img"); im.alt = ""; im.loading = "lazy"; im.src = P.sprite(id, 0); row.appendChild(im); }
        else row.appendChild(el("div", "hi", m[0]));
        var t = el("div", "ht"); t.appendChild(el("b", "", (e.w ? "✅ " : "❌ ") + (e.n || "Pokémon mystère")));
        var detail = m[1];
        if (e.m === "wordle" && e.k) detail += " · " + e.k + (e.k > 1 ? " essais" : " essai");
        if (e.m === "whois" && e.w && e.k) detail += " · " + secs(e.k);
        t.appendChild(el("small", "", detail + " · " + ago(e.t))); row.appendChild(t);
        body.appendChild(row);
      });
    }
    $("clearHist").addEventListener("click", function () {
      if (window.confirm("Vider l'historique de tes parties ?") && window.PokeStats) window.PokeStats.clearHistory();
    });
    window.addEventListener("statschange", function () { renderStats(); renderHistory(); renderOptions(); });
    renderStats(); renderHistory();
    // Un objet vient d'être gagné dans une crate : il se déverrouille tout de suite dans l'éditeur.
    window.addEventListener("cratechange", function () { renderOptions(); renderPreview(); });
    // Profil modifié ailleurs (ex. « Équiper » depuis l'onglet Crates) : on recharge la carte si l'éditeur est fermé.
    window.addEventListener("profilechange", function () { if ($("editor").classList.contains("hidden")) fillFromSaved(); });

    // ---- Chargement : profil existant + liste des noms ----
    // Remplit le brouillon et les champs depuis le profil enregistré (utilisé au chargement et à l'annulation).
    function fillFromSaved() {
      var cur = P.get();
      draft = newDraft();
      $("pName").value = ""; $("pFav").value = ""; $("pTeam").value = ""; $("pMotto").value = ""; $("sugg").textContent = ""; $("teamSugg").textContent = "";
      if (cur) {
        $("pName").value = cur.name; draft.favId = cur.favId || null; draft.favName = cur.favName || "";
        draft.style = cur.style; draft.color = cur.color; draft.type = cur.type; draft.bg = cur.bg; draft.title = cur.title; draft.team = cur.team.slice(); $("pMotto").value = cur.motto;
        draft.frameStyle = cur.frameStyle || 0; draft.shape = cur.shape || 0; draft.effect = cur.effect || 0; draft.badge = cur.badge || 0; draft.nameFont = cur.nameFont || 0; draft.nameColor = cur.nameColor || 0;
        if (cur.favName) $("pFav").value = cur.favName;
      }
      $("clear").classList.toggle("hidden", !cur);
      say(""); renderOptions(); renderPreview();
    }

    // ---- Engrenage : affiche / masque l'éditeur de carte ----
    function setEditor(open) {
      $("editor").classList.toggle("hidden", !open);
      $("gear").classList.toggle("on", open);
      $("gear").setAttribute("aria-expanded", String(open));
    }
    $("gear").addEventListener("click", function () {
      var open = $("editor").classList.contains("hidden");
      if (!open) fillFromSaved(); // fermeture sans enregistrer : on revient à la carte enregistrée
      setEditor(open);
    });
    $("cancel").addEventListener("click", function () { fillFromSaved(); setEditor(false); });

    fillFromSaved();
    if (!P.get()) setEditor(true); // pas encore de profil : on ouvre directement l'éditeur
    fetch("/api/whois?action=names").then(function (r) { return r.json(); }).then(function (j) {
      var list = j.byId || j.names || [];
      names = list; folded = list.map(fold);
      renderPreview(); renderHistory(); if ($("pFav").value) renderSugg();
    }).catch(function () {});
  }
})();
