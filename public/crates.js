/* crates.js — onglet « Bonus » (sections Crates, Battle Pass et Shop) : une crate gratuite par jour, contenant un objet de personnalisation de profil au hasard
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
    ".device{background:var(--skin-device,linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,0) 22%),linear-gradient(160deg,#E23B30,#cf2f25 55%,#A3231A));",
    "  border:1px solid rgba(0,0,0,.35); border-radius:30px; padding:16px 16px 20px;",
    "  box-shadow:0 30px 60px -15px rgba(0,0,0,.65), inset 0 2px 0 rgba(255,255,255,.35), inset 0 -6px 0 rgba(0,0,0,.18);}",
    ":host(.dark) .device{background:var(--skin-device-dark,linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,0) 22%),linear-gradient(160deg,#a82a21,#8a1f18 55%,#4a0f09));}",
    ".top{display:flex; align-items:center; gap:10px; margin-bottom:12px;}",
    ".lens{width:22px;height:22px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 35% 30%,#bfe9ff,#3b8fd6 55%,#1b5a9c);box-shadow:0 0 0 3px rgba(255,255,255,.55),0 0 14px rgba(120,200,255,.8);}",
    ".brand{font-family:'Silkscreen',monospace; font-size:12px; letter-spacing:.12em; flex:1;}",
    ".wallet{font-family:'Silkscreen',monospace; font-size:12px; color:#FFC93C; background:rgba(0,0,0,.3); padding:6px 11px; border-radius:999px; white-space:nowrap;}",
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
    ".seg{display:flex; gap:6px; margin-bottom:12px; background:rgba(0,0,0,.25); padding:5px; border-radius:16px;}",
    ".seg button{flex:1; min-height:42px; border:0; border-radius:12px; cursor:pointer; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:13px; padding:0 4px; color:#fff; background:transparent;}",
    ".seg button.on{background:var(--gold); color:#221d17; box-shadow:0 3px 0 var(--gold-deep);}",
    ".bar{height:16px; border-radius:99px; background:rgba(0,0,0,.15); overflow:hidden; margin:8px 0 4px;} .bar i{display:block; height:100%; background:linear-gradient(90deg,#ffd96b,var(--gold-deep)); transition:width .4s var(--ease);}",
    ".lvl{font-family:'Baloo 2',sans-serif; font-weight:800; font-size:26px;} .xpt{color:var(--muted); font-weight:800; font-size:13px;}",
    ".skins{display:grid; grid-template-columns:repeat(2,1fr); gap:8px;}",
    ".sk{border:2px solid var(--line); background:var(--card); color:var(--ink); border-radius:14px; padding:10px 8px; cursor:pointer; font:inherit; font-weight:800; font-size:13px; display:flex; flex-direction:column; align-items:center; gap:6px;}",
    ".sk .sw{width:44px; height:44px; border-radius:50%; box-shadow:inset 0 0 0 3px rgba(0,0,0,.2);} .sk.on{border-color:var(--ok); box-shadow:0 0 0 2px var(--ok);} .sk.no{opacity:.5; cursor:default; border-style:dashed;} .sk small{color:var(--muted); font-size:11px;}",
    ".trow{display:flex; align-items:center; gap:10px; background:var(--card); border:2px solid var(--line); border-radius:12px; padding:8px 10px; margin-bottom:6px; font-weight:800; font-size:14px;}",
    ".trow .tn{width:34px; height:34px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-family:'Baloo 2',sans-serif; background:rgba(0,0,0,.1);}",
    ".trow .tl{flex:1; min-width:0;} .trow.lock{opacity:.55;} .trow.can{border-color:var(--gold); box-shadow:0 0 0 2px rgba(255,201,60,.4);} .trow.skin{border-color:#9b6bd6;} .trow.done .tl{text-decoration:line-through; opacity:.7;}",
    ".trow .go{border:0; border-radius:10px; min-height:34px; padding:0 12px; cursor:pointer; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:13px; color:#221d17; background:var(--gold); box-shadow:0 3px 0 var(--gold-deep);}",
    ".trow .st{font-size:18px;}",
    ".shopbig{text-align:center; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:22px; color:var(--gold-deep); margin-top:6px;}",
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
    ".coin{font-size:64px; line-height:1; animation:coin .8s var(--ease) both;} @keyframes coin{from{transform:translateY(14px) scale(.6) rotate(-20deg); opacity:0;}to{transform:none; opacity:1;}}",
    ".rname.money{font-size:34px; color:var(--gold-deep); margin-top:6px;}",
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
    ".dual{display:grid; grid-template-columns:1fr 1fr; gap:6px;}",
    ".dual .dh{font-family:'Baloo 2',sans-serif; font-weight:800; font-size:14px; text-align:center; padding:6px 4px; border-radius:10px; background:rgba(0,0,0,.08);} .dual .dh.p{background:rgba(230,167,0,.22);}",
    ".dual .trow{margin:0; flex-wrap:wrap; gap:6px; padding:6px 8px; font-size:12.5px; line-height:1.25; min-width:0;}",
    ".dual .trow .tn{width:26px; height:26px; font-size:13px;}",
    ".dual .trow .tl{flex:1 1 60px;}",
    ".dual .trow .go{width:100%; min-height:30px; padding:0 6px; font-size:12px;}",
    ".dual .trow .st{margin-left:auto; font-size:16px;}",
    ".seg{flex-wrap:wrap;} .seg button{flex:1 1 30%;}",
    ".mrow{display:flex; flex-direction:column; gap:6px; background:var(--card); border:2px solid var(--line); border-radius:12px; padding:10px; margin-bottom:6px; font-weight:800; font-size:14px;}",
    ".mrow.can{border-color:var(--gold); box-shadow:0 0 0 2px rgba(255,201,60,.4);} .mrow.done{opacity:.6;} .mrow.done .mt span:first-child{text-decoration:line-through;}",
    ".mrow .mt{display:flex; justify-content:space-between; gap:8px;} .mrow .mt span:last-child{color:var(--muted);}",
    ".mrow .mb{height:10px; border-radius:99px; background:rgba(0,0,0,.15); overflow:hidden;} .mrow .mb i{display:block; height:100%; background:linear-gradient(90deg,#ffd96b,var(--gold-deep)); transition:width .4s var(--ease);}",
    ".mrow .mf{display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12.5px; color:var(--muted);}",
    ".mrow .go{border:0; border-radius:10px; min-height:34px; padding:0 12px; cursor:pointer; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:13px; color:#221d17; background:var(--gold); box-shadow:0 3px 0 var(--gold-deep);}",
    ".days{display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin:10px 0 0;}",
    ".sd{border:2px solid var(--line); background:var(--card); border-radius:10px; padding:6px 1px; text-align:center; font-weight:800; font-size:10px; line-height:1.25; min-width:0;} .sd b{display:block; font-family:'Baloo 2',sans-serif; font-size:13px;}",
    ".sd.done{opacity:.5;} .sd.now{border-color:var(--gold); box-shadow:0 0 0 2px rgba(255,201,60,.45);} .sd.big{border-color:#9b6bd6;}",
    ".offers{display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;}",
    ".xi .big{font-family:'Baloo 2',sans-serif; font-size:22px; text-align:center; min-height:26px; line-height:26px;} .xi .pr{font-family:'Baloo 2',sans-serif; font-size:15px; color:var(--gold-deep);} .xi .old{text-decoration:line-through; color:var(--muted); font-size:11px; font-weight:700;}",
    ".xi button:disabled{opacity:.55; cursor:default;} .xi .tag{align-self:flex-start; font-size:10.5px; font-weight:800; color:#fff; background:#2fa84f; border-radius:99px; padding:1px 7px;}",
    ".prem{border:2px solid #E6A700; background:linear-gradient(180deg, rgba(230,167,0,.12), transparent 40%), var(--card);}",
    ".trow.p{border-color:#E6A700;} .trow.p.xl{border-color:#9b6bd6; box-shadow:0 0 0 2px rgba(155,107,214,.35);} .trow .ex{display:block; font-size:11.5px; font-weight:800; color:#9b6bd6; margin-top:2px;}",
    ".exh{margin:16px 0 0; font-family:'Baloo 2',sans-serif; font-size:17px;}",
    ".excl{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; margin-top:8px;}",
    ".xi{border:2px solid var(--line); border-radius:12px; padding:8px; background:var(--card); display:flex; flex-direction:column; gap:4px; font-weight:800; font-size:12.5px;}",
    ".xi.own{border-color:#E6A700;} .xi.no{opacity:.6;} .xi small{color:var(--muted); font-size:11px;}",
    ".xi .pv{height:26px; border-radius:8px; border:1px solid var(--line); background:var(--line);}",
    ".xi button{min-height:34px; border-radius:10px; border:0; cursor:pointer; font:inherit; font-weight:800; font-size:12px; background:var(--gold); color:#221d17;}",
    ".hint2{margin:10px 0 0; color:var(--muted); font-size:12.5px; font-weight:700; line-height:1.35;}",
    "@media (prefers-reduced-motion:reduce){*{animation-duration:.001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important;}}"
  ].join("\n");

  // Crate bleue et blanche (SVG en ligne : pas de dépendance, s'anime comme l'ancien emoji). Ids de dégradé uniques par copie.
  function crateSvg(k) {
    return '<svg viewBox="0 0 100 100" width="92" height="92" style="display:block" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      '<linearGradient id="cb' + k + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5bb2ff"/><stop offset=".55" stop-color="#2f7fd8"/><stop offset="1" stop-color="#1747a0"/></linearGradient>' +
      '<linearGradient id="cl' + k + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfe3fb"/></linearGradient>' +
      '</defs>' +
      '<rect x="14" y="44" width="72" height="44" rx="6" fill="url(#cb' + k + ')" stroke="#123a80" stroke-width="2"/>' +
      '<rect x="44" y="44" width="12" height="44" fill="#fff"/>' +
      '<rect x="19" y="50" width="6" height="32" rx="3" fill="#fff" opacity=".28"/>' +
      '<rect x="9" y="31" width="82" height="17" rx="5" fill="url(#cl' + k + ')" stroke="#123a80" stroke-width="2"/>' +
      '<rect x="44" y="31" width="12" height="17" fill="#2f7fd8"/>' +
      '<ellipse cx="37" cy="23" rx="14" ry="8" transform="rotate(-22 37 23)" fill="#fff" stroke="#123a80" stroke-width="2"/>' +
      '<ellipse cx="63" cy="23" rx="14" ry="8" transform="rotate(22 63 23)" fill="#fff" stroke="#123a80" stroke-width="2"/>' +
      '<circle cx="50" cy="28" r="6.5" fill="#2f7fd8" stroke="#fff" stroke-width="2"/>' +
      '<path d="M71 58l1.6 4.2 4.2 1.6-4.2 1.6L71 69.6l-1.6-4.2-4.2-1.6 4.2-1.6z" fill="#fff" opacity=".9"/>' +
      '</svg>';
  }

  var HTML = [
    '<div class="device">',
    '  <div class="top"><span class="lens"></span><span class="brand">BONUS</span><span class="wallet" id="wallet" title="Tes Pokédollars"></span><button type="button" class="themebtn" id="themeBtn" aria-label="Mode sombre">🌙</button></div>',
    '  <div class="seg" role="tablist"><button type="button" class="on" id="segCrates">🎁 Crates</button><button type="button" id="segPass">🏆 Pass</button><button type="button" id="segQuests">🎯 Missions</button><button type="button" id="segShop">🛒 Shop</button><button type="button" id="segAdmin">🔑 Admin</button></div>',
    '  <div id="secAdmin" class="hidden">',
    '  <section class="panel">',
    '    <h2>🔑 Accès admin</h2>',
    '    <p class="sub">Entre le code admin pour tout débloquer sur cet appareil (objets, paliers, skins, Pokédollars).</p>',
    '    <input id="adminCode" type="password" autocomplete="off" placeholder="Code admin" style="width:100%; min-height:46px; border-radius:12px; border:1px solid var(--line); padding:0 12px; font:inherit; background:var(--card); color:var(--ink);">',
    '    <button type="button" class="btn" id="adminBtn">Déverrouiller</button>',
    '    <div class="msg" id="adminMsg" role="status"></div>',
    '  </section>',
    '  </div>',
    '  <div id="secPass" class="hidden">',
    '  <section class="panel">',
    '    <h2>🏆 Battle Pass</h2>',
    '    <p class="sub" id="passSeason"></p>',
    '    <div class="head"><span class="lvl" id="passLvl"></span><span class="xpt" id="passXp"></span></div>',
    '    <div class="bar"><i id="passBar"></i></div>',
    '    <p class="hint2" id="passHint"></p>',
    '    <p class="hint2 hidden" id="passRecap"></p>',
    '    <button type="button" class="btn" id="claimAll"></button>',
    '    <div class="msg" id="passMsg" role="status"></div>',
    '  </section>',
    '  <section class="panel">',
    '    <h2>🎁 Les 30 paliers</h2>',
    '    <div class="dual" id="tiers"></div>',
    '  </section>',
    '  </div>',
    '  <div id="secQuests" class="hidden">',
    '  <section class="panel">',
    '    <h2>🔥 Série de connexion</h2>',
    '    <div class="head"><span class="lvl" id="stkNum"></span><span class="xpt" id="stkBest"></span></div>',
    '    <p class="sub" id="stkSub"></p>',
    '    <div class="days" id="stkDays"></div>',
    '    <button type="button" class="btn" id="stkClaim"></button>',
    '    <div class="msg" id="stkMsg" role="status"></div>',
    '  </section>',
    '  <section class="panel">',
    '    <h2>📅 Missions du jour</h2>',
    '    <p class="sub" id="dqSub"></p>',
    '    <div id="dq"></div>',
    '  </section>',
    '  <section class="panel">',
    '    <h2>🗓️ Missions de la semaine</h2>',
    '    <p class="sub" id="wqSub"></p>',
    '    <div id="wq"></div>',
    '    <div class="msg" id="qMsg" role="status"></div>',
    '  </section>',
    '  </div>',
    '  <div id="secShop" class="hidden">',
    '  <section class="panel">',
    '    <h2>🛒 Shop</h2>',
    '    <p class="sub">Achète des crates avec tes Pokédollars. Gagne-en en finissant des manches en multijoueur ou en ouvrant des crates.</p>',
    '    <div class="stage"><div class="crate idle" aria-hidden="true">' + crateSvg("s") + '</div></div>',
    '    <div class="shopbig" id="shopPrice"></div>',
    '    <button type="button" class="btn" id="buyBtn"></button>',
    '    <div class="msg" id="shopMsg" role="status"></div>',
    '    <p class="hint2" id="shopStock"></p>',
    '  </section>',
    '  <section class="panel">',
    '    <h2>✨ Offres du jour</h2>',
    '    <p class="sub" id="offDSub"></p>',
    '    <div class="offers" id="offD"></div>',
    '    <h3 class="exh">🗓️ Offres de la semaine</h3>',
    '    <p class="sub" id="offWSub"></p>',
    '    <div class="offers" id="offW"></div>',
    '    <div class="msg" id="offMsg" role="status"></div>',
    '  </section>',
    '  <section class="panel prem">',
    '    <h2>👑 Pass Premium</h2>',
    '    <p class="sub" id="premSub"></p>',
    '    <button type="button" class="btn" id="premBuy"></button>',
    '    <div class="msg" id="premMsg" role="status"></div>',
    '  </section>',
    '  </div>',
    '  <div id="secCrates">',
    '  <section class="panel">',
    '    <h2>🎁 Crate du jour</h2>',
    '    <p class="sub">Une crate gratuite chaque jour. Elle contient au hasard un objet pour personnaliser ta carte (fond, titre, cadre, effet…) ou des Pokédollars.</p>',
    '    <div class="stage"><div class="crate idle" id="crate" aria-hidden="true">' + crateSvg("c") + '</div></div>',
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
    '    <p class="sub">Chaque objet et chaque gain a une rareté : plus elle est haute, plus c\'est rare.</p>',
    '    <div class="odds" id="odds"></div>',
    '    <p class="hint2">Tu ne tires jamais deux fois le même objet. Si une rareté est épuisée, ses chances sont redistribuées. Une fois tous les objets obtenus, chaque crate donne des Pokédollars.</p>',
    '  </section>',
    '  </div>',
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
    function renderWallet() { $("wallet").textContent = window.PokeMoney ? window.PokeMoney.format() : ""; }

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

    function showMoney(m) {
      var rv = $("reveal"), R = C.rarities[m.rar];
      rv.textContent = ""; rv.className = "reveal r" + m.rar;
      var pill = el("div", "rpill", "Pokédollars · " + R.name); pill.style.background = R.color; rv.appendChild(pill);
      rv.appendChild(el("div", "coin", "💰"));
      rv.appendChild(el("div", "rname money", "+" + window.PokeMoney.format(m.amount)));
      rv.appendChild(el("div", "rcat", "Ton solde : " + window.PokeMoney.format()));
      var close = el("button", "btn alt", "Fermer"); close.type = "button"; close.onclick = function () { rv.className = "reveal hidden"; rv.textContent = ""; }; rv.appendChild(close);
      rv.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    }

    // ---- Bouton principal : ouvrir / compte à rebours ----
    function refreshMain() {
      var s = C.state(), all = C.items(), btn = $("openBtn"), crate = $("crate");
      if (busy) return;
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
        else if (res.money) showMoney(res.money);
        else showReveal(res.item, true);
        renderCollection(); refreshMain();
      }, reduced ? 0 : 950);
    });

    // ---- Collection ----
    function renderCollection() {
      var s = C.state(), all = C.items(), body = $("collBody"); body.textContent = "";
      $("collCount").textContent = (all.length && s.ownedCount >= all.length ? "🏆 " : "") + s.ownedCount + " / " + all.length;
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
      function row(color, text, right) { var d = el("div", "orow"), dot = el("i"); dot.style.background = color; d.appendChild(dot); d.appendChild(document.createTextNode(text)); d.appendChild(el("span", "", right)); box.appendChild(d); }
      var mp = Math.round(100 * C.moneyRate);
      box.appendChild(el("h3", "", "Contenu d'une crate"));
      row("#3a86d6", "🎨 Objet de style", (100 - mp) + " %");
      row("#E6A700", "💰 Pokédollars", mp + " %");
      box.appendChild(el("h3", "", "Rareté"));
      C.rarities.forEach(function (r) { row(r.color, r.name, Math.round(100 * r.w / total) + " %"); });
      box.appendChild(el("h3", "", "Gains en Pokédollars"));
      C.rarities.forEach(function (r, i) { row(r.color, r.name, window.PokeMoney.format(C.moneyRanges[i][0]).replace(" ₽", "") + " – " + window.PokeMoney.format(C.moneyRanges[i][1])); });
    }

    // ---- Shop ----
    function renderShop() {
      var money = window.PokeMoney.get(), s = C.state(), full = s.stock >= 99;
      $("shopPrice").textContent = "1 crate = " + window.PokeMoney.format(C.price);
      var b = $("buyBtn");
      b.disabled = full || money < C.price;
      b.textContent = full ? "Stock plein" : money < C.price ? "🔒 Il te manque " + window.PokeMoney.format(C.price - money) : "🛒 Acheter une crate";
      $("shopStock").textContent = "Crates en stock : " + s.stock + ". Ouvre-les dans la section Crates.";
      renderPremium();
      renderOffers();
    }
    $("buyBtn").addEventListener("click", function () {
      var m = $("shopMsg");
      if (C.buy()) { m.textContent = "Crate achetée ! Elle t'attend dans la section Crates."; m.className = "msg ok"; }
      else { m.textContent = "Achat impossible."; m.className = "msg ko"; }
      renderShop(); refreshMain();
    });
    // ---- Battle Pass ----
    var PP = window.PokePass;
    function rewardText(t) {
      if (t.skin) return "🎨 Skin Pokédex « " + PP.skins[t.skin].name + " »";
      if (t.money) return "💰 " + window.PokeMoney.format(t.money);
      return "🎁 " + t.crates + " crate" + (t.crates > 1 ? "s" : "");
    }
    function renderPass() {
      var st = PP.state(), n = PP.claimable();
      $("passLvl").textContent = "Palier " + st.level + " / " + PP.maxTier;
      $("passXp").textContent = st.level >= PP.maxTier ? "MAX" : st.into + " / " + PP.xpTier + " XP";
      $("passBar").style.width = Math.round(100 * st.into / PP.xpTier) + "%";
      $("passHint").textContent = "+" + PP.xpRound + " XP par manche multijoueur terminée, +" + PP.xpCrate + " XP par crate ouverte." + (st.premium ? "" : " 👑 Le Pass Premium s'achète dans l'onglet Shop.") + " Les skins du Pokédex se choisissent dans ton profil.";
      renderSeason();
      renderPremium();
      var ca = $("claimAll"); ca.disabled = n === 0; ca.textContent = n ? "🎁 Tout récupérer (" + n + ")" : "Rien à récupérer";
      renderTiers(st);
    }
    // Les deux pistes côte à côte : gratuit à gauche, premium à droite, une ligne par palier.
    function renderTiers(st) {
      var list = $("tiers"); list.textContent = "";
      list.appendChild(el("div", "dh", "🎁 Gratuit")); list.appendChild(el("div", "dh p", "👑 Premium"));
      var free = PP.tiers(), prem = PP.premiumTiers();
      free.forEach(function (t, i) {
        var done = !!st.claimed[t.tier], can = PP.canClaim(t.tier);
        var r = el("div", "trow" + (t.skin ? " skin" : "") + (done ? " done" : can ? " can" : " lock"));
        r.appendChild(el("span", "tn", String(t.tier))); r.appendChild(el("span", "tl", rewardText(t)));
        if (can) { var g = el("button", "go", "Récupérer"); g.type = "button"; g.onclick = function () { claimOne(t.tier); }; r.appendChild(g); }
        else r.appendChild(el("span", "st", done ? "✅" : "🔒"));
        list.appendChild(r);
        var q = prem[i];
        if (!q) { list.appendChild(el("div")); return; }
        var pd = !!st.pclaimed[q.tier], pc = PP.canClaimPremium(q.tier);
        var pr = el("div", "trow p" + (q.items.length ? " xl" : "") + (pd ? " done" : pc ? " can" : " lock"));
        pr.appendChild(el("span", "tn", String(q.tier)));
        var tl = el("span", "tl", premText(q));
        if (q.items.length) tl.appendChild(el("span", "ex", "✨ " + q.items.map(function (x) { return x.name; }).join(", ")));
        pr.appendChild(tl);
        if (pc) { var pg = el("button", "go", "Récupérer"); pg.type = "button"; pg.onclick = function () { claimPrem(q.tier); }; pr.appendChild(pg); }
        else pr.appendChild(el("span", "st", pd ? "✅" : st.premium ? "🔒" : "👑"));
        list.appendChild(pr);
      });
    }
    function premText(t) {
      var a = [];
      if (t.money) a.push("💰 " + window.PokeMoney.format(t.money));
      if (t.crates) a.push("🎁 " + t.crates + " crate" + (t.crates > 1 ? "s" : ""));
      return a.join(" + ");
    }
    function renderPremium() {
      var st = PP.state(), prem = st.premium, price = PP.premiumPrice, money = window.PokeMoney.get();
      $("premSub").textContent = prem ? "Pass Premium actif pour cette saison : une 2e piste de récompenses est débloquée." : "Débloque pour la saison en cours une 2e piste de récompenses (Pokédollars + crates) et 3 packs de personnalisations de profil exclusives, à toi pour toujours. À racheter à chaque nouvelle saison, pour " + window.PokeMoney.format(price) + ".";
      var b = $("premBuy");
      b.classList.toggle("hidden", prem); b.disabled = !prem && money < price;
      b.textContent = money < price ? "👑 Acheter le Pass Premium — " + window.PokeMoney.format(price) + " (solde insuffisant)" : "👑 Acheter le Pass Premium — " + window.PokeMoney.format(price);
    }
    function claimPrem(t) {
      var o = PP.claimPremium(t), m = $("passMsg");
      if (o) { m.textContent = "Récompense premium récupérée !" + (o.items.length ? " Nouveaux éléments de profil débloqués : " + o.items.map(function (i) { return i.name; }).join(", ") + "." : ""); m.className = "msg ok"; }
      else { m.textContent = "Impossible : ton stock de crates est plein (99). Ouvre-en quelques-unes."; m.className = "msg ko"; }
    }
    $("premBuy").addEventListener("click", function () {
      var m = $("premMsg");
      if (PP.buyPremium()) { m.textContent = "Pass Premium acheté ! Récupère tes récompenses."; m.className = "msg ok"; }
      else { m.textContent = "Solde insuffisant : il te faut " + window.PokeMoney.format(PP.premiumPrice) + "."; m.className = "msg ko"; }
    });
    function claimOne(t) {
      var o = PP.claim(t), m = $("passMsg");
      if (o) { m.textContent = o.dup ? "Skin déjà possédé : tu reçois " + window.PokeMoney.format(500) + " à la place." : "Récompense récupérée !"; m.className = "msg ok"; }
      else { m.textContent = "Impossible : ton stock de crates est plein (99). Ouvre-en quelques-unes."; m.className = "msg ko"; }
    }
    $("claimAll").addEventListener("click", function () {
      var before = PP.claimable(), o = PP.claimAll(), m = $("passMsg");
      var left = PP.claimable();
      if (left > 0) { m.textContent = "Récupéré, sauf " + left + " palier(s) : stock de crates plein (99)."; m.className = "msg ko"; }
      else if (before) { m.textContent = "Tout est récupéré : +" + window.PokeMoney.format(o.money) + ", " + o.crates + " crate(s)" + (o.skins ? ", " + o.skins + " skin(s)" : "") + (o.items ? ", " + o.items + " élément(s) de profil exclusif(s)" : "") + "."; m.className = "msg ok"; }
    });
    window.addEventListener("moneychange", function () { renderPass(); });
    window.addEventListener("profilechange", function () { renderPass(); });
    window.addEventListener("passchange", function () { renderPass(); renderShop(); refreshMain(); });

    // ---- Saison du Battle Pass ----
    function daysLeft(ms) { return ms < 86400000 ? "moins d'un jour" : Math.ceil(ms / 86400000) + " jours"; }
    function renderSeason() {
      var se = PP.season();
      $("passSeason").textContent = se.icon + " Saison " + se.n + " · " + se.name + " — fin dans " + daysLeft(se.msLeft) + ". À la fin, tes récompenses non récupérées sont créditées automatiquement ; la progression et le Pass Premium repartent de zéro, tes skins et personnalisations sont conservés.";
      var rc = $("passRecap");
      if (se.last && se.last.n) { rc.classList.remove("hidden"); rc.textContent = "Saison " + se.last.n + " terminée : palier " + se.last.level + " atteint" + (se.last.money || se.last.crates ? " · récompenses créditées : " + window.PokeMoney.format(se.last.money) + " + " + se.last.crates + " crate" + (se.last.crates > 1 ? "s" : "") : "") + "."; }
      else rc.classList.add("hidden");
    }

    // ---- Missions & série de connexion ----
    var Q = window.PokeQuests, SH = window.PokeShop;
    function fmt(v) { return window.PokeMoney.format(v); }
    function rewardLabel(r) { return (r.m ? r.m : "") + (r.c ? " +🎁" + (r.c > 1 ? "×" + r.c : "") : "") + (r.xp ? " +⚡" : ""); }
    function renderStreak() {
      var st = Q.streak.state();
      $("stkNum").textContent = "🔥 " + st.streak + " jour" + (st.streak > 1 ? "s" : "");
      $("stkBest").textContent = "Record : " + st.best;
      $("stkSub").textContent = "Reviens chaque jour pour récupérer un bonus. Si tu rates un jour, la série repart de zéro. Le cycle dure 7 jours.";
      var box = $("stkDays"); box.textContent = "";
      st.rewards.forEach(function (r, i) {
        var d = i + 1, done = d < st.day || (d === st.day && st.claimedToday);
        var c = el("div", "sd" + (done ? " done" : "") + (d === st.day ? " now" : "") + (r.c ? " big" : ""));
        c.appendChild(el("b", "", "J" + d)); c.appendChild(document.createTextNode(rewardLabel(r)));
        box.appendChild(c);
      });
      var b = $("stkClaim");
      b.disabled = !st.canClaim;
      b.textContent = st.canClaim ? "🎁 Récupérer le bonus du jour" : st.claimedToday ? "✅ Bonus du jour récupéré, reviens demain" : "Reviens demain";
    }
    function questRow(q, kind) {
      var r = el("div", "mrow" + (q.claimed ? " done" : q.done ? " can" : ""));
      var t = el("div", "mt"); t.appendChild(el("span", "", q.text)); t.appendChild(el("span", "", q.progress + " / " + q.target)); r.appendChild(t);
      var bar = el("div", "mb"), i = document.createElement("i"); i.style.width = Math.round(100 * q.progress / q.target) + "%"; bar.appendChild(i); r.appendChild(bar);
      var f = el("div", "mf"); f.appendChild(el("span", "", "💰 " + fmt(q.money) + " · ⚡ " + q.xp + " XP"));
      if (q.claimed) f.appendChild(el("span", "", "✅"));
      else if (q.done) { var g = el("button", "go", "Récupérer"); g.type = "button"; g.onclick = function () { claimQuest(kind, q.id); }; f.appendChild(g); }
      else f.appendChild(el("span", "", "🔒"));
      r.appendChild(f);
      return r;
    }
    function renderQuests() {
      if (!Q) return;
      renderStreak();
      var st = Q.state();
      [["dq", st.daily, "daily"], ["wq", st.weekly, "weekly"]].forEach(function (x) {
        var box = $(x[0]); box.textContent = "";
        x[1].forEach(function (q) { box.appendChild(questRow(q, x[2])); });
      });
      renderQuestTimers(st);
    }
    function renderQuestTimers(st) {
      if (!Q) return; st = st || Q.state();
      $("dqSub").textContent = "Nouvelles missions dans " + clock(st.msDaily) + ".";
      $("wqSub").textContent = "Nouvelles missions dans " + daysLeft(st.msWeekly) + ". Plus gros gains que les missions du jour.";
    }
    function claimQuest(kind, id) {
      var o = Q.claim(kind, id), m = $("qMsg");
      if (o) { m.textContent = "Mission récupérée : +" + fmt(o.money) + " et +" + o.xp + " XP !"; m.className = "msg ok"; }
    }
    $("stkClaim").addEventListener("click", function () {
      var o = Q.streak.claim(), m = $("stkMsg");
      if (!o) return;
      if (o.error) { m.textContent = "Ton stock de crates est plein (99) : ouvre-en quelques-unes puis réessaie."; m.className = "msg ko"; return; }
      m.textContent = "Bonus du jour : +" + fmt(o.m) + (o.c ? " · +" + o.c + " crate" + (o.c > 1 ? "s" : "") : "") + (o.xp ? " · +" + o.xp + " XP" : "") + " !"; m.className = "msg ok";
    });

    // ---- Offres rotatives du shop ----
    function offerCard(o, money) {
      var c = el("div", "xi" + (o.bought || o.owned ? " no" : ""));
      if (o.rarity) c.style.borderColor = o.rarity.color;
      var pv;
      if (o.kind === "item") { if (o.css) { pv = el("div", "pv"); pv.style.background = o.css; } else pv = el("div", "big", o.e || "🎨"); }
      else if (o.kind === "crates") pv = el("div", "big", "🎁 ×" + o.n);
      else pv = el("div", "big", "⚡ +" + o.xp);
      c.appendChild(pv); c.appendChild(document.createTextNode(o.name));
      if (o.kind === "item") c.appendChild(el("small", "", o.catName + (o.rarity ? " · " + o.rarity.name : "")));
      var pr = el("div", "pr", fmt(o.price)); if (o.base > o.price) pr.appendChild(el("span", "old", " " + fmt(o.base)));
      c.appendChild(pr);
      if (o.base > o.price) c.appendChild(el("span", "tag", "-" + Math.round(100 * (1 - o.price / o.base)) + " %"));
      var b = el("button", "", o.bought ? "✅ Acheté" : o.owned ? "Déjà possédé" : money < o.price ? "🔒 Solde insuffisant" : "Acheter"); b.type = "button";
      b.disabled = o.bought || o.owned || money < o.price;
      b.onclick = function () {
        var r = SH.buy(o.id), m = $("offMsg");
        if (r.ok) { m.textContent = r.text; m.className = "msg ok"; } else { m.textContent = r.error; m.className = "msg ko"; }
      };
      c.appendChild(b);
      return c;
    }
    function renderOffers() {
      if (!SH) return;
      var st = SH.state(), money = window.PokeMoney.get();
      [["offD", st.daily], ["offW", st.weekly]].forEach(function (x) {
        var box = $(x[0]); box.textContent = "";
        x[1].forEach(function (o) { box.appendChild(offerCard(o, money)); });
      });
      renderOfferTimers(st);
    }
    function renderOfferTimers(st) {
      if (!SH) return; st = st || SH.state();
      $("offDSub").textContent = "Change dans " + clock(st.msDaily) + ". Un seul achat par offre.";
      $("offWSub").textContent = "Change dans " + daysLeft(st.msWeekly) + ".";
    }

    function showSec(which) {
      var shop = which === "shop", pass = which === "pass", adm = which === "admin", qs = which === "quests";
      $("secAdmin").classList.toggle("hidden", !adm); $("segAdmin").classList.toggle("on", adm);
      $("secShop").classList.toggle("hidden", !shop); $("secPass").classList.toggle("hidden", !pass); $("secQuests").classList.toggle("hidden", !qs);
      $("secCrates").classList.toggle("hidden", shop || pass || adm || qs);
      $("segShop").classList.toggle("on", shop); $("segPass").classList.toggle("on", pass); $("segQuests").classList.toggle("on", qs);
      $("segCrates").classList.toggle("on", !shop && !pass && !adm && !qs);
      if (shop) { $("shopMsg").textContent = ""; $("offMsg").textContent = ""; renderShop(); }
      if (pass) { $("passMsg").textContent = ""; renderPass(); }
      if (qs) { $("qMsg").textContent = ""; $("stkMsg").textContent = ""; renderQuests(); }
    }
    $("segQuests").addEventListener("click", function () { showSec("quests"); });
    $("segCrates").addEventListener("click", function () { showSec("crates"); });
    $("segPass").addEventListener("click", function () { showSec("pass"); });
    $("segShop").addEventListener("click", function () { showSec("shop"); });
    $("segAdmin").addEventListener("click", function () { showSec("admin"); });
    window.addEventListener("moneychange", renderShop);
    window.addEventListener("cratechange", renderShop);
    window.addEventListener("shopchange", renderShop);
    window.addEventListener("questchange", function () { renderQuests(); });

    // ---- Admin : le code est vérifié côté serveur (variable ADMIN_CODE) ----
    $("adminBtn").addEventListener("click", function () {
      var code = $("adminCode").value, m = $("adminMsg"), b = $("adminBtn");
      if (!code) return;
      b.disabled = true; m.textContent = "Vérification…"; m.className = "msg";
      fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "admin", code: code }) })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          if (d && d.ok && window.PokeAdmin) { window.PokeAdmin.unlockAll(); $("adminCode").value = ""; m.textContent = "Mode admin activé : tout est débloqué."; m.className = "msg ok"; }
          else { m.textContent = "Code incorrect."; m.className = "msg ko"; }
        })
        .catch(function () { m.textContent = "Serveur injoignable."; m.className = "msg ko"; })
        .then(function () { b.disabled = false; });
    });

    // ---- Démarrage : crédite la crate du jour, puis tic-tac jusqu'à minuit ----
    C.sync();
    if (PP.sync) PP.sync(); // fin de saison éventuelle
    renderWallet(); window.addEventListener("moneychange", renderWallet);
    renderOdds(); renderCollection(); refreshMain(); renderShop(); renderPass(); renderQuests();
    var timer = setInterval(function () {
      if (!host.isConnected) { clearInterval(timer); return; }
      if (document.hidden || busy) return;
      if (C.state().stock === 0 && C.available()) C.sync(); // minuit est passé : nouvelle crate
      refreshMain();
      if (!$("secQuests").classList.contains("hidden")) renderQuestTimers();
      if (!$("secShop").classList.contains("hidden")) renderOfferTimers();
    }, 1000);
    window.addEventListener("cratechange", function () { if (!busy) { renderCollection(); refreshMain(); } });
  }
})();
