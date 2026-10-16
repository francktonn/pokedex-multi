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

  // ---------- Confettis ----------
  function confetti(count) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var colors = ["#FFC93C", "#E23B30", "#5ee06a", "#3a86d6", "#F95587", "#ffffff"];
    for (var i = 0; i < (count || 60); i++) {
      var c = document.createElement("span");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.setProperty("--dx", (Math.random() * 160 - 80) + "px");
      c.style.setProperty("--rot", (360 + Math.random() * 720) + "deg");
      c.style.setProperty("--dur", (1.8 + Math.random() * 1.4) + "s");
      c.style.animationDelay = (Math.random() * 0.4) + "s";
      document.body.appendChild(c);
      (function (n) { setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 3800); })(c);
    }
  }

  // ---------- Libellés du dock (accessibilité + survol) ----------
  var labels = { btnSearch: "Pokédex", btnGuess: "Deviner", btnMultiplayer: "Partie", btnNotepad: "Notes" };
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

  // ---------- Retours de jeu (bonne / mauvaise réponse, fin de manche) ----------
  var lastBannerText = "";
  function watchFeedback() {
    var fbs = document.querySelectorAll(".mp-guess-feedback");
    fbs.forEach(function (fb) {
      var t = fb.textContent.trim();
      if (!t || fb.dataset.seen === t) return;
      if (fb.id === "gcErrorMsg") return;
      fb.dataset.seen = t;
      if (fb.classList.contains("ok")) {
        vibrate([40, 30, 80]);
        toast(t, { kind: "ok", icon: "🎉" });
      } else if (fb.classList.contains("ko")) {
        vibrate(120);
      }
    });
    var banner = $("mpRoundBanner");
    if (banner && banner.style.display !== "none") {
      var bt = banner.textContent.trim();
      if (bt && bt !== lastBannerText) {
        lastBannerText = bt;
        toast(bt, { kind: "win", icon: "🏆", ttl: 6000 });
        confetti(70);
        vibrate([60, 40, 60, 40, 140]);
      }
    } else if (banner) {
      lastBannerText = "";
    }
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
    var b = $("btnMultiplayer");
    if (b) setTimeout(function () { b.click(); }, 350);
  });

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
