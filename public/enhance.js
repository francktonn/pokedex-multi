/* =====================================================================
   enhance.js — améliorations de confort par-dessus index.html
   Aucune dépendance : observe le DOM existant, ne modifie pas la logique de jeu.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  // ---------- Toasts ----------
  var host = document.createElement("div");
  host.id = "toastHost";
  host.setAttribute("role", "status");
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);

  function toast(text, opts) {
    opts = opts || {};
    var el = document.createElement("div");
    el.className = "toast" + (opts.kind ? " " + opts.kind : "");
    var ico = document.createElement("span");
    ico.className = "t-ico";
    ico.textContent = opts.icon || "ℹ️";
    var msg = document.createElement("span");
    msg.textContent = text;
    el.appendChild(ico);
    el.appendChild(msg);
    host.appendChild(el);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    var ttl = opts.ttl || 3800;
    setTimeout(function () {
      el.classList.add("out");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, ttl);
  }
  window.toast = toast;

  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  }

  // ---------- Libellés du dock (accessibilité + survol) ----------
  var labels = { btnSearch: "Pokédex", btnGuess: "Deviner", btnNotepad: "Notes" };
  Object.keys(labels).forEach(function (id) {
    var b = $(id);
    if (b) b.setAttribute("data-label", labels[id]);
  });

  // ---------- Indicateur de connexion ----------
  var net = document.createElement("div");
  net.id = "netDot";
  net.textContent = "HORS LIGNE";
  document.body.appendChild(net);
  function refreshNet() {
    var offline = navigator.onLine === false;
    net.classList.toggle("show", offline);
    if (offline) toast("Connexion perdue : la partie reprendra dès le retour du réseau.", { kind: "warn", icon: "📡", ttl: 4500 });
  }
  window.addEventListener("offline", refreshNet);
  window.addEventListener("online", function () {
    net.classList.remove("show");
    toast("De nouveau en ligne.", { kind: "ok", icon: "✅", ttl: 2200 });
  });

  // ---------- Lien d'invitation (?code=ABCDE) ----------
  var params = new URLSearchParams(location.search);
  var inviteCode = (params.get("code") || "").toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(inviteCode)) inviteCode = "";

  function inviteLink(code) {
    return location.origin + location.pathname + "?code=" + encodeURIComponent(code);
  }

  var mpBody = $("mpBody");

  function prefillInvite() {
    if (!inviteCode) return;
    var input = $("mpCodeInput");
    if (input && !input.value) {
      input.value = inviteCode;
      var nameInput = $("mpNameInput");
      if (nameInput && !nameInput.value) nameInput.focus();
      else input.focus();
      toast("Code " + inviteCode + " prérempli : choisis ton pseudo puis rejoins !", { icon: "🎟️", ttl: 5000 });
      inviteCode = ""; // une seule fois
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
    }
  }

  // Bouton « Partager » à côté du code de la partie
  function injectShareButton() {
    var copyBtn = $("mpCopyCodeBtn");
    if (!copyBtn || $("mpShareBtn")) return;
    var share = document.createElement("button");
    share.id = "mpShareBtn";
    share.type = "button";
    share.className = "mp-copy-code-btn";
    share.title = "Partager le lien d'invitation";
    share.setAttribute("aria-label", "Partager le lien d'invitation");
    share.textContent = "🔗";
    share.style.marginLeft = "6px";
    share.addEventListener("click", function () {
      var codeEl = $("mpCodeValue");
      var code = codeEl ? codeEl.textContent.trim() : "";
      if (!code) return;
      var url = inviteLink(code);
      var text = "Rejoins ma partie de Pokédex Devinette ! Code : " + code;
      if (navigator.share) {
        navigator.share({ title: "Pokédex Devinette", text: text, url: url }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          toast("Lien d'invitation copié !", { kind: "ok", icon: "🔗", ttl: 2400 });
        }).catch(function () {});
      }
    });
    copyBtn.parentNode.insertBefore(share, copyBtn.nextSibling);
    // Alignement : le conteneur du code garde le bouton 📋 puis 🔗 côte à côte
    var wrap = document.createElement("span");
    wrap.style.display = "inline-flex";
    copyBtn.parentNode.insertBefore(wrap, copyBtn);
    wrap.appendChild(copyBtn);
    wrap.appendChild(share);
  }

  // ---------- Retours de jeu ----------
  // Plus de notification de bonne réponse, de victoire ni de fin de manche (le message de la partie reste affiché dans la fenêtre).
  // Seule une légère vibration signale une mauvaise réponse.
  function watchFeedback() {
    var fbs = document.querySelectorAll(".mp-guess-feedback");
    fbs.forEach(function (fb) {
      var t = fb.textContent.trim();
      if (!t || fb.dataset.seen === t) return;
      if (fb.id === "gcErrorMsg") return;
      fb.dataset.seen = t;
      if (fb.classList.contains("ko")) vibrate(120);
    });
  }

  var moScheduled = false;
  function onMpMutation() {
    if (moScheduled) return;
    moScheduled = true;
    requestAnimationFrame(function () {
      moScheduled = false;
      prefillInvite();
      injectShareButton();
      watchFeedback();
    });
  }
  if (mpBody) {
    new MutationObserver(onMpMutation).observe(mpBody, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] });
  }
  var guessBody = $("guessBody");
  if (guessBody) {
    new MutationObserver(onMpMutation).observe(guessBody, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
  }

  // ---------- Notifications d'état de manche ----------
  var statusEl = $("mpQuickStatus");
  var prevStatus = "";
  var guessBtn = $("btnGuess");
  if (statusEl) {
    new MutationObserver(function () {
      var s = statusEl.textContent.trim();
      if (s === prevStatus) return;
      if (s === "manche en cours" && prevStatus !== "") {
        toast("La manche est lancée : à toi de deviner !", { icon: "🎲" });
        vibrate(80);
      }
      if (guessBtn) guessBtn.classList.toggle("has-badge", s === "manche en cours" && !($("guessOverlay") || {}).classList.contains("open"));
      prevStatus = s;
    }).observe(statusEl, { childList: true, characterData: true, subtree: true });
  }
  if (guessBtn) guessBtn.addEventListener("click", function () { guessBtn.classList.remove("has-badge"); });

  // ---------- Ouverture automatique du multijoueur depuis un lien d'invitation ----------
  window.addEventListener("load", function () {
    if (!inviteCode) return;
    // Le bouton « Partie » n'existe plus : on ouvre la fenêtre multijoueur via la passerelle du Groupe.
    setTimeout(function () {
      if (window.__guessBridge && window.__guessBridge.open) window.__guessBridge.open();
      else { var b = $("btnMultiplayer"); if (b) b.click(); }
    }, 350);
  });


  // ---------- Annuaire des joueurs : envoie ton profil au serveur (onglet « Joueurs ») ----------
  // Aucun compte : le navigateur garde un identifiant public + un jeton secret (players_session) qui n'autorise que SA fiche.
  var PLAYERS_KEY = "players_session";
  var syncTimer = null, syncing = null;
  function playersSession() { try { return JSON.parse(localStorage.getItem(PLAYERS_KEY) || "null") || {}; } catch (e) { return {}; } }
  function syncPlayer() {
    if (syncing) return syncing;
    var P = window.PokeProfile, pr = P && P.get && P.get();
    if (!pr || !pr.name || navigator.onLine === false) return Promise.resolve();
    var sess = playersSession();
    syncing = fetch("/api/players", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync", pub: sess.pub, tok: sess.tok, name: pr.name, avatar: pr.favId || null, card: P.card ? P.card() : null })
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        if (j && j.pub && j.tok) { try { localStorage.setItem(PLAYERS_KEY, JSON.stringify({ pub: j.pub, tok: j.tok })); } catch (e) {} }
      })
      .catch(function () {})
      .then(function () { syncing = null; });
    return syncing;
  }
  window.PokePlayersSync = syncPlayer;
  function scheduleSync(delay) { clearTimeout(syncTimer); syncTimer = setTimeout(syncPlayer, delay); }
  window.addEventListener("load", function () { scheduleSync(1500); });
  window.addEventListener("profilechange", function () { scheduleSync(4000); });
  window.addEventListener("statschange", function () { scheduleSync(4000); });

  // ---------- Ferme les fenêtres avec le retour arrière du téléphone ----------
  // (pousse un état d'historique à l'ouverture d'une fenêtre, le retire à sa fermeture)
  var overlays = ["mpOverlay", "guessOverlay", "searchOverlay", "notepadOverlay", "gcOverlay"].map($).filter(Boolean);
  var historyPushed = false;
  overlays.forEach(function (ov) {
    new MutationObserver(function () {
      var anyOpen = overlays.some(function (o) { return o.classList.contains("open"); });
      document.body.style.overflow = anyOpen ? "hidden" : "";
      if (anyOpen && !historyPushed) {
        try { history.pushState({ overlay: true }, ""); historyPushed = true; } catch (e) {}
      } else if (!anyOpen && historyPushed) {
        historyPushed = false;
        try { if (history.state && history.state.overlay) history.back(); } catch (e) {}
      }
    }).observe(ov, { attributes: true, attributeFilter: ["class"] });
  });
  window.addEventListener("popstate", function () {
    var open = overlays.filter(function (o) { return o.classList.contains("open"); });
    if (!open.length) return;
    historyPushed = false;
    // Le dernier ouvert est celui du dessus (la config s'ouvre au-dessus du multijoueur)
    var top = open[open.length - 1];
    var closeBtn = top.querySelector(".notepad-close");
    if (closeBtn) closeBtn.click();
  });
})();
