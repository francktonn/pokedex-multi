/* admin.js — onglet « 🛠️ Créateur » : tableau de bord pour personnaliser le site depuis le site lui-même.
   • Bloc-note : ajouter / renommer / masquer / supprimer / réordonner les onglets et les cases.
   • Pokémon : modifier nom, types, génération, taille/poids, stats, talents et famille d'évolution.
   Les changements sont enregistrés sur le serveur (api/admin.js) et s'appliquent à tous les joueurs.
   Accès protégé par le code secret ADMIN_CODE ; le jeton de session est gardé dans ce navigateur (admin_token). */
(function () {
  "use strict";
  var API = "/api/admin", TOKEN_KEY = "admin_token";
  var STAT_LABELS = [["hp", "PV"], ["attack", "Attaque"], ["defense", "Défense"], ["special-attack", "Atq. Spé."], ["special-defense", "Déf. Spé."], ["speed", "Vitesse"]];

  var S = { token: null, view: "boot", tab: "notepad", msg: null, busy: false,
    np: null, npDirty: false, open: {}, newCat: "", newItem: {},
    names: null, pk: { q: "", sel: null, loading: false, form: null, famQ: "", err: "" } };
  var host, wrap, root;

  // ---------- utilitaires ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(label, cls, onclick, title) {
    var b = el("button", "btn " + (cls || ""), label); b.type = "button";
    if (title) { b.title = title; b.setAttribute("aria-label", title); }
    b.onclick = onclick; return b;
  }
  function fold(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function rid(n) { return Math.random().toString(36).slice(2, 2 + n); }
  function cfg() { return (window.SiteConfig && window.SiteConfig.get()) || { notepad: null, pokemon: {} }; }
  function scrollKeep(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }
  function say(kind, text) { S.msg = text ? { kind: kind, text: text } : null; }
  function typeFr() { return (window.PokeData && window.PokeData.typeFr) || {}; }

  function api(body) {
    var payload = Object.assign({}, body, { token: S.token });
    return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && body.action !== "login") { logout("Session expirée : reconnecte-toi."); throw new Error(j.error || "Session expirée"); }
        if (!r.ok) throw new Error(j.error || "Erreur " + r.status);
        return j;
      }); });
  }
  function logout(message) {
    S.token = null; S.view = "login"; S.np = null; S.npDirty = false;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent("adminchange")); } catch (e) {}
    say(message ? "err" : "", message || ""); render();
  }
  function afterSave() { return window.SiteConfig ? window.SiteConfig.refresh(true) : Promise.resolve(); }

  // ---------- styles ----------
  var CSS = [
    ":host{all:initial;display:block;font-family:'Nunito',system-ui,sans-serif;color:#1d1d1f;}",
    "*{box-sizing:border-box;} .wrap{max-width:640px;margin:0 auto;padding:12px 10px 60px;}",
    ".card{background:#fff;border-radius:18px;padding:14px;box-shadow:0 6px 24px rgba(0,0,0,.12);margin-bottom:12px;}",
    ":host(.dark) .card{background:#252a36;color:#f2f3f7;}",
    "h2{margin:0;font-size:20px;font-weight:900;} h3{margin:0 0 8px;font-size:15px;font-weight:900;} p.sub{margin:6px 0 0;font-size:13px;line-height:1.45;opacity:.75;font-weight:700;}",
    ".head{display:flex;align-items:center;gap:8px;} .head h2{flex:1;}",
    ".btn{border:0;border-radius:10px;padding:8px 11px;font:900 13px 'Nunito',sans-serif;cursor:pointer;background:#e9ebf1;color:#1d1d1f;touch-action:manipulation;}",
    ":host(.dark) .btn{background:#3a4152;color:#f2f3f7;} .btn:active{transform:scale(.96);} .btn[disabled]{opacity:.45;cursor:default;}",
    ".btn.pri{background:var(--red,#e23b30);color:#fff;} .btn.ok{background:#2e7d32;color:#fff;} .btn.warn{background:#c62828;color:#fff;} .btn.sm{padding:6px 9px;min-width:34px;}",
    ".seg{display:flex;gap:4px;margin:12px 0 0;padding:4px;border-radius:12px;background:rgba(127,127,127,.14);}",
    ".seg button{flex:1;border:0;border-radius:9px;padding:9px 4px;font:900 13px 'Nunito',sans-serif;cursor:pointer;background:transparent;color:inherit;opacity:.7;}",
    ".seg button.on{background:var(--red,#e23b30);color:#fff;opacity:1;}",
    "input[type=text],input[type=password],input[type=number],select{width:100%;min-width:0;border-radius:10px;border:1px solid rgba(127,127,127,.4);padding:8px 10px;font:700 14px 'Nunito',sans-serif;background:rgba(127,127,127,.08);color:inherit;}",
    "input:focus,select:focus{outline:2px solid var(--gold,#ffc93c);outline-offset:1px;}",
    ".row{display:flex;align-items:center;gap:6px;margin:6px 0;} .row>input,.row>select{flex:1;}",
    ".msg{margin:10px 0 0;padding:9px 11px;border-radius:10px;font-weight:800;font-size:13px;} .msg.err{background:rgba(198,40,40,.15);color:#c62828;} .msg.ok{background:rgba(46,125,50,.16);color:#2e7d32;}",
    ".bar{position:sticky;top:0;z-index:4;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:10px;margin:0 0 12px;border-radius:14px;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25);}",
    ":host(.dark) .bar{background:#252a36;color:#f2f3f7;}",
    ".bar .dirty{flex:1;min-width:120px;font-weight:800;font-size:12.5px;opacity:.85;}",
    ".cat{border-radius:14px;background:rgba(127,127,127,.12);padding:8px;margin:8px 0;} .cat.off{opacity:.55;}",
    ".cat .ch{display:flex;align-items:center;gap:6px;} .cat .cn{flex:1;font-weight:900;}",
    ".cat .ch2{display:flex;align-items:center;gap:5px;margin-top:6px;} .cat .ch2 .cnt{flex:1;padding-left:4px;}",
    ".cnt{font-size:11.5px;font-weight:800;opacity:.65;white-space:nowrap;}",
    ".items{margin:6px 0 0;padding:6px 0 0 6px;border-left:3px solid rgba(127,127,127,.3);}",
    ".it{display:flex;align-items:center;gap:5px;margin:5px 0;} .it.off{opacity:.5;} .it input{flex:1;}",
    ".tag{font-size:10.5px;font-weight:800;opacity:.6;white-space:nowrap;}",
    ".res{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;} .res .btn{font-weight:800;}",
    ".grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;} .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}",
    "label.f{display:block;font-size:11.5px;font-weight:900;opacity:.7;margin:8px 0 3px;text-transform:uppercase;letter-spacing:.03em;}",
    ".orig{font-size:11px;font-weight:700;opacity:.55;margin-top:2px;}",
    ".pkh{display:flex;align-items:center;gap:10px;} .pkh img{width:64px;height:64px;object-fit:contain;}",
    ".fam{display:flex;align-items:center;gap:5px;margin:5px 0;padding:5px 8px;border-radius:10px;background:rgba(127,127,127,.12);font-weight:800;} .fam .n{flex:1;}",
    ".chk{display:flex;align-items:center;gap:8px;margin:8px 0;font-weight:800;font-size:13px;} .chk input{width:20px;height:20px;flex:none;}",
    ".ov{display:flex;align-items:center;gap:6px;padding:7px 0;border-top:1px solid rgba(127,127,127,.25);} .ov .t{flex:1;min-width:0;font-weight:800;font-size:13px;} .ov .s{font-size:11.5px;opacity:.65;font-weight:700;}",
    ".empty{opacity:.65;font-weight:800;text-align:center;margin:12px 0;}"
  ].join("\n");

  // ============================================================
  //  Connexion
  // ============================================================
  function loginView(box) {
    var c = el("div", "card"); box.appendChild(c);
    c.appendChild(el("h2", "", "🛠️ Espace créateur"));
    c.appendChild(el("p", "sub", "Saisis le code créateur pour modifier le bloc-note et les infos des Pokémon."));
    var inp = el("input"); inp.type = "password"; inp.placeholder = "Code créateur"; inp.autocomplete = "current-password"; inp.style.marginTop = "12px";
    c.appendChild(inp);
    var go = btn("Se connecter", "pri", function () {
      var code = inp.value; if (!code) return;
      go.disabled = true; say("", "");
      api({ action: "login", code: code }).then(function (j) {
        S.token = j.token; try { localStorage.setItem(TOKEN_KEY, j.token); } catch (e) {}
        try { window.dispatchEvent(new CustomEvent("adminchange")); } catch (e) {}
        S.view = "main"; say("", ""); render();
      }).catch(function (e) { go.disabled = false; say("err", e.message); render(); });
    });
    go.style.marginTop = "10px"; go.style.width = "100%";
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
    c.appendChild(go);
    if (S.msg) c.appendChild(el("div", "msg " + S.msg.kind, S.msg.text));
  }

  // ============================================================
  //  Bloc-note
  // ============================================================
  function buildSnapshot() {
    var base = window.PokeNotepadBase ? window.PokeNotepadBase() : [];
    var np = cfg().notepad, out = [], seen = {}, bMap = {};
    base.forEach(function (b) { bMap[b.key] = b; });
    function fromBase(b) {
      return { key: b.key, label: b.label, origLabel: b.label, custom: false, hidden: false,
        items: b.items.map(function (i) { return { id: i.id, label: i.label, origLabel: i.label, custom: false, hidden: false }; }) };
    }
    if (np && Array.isArray(np.categories)) {
      np.categories.forEach(function (sc) {
        if (!sc || !sc.key) return;
        if (sc.custom) {
          out.push({ key: sc.key, label: sc.label || "", custom: true, hidden: !!sc.hidden,
            items: (sc.items || []).map(function (i) { return { id: i.id, label: i.label || "", custom: true, hidden: !!i.hidden }; }) });
          return;
        }
        var b = bMap[sc.key]; if (!b) return;
        seen[sc.key] = true;
        var cat = fromBase(b); cat.label = sc.label || b.label; cat.hidden = !!sc.hidden;
        var iMap = {}, order = [], seenI = {};
        cat.items.forEach(function (i) { iMap[i.id] = i; });
        (sc.items || []).forEach(function (si) {
          if (!si) return;
          if (si.custom) { order.push({ id: si.id, label: si.label || "", custom: true, hidden: !!si.hidden }); return; }
          var bi = iMap[si.id]; if (!bi) return;
          seenI[si.id] = true; bi.label = si.label || bi.origLabel; bi.hidden = !!si.hidden; order.push(bi);
        });
        cat.items.forEach(function (i) { if (!seenI[i.id]) order.push(i); });
        cat.items = order; out.push(cat);
      });
    }
    base.forEach(function (b) { if (!seen[b.key]) out.push(fromBase(b)); });
    return out;
  }
  function snapshotPayload() {
    var empty = null;
    var cats = S.np.map(function (c) {
      if (c.custom && !c.label.trim()) empty = "Un onglet n'a pas de nom.";
      return { key: c.key, label: (c.custom || c.label !== c.origLabel) ? c.label : "", custom: c.custom, hidden: c.hidden,
        items: c.items.map(function (i) {
          if (i.custom && !i.label.trim()) empty = "Une case n'a pas de nom (onglet « " + c.label + " »).";
          return { id: i.id, label: (i.custom || i.label !== i.origLabel) ? i.label : "", custom: i.custom, hidden: i.hidden };
        }) };
    });
    return empty ? { error: empty } : { value: { categories: cats } };
  }
  function move(arr, i, d) { var j = i + d; if (j < 0 || j >= arr.length) return; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; S.npDirty = true; }
  function dirty() { S.npDirty = true; var b = root && root.getElementById("npPublish"); if (b) b.disabled = false; var d = root && root.getElementById("npDirty"); if (d) d.textContent = "● Modifications non publiées"; }

  function notepadView(box) {
    if (!S.np) { S.np = buildSnapshot(); S.npDirty = false; }
    var bar = el("div", "bar"); box.appendChild(bar);
    var pub = btn("📣 Publier pour tous", "pri", publishNotepad); pub.id = "npPublish"; pub.disabled = !S.npDirty; bar.appendChild(pub);
    var dt = el("span", "dirty", S.npDirty ? "● Modifications non publiées" : "À jour"); dt.id = "npDirty"; bar.appendChild(dt);
    bar.appendChild(btn("↩︎ Annuler", "", function () { S.np = null; scrollKeep(render); }, "Annuler les modifications non publiées"));
    bar.appendChild(btn("♻️ Par défaut", "warn", resetNotepad, "Rétablir le bloc-note d'origine"));
    if (S.msg) box.appendChild(el("div", "msg " + S.msg.kind, S.msg.text));

    var add = el("div", "card"); box.appendChild(add);
    add.appendChild(el("h3", "", "➕ Nouvel onglet"));
    var row = el("div", "row"); add.appendChild(row);
    var ni = el("input"); ni.type = "text"; ni.placeholder = "Nom de l'onglet (ex. Habitat)"; ni.maxLength = 30; ni.value = S.newCat;
    ni.oninput = function () { S.newCat = ni.value; };
    var addCat = function () {
      var n = ni.value.trim(); if (!n) return;
      S.np.push({ key: "c_" + rid(8), label: n, custom: true, hidden: false, items: [] }); S.open[S.np[S.np.length - 1].key] = true; S.newCat = ""; S.npDirty = true; say("", ""); scrollKeep(render);
    };
    ni.addEventListener("keydown", function (e) { if (e.key === "Enter") addCat(); });
    row.appendChild(ni); row.appendChild(btn("Ajouter", "ok", addCat));

    var listCard = el("div", "card"); box.appendChild(listCard);
    listCard.appendChild(el("h3", "", "Onglets du bloc-note (" + S.np.length + ")"));
    S.np.forEach(function (c, ci) { listCard.appendChild(catCard(c, ci)); });
  }

  function catCard(c, ci) {
    var card = el("div", "cat" + (c.hidden ? " off" : ""));
    var h = el("div", "ch"); card.appendChild(h);
    var open = !!S.open[c.key];
    h.appendChild(btn(open ? "▾" : "▸", "sm", function () { S.open[c.key] = !open; scrollKeep(render); }, open ? "Replier" : "Déplier"));
    var name = el("input", "cn"); name.type = "text"; name.value = c.label; name.maxLength = 30; name.setAttribute("aria-label", "Nom de l'onglet");
    name.oninput = function () { c.label = name.value; dirty(); };
    name.onchange = function () { if (!c.custom && !name.value.trim()) { c.label = c.origLabel; name.value = c.label; } };
    h.appendChild(name);
    var h2 = el("div", "ch2"); card.appendChild(h2);
    h2.appendChild(el("span", "cnt", c.items.filter(function (i) { return !i.hidden; }).length + " cases" + (c.hidden ? " · masqué" : "")));
    h2.appendChild(btn("↑", "sm", function () { move(S.np, ci, -1); scrollKeep(render); }, "Monter l'onglet"));
    h2.appendChild(btn("↓", "sm", function () { move(S.np, ci, 1); scrollKeep(render); }, "Descendre l'onglet"));
    h2.appendChild(btn(c.hidden ? "🙈" : "👁", "sm", function () { c.hidden = !c.hidden; S.npDirty = true; scrollKeep(render); }, c.hidden ? "Onglet masqué : afficher" : "Masquer l'onglet"));
    if (c.custom) h2.appendChild(btn("🗑", "sm warn", function () {
      if (!confirm("Supprimer l'onglet « " + c.label + " » et ses cases ?")) return;
      S.np.splice(ci, 1); S.npDirty = true; scrollKeep(render);
    }, "Supprimer l'onglet"));
    if (!open) return card;

    var list = el("div", "items"); card.appendChild(list);
    if (!c.items.length) list.appendChild(el("div", "empty", "Aucune case. Ajoute-en une ci-dessous."));
    c.items.forEach(function (it, ii) {
      var r = el("div", "it" + (it.hidden ? " off" : "")); list.appendChild(r);
      r.appendChild(btn("↑", "sm", function () { move(c.items, ii, -1); scrollKeep(render); }, "Monter la case"));
      r.appendChild(btn("↓", "sm", function () { move(c.items, ii, 1); scrollKeep(render); }, "Descendre la case"));
      var inp = el("input"); inp.type = "text"; inp.value = it.label; inp.maxLength = 40; inp.setAttribute("aria-label", "Nom de la case");
      if (!it.custom && it.origLabel !== it.label) inp.title = "Nom d'origine : " + it.origLabel;
      inp.oninput = function () { it.label = inp.value; dirty(); };
      inp.onchange = function () { if (!it.custom && !inp.value.trim()) { it.label = it.origLabel; inp.value = it.label; } };
      r.appendChild(inp);
      if (!it.custom) r.appendChild(el("span", "tag", "d'origine"));
      r.appendChild(btn(it.hidden ? "🙈" : "👁", "sm", function () { it.hidden = !it.hidden; S.npDirty = true; scrollKeep(render); }, it.hidden ? "Case masquée : afficher" : "Masquer la case"));
      if (it.custom) r.appendChild(btn("🗑", "sm warn", function () { c.items.splice(ii, 1); S.npDirty = true; scrollKeep(render); }, "Supprimer la case"));
    });
    var ar = el("div", "row"); list.appendChild(ar);
    var ai = el("input"); ai.type = "text"; ai.placeholder = "Nouvelle case…"; ai.maxLength = 40; ai.value = S.newItem[c.key] || "";
    ai.oninput = function () { S.newItem[c.key] = ai.value; };
    var addItem = function () {
      var n = ai.value.trim(); if (!n) return;
      c.items.push({ id: "x:" + rid(8), label: n, custom: true, hidden: false }); S.newItem[c.key] = ""; S.npDirty = true; say("", ""); scrollKeep(render);
    };
    ai.addEventListener("keydown", function (e) { if (e.key === "Enter") addItem(); });
    ar.appendChild(ai); ar.appendChild(btn("＋ Case", "ok", addItem));
    return card;
  }

  function publishNotepad() {
    var p = snapshotPayload(); if (p.error) { say("err", p.error); scrollKeep(render); return; }
    S.busy = true;
    api({ action: "save_notepad", notepad: p.value }).then(afterSave).then(function () {
      S.npDirty = false; S.np = null; say("ok", "✅ Bloc-note publié : tous les joueurs verront les changements.");
    }).catch(function (e) { say("err", "Échec : " + e.message); }).then(function () { S.busy = false; scrollKeep(render); });
  }
  function resetNotepad() {
    if (!confirm("Rétablir le bloc-note d'origine ? Tes onglets et cases personnalisés seront supprimés pour tout le monde.")) return;
    api({ action: "save_notepad", notepad: null }).then(afterSave).then(function () {
      S.np = null; S.npDirty = false; say("ok", "♻️ Bloc-note rétabli par défaut.");
    }).catch(function (e) { say("err", "Échec : " + e.message); }).then(function () { scrollKeep(render); });
  }

  // ============================================================
  //  Pokémon
  // ============================================================
  function loadNames() {
    if (S.names) return Promise.resolve();
    return fetch("/api/whois?action=names").then(function (r) { return r.json(); })
      .then(function (j) { S.names = Array.isArray(j.byId) ? j.byId : []; }).catch(function () { S.names = []; });
  }
  function search(q) {
    q = fold(q.trim()); if (!q) return [];
    var out = [], n = S.names || [];
    if (/^\d+$/.test(q)) { var id = Number(q); if (id >= 1 && id <= 1025) out.push({ id: id, name: n[id - 1] || "n°" + id }); return out; }
    for (var i = 0; i < n.length && out.length < 10; i++) if (fold(n[i]).indexOf(q) >= 0) out.push({ id: i + 1, name: n[i] });
    return out;
  }
  function sprite(id) { return "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/" + id + ".png"; }
  function officialFamily(raw) {
    var ids = [];
    ((raw.evolution && raw.evolution.ancestors) || []).forEach(function (a) { ids.push(a.id); });
    ids.push(raw.id);
    ((raw.evolution && raw.evolution.descendants) || []).forEach(function (d) { if (ids.indexOf(d.id) < 0) ids.push(d.id); });
    return ids.slice(0, 6);
  }

  function selectPokemon(id) {
    S.pk.loading = true; S.pk.err = ""; S.pk.sel = null; S.pk.form = null; render();
    Promise.all([window.PokeData.load(id, { raw: true }), window.PokeData.load(id), loadNames()]).then(function (res) {
      var raw = res[0], eff = res[1], tech = raw.pokemonId, ov = cfg().pokemon[String(tech)] || {};
      var stats = {}; eff.stats.forEach(function (s) { stats[s.name] = s.value; });
      var fam = (ov.family && ov.family.length) ? ov.family.slice() : officialFamily(raw);
      S.pk.sel = { raw: raw, tech: tech };
      S.pk.form = {
        name: ov.name || "", t1: eff.types[0] || "", t2: eff.types[1] || "", gen: String(eff.generation || ""),
        h: eff.heightM, w: eff.weightKg, stats: stats,
        abil: (eff.abilities || []).slice(0, 3).map(function (a) { return { name: a.name, hidden: !!a.hidden }; }),
        fam: fam, applyAll: true
      };
      while (S.pk.form.abil.length < 3) S.pk.form.abil.push({ name: "", hidden: false });
      S.pk.loading = false; render();
    }).catch(function (e) { S.pk.loading = false; S.pk.err = "Impossible de charger ce Pokémon : " + e.message; render(); });
  }

  function famName(id) { return (S.names && S.names[id - 1]) || "n°" + id; }

  function pokemonView(box) {
    var c = el("div", "card"); box.appendChild(c);
    c.appendChild(el("h3", "", "🔎 Choisir un Pokémon"));
    var row = el("div", "row"); c.appendChild(row);
    var q = el("input"); q.type = "text"; q.placeholder = "Nom ou numéro (ex. Dracaufeu, 6)"; q.value = S.pk.q;
    var res = el("div", "res");
    function showRes() {
      res.textContent = "";
      search(q.value).forEach(function (r) {
        res.appendChild(btn("n°" + r.id + " " + r.name, "", function () { S.pk.q = ""; selectPokemon(r.id); }));
      });
    }
    q.oninput = function () { S.pk.q = q.value; showRes(); };
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") { var r = search(q.value)[0]; if (r) { S.pk.q = ""; selectPokemon(r.id); } } });
    row.appendChild(q); c.appendChild(res);
    if (!S.names) { loadNames().then(function () { showRes(); }); }
    showRes();
    if (S.msg) c.appendChild(el("div", "msg " + S.msg.kind, S.msg.text));
    if (S.pk.err) c.appendChild(el("div", "msg err", S.pk.err));
    if (S.pk.loading) c.appendChild(el("div", "empty", "Chargement…"));

    if (S.pk.sel && S.pk.form) box.appendChild(editorCard());
    box.appendChild(overridesCard());
  }

  function field(label, node, orig) {
    var w = el("div"); w.appendChild(el("label", "f", label)); w.appendChild(node);
    if (orig != null) w.appendChild(el("div", "orig", "Origine : " + orig));
    return w;
  }
  function selectOf(options, value, onchange) {
    var s = el("select");
    options.forEach(function (o) { var op = el("option", "", o[1]); op.value = o[0]; if (o[0] === value) op.selected = true; s.appendChild(op); });
    s.onchange = function () { onchange(s.value); }; return s;
  }

  function editorCard() {
    var raw = S.pk.sel.raw, f = S.pk.form, card = el("div", "card");
    var h = el("div", "pkh"); card.appendChild(h);
    var im = el("img"); im.alt = ""; im.src = sprite(raw.pokemonId); h.appendChild(im);
    var t = el("div"); h.appendChild(t);
    t.appendChild(el("h2", "", raw.displayName + "  ·  n°" + raw.id));
    t.appendChild(el("p", "sub", raw.form && raw.form.label ? raw.form.label : ""));
    if (raw.forms && raw.forms.length) {
      var fr = el("div", "res"); fr.appendChild(el("span", "tag", "Autres formes :"));
      raw.forms.forEach(function (x) { fr.appendChild(btn(x.label, "sm", function () { selectPokemon(x.id); })); });
      card.appendChild(fr);
    }
    var tFR = typeFr(), typeOpts = Object.keys(tFR).map(function (k) { return [k, tFR[k]]; });

    var nm = el("input"); nm.type = "text"; nm.maxLength = 40; nm.placeholder = raw.displayName; nm.value = f.name; nm.oninput = function () { f.name = nm.value; };
    card.appendChild(field("Nom affiché", nm, raw.displayName));

    var g = el("div", "grid2"); card.appendChild(g);
    g.appendChild(field("Type 1", selectOf(typeOpts, f.t1, function (v) { f.t1 = v; }), tFR[raw.types[0]]));
    g.appendChild(field("Type 2", selectOf([["", "— aucun —"]].concat(typeOpts), f.t2, function (v) { f.t2 = v; }), raw.types[1] ? tFR[raw.types[1]] : "aucun"));

    var g2 = el("div", "grid3"); card.appendChild(g2);
    g2.appendChild(field("Génération", selectOf([1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return [String(n), String(n)]; }), f.gen, function (v) { f.gen = v; }), raw.generation));
    var hi = el("input"); hi.type = "number"; hi.step = "0.1"; hi.min = "0.1"; hi.value = f.h; hi.oninput = function () { f.h = hi.value; };
    g2.appendChild(field("Taille (m)", hi, raw.heightM));
    var wi = el("input"); wi.type = "number"; wi.step = "0.1"; wi.min = "0.1"; wi.value = f.w; wi.oninput = function () { f.w = wi.value; };
    g2.appendChild(field("Poids (kg)", wi, raw.weightKg));

    card.appendChild(el("label", "f", "Statistiques de base"));
    var sg = el("div", "grid3"); card.appendChild(sg);
    var rawStats = {}; raw.stats.forEach(function (s) { rawStats[s.name] = s.value; });
    STAT_LABELS.forEach(function (sl) {
      var si = el("input"); si.type = "number"; si.min = "1"; si.max = "999"; si.value = f.stats[sl[0]]; si.oninput = function () { f.stats[sl[0]] = si.value; };
      sg.appendChild(field(sl[1], si, rawStats[sl[0]]));
    });

    card.appendChild(el("label", "f", "Talents (3 maximum, laisse vide pour retirer)"));
    f.abil.forEach(function (a) {
      var r = el("div", "row"); card.appendChild(r);
      var ai = el("input"); ai.type = "text"; ai.maxLength = 40; ai.placeholder = "Nom du talent"; ai.value = a.name; ai.oninput = function () { a.name = ai.value; };
      var hc = el("input"); hc.type = "checkbox"; hc.checked = a.hidden; hc.style.cssText = "width:20px;height:20px;flex:none"; hc.onchange = function () { a.hidden = hc.checked; };
      var hl = el("span", "tag", "caché");
      r.appendChild(ai); r.appendChild(hc); r.appendChild(hl);
    });
    card.appendChild(el("div", "orig", "Origine : " + window.PokeData.formatAbilities(raw.abilities)));

    // ----- Famille d'évolution -----
    card.appendChild(el("label", "f", "Famille d'évolution (dans l'ordre : base → dernière évolution)"));
    f.fam.forEach(function (id, i) {
      var r = el("div", "fam"); card.appendChild(r);
      var img = el("img"); img.alt = ""; img.src = sprite(id); img.style.cssText = "width:34px;height:34px;object-fit:contain;image-rendering:pixelated"; r.appendChild(img);
      r.appendChild(el("span", "n", famName(id) + (id === raw.id ? "  (celui-ci)" : "")));
      r.appendChild(btn("↑", "sm", function () { move2(f.fam, i, -1); scrollKeep(render); }));
      r.appendChild(btn("↓", "sm", function () { move2(f.fam, i, 1); scrollKeep(render); }));
      r.appendChild(btn("✕", "sm warn", function () { f.fam.splice(i, 1); scrollKeep(render); }, "Retirer de la famille"));
    });
    var fq = el("input"); fq.type = "text"; fq.placeholder = "Ajouter un Pokémon à la famille (nom ou n°)"; fq.value = S.pk.famQ;
    var fres = el("div", "res");
    function showF() {
      fres.textContent = "";
      search(fq.value).slice(0, 6).forEach(function (r) {
        if (f.fam.indexOf(r.id) >= 0 || f.fam.length >= 6) return;
        fres.appendChild(btn("＋ " + r.name, "", function () { f.fam.push(r.id); S.pk.famQ = ""; scrollKeep(render); }));
      });
    }
    fq.oninput = function () { S.pk.famQ = fq.value; showF(); };
    card.appendChild(fq); card.appendChild(fres); showF();
    card.appendChild(btn("↺ Remettre la famille officielle", "", function () { f.fam = officialFamily(raw); scrollKeep(render); }));
    var ck = el("label", "chk"); var cb = el("input"); cb.type = "checkbox"; cb.checked = f.applyAll; cb.onchange = function () { f.applyAll = cb.checked; };
    ck.appendChild(cb); ck.appendChild(el("span", "", "Appliquer cette famille aux autres membres aussi")); card.appendChild(ck);
    card.appendChild(el("div", "orig", "La taille de la famille et la place de chacun découlent de cette liste."));

    var act = el("div", "row"); act.style.marginTop = "14px"; card.appendChild(act);
    var sv = btn("💾 Enregistrer pour tous", "pri", savePokemon); act.appendChild(sv);
    act.appendChild(btn("🗑 Retirer mes modifications", "warn", clearPokemon));
    return card;
  }
  function move2(arr, i, d) { var j = i + d; if (j < 0 || j >= arr.length) return; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }

  function sameList(a, b) { return a.length === b.length && a.every(function (v, i) { return v === b[i]; }); }
  function diffFromRaw() {
    var raw = S.pk.sel.raw, f = S.pk.form, d = {};
    if (f.name.trim() && f.name.trim() !== raw.displayName) d.name = f.name.trim();
    var types = [f.t1, f.t2].filter(Boolean);
    if (types.length && !sameList(types, raw.types)) d.types = types;
    if (f.gen && f.gen !== String(raw.generation)) d.generation = Number(f.gen);
    if (f.h !== "" && Number(f.h) !== Number(raw.heightM)) d.heightM = Number(f.h);
    if (f.w !== "" && Number(f.w) !== Number(raw.weightKg)) d.weightKg = Number(f.w);
    var st = {}; raw.stats.forEach(function (s) { var v = f.stats[s.name]; if (v !== "" && v != null && Number(v) !== s.value) st[s.name] = Number(v); });
    if (Object.keys(st).length) d.stats = st;
    var ab = f.abil.filter(function (a) { return a.name.trim(); }).map(function (a) { return { name: a.name.trim(), hidden: !!a.hidden }; });
    var rawAb = (raw.abilities || []).map(function (a) { return { name: a.name, hidden: !!a.hidden }; });
    if (ab.length && JSON.stringify(ab) !== JSON.stringify(rawAb)) d.abilities = ab;
    if (f.fam.length && !sameList(f.fam, officialFamily(raw))) d.family = f.fam.slice();
    return d;
  }

  function savePokemon() {
    var f = S.pk.form, raw = S.pk.sel.raw, d = diffFromRaw();
    if (f.fam.length && f.fam.indexOf(raw.id) < 0) { say("err", "Le Pokémon affiché doit faire partie de sa famille."); scrollKeep(render); return; }
    var entries = [{ id: S.pk.sel.tech, data: Object.keys(d).length ? d : null }];
    // Famille partagée : les autres membres (formes de base) reçoivent la même liste, en gardant leurs autres modifications.
    if (f.applyAll && d.family) {
      f.fam.forEach(function (mid) {
        if (mid === raw.id || mid === S.pk.sel.tech) return;
        var ex = Object.assign({}, cfg().pokemon[String(mid)] || {}); ex.family = d.family.slice();
        entries.push({ id: mid, data: ex });
      });
    }
    api({ action: "save_pokemon", entries: entries.slice(0, 12) }).then(afterSave).then(function () {
      say("ok", "✅ " + raw.displayName + " mis à jour pour tous les joueurs" + (entries.length > 1 ? " (" + (entries.length - 1) + " autre(s) membre(s) de la famille aussi)." : "."));
      return selectPokemon(raw.pokemonId);
    }).catch(function (e) { say("err", "Échec : " + e.message); scrollKeep(render); });
  }
  function clearPokemon() {
    var raw = S.pk.sel.raw;
    api({ action: "save_pokemon", entries: [{ id: S.pk.sel.tech, data: null }] }).then(afterSave).then(function () {
      say("ok", "↺ Modifications de " + raw.displayName + " retirées."); return selectPokemon(raw.pokemonId);
    }).catch(function (e) { say("err", "Échec : " + e.message); scrollKeep(render); });
  }

  function overridesCard() {
    var card = el("div", "card"), ov = cfg().pokemon || {}, ids = Object.keys(ov);
    card.appendChild(el("h3", "", "📋 Pokémon modifiés (" + ids.length + ")"));
    if (!ids.length) { card.appendChild(el("div", "empty", "Aucune modification pour l'instant.")); return card; }
    var LAB = { name: "nom", types: "types", generation: "génération", heightM: "taille", weightKg: "poids", stats: "stats", abilities: "talents", family: "famille" };
    ids.sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (id) {
      var o = ov[id], r = el("div", "ov"); card.appendChild(r);
      var t = el("div", "t"); r.appendChild(t);
      t.appendChild(document.createTextNode("n°" + id + " " + (o.name || (Number(id) <= 1025 ? famName(Number(id)) : "forme"))));
      t.appendChild(el("div", "s", Object.keys(o).map(function (k) { return LAB[k] || k; }).join(", ")));
      r.appendChild(btn("Modifier", "sm", function () { selectPokemon(Number(id)); window.scrollTo(0, 0); }));
      r.appendChild(btn("🗑", "sm warn", function () {
        api({ action: "save_pokemon", entries: [{ id: Number(id), data: null }] }).then(afterSave).then(function () { say("ok", "Modification retirée."); scrollKeep(render); })
          .catch(function (e) { say("err", "Échec : " + e.message); scrollKeep(render); });
      }, "Retirer cette modification"));
    });
    return card;
  }

  // ============================================================
  //  Affichage général
  // ============================================================
  function mainView(box) {
    var head = el("div", "card"); box.appendChild(head);
    var hr = el("div", "head"); head.appendChild(hr);
    hr.appendChild(el("h2", "", "🛠️ Tableau de bord"));
    hr.appendChild(btn("Se déconnecter", "", function () {
      var t = S.token; fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout", token: t }) }).catch(function () {});
      logout("");
    }));
    head.appendChild(el("p", "sub", "Les changements publiés s'appliquent à tous les joueurs, sans republier le site."));
    var seg = el("div", "seg"); head.appendChild(seg);
    [["notepad", "📝 Bloc-note"], ["pokemon", "🔎 Pokémon"]].forEach(function (o) {
      var b = el("button", S.tab === o[0] ? "on" : "", o[1]); b.type = "button";
      b.onclick = function () {
        if (S.tab === "notepad" && S.npDirty && !confirm("Des modifications du bloc-note ne sont pas publiées. Changer d'onglet quand même ? (elles resteront en attente)")) return;
        S.tab = o[0]; say("", ""); render();
      };
      seg.appendChild(b);
    });
    if (S.tab === "notepad") notepadView(box); else pokemonView(box);
  }

  function render() {
    if (!wrap) return;
    wrap.textContent = "";
    if (S.view === "boot") { wrap.appendChild(el("div", "card", "Chargement…")); return; }
    if (S.view === "login") loginView(wrap); else mainView(wrap);
  }

  var mounted = false;
  function mount(h) {
    if (mounted) return; mounted = true; host = h;
    root = host.attachShadow ? (host.shadowRoot || host.attachShadow({ mode: "open" })) : host;
    var st = el("style"); st.textContent = CSS; root.appendChild(st);
    wrap = el("div", "wrap"); root.appendChild(wrap);
    function theme() { host.classList.toggle("dark", document.documentElement.getAttribute("data-theme") === "dark"); }
    new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); theme();
    render();
    var t = null; try { t = localStorage.getItem(TOKEN_KEY); } catch (e) {}
    if (!t) { S.view = "login"; render(); return; }
    S.token = t;
    fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", token: t }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ok) { S.view = "main"; render(); } else logout("Session expirée : reconnecte-toi."); })
      .catch(function () { S.view = "main"; render(); }); // hors ligne : on garde la session, les écritures échoueront proprement
    window.addEventListener("siteconfigchange", function () { if (!S.npDirty) S.np = null; if (S.view === "main") scrollKeep(render); });
  }
  window.AdminTab = { mount: mount };
})();
