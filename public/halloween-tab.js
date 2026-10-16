/* halloween-tab.js — onglet « 🎃 Halloween » : solde de bonbons, comment en gagner, calendrier de connexion quotidienne
   et boutique d'objets exclusifs (personnalisation de profil + skins du Pokédex).
   Shadow DOM : HTML/CSS/ids isolés du reste du site. Toute la logique (bonbons, achats, possession) est dans
   window.PokeHalloween (halloween.js, chargé au démarrage du site). */
(function () {
  "use strict";

  var CSS = [
    ":host{display:block; font-family:'Nunito',sans-serif; color:#fff;",
    "  --ink:#221d17; --paper:#FCF9F1; --card:#fff; --line:rgba(34,29,23,.12); --muted:#7b6f60; --ok:#2fa84f; --ko:#c8372d;",
    "  --gold:#FF9A2E; --gold-deep:#C4600A; --frame:#FF9A2E; --accent:#D99A12; --ease:cubic-bezier(.2,.8,.2,1);}",
    ":host(.dark){--ink:#f3ebdd; --paper:#241e1a; --card:#322a24; --line:rgba(255,255,255,.16); --muted:#b5a891; --ok:#5ee06a; --ko:#ff7a6e; color-scheme:dark;}",
    "*{box-sizing:border-box; -webkit-tap-highlight-color:transparent;}",
    ".device{position:relative; overflow:hidden; background:radial-gradient(120% 60% at 50% -10%, rgba(255,154,46,.35), transparent 60%), linear-gradient(160deg,#3a1763,#25104a 55%,#150a2b);",
    "  border:1px solid rgba(0,0,0,.45); border-radius:30px; padding:16px 16px 20px;",
    "  box-shadow:0 30px 60px -15px rgba(0,0,0,.65), inset 0 2px 0 rgba(255,255,255,.28), inset 0 -6px 0 rgba(0,0,0,.25);}",
    ".top{display:flex; align-items:center; gap:10px; margin-bottom:12px;}",
    ".lens{width:22px;height:22px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 35% 30%,#ffe2b0,#ff9a2e 55%,#c4600a);box-shadow:0 0 0 3px rgba(255,255,255,.5),0 0 14px rgba(255,154,46,.9);}",
    ".brand{font-family:'Silkscreen',monospace; font-size:12px; letter-spacing:.12em; flex:1;}",
    ".wallet{font-family:'Silkscreen',monospace; font-size:12px; color:#ffd27a; background:rgba(0,0,0,.35); padding:6px 11px; border-radius:999px; white-space:nowrap;}",
    ".themebtn{border:0; width:34px; height:34px; border-radius:50%; cursor:pointer; font-size:15px; background:rgba(0,0,0,.28); color:#fff;}",
    ".panel{background:var(--paper); color:var(--ink); border-radius:20px; padding:16px; margin-bottom:12px; box-shadow:0 8px 20px -8px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.6);}",
    ":host(.dark) .panel{box-shadow:0 8px 20px -8px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.05);}",
    "h2{font-family:'Baloo 2',sans-serif; margin:0 0 4px; font-size:20px;}",
    "h3{font-family:'Baloo 2',sans-serif; margin:14px 0 6px; font-size:15px;}",
    "p.sub{margin:0 0 12px; color:var(--muted); font-size:14px; line-height:1.4;}",
    ".head{display:flex; align-items:center; justify-content:space-between; gap:10px;}",
    ".count{font-family:'Baloo 2',sans-serif; font-weight:800; font-size:15px; color:var(--muted);}",
    ".hidden{display:none !important;}",
    ".seg{display:flex; gap:6px; margin-bottom:12px; background:rgba(0,0,0,.3); padding:5px; border-radius:16px;}",
    ".seg button{flex:1; min-height:42px; border:0; border-radius:12px; cursor:pointer; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:14px; padding:0 4px; color:#fff; background:transparent;}",
    ".seg button.on{background:var(--gold); color:#221d17; box-shadow:0 3px 0 var(--gold-deep);}",
    /* héros */
    ".hero{text-align:center; background:radial-gradient(90% 70% at 50% 0, rgba(255,154,46,.22), transparent 70%), var(--paper);}",
    ".pump{font-size:78px; line-height:1; filter:drop-shadow(0 8px 10px rgba(0,0,0,.35)); animation:float 3s ease-in-out infinite; user-select:none;}",
    "@keyframes float{50%{transform:translateY(-8px) rotate(-4deg);}}",
    ".bigc{font-family:'Baloo 2',sans-serif; font-weight:800; font-size:38px; line-height:1.1; color:var(--gold-deep); margin-top:2px;}",
    ".clock{display:inline-block; margin-top:8px; padding:4px 12px; border-radius:999px; background:rgba(0,0,0,.08); font-family:'Silkscreen',monospace; font-size:12px; color:var(--muted);}",
    /* gains */
    ".earn{display:flex; flex-direction:column; gap:6px;}",
    ".erow{display:flex; align-items:center; gap:10px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:9px 12px; font-weight:800; font-size:14px;}",
    ".erow .ei{font-size:20px;} .erow .et{flex:1; min-width:0;} .erow .ev{font-family:'Baloo 2',sans-serif; color:var(--gold-deep); white-space:nowrap;}",
    ".bar{height:12px; border-radius:99px; background:rgba(0,0,0,.15); overflow:hidden; margin:12px 0 4px;} .bar i{display:block; height:100%; background:linear-gradient(90deg,#ffd27a,var(--gold-deep)); transition:width .4s var(--ease);}",
    ".hint2{margin:6px 0 0; color:var(--muted); font-size:12.5px; font-weight:700; line-height:1.35;}",
    /* calendrier */
    ".cal{display:grid; grid-template-columns:repeat(5,1fr); gap:6px; margin:6px 0 0;}",
    ".cd{position:relative; border:2px solid var(--line); background:var(--card); color:var(--ink); border-radius:12px; padding:6px 2px 7px; text-align:center; font-weight:800; line-height:1.2; min-width:0;}",
    ".cd small{display:block; font-size:10px; color:var(--muted);} .cd b{display:block; font-family:'Baloo 2',sans-serif; font-size:18px; line-height:1.1;}",
    ".cd .rw{display:block; font-size:12px; color:var(--gold-deep); font-family:'Baloo 2',sans-serif;}",
    ".cd.claimed{opacity:.55;} .cd.claimed::after{content:'\\2705'; position:absolute; top:2px; right:3px; font-size:11px;}",
    ".cd.missed{border-style:dashed; opacity:.4; filter:grayscale(.8);}",
    ".cd.today{border-color:var(--gold); box-shadow:0 0 0 3px rgba(255,154,46,.45); animation:pulse 1.8s ease-in-out infinite;}",
    "@keyframes pulse{50%{box-shadow:0 0 0 6px rgba(255,154,46,.15);}}",
    ".cd.big{border-color:#9b6bd6;} .cd.big.today{border-color:var(--gold);} .cd.big .rw{color:#9b6bd6;}",
    /* boutons */
    ".btn{width:100%; min-height:50px; border:0; border-radius:16px; cursor:pointer; margin-top:12px; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:17px; color:#221d17;",
    "  background:linear-gradient(180deg,#ffc27a,var(--gold) 55%,#f08a14); box-shadow:0 5px 0 var(--gold-deep), 0 12px 20px -8px rgba(0,0,0,.4); transition:transform .15s var(--ease), box-shadow .15s var(--ease);}",
    ".btn:active{transform:translateY(3px); box-shadow:0 2px 0 var(--gold-deep);}",
    ".btn:disabled{cursor:default; opacity:.65; transform:none; box-shadow:0 5px 0 var(--gold-deep);}",
    ".msg{min-height:20px; margin-top:10px; font-weight:800; font-size:13px; text-align:center;}",
    ".msg.ok{color:var(--ok);} .msg.ko{color:var(--ko);}",
    /* boutique */
    ".chips{display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;}",
    ".chips button{border:2px solid var(--line); background:var(--card); color:var(--ink); border-radius:999px; min-height:34px; padding:0 14px; cursor:pointer; font:inherit; font-weight:800; font-size:13px;}",
    ".chips button.on{border-color:var(--gold); background:var(--gold); color:#221d17;}",
    ".goods{display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin-top:8px;}",
    ".gd{border:2px solid var(--rc,var(--line)); border-radius:14px; padding:8px; background:var(--card); color:var(--ink); display:flex; flex-direction:column; gap:5px; min-width:0; font-weight:800; font-size:13px;}",
    ".gd.own{box-shadow:0 0 0 2px rgba(47,168,79,.35);}",
    ".gd .gname{line-height:1.2; word-break:break-word;} .gd small{font-size:11px; font-weight:800; color:var(--rc,var(--muted));}",
    ".gd .gb{margin-top:auto; min-height:36px; border:0; border-radius:10px; cursor:pointer; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:14px; color:#221d17; background:var(--gold); box-shadow:0 3px 0 var(--gold-deep);}",
    ".gd .gb:disabled{opacity:.55; cursor:default; box-shadow:none;} .gd .gb.alt{background:var(--card); color:var(--ink); border:1px solid var(--line); box-shadow:0 3px 0 rgba(0,0,0,.12);}",
    ".pvbox{min-height:64px; display:flex; align-items:center; justify-content:center; border-radius:10px; overflow:hidden;}",
    ".skpv{width:100%; height:64px; border-radius:12px; position:relative; box-shadow:inset 0 0 0 3px rgba(0,0,0,.2), inset 0 2px 0 rgba(255,255,255,.35);}",
    ".skpv::after{content:''; position:absolute; top:10px; left:10px; width:16px; height:16px; border-radius:50%; background:radial-gradient(circle at 35% 30%,#bfe9ff,#3b8fd6 55%,#1b5a9c); box-shadow:0 0 0 2px rgba(255,255,255,.6);}",
    /* aperçus de carte (même rendu que le profil, version compacte) */
    ".card{position:relative; overflow:hidden; width:100%; border-radius:12px; padding:8px; color:#fff; border:2px solid var(--frame);",
    "  background:var(--bg, linear-gradient(150deg, color-mix(in srgb, var(--accent) 55%, #1a1411), #1a1411 85%));}",
    ".abx{display:flex; align-items:center; gap:8px;} .who{min-width:0; flex:1;}",
    ".avatar{width:44px; height:44px; flex-shrink:0; border-radius:50%; display:flex; align-items:center; justify-content:center; overflow:hidden; font-size:20px;",
    "  background:radial-gradient(circle at 50% 40%, rgba(255,154,46,.28), transparent 70%), #1a0f06; border:3px solid #070d08; box-shadow:0 0 0 2px var(--frame);}",
    ".who .nm{font-family:'Baloo 2',sans-serif; font-weight:800; font-size:14px; line-height:1.1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}",
    ".who .ttl{font-weight:800; font-size:10px; margin-top:1px; color:#FFC93C; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}",
    /* effets visuels */
    ".fx{position:absolute; pointer-events:none; font-size:20px; z-index:5; animation:fx 1.1s ease-out forwards;}",
    "@keyframes fx{from{transform:translate(0,0) scale(.6); opacity:1;}to{transform:translate(var(--dx),var(--dy)) rotate(40deg) scale(1.1); opacity:0;}}",
    "@media (prefers-reduced-motion:reduce){*{animation-duration:.001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important;}}"
  ].join("\n");

  var HTML = [
    '<div class="device">',
    '  <div class="top"><span class="lens"></span><span class="brand">HALLOWEEN</span><span class="wallet" id="wallet" title="Tes bonbons"></span><button type="button" class="themebtn" id="themeBtn" aria-label="Mode sombre">🌙</button></div>',
    '  <div class="seg" role="tablist"><button type="button" class="on" id="segHome">🍬 Bonbons</button><button type="button" id="segShop">🛍️ Boutique</button></div>',
    '  <div id="secHome">',
    '  <section class="panel hero">',
    '    <div class="pump" aria-hidden="true">🎃</div>',
    '    <h2>Fête d\'Halloween</h2>',
    '    <p class="sub" id="evSub"></p>',
    '    <div class="bigc" id="bigCandy"></div>',
    '    <div class="clock" id="clock"></div>',
    '  </section>',
    '  <section class="panel">',
    '    <h2>🍬 Gagner des bonbons</h2>',
    '    <p class="sub">Joue en Devinette : chaque partie te rapporte des bonbons.</p>',
    '    <div class="earn" id="earn"></div>',
    '    <div class="bar"><i id="capBar"></i></div>',
    '    <p class="hint2" id="capTxt"></p>',
    '  </section>',
    '  <section class="panel">',
    '    <div class="head"><h2>📅 Connexion quotidienne</h2><span class="count" id="logCount"></span></div>',
    '    <p class="sub" id="logSub"></p>',
    '    <div class="cal" id="cal"></div>',
    '    <button type="button" class="btn" id="logClaim"></button>',
    '    <div class="msg" id="logMsg" role="status"></div>',
    '  </section>',
    '  </div>',
    '  <div id="secShop" class="hidden">',
    '  <section class="panel">',
    '    <h2>🛍️ Boutique exclusive</h2>',
    '    <p class="sub" id="shopSub"></p>',
    '    <div class="chips" id="chips"></div>',
    '    <div class="msg" id="shopMsg" role="status"></div>',
    '  </section>',
    '  <div id="shopBody"></div>',
    '  </div>',
    '</div>'
  ].join("\n");

  var mounted = false;
  window.HalloweenTab = {
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
    var H = window.PokeHalloween, P = window.PokeProfile, PP = window.PokePass;
    var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var filter = "all", lastDay = "";
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    function clock(ms) {
      var s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400);
      return (d ? d + " j " : "") + pad(Math.floor(s / 3600) % 24) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
    }
    function say(id, text, kind) { var m = $(id); m.textContent = text || ""; m.className = "msg" + (kind ? " " + kind : ""); }
    function ping(text, kind, icon) { if (window.toast) window.toast(text, { kind: kind || "ok", icon: icon || "🎃" }); }

    if (!H) {
      $("secHome").textContent = "";
      var err = el("section", "panel"); err.appendChild(el("p", "sub", "Le module Halloween n'est pas chargé. Vérifie que halloween.js est bien à côté de index.html, puis redéploie."));
      $("secHome").appendChild(err); return;
    }

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

    // ---- Onglets internes ----
    function seg(which) {
      var shop = which === "shop";
      $("secHome").classList.toggle("hidden", shop); $("secShop").classList.toggle("hidden", !shop);
      $("segHome").classList.toggle("on", !shop); $("segShop").classList.toggle("on", shop);
      if (shop) renderShop();
    }
    $("segHome").addEventListener("click", function () { seg("home"); });
    $("segShop").addEventListener("click", function () { seg("shop"); });

    // ---- Pluie de bonbons ----
    function burst(from) {
      if (reduced) return;
      var dev = root.querySelector(".device"), r = from.getBoundingClientRect(), d = dev.getBoundingClientRect(), icons = ["🍬", "🎃", "🦇", "🍭"];
      for (var i = 0; i < 14; i++) {
        var s = el("span", "fx", icons[i % icons.length]);
        s.style.left = (r.left - d.left + r.width / 2) + "px"; s.style.top = (r.top - d.top) + "px";
        s.style.setProperty("--dx", (Math.random() * 180 - 90) + "px"); s.style.setProperty("--dy", (-60 - Math.random() * 100) + "px");
        s.style.animationDelay = (Math.random() * 0.15) + "s";
        dev.appendChild(s);
        (function (n) { setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 1500); })(s);
      }
    }

    // ---- Accueil ----
    function renderWallet() { $("wallet").textContent = H.format(); }
    function renderHome() {
      var on = H.active(), R = H.rates, ps = H.playState();
      renderWallet();
      $("bigCandy").textContent = H.format();
      $("evSub").textContent = on ? "Du 17 au 31 octobre : gagne des bonbons et échange-les contre des récompenses exclusives."
        : H.started() ? "L'événement est terminé. Tes récompenses restent à toi pour toujours !" : "L'événement n'a pas encore commencé.";
      var earn = $("earn"); earn.textContent = "";
      [["🎯", "Manche de Devinette terminée", "+" + R.round + " 🍬"], ["🔴", "Pokémon trouvé en Devinette", "+" + R.found + " 🍬"], ["📅", "Connexion quotidienne", "jusqu'à +" + Math.max.apply(null, H.login.state().days.map(function (d) { return d.reward; })) + " 🍬"]].forEach(function (r) {
        var row = el("div", "erow"); row.appendChild(el("span", "ei", r[0])); row.appendChild(el("span", "et", r[1])); row.appendChild(el("span", "ev", r[2])); earn.appendChild(row);
      });
      $("capBar").style.width = Math.min(100, Math.round(100 * ps.used / ps.cap)) + "%";
      $("capTxt").textContent = ps.left > 0 ? "Aujourd'hui : " + ps.used + " / " + ps.cap + " 🍬 gagnés en jouant (la connexion quotidienne ne compte pas dans cette limite)."
        : "Limite du jour atteinte (" + ps.cap + " 🍬). Reviens demain, et n'oublie pas ta récompense de connexion !";
      renderLogin();
    }
    function renderLogin() {
      var st = H.login.state(), cal = $("cal"); cal.textContent = "";
      $("logCount").textContent = st.got + " / " + st.total + " 🍬";
      st.days.forEach(function (d) {
        var c = el("div", "cd " + d.status + (d.big ? " big" : ""));
        c.appendChild(el("small", "", d.month)); c.appendChild(el("b", "", String(d.date))); c.appendChild(el("span", "rw", "+" + d.reward + "🍬"));
        c.title = d.status === "claimed" ? "Récupéré" : d.status === "missed" ? "Raté" : d.status === "today" ? "Aujourd'hui" : "À venir";
        cal.appendChild(c);
      });
      var b = $("logClaim");
      if (st.canClaim) { b.disabled = false; b.textContent = "🎁 Récupérer +" + st.days[st.today].reward + " 🍬"; }
      else { b.disabled = true; b.textContent = H.active() ? "✅ Récupéré aujourd'hui" : "Événement terminé"; }
      $("logSub").textContent = H.active() ? "Une récompense par jour, jusqu'au 31 octobre. Un jour raté ne se rattrape pas, et la nuit d'Halloween rapporte le plus gros lot !" : "Merci d'avoir joué !";
    }
    $("logClaim").addEventListener("click", function () {
      var r = H.login.claim();
      if (!r) { say("logMsg", "Rien à récupérer pour l'instant.", "ko"); return; }
      say("logMsg", "+" + r.candies + " 🍬 (jour " + r.day + ") !", "ok");
      burst($("logClaim"));
    });

    // ---- Boutique ----
    var BG_KEY = { bgs: "bg", titles: "title", frameStyles: "f", shapes: "h", effects: "e", nameFonts: "nf", nameColors: "nc" };
    function preview(it) {
      var box = el("div", "pvbox");
      if (it.kind === "skin") { var sk = el("div", "skpv"); sk.style.background = it.css; box.appendChild(sk); return box; }
      if (!P) return box;
      var base = P.get() || {}, c = { f: 0, h: 0, e: 0, nf: 0, nc: 0 }, bg = 0, title = 0, k = BG_KEY[it.list];
      if (k === "bg") bg = it.idx; else if (k === "title") title = it.idx; else c[k] = it.idx;
      var card = el("div", "card");
      card.style.setProperty("--frame", P.frame(base.color || 0));
      card.style.setProperty("--accent", "#D99A12");
      card.style.setProperty("--bg", ((P.bgs[bg] || P.bgs[0]).css));
      var row = el("div", "abx"); card.appendChild(row);
      var av = el("div", "avatar", "🎃"); row.appendChild(av);
      var who = el("div", "who"); row.appendChild(who);
      var nm = el("div", "nm"); who.appendChild(nm);
      if (title) who.appendChild(el("div", "ttl", P.titles[title].name));
      P.paint({ card: card, avatar: av, name: nm }, c, base.name || "Dresseur");
      card.classList.add("pv"); // paint() réécrit className : on remet nos classes ensuite
      box.appendChild(card);
      return box;
    }
    function renderChips() {
      var chips = $("chips"); chips.textContent = "";
      [["all", "Tout"], ["skins", "🎨 Skins"], ["profile", "👤 Profil"]].forEach(function (f) {
        var b = el("button", f[0] === filter ? "on" : "", f[1]); b.type = "button";
        b.onclick = function () { filter = f[0]; renderShop(); };
        chips.appendChild(b);
      });
    }
    function goodCard(it) {
      var R = H.rarities[it.rar], cur = H.candies(), on = H.active();
      var g = el("div", "gd" + (it.owned ? " own" : "")); g.style.setProperty("--rc", R.color);
      g.appendChild(preview(it));
      g.appendChild(el("div", "gname", it.name));
      g.appendChild(el("small", "", R.name + " · " + it.catName));
      var b = el("button", "gb"); b.type = "button"; g.appendChild(b);
      if (it.owned) {
        if (H.isEquipped(it)) { b.textContent = "✅ Équipé"; b.disabled = true; }
        else { b.textContent = "✨ Équiper"; b.className = "gb alt"; b.onclick = function () { var r = H.equip(it.key); if (r.ok) { say("shopMsg", "« " + it.name + " » équipé !", "ok"); } else say("shopMsg", r.error, "ko"); }; }
      } else if (!on) { b.textContent = "Boutique fermée"; b.disabled = true; }
      else {
        b.textContent = "🍬 " + it.price;
        if (cur < it.price) { b.disabled = true; b.title = "Il te manque " + (it.price - cur) + " 🍬"; }
        b.onclick = function () {
          var r = H.buy(it.key);
          if (r.ok) { say("shopMsg", r.text + " Tu peux l'équiper juste en dessous.", "ok"); ping(r.text, "win", "🎃"); burst(b); }
          else say("shopMsg", r.error, "ko");
        };
      }
      return g;
    }
    function renderShop() {
      renderWallet(); renderChips();
      $("shopSub").textContent = H.active() ? "Échange tes bonbons contre des objets exclusifs, disponibles uniquement pendant l'événement. Ce que tu achètes reste à toi pour toujours."
        : "La boutique est fermée. Tu peux toujours équiper ce que tu as acheté.";
      var body = $("shopBody"), all = H.catalog(), scroll = window.scrollY; body.textContent = "";
      var groups = [];
      if (filter !== "profile") groups.push(["🎨 Skins du Pokédex", all.filter(function (i) { return i.kind === "skin"; })]);
      if (filter !== "skins") H.cats.forEach(function (c) { groups.push([c[2], all.filter(function (i) { return i.list === c[0]; })]); });
      groups.forEach(function (gr) {
        if (!gr[1].length) return;
        var got = gr[1].filter(function (i) { return i.owned; }).length;
        var sec = el("section", "panel"), head = el("div", "head");
        head.appendChild(el("h2", "", gr[0])); head.appendChild(el("span", "count", got + " / " + gr[1].length)); sec.appendChild(head);
        var grid = el("div", "goods"); sec.appendChild(grid);
        gr[1].sort(function (a, b) { return a.price - b.price; }).forEach(function (it) { grid.appendChild(goodCard(it)); });
        body.appendChild(sec);
      });
      if (!body.firstChild) { var e = el("section", "panel"); e.appendChild(el("p", "sub", "Rien à afficher pour l'instant.")); body.appendChild(e); }
      try { window.scrollTo(0, scroll); } catch (e2) {}
    }

    // ---- Rafraîchissements ----
    function refresh() { renderHome(); if (!$("secShop").classList.contains("hidden")) renderShop(); }
    window.addEventListener("halloweenchange", refresh);
    window.addEventListener("profilechange", function () { if (!$("secShop").classList.contains("hidden")) renderShop(); });
    window.addEventListener("passchange", function () { if (!$("secShop").classList.contains("hidden")) renderShop(); });
    // Compte à rebours chaque seconde (s'arrête de lui-même si l'onglet disparaît) ; nouveau jour → calendrier mis à jour.
    function tickClock() {
      if (!host.isConnected) return;
      var on = H.active();
      $("clock").textContent = on ? "⏳ Fin dans " + clock(H.msLeft()) : "🎃 Événement terminé";
      var day = new Date().toDateString();
      if (day !== lastDay) { lastDay = day; renderHome(); }
    }
    setInterval(tickClock, 1000);
    renderHome(); tickClock();
  }
})();
