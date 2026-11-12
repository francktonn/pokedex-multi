/* players.js — onglet « Joueurs » : la liste de tous les amis qui ont déjà ouvert le site.
   Chaque fiche est envoyée au serveur par enhance.js (window.PokePlayersSync) ; ici on se contente de la lire et de l'afficher.
   Un clic sur un joueur ouvre son profil complet (window.PokeCard). Vit dans son propre Shadow DOM. */
(function () {
  "use strict";
  var API = "/api/players";
  var SESSION_KEY = "players_session";
  var REFRESH_MS = 30000;
  var ONLINE_MS = 2 * 60 * 1000;

  var S = { list: null, now: Date.now(), sort: "recent", error: "", loading: false, root: null, wrap: null, host: null, timer: null };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function mySession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null") || {}; } catch (e) { return {}; } }
  function hasProfile() { return !!(window.PokeProfile && window.PokeProfile.get && window.PokeProfile.get()); }

  var CSS = [
    ":host{all:initial;display:block;font-family:'Nunito',system-ui,sans-serif;color:#1d1d1f;}",
    ".wrap{max-width:560px;margin:0 auto;padding:14px 12px 40px;}",
    ".card{background:#fff;border-radius:20px;padding:16px;box-shadow:0 6px 24px rgba(0,0,0,.12);margin-bottom:12px;}",
    ":host(.dark) .card{background:#252a36;color:#f2f3f7;}",
    ".head{display:flex;align-items:center;gap:8px;} .head h2{margin:0;flex:1;font-size:22px;font-weight:900;}",
    "p.sub{margin:6px 0 0;font-size:13.5px;line-height:1.45;opacity:.75;font-weight:700;}",
    ".btn{border:0;border-radius:12px;padding:8px 12px;font:900 13px 'Nunito',sans-serif;cursor:pointer;background:#e9ebf1;color:#1d1d1f;}",
    ":host(.dark) .btn{background:#3a4152;color:#f2f3f7;} .btn:active{transform:scale(.96);} .btn[disabled]{opacity:.5;}",
    ".seg{display:flex;gap:4px;margin-top:12px;padding:4px;border-radius:12px;background:rgba(127,127,127,.14);}",
    ".seg button{flex:1;border:0;border-radius:9px;padding:8px 4px;font:900 12.5px 'Nunito',sans-serif;cursor:pointer;background:transparent;color:inherit;opacity:.7;}",
    ".seg button.on{background:var(--red,#e23b30);color:#fff;opacity:1;}",
    ".list{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px;}",
    ".p{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:14px;background:rgba(127,127,127,.12);cursor:pointer;border:2px solid transparent;text-align:left;width:100%;font:inherit;color:inherit;}",
    ".p:hover{border-color:var(--red,#e23b30);} .p:active{transform:scale(.99);} .p.me{border-color:rgba(60,181,74,.55);}",
    ".rk{width:22px;flex:none;text-align:center;font:900 13px 'Nunito',sans-serif;opacity:.6;}",
    ".av{width:46px;height:46px;border-radius:50%;border:3px solid #bbb;background:#fff;object-fit:contain;image-rendering:pixelated;flex:none;}",
    ".info{flex:1;min-width:0;} .nm{font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".st{font-size:12px;font-weight:700;opacity:.7;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".me-tag{font-size:11px;font-weight:800;opacity:.65;margin-left:6px;}",
    ".when{flex:none;font-size:11.5px;font-weight:800;opacity:.65;text-align:right;display:flex;align-items:center;gap:5px;}",
    ".dot{width:9px;height:9px;border-radius:50%;background:#3cb54a;} .dot.off{display:none;}",
    ".err{color:#d12a20;font-weight:800;font-size:13px;margin-top:10px;}",
    ".empty{margin:14px 0 4px;text-align:center;font-weight:800;opacity:.7;line-height:1.5;}"
  ].join("\n");

  function ago(ms) {
    var d = Math.max(0, S.now - ms);
    if (d < ONLINE_MS) return "en ligne";
    var m = Math.floor(d / 60000); if (m < 60) return "il y a " + m + " min";
    var h = Math.floor(m / 60); if (h < 24) return "il y a " + h + " h";
    var j = Math.floor(h / 24); return "il y a " + j + " j";
  }
  function stats(p) {
    var x = p.card && p.card.x, f = x ? x.gf : 0, m = x ? x.gm : 0;
    return { found: f || 0, missed: m || 0, total: (f || 0) + (m || 0), pct: (f || 0) + (m || 0) ? Math.round(100 * f / (f + m)) : -1 };
  }

  function sorted() {
    var a = (S.list || []).slice();
    if (S.sort === "found") a.sort(function (p, q) { return stats(q).found - stats(p).found || q.seen - p.seen; });
    else if (S.sort === "acc") a.sort(function (p, q) { return stats(q).pct - stats(p).pct || stats(q).total - stats(p).total; });
    else a.sort(function (p, q) { return q.seen - p.seen; });
    return a;
  }

  function row(p, i) {
    var me = mySession().pub === p.id;
    var b = el("button", "p" + (me ? " me" : "")); b.type = "button";
    if (S.sort !== "recent") b.appendChild(el("span", "rk", String(i + 1)));
    var av = el("img", "av"); av.alt = ""; av.draggable = false;
    if (p.avatar && window.PokeProfile) {
      av.src = window.PokeProfile.sprite(p.avatar, p.card && p.card.s);
      if (p.card) { av.style.borderColor = window.PokeProfile.frame(p.card.c); if (p.card.s === 2) av.style.imageRendering = "auto"; }
    } else av.style.visibility = "hidden";
    b.appendChild(av);
    var info = el("div", "info"); b.appendChild(info);
    var nm = el("div", "nm", p.name); if (me) nm.appendChild(el("span", "me-tag", "toi")); info.appendChild(nm);
    var s = stats(p);
    info.appendChild(el("div", "st", s.total ? "🔴 " + s.found + " devinés · " + s.pct + " % de précision" : "Pas encore de statistiques"));
    var w = el("div", "when"); w.appendChild(el("span", "dot" + (S.now - p.seen < ONLINE_MS ? "" : " off"))); w.appendChild(el("span", "", ago(p.seen))); b.appendChild(w);
    b.onclick = function () { try { window.PokeCard.show({ name: p.name, avatar: p.avatar, card: p.card, me: me }); } catch (e) {} };
    return b;
  }

  function render() {
    if (!S.wrap) return;
    var w = S.wrap; w.textContent = "";
    var c = el("div", "card"); w.appendChild(c);
    var head = el("div", "head"); c.appendChild(head);
    head.appendChild(el("h2", "", "🧑‍🤝‍🧑 Joueurs" + (S.list ? " (" + S.list.length + ")" : "")));
    var rf = el("button", "btn", S.loading ? "…" : "🔄"); rf.type = "button"; rf.title = "Actualiser"; rf.setAttribute("aria-label", "Actualiser la liste"); rf.disabled = S.loading; rf.onclick = function () { refresh(true); };
    head.appendChild(rf);
    c.appendChild(el("p", "sub", "Tous les amis qui ont déjà ouvert le site. Touche un joueur pour voir son profil."));

    var seg = el("div", "seg"); c.appendChild(seg);
    [["recent", "🕒 Récents"], ["found", "🔴 Devinés"], ["acc", "🎯 Précision"]].forEach(function (o) {
      var b = el("button", S.sort === o[0] ? "on" : "", o[1]); b.type = "button";
      b.onclick = function () { S.sort = o[0]; render(); };
      seg.appendChild(b);
    });

    if (S.error) c.appendChild(el("div", "err", S.error));
    if (!S.list) { if (!S.error) c.appendChild(el("div", "empty", "Chargement…")); return; }
    if (!hasProfile()) c.appendChild(el("p", "sub", "💡 Crée ton profil dans l'onglet Profil pour apparaître dans cette liste."));
    if (!S.list.length) { c.appendChild(el("div", "empty", "Personne pour l'instant. Les joueurs apparaissent ici dès qu'ils ouvrent le site avec un profil.")); return; }
    var ul = el("ul", "list"); c.appendChild(ul);
    sorted().forEach(function (p, i) { var li = el("li"); li.appendChild(row(p, i)); ul.appendChild(li); });
  }

  function refresh(manual) {
    if (S.loading) return Promise.resolve();
    S.loading = true; if (manual) render();
    var sync = window.PokePlayersSync ? window.PokePlayersSync() : Promise.resolve();
    return Promise.resolve(sync).catch(function () {}).then(function () { return fetch(API, { cache: "no-store" }); })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "Erreur " + r.status); return j; }); })
      .then(function (j) { S.list = j.players || []; S.now = j.now || Date.now(); S.error = ""; })
      .catch(function (e) { S.error = "Impossible de charger la liste : " + (e && e.message ? e.message : "erreur réseau"); })
      .then(function () { S.loading = false; render(); });
  }

  var mounted = false;
  function mount(host) {
    if (mounted) return; mounted = true;
    var root = host.attachShadow ? (host.shadowRoot || host.attachShadow({ mode: "open" })) : host;
    var style = el("style"); style.textContent = CSS; root.appendChild(style);
    var wrap = el("div", "wrap"); root.appendChild(wrap);
    S.root = root; S.wrap = wrap; S.host = host;
    function syncTheme() { host.classList.toggle("dark", document.documentElement.getAttribute("data-theme") === "dark"); }
    new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    syncTheme();
    render(); refresh(false);
    // Actualisation douce tant que l'onglet est visible.
    S.timer = setInterval(function () { if (!document.hidden && host.offsetParent !== null) refresh(false); }, REFRESH_MS);
    // Un clic sur l'onglet Joueurs rafraîchit aussi la liste.
    var tab = document.getElementById("tabPlayers");
    if (tab) tab.addEventListener("click", function () { refresh(false); });
  }
  window.PlayersTab = { mount: mount };
})();
