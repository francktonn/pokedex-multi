/* crates.js — onglet « Crates » : une crate gratuite par jour, contenant un objet de personnalisation de profil au hasard
   (fond de carte, titre, style de cadre, forme de photo, effet, police ou couleur du pseudo).
   Shadow DOM : HTML/CSS/ids isolés du reste du site. La logique (stock, tirage, objets obtenus) est dans window.PokeCrates
   (index.html), pour que l'onglet Profil puisse lire les objets gagnés. */
(function () {
  "use strict";
  var TYPE_COL = { normal:"#A8A77A", fire:"#EE8130", water:"#6390F0", grass:"#7AC74C", electric:"#E5B90F", ice:"#6FC7C3", fighting:"#C22E28", poison:"#A33EA1", ground:"#C9A23F",
    flying:"#8D74E8", psychic:"#F95587", bug:"#8FA015", rock:"#A28F2C", ghost:"#735797", dragon:"#6F35FC", dark:"#705746", steel:"#8E8EAA", fairy:"#D685AD" };

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
    "h3{font-family:'Baloo 2',sans-serif; margin:16px 0 6px; font-size:15px;}",
    "p.sub{margin:0 0 12px; color:var(--muted); font-size:14px; line-height:1.4;}",
    ".head{display:flex; align-items:center; justify-content:space-between; gap:10px;}",
    ".count{font-family:'Baloo 2',sans-serif; font-weight:800; font-size:15px; color:var(--muted);}",
    ".hidden{display:none !important;}",
    /* bouton */
    ".btn{width:100%; min-height:50px; border:0; border-radius:16px; cursor:pointer; margin-top:12px; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:17px; color:#221d17;",
    "  background:linear-gradient(180deg,#ffd96b,var(--gold) 55%,#f0b21f); box-shadow:0 5px 0 var(--gold-deep), 0 12px 20px -8px rgba(0,0,0,.4); transition:transform .15s var(--ease), box-shadow .15s var(--ease);}",
    ".btn:active{transform:translateY(3px); box-shadow:0 2px 0 var(--gold-deep);}",
    ".btn:disabled{cursor:default; opacity:.65; transform:none; box-shadow:0 5px 0 var(--gold-deep);}",
    ".btn.alt{background:var(--card); color:var(--ink); box-shadow:0 4px 0 rgba(0,0,0,.15); border:1px solid var(--line); min-height:42px; font-size:14px;}",
    ".msg{min-height:20px; margin-top:10px; font-weight:800; font-size:13px; text-align:center;}",
    ".msg.ok{color:var(--ok);} .msg.ko{color:var(--ko);}",
    /* crate */
    ".stage{display:flex; justify-content:center; padding:10px 0 2px;}",
    ".crate{font-size:92px; line-height:1; filter:drop-shadow(0 10px 12px rgba(0,0,0,.35)); user-select:none; transform-origin:50% 90%;}",
    ".crate.idle{animation:float 2.8s ease-in-out infinite;} .crate.off{filter:grayscale(.8) drop-shadow(0 10px 12px rgba(0,0,0,.25)); opacity:.7;}",
    ".crate.shake{animation:shake .9s ease-in-out both;} .crate.burst{animation:burst .45s var(--ease) both;}",
    "@keyframes float{50%{transform:translateY(-8px) rotate(-3deg);}}",
    "@keyframes shake{0%,100%{transform:rotate(0)} 10%{transform:rotate(-12deg) scale(1.05)} 20%{transform:rotate(12deg) scale(1.08)} 30%{transform:rotate(-14deg) scale(1.1)} 40%{transform:rotate(14deg) scale(1.12)} 55%{transform:rotate(-16deg) scale(1.16)} 70%{transform:rotate(16deg) scale(1.2)} 85%{transform:rotate(0) scale(1.28)}}",
    "@keyframes burst{0%{transform:scale(1.28); opacity:1;} 100%{transform:scale(.9); opacity:.9;}}",
    /* révélation */
    ".reveal{margin-top:16px; padding-top:14px; border-top:2px dashed var(--line); text-align:center; animation:pop .5s var(--ease) both;}",
    "@keyframes pop{from{opacity:0; transform:translateY(10px) scale(.92);}to{opacity:1; transform:none;}}",
    ".rpill{display:inline-block; padding:3px 14px; border-radius:999px; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:14px; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.35); margin-bottom:10px;}",
    ".reveal.r3 .rpill{color:#221d17; text-shadow:none;}",
    ".reveal.r3 .card{box-shadow:0 0 0 2px #FFC93C, 0 0 30px 4px rgba(255,201,60,.55);} .reveal.r2 .card{box-shadow:0 0 22px 2px rgba(155,107,214,.55);}",
    ".rname{font-family:'Baloo 2',sans-serif; font-weight:800; font-size:22px; margin-top:12px; line-height:1.15;}",
    ".rcat{color:var(--muted); font-weight:700; font-size:13px; margin-top:2px;}",
    /* aperçu de carte (même rendu que l'onglet Profil) */
    ".card{border-radius:20px; padding:14px; margin:0; color:#fff; text-align:left; position:relative; overflow:hidden;",
    "  background:var(--bg, linear-gradient(150deg, color-mix(in srgb, var(--accent) 55%, #1a1411), #1a1411 85%)); border:3px solid var(--frame);}",
    ".avatarbox{display:flex; align-items:center; gap:14px;}",
    ".avatar{width:84px; height:84px; flex-shrink:0; border-radius:50%; display:flex; align-items:center; justify-content:center; overflow:hidden;",
    "  background:radial-gradient(circle at 50% 40%, rgba(143,240,164,.28), transparent 70%), #0e1a12; border:5px solid #070d08; box-shadow:0 0 0 3px var(--frame), 0 8px 18px -6px rgba(0,0,0,.6);}",
    ".avatar img{width:88%; height:88%; image-rendering:pixelated; object-fit:contain;} .avatar img.art{image-rendering:auto;}",
    ".avatar span{font-family:'Silkscreen',monospace; font-size:28px; color:#8ff0a4;}",
    ".who{min-width:0; flex:1;}",
    ".who .nm{font-family:'Baloo 2',sans-serif; font-weight:800; font-size:21px; line-height:1.1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}",
    ".who .fv{opacity:.8; font-weight:700; font-size:13px; margin-top:2px;}",
    ".ttl{font-weight:800; font-size:12px; letter-spacing:.03em; opacity:.95; margin-top:2px; color:var(--gold);}",
    /* collection */
    ".grid{display:grid; grid-template-columns:repeat(3,1fr); gap:6px;}",
    ".it{min-height:58px; border-radius:12px; padding:6px 4px; font:inherit; font-weight:800; font-size:12px; line-height:1.15; color:var(--ink); background:var(--card);",
    "  border:2px solid var(--rc,var(--line)); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; word-break:break-word;}",
    "button.it{cursor:pointer;} button.it:active{transform:scale(.97);}",
    ".it.no{border-style:dashed; opacity:.55; color:var(--muted); cursor:default;} .it .big{font-size:22px; line-height:1;}",
    ".it .sw{width:22px; height:22px; border-radius:50%; box-shadow:inset 0 0 0 2px rgba(0,0,0,.25);}",
    ".it small{font-size:10px; font-weight:800; color:var(--rc,var(--muted));}",
    ".odds{display:flex; flex-direction:column; gap:6px;}",
    ".orow{display:flex; align-items:center; gap:10px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:8px 12px; font-weight:800; font-size:14px;}",
    ".orow i{width:12px; height:12px; border-radius:50%; flex-shrink:0;} .orow span{margin-left:auto; color:var(--muted);}",
    ".hint2{margin:10px 0 0; color:var(--muted); font-size:12.5px; font-weight:700; line-height:1.35;}",
    "@media (prefers-reduced-motion:reduce){*{animation-duration:.001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important;}}"
  ].join("\n");

  var HTML = [
    '<div class="device">',
    '  <div class="top"><span class="lens"></span><span class="brand">CRATES</span><button type="button" class="themebtn" id="themeBtn" aria-label="Mode sombre">🌙</button></div>',
    '  <section class="panel">',
    '    <h2>🎁 Crate du jour</h2>',
    '    <p class="sub">Une crate gratuite chaque jour. Elle contient au hasard un objet pour personnaliser ta carte : fond, titre, cadre, effet…</p>',
    '    <div class="stage"><div class="crate idle" id="crate" aria-hidden="true">🎁</div></div>',
    '    <button type="button" class="btn" id="openBtn"></button>',
    '    <div class="msg" id="msg" role="status"></div>',
    '    <div class="reveal hidden" id="reveal"></div>',
    '  </section>',
    '  <section class="panel">',
    '    <div class="head"><h2>📚 Ma collection</h2><span class="count" id="collCount"></span></div>',
    '    <p class="sub">Les objets verrouillés (🔒) de ton profil ne s\'obtiennent qu\'ici. Touche un objet débloqué pour le revoir ou l\'équiper.</p>',
    '    <div id="collBody"></div>',
    '  </section>',
    '  <section class="panel">',
    '    <h2>🎲 Chances de drop</h2>',
    '    <p class="sub">Chaque objet a une rareté fixe : plus elle est haute, plus il est difficile à obtenir.</p>',
    '    <div class="odds" id="odds"></div>',
    '    <p class="hint2">Tu ne tires jamais deux fois le même objet. Si une rareté est épuisée, ses chances sont redistribuées.</p>',
    '  </section>',
    '</div>'
  ].join("\n");

  var mounted = false;
  window.CratesTab = {
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
    var P = window.PokeProfile, C = window.PokeCrates;
    var busy = false;
    var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function say(text, kind) { var m = $("msg"); m.textContent = text || ""; m.className = "msg" + (kind ? " " + kind : ""); }
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    function clock(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60); }
    function label(it) { return it.name; }

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

    // ---- Aperçu : ta carte actuelle, avec l'objet gagné par-dessus ----
    function buildPreview(item) {
      var base = P.get() || {};
      var d = { favId: base.favId || 0, style: base.style || 0, color: base.color || 0, type: base.type || "", bg: base.bg || 0, title: base.title || 0,
        frameStyle: base.frameStyle || 0, shape: base.shape || 0, effect: base.effect || 0, nameFont: base.nameFont || 0, nameColor: base.nameColor || 0 };
      d[item.field] = item.idx;
      var card = el("div", "card");
      card.style.setProperty("--frame", P.frame(d.color));
      card.style.setProperty("--accent", TYPE_COL[d.type] || "#D99A12");
      card.style.setProperty("--bg", (P.bgs[d.bg] || P.bgs[0]).css);
      var row = el("div", "avatarbox"); card.appendChild(row);
      var av = el("div", "avatar"); row.appendChild(av);
      if (d.favId) { var im = document.createElement("img"); im.alt = ""; im.src = P.sprite(d.favId, d.style); if (d.style === 2) im.className = "art"; av.appendChild(im); }
      else av.appendChild(el("span", "", "?"));
      var who = el("div", "who"); row.appendChild(who);
      var nm = el("div", "nm"); who.appendChild(nm);
      if (d.title) who.appendChild(el("div", "ttl", P.titles[d.title].name));
      who.appendChild(el("div", "fv", base.favName ? "Préféré : " + base.favName : "Pokémon préféré : à choisir"));
      P.paint({ card: card, avatar: av, name: nm }, { f: d.frameStyle, h: d.shape, e: d.effect, nf: d.nameFont, nc: d.nameColor }, base.name || "Dresseur");
      return card;
    }

    // ---- Révélation d'un objet (nouveau ou revu depuis la collection) ----
    function showReveal(item, fresh) {
      var rv = $("reveal"), R = C.rarities[item.rar];
      rv.textContent = ""; rv.className = "reveal r" + item.rar;
      var pill = el("div", "rpill", (fresh ? "Nouvel objet · " : "") + R.name); pill.style.background = R.color; rv.appendChild(pill);
      rv.appendChild(buildPreview(item));
      rv.appendChild(el("div", "rname", label(item)));
      rv.appendChild(el("div", "rcat", item.catName));
      var eq = el("button", "btn", "✨ Équiper sur ma carte"); eq.type = "button"; rv.appendChild(eq);
      var rmsg = el("div", "msg"); rv.appendChild(rmsg);
      eq.onclick = function () {
        if (C.equip(item)) { eq.textContent = "✅ Équipé !"; eq.disabled = true; rmsg.textContent = "Ta carte est à jour."; rmsg.className = "msg ok"; }
        else { rmsg.textContent = "Crée d'abord ton profil dans l'onglet Profil."; rmsg.className = "msg ko"; }
      };
      var close = el("button", "btn alt", "Fermer"); close.type = "button"; close.onclick = function () { rv.className = "reveal hidden"; rv.textContent = ""; }; rv.appendChild(close);
      rv.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    }

    // ---- Bouton principal : ouvrir / compte à rebours ----
    function refreshMain() {
      var s = C.state(), all = C.items(), btn = $("openBtn"), crate = $("crate");
      var complete = all.length > 0 && s.ownedCount >= all.length;
      if (busy) return;
      if (complete) { btn.disabled = true; btn.textContent = "🏆 Collection complète !"; crate.classList.add("off"); return; }
      if (s.stock > 0) {
        btn.disabled = false; btn.textContent = s.stock > 1 ? "🎁 Ouvrir une crate (" + s.stock + ")" : "🎁 Ouvrir ma crate du jour";
        crate.classList.remove("off");
      } else {
        btn.disabled = true; btn.textContent = "⏳ Prochaine crate dans " + clock(C.msUntilNext());
        crate.classList.add("off");
      }
    }
    $("openBtn").addEventListener("click", function () {
      if (busy) return;
      var s = C.state(); if (s.stock <= 0) return;
      busy = true; say(""); $("openBtn").disabled = true;
      var crate = $("crate"); crate.classList.remove("idle", "off", "burst"); void crate.offsetWidth; crate.classList.add("shake");
      setTimeout(function () {
        var res = C.open();
        crate.classList.remove("shake"); crate.classList.add("burst");
        setTimeout(function () { crate.classList.remove("burst"); crate.classList.add("idle"); }, 450);
        busy = false;
        if (!res) say("Plus de crate disponible pour aujourd'hui.", "ko");
        else if (res.done) say("Tu possèdes déjà tous les objets de crate !", "ok");
        else showReveal(res.item, true);
        renderCollection(); refreshMain();
      }, reduced ? 0 : 950);
    });

    // ---- Collection ----
    function renderCollection() {
      var s = C.state(), all = C.items(), body = $("collBody"); body.textContent = "";
      $("collCount").textContent = s.ownedCount + " / " + all.length;
      C.cats.forEach(function (c) {
        var list = all.filter(function (it) { return it.list === c[0]; });
        if (!list.length) return;
        var got = list.filter(function (it) { return s.owned[it.key]; }).length;
        body.appendChild(el("h3", "", c[2] + " (" + got + "/" + list.length + ")"));
        var g = el("div", "grid"); body.appendChild(g);
        list.sort(function (a, b) { return a.min - b.min; }).forEach(function (it) {
          var R = C.rarities[it.rar], has = !!s.owned[it.key], t;
          if (has) {
            t = el("button", "it"); t.type = "button"; t.onclick = function () { if (!busy) showReveal(it, false); };
            if (c[0] === "nameColors") { var sw = el("span", "sw"); sw.style.background = it.css; t.appendChild(sw); }
            t.appendChild(document.createTextNode(it.name));
          } else { t = el("div", "it no"); t.appendChild(el("span", "big", "❓")); }
          t.style.setProperty("--rc", R.color); t.appendChild(el("small", "", R.name)); g.appendChild(t);
        });
      });
    }

    // ---- Chances de drop ----
    function renderOdds() {
      var box = $("odds"), total = 0; box.textContent = "";
      C.rarities.forEach(function (r) { total += r.w; });
      C.rarities.forEach(function (r) {
        var row = el("div", "orow"), dot = el("i"); dot.style.background = r.color; row.appendChild(dot);
        row.appendChild(document.createTextNode(r.name)); row.appendChild(el("span", "", Math.round(100 * r.w / total) + " %")); box.appendChild(row);
      });
    }

    // ---- Démarrage : crédite la crate du jour, puis tic-tac jusqu'à minuit ----
    C.sync();
    renderOdds(); renderCollection(); refreshMain();
    var timer = setInterval(function () {
      if (!host.isConnected) { clearInterval(timer); return; }
      if (document.hidden || busy) return;
      if (C.state().stock === 0 && C.available()) C.sync(); // minuit est passé : nouvelle crate
      refreshMain();
    }, 1000);
    window.addEventListener("cratechange", function () { if (!busy) { renderCollection(); refreshMain(); } });
  }
})();
