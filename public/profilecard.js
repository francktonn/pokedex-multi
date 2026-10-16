/* profilecard.js — fenêtre « profil d'un joueur », partagée par tous les modes de jeu.
   window.PokeCard.show({ name, avatar, card, me })  (avatar = n° du Pokémon, card = {s,c,t,m,x} reçu du serveur).
   Vit dans son propre Shadow DOM (au-dessus de tout le reste) : aucune dépendance de style avec les pages. */
(function () {
  "use strict";
  var TYPES = [["normal","Normal","#A8A77A"],["fire","Feu","#EE8130"],["water","Eau","#6390F0"],["grass","Plante","#7AC74C"],["electric","Électrik","#E5B90F"],
    ["ice","Glace","#6FC7C3"],["fighting","Combat","#C22E28"],["poison","Poison","#A33EA1"],["ground","Sol","#C9A23F"],["flying","Vol","#8D74E8"],
    ["psychic","Psy","#F95587"],["bug","Insecte","#8FA015"],["rock","Roche","#A28F2C"],["ghost","Spectre","#735797"],["dragon","Dragon","#6F35FC"],
    ["dark","Ténèbres","#705746"],["steel","Acier","#8E8EAA"],["fairy","Fée","#D685AD"]]; // t = index + 1 (0 = aucun)
  var FRAMES = ["#FFC93C","#E23B30","#3a86d6","#5ee06a","#F95587","#9b6bd6","#ff8a3c","#e8e8e8"];
  var BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";
  var CSS = [
    ":host{all:initial; position:fixed; inset:0; z-index:2147483000; display:none; font-family:'Nunito',sans-serif;}",
    ":host(.open){display:block;}",
    ".back{position:absolute; inset:0; background:rgba(0,0,0,.62); display:flex; align-items:center; justify-content:center; padding:16px; overflow:auto;}",
    ".box{width:100%; max-width:380px; background:#FCF9F1; color:#221d17; border-radius:24px; padding:16px; box-shadow:0 30px 60px -15px rgba(0,0,0,.7); animation:in .25s cubic-bezier(.2,.8,.2,1) both; position:relative;}",
    ".dark .box{background:#241e1a; color:#f3ebdd;}",
    "@keyframes in{from{opacity:0; transform:translateY(12px) scale(.97)}to{opacity:1; transform:none}}",
    ".x{position:absolute; top:10px; right:10px; width:34px; height:34px; border-radius:50%; border:0; cursor:pointer; font-size:16px; background:rgba(0,0,0,.35); color:#fff; z-index:2;}",
    ".card{border-radius:20px; padding:16px; color:#fff; border:3px solid var(--frame); background:var(--bg, linear-gradient(150deg, color-mix(in srgb, var(--accent) 55%, #1a1411), #1a1411 85%));}",
    ".row{display:flex; align-items:center; gap:14px;}",
    ".avatar{width:92px; height:92px; flex-shrink:0; border-radius:50%; display:flex; align-items:center; justify-content:center; overflow:hidden; background:radial-gradient(circle at 50% 40%, rgba(143,240,164,.28), transparent 70%), #0e1a12; border:5px solid #070d08; box-shadow:0 0 0 3px var(--frame), 0 8px 18px -6px rgba(0,0,0,.6);}",
    ".avatar img{width:88%; height:88%; object-fit:contain; image-rendering:pixelated;} .avatar img.art{image-rendering:auto;}",
    ".avatar span{font-family:'Silkscreen',monospace; font-size:28px; color:#8ff0a4;}",
    ".who{min-width:0; flex:1; padding-right:28px;}",
    ".nm{font-family:'Baloo 2',sans-serif; font-weight:800; font-size:22px; line-height:1.1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}",
    ".fv{opacity:.8; font-weight:700; font-size:13px; margin-top:2px;}",
    ".chip{display:inline-block; margin-top:6px; padding:2px 10px; border-radius:999px; font-size:12px; font-weight:800; background:var(--accent); text-shadow:0 1px 2px rgba(0,0,0,.4);}",
    ".motto{margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,.18); font-style:italic; font-weight:700; font-size:14px; opacity:.92;}",
    ".ttl{font-weight:800; font-size:12px; opacity:.9; margin-top:2px; color:#FFC93C;}",
    ".team{display:flex; gap:4px; margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,.18);}",
    ".team span{flex:1; min-width:0; aspect-ratio:1; border-radius:12px; background:rgba(0,0,0,.28); display:flex; align-items:center; justify-content:center;}",
    ".team img{width:92%; height:92%; object-fit:contain; image-rendering:pixelated;}",
    "h3{font-family:'Baloo 2',sans-serif; font-size:15px; margin:14px 0 6px;}",
    ".tiles{display:grid; grid-template-columns:repeat(3,1fr); gap:6px;}",
    ".tile{background:rgba(127,127,127,.12); border:1px solid rgba(127,127,127,.25); border-radius:12px; padding:8px 4px; text-align:center;}",
    ".tile b{display:block; font-family:'Baloo 2',sans-serif; font-size:19px; line-height:1.1;}",
    ".tile small{display:block; margin-top:2px; opacity:.65; font-weight:700; font-size:10.5px; line-height:1.2;}",
    ".none{opacity:.65; font-size:13px; font-weight:700; margin:12px 0 0; text-align:center;}"
  ].join("\n");

  var host = null, root = null, names = null, namesLoading = false;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ensure() {
    if (host) return;
    host = document.createElement("div"); host.id = "pokeCardHost";
    root = host.attachShadow({ mode: "open" });
    var st = document.createElement("style"); st.textContent = CSS + "\n" + (window.PokeProfile && window.PokeProfile.cardCss || ""); root.appendChild(st);
    var back = el("div", "back"); back.id = "back"; root.appendChild(back);
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    document.body.appendChild(host);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }
  function close() { if (host) host.classList.remove("open"); }
  function loadNames(cb) {
    if (names) return cb();
    if (namesLoading) return;
    namesLoading = true;
    fetch("/api/whois?action=names").then(function (r) { return r.json(); }).then(function (j) { names = j.byId || []; cb(); }).catch(function () { names = []; });
  }
  function pct(a, b) { return b ? Math.round(100 * a / b) + " %" : "–"; }
  function secs(ms) { return ms ? (Math.round(ms / 100) / 10).toString().replace(".", ",") + " s" : "–"; }
  function tile(v, l) { var t = el("div", "tile"); t.appendChild(el("b", "", String(v))); t.appendChild(el("small", "", l)); return t; }

  // Statistiques : pour « moi » on lit les valeurs locales à jour, sinon l'instantané reçu du serveur.
  function statsFor(p, card) {
    if (p.me && window.PokeStats) {
      var S = window.PokeStats.get();
      return { qp: S.whois.played, qc: S.whois.correct, qb: S.whois.bestMs, gf: S.guess.found, gm: S.guess.missed };
    }
    return card && card.x ? card.x : null;
  }

  function show(p) {
    if (!p) return;
    ensure();
    var card = p.card || {};
    if (p.me && window.PokeProfile && window.PokeProfile.get()) {
      card = window.PokeProfile.card() || card;
    }
    var style = Number(card.s) || 0, frameList = (window.PokeProfile && window.PokeProfile.frames) || FRAMES, frame = frameList[Number(card.c)] || frameList[0];
    var ti = card.t > 0 ? TYPES[card.t - 1] : null;
    var PP = window.PokeProfile, bgs = PP && PP.bgs, titles = PP && PP.titles;
    var bgDef = bgs && bgs[Number(card.b)] ? bgs[Number(card.b)] : null, ttl = titles && Number(card.ti) > 0 ? titles[Number(card.ti)] : null;
    var back = root.getElementById("back"); back.textContent = "";
    host.classList.toggle("dark", document.documentElement.getAttribute("data-theme") === "dark");

    var box = el("div", "box"); back.appendChild(box);
    var x = el("button", "x", "✕"); x.type = "button"; x.setAttribute("aria-label", "Fermer"); x.onclick = close; box.appendChild(x);

    var c = el("div", "card"); c.style.setProperty("--frame", frame); c.style.setProperty("--accent", ti ? ti[2] : "#D99A12"); if (bgDef) c.style.setProperty("--bg", bgDef.css); box.appendChild(c);
    var row = el("div", "row"); c.appendChild(row);
    var av = el("div", "avatar"); row.appendChild(av);
    if (p.avatar) {
      var im = document.createElement("img"); im.alt = "";
      im.src = style === 2 ? BASE + "other/official-artwork/" + p.avatar + ".png" : BASE + (style === 1 ? "shiny/" : "") + p.avatar + ".png";
      if (style === 2) im.className = "art"; av.appendChild(im);
    } else av.appendChild(el("span", "", "?"));
    var who = el("div", "who"); row.appendChild(who);
    var nmEl = el("div", "nm"); who.appendChild(nmEl);
    if (PP && PP.paint) PP.paint({ card: c, avatar: av, name: nmEl }, card, p.name || "Joueur"); else nmEl.textContent = p.name || "Joueur";
    if (ttl) who.appendChild(el("div", "ttl", ttl.name));
    var fv = el("div", "fv", p.avatar ? "Préféré : n°" + p.avatar : "Pas de Pokémon préféré"); who.appendChild(fv);
    if (ti) who.appendChild(el("span", "chip", "Type " + ti[1]));
    if (card.m) c.appendChild(el("div", "motto", "« " + card.m + " »"));
    if (Array.isArray(card.tm) && card.tm.length) {
      var tmEl = el("div", "team");
      card.tm.slice(0, 6).forEach(function (id) { var sp = el("span"), im = document.createElement("img"); im.alt = ""; im.loading = "lazy"; im.src = BASE + id + ".png"; sp.appendChild(im); tmEl.appendChild(sp); });
      c.appendChild(tmEl);
    }
    if (p.avatar) loadNames(function () { if (names[p.avatar - 1]) fv.textContent = "Préféré : " + names[p.avatar - 1] + " · n°" + p.avatar; });

    var s = statsFor(p, card);
    if (!s) { box.appendChild(el("p", "none", "Ce joueur n'a pas encore de statistiques à partager.")); }
    else {
      var total = s.qp + s.gf + s.gm;
      if (!total) box.appendChild(el("p", "none", "Pas encore de statistiques."));
      else {
        function sec(title, tiles) { box.appendChild(el("h3", "", title)); var g = el("div", "tiles"); tiles.forEach(function (t) { g.appendChild(t); }); box.appendChild(g); }
        if (s.qp) sec("❔ Qui est-ce ?", [tile(s.qp, "Manches"), tile(pct(s.qc, s.qp), "Réussite"), tile(secs(s.qb), "Meilleur temps")]);
        if (s.gf + s.gm) sec("🔴 Devinette", [tile(s.gf, "Devinés"), tile(s.gm, "Ratés"), tile(pct(s.gf, s.gf + s.gm), "Précision")]);
      }
    }
    host.classList.add("open");
  }
  window.PokeCard = { show: show, close: close };
})();
