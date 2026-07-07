// Fonction serverless Vercel : gère toute la logique d'une partie multijoueur.
// Stockage : Redis (n'importe quel serveur Redis "classique" — Upstash en mode
// Redis, Redis Cloud, un Redis auto-hébergé, etc.), via l'URL de connexion fournie
// dans la variable d'environnement REDIS_URL (voir README.md pour les instructions).
const Redis = require('ioredis');
const POKEDEX_QUESTIONS = require('../public/questions.js');

const MAX_DEX_ID = 807; // Génération I à VII
const ROOM_TTL_SECONDS = 60 * 60 * 24; // les parties expirent après 24h d'inactivité
const QUIZ_ANSWER_DELAY_MS = 30 * 1000; // clôture auto d'un tour si tout le monde n'a pas répondu

const QUESTIONS_BY_ID = {};
POKEDEX_QUESTIONS.forEach(q => { QUESTIONS_BY_ID[q.id] = q; });

// En serverless, une même instance de fonction peut traiter plusieurs requêtes :
// on réutilise donc la connexion Redis d'un appel à l'autre au lieu d'en ouvrir
// une nouvelle à chaque fois (ce qui épuiserait vite le nombre de connexions
// autorisées par la plupart des offres Redis gratuites).
let redisClient = null;
function getRedis() {
  if (!redisClient) {
    if (!process.env.REDIS_URL) {
      throw new Error('Variable d\'environnement REDIS_URL manquante');
    }
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: false
    });
  }
  return redisClient;
}

// ---------- Utilitaires ----------

// Même logique de normalisation que côté client (accents/casse ignorés) pour comparer
// une proposition de nom au nom réel du Pokémon secret.
function foldFr(str) {
  return (str || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ');
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I, pour éviter la confusion
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomId() {
  return Math.floor(Math.random() * MAX_DEX_ID) + 1;
}

function formatSlugName(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Récupère le nom français officiel d'un Pokémon depuis PokeAPI (appelé depuis le
// serveur : pas de souci de CORS, et le nom réel n'est jamais exposé aux autres joueurs).
async function fetchFrenchName(id) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  if (!res.ok) throw new Error('Erreur PokeAPI');
  const data = await res.json();
  const frEntry = (data.names || []).find(n => n.language && n.language.name === 'fr');
  return frEntry ? frEntry.name : formatSlugName(data.name);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Renvoie le prochain joueur du tour (dans l'ordre figé room.quiz.turnOrder) qui est
// toujours présent dans la partie. Si tout le monde a quitté sauf un, ce dernier
// redevient l'asker suivant (il posera une question à lui-même n'a pas de sens, mais
// dans ce cas de figure la partie est de toute façon terminée en pratique).
function nextAsker(quiz, room) {
  const order = quiz.turnOrder.filter(pid => room.players[pid]);
  if (order.length === 0) return null;
  const currentIdx = order.indexOf(quiz.currentAskerId);
  const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % order.length;
  return order[nextIdx];
}

// Si une question est en attente de réponses et que (a) tous les joueurs concernés ont
// répondu, ou (b) le délai configurable est dépassé : on clôt le tour, on l'archive
// dans l'historique, on passe au joueur suivant. Renvoie true si l'état a changé (pour
// savoir s'il faut re-sauvegarder la room).
function maybeFinalizeQuizTurn(room) {
  const quiz = room.quiz;
  if (!quiz || !quiz.pending) return false;

  const pending = quiz.pending;
  const targetIds = Object.keys(room.players).filter(pid => pid !== quiz.currentAskerId);
  const answeredIds = Object.keys(pending.answers);
  const allAnswered = targetIds.length > 0 && targetIds.every(pid => answeredIds.includes(pid));
  const deadlinePassed = Date.now() >= pending.deadlineAt;

  if (!allAnswered && !deadlinePassed) return false;

  const askerName = room.players[quiz.currentAskerId] ? room.players[quiz.currentAskerId].name : '(parti)';
  quiz.history.push({
    turn: quiz.turnNumber,
    askerId: quiz.currentAskerId,
    askerName,
    questionId: pending.questionId,
    questionText: pending.questionText,
    answers: targetIds.map(pid => ({
      pid,
      name: room.players[pid] ? room.players[pid].name : '(parti)',
      answer: pending.answers[pid] || null // null = n'a pas répondu à temps
    }))
  });
  quiz.usedQuestionIds.push(pending.questionId);
  quiz.pending = null;
  quiz.currentAskerId = nextAsker(quiz, room);
  quiz.turnNumber += 1;
  return true;
}

function roomKey(code) {
  return `room:${code}`;
}

async function getRoom(code) {
  const raw = await getRedis().get(roomKey(code));
  return raw ? JSON.parse(raw) : null; // contrairement à @vercel/kv, ioredis renvoie du texte brut
}

async function saveRoom(code, room) {
  room.updatedAt = Date.now();
  // "EX" pose le TTL (en secondes) directement dans la même commande que le SET.
  await getRedis().set(roomKey(code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
}

// Tire un nouveau Pokémon secret pour CHAQUE joueur présent dans la partie, en
// parallèle (une seule "manche" démarre pour tout le monde en même temps). Ne
// touche pas aux scores. Met le statut de la partie à "playing".
async function startNewRound(room) {
  const pids = Object.keys(room.players);
  const draws = await Promise.all(pids.map(async (pid) => {
    const id = randomId();
    const name = await fetchFrenchName(id);
    return { pid, id, name };
  }));
  draws.forEach(({ pid, id, name }) => {
    room.players[pid].pokemonId = id;
    room.players[pid].pokemonName = name;
  });
  room.status = 'playing';
}

// Ne renvoie JAMAIS le nom du Pokémon secret des autres joueurs : seulement le sien
// (via `me`) et un booléen `hasPokemon` pour les autres. C'est le serveur qui tranche
// les devinettes, donc personne ne peut "tricher" en lisant les données brutes.
function sanitizeRoom(room, playerId) {
  const players = Object.keys(room.players).map(pid => {
    const p = room.players[pid];
    return {
      id: pid,
      name: p.name,
      score: p.score || 0,
      hasPokemon: !!p.pokemonId
    };
  });
  const me = playerId && room.players[playerId] ? room.players[playerId] : null;

  let quiz = null;
  if (room.quiz) {
    const q = room.quiz;
    quiz = {
      turnNumber: q.turnNumber,
      currentAskerId: q.currentAskerId,
      isMyTurn: !!(playerId && q.currentAskerId === playerId),
      usedQuestionIds: q.usedQuestionIds,
      pending: q.pending ? {
        questionId: q.pending.questionId,
        questionText: q.pending.questionText,
        askerId: q.currentAskerId,
        deadlineAt: q.pending.deadlineAt,
        targetIds: Object.keys(room.players).filter(pid => pid !== q.currentAskerId),
        answeredIds: Object.keys(q.pending.answers),
        myAnswer: (playerId && q.pending.answers[playerId]) || null
      } : null,
      history: q.history
    };
  }

  return {
    code: room.code,
    status: room.status || 'lobby',
    hostId: room.hostId || null,
    isHost: !!(playerId && room.hostId === playerId),
    players,
    me: me ? { pokemonId: me.pokemonId || null, pokemonName: me.pokemonName || null } : null,
    quiz
  };
}

// ---------- Handler ----------

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // ---- Lecture de l'état d'une partie (utilisé au chargement + sondage périodique) ----
    if (req.method === 'GET') {
      const code = (req.query.code || '').toString().trim().toUpperCase();
      const playerId = (req.query.playerId || '').toString();
      if (!code) {
        res.status(400).json({ error: 'Code manquant' });
        return;
      }
      const room = await getRoom(code);
      if (!room) {
        res.status(404).json({ error: 'Partie introuvable' });
        return;
      }
      // Clôture paresseuse : si le délai de réponse est dépassé depuis le dernier
      // appel, on fait avancer le tour ici même (pas besoin de cron, le sondage
      // périodique du client s'en charge).
      if (maybeFinalizeQuizTurn(room)) {
        await saveRoom(code, room);
      }
      res.status(200).json(sanitizeRoom(room, playerId));
      return;
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const action = body.action;

      // ---- Créer une partie ----
      // Le créateur devient automatiquement l'hôte (seul lui peut lancer une manche).
      if (action === 'create') {
        const name = (body.name || '').toString().trim().slice(0, 16);
        if (!name) {
          res.status(400).json({ error: 'Pseudo manquant' });
          return;
        }
        let code, existing, attempts = 0;
        do {
          code = genCode();
          existing = await getRoom(code);
          attempts++;
        } while (existing && attempts < 8);

        const playerId = 'p_' + Math.random().toString(36).slice(2, 9);
        const room = {
          code,
          createdAt: Date.now(),
          status: 'lobby', // 'lobby' = en attente que l'hôte lance la 1ère manche, 'playing' = manche en cours
          hostId: playerId,
          players: { [playerId]: { name, score: 0, pokemonId: null, pokemonName: null } }
        };
        await saveRoom(code, room);
        res.status(200).json({ code, playerId });
        return;
      }

      // ---- Rejoindre une partie ----
      if (action === 'join') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const name = (body.name || '').toString().trim().slice(0, 16);
        if (!code || !name) {
          res.status(400).json({ error: 'Code ou pseudo manquant' });
          return;
        }
        const room = await getRoom(code);
        if (!room) {
          res.status(404).json({ error: 'Partie introuvable' });
          return;
        }
        const playerId = 'p_' + Math.random().toString(36).slice(2, 9);
        room.players[playerId] = { name, score: 0, pokemonId: null, pokemonName: null };
        // Rejoindre en cours de manche : le nouveau joueur attend simplement la
        // manche suivante (il n'a pas de secret tant que l'hôte n'en relance pas une).
        await saveRoom(code, room);
        res.status(200).json({ code, playerId });
        return;
      }

      // ---- Lancer une manche pour TOUT LE MONDE (réservé à l'hôte) ----
      // Utilisé pour la 1ère manche, et peut aussi être utilisé par l'hôte pour
      // relancer une manche manuellement à tout moment.
      if (action === 'start') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        if (room.hostId !== playerId) {
          res.status(403).json({ error: "Seul l'hôte de la partie peut lancer une manche" });
          return;
        }
        await startNewRound(room);
        await saveRoom(code, room);
        res.status(200).json({ ok: true });
        return;
      }

      // ---- Deviner le Pokémon d'un autre joueur ----
      if (action === 'guess') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const { playerId, targetId, guess } = body;
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        const target = room.players[targetId];
        if (!target || !target.pokemonId) {
          res.status(200).json({ correct: false, gone: true });
          return;
        }
        const isCorrect = foldFr(guess) === foldFr(target.pokemonName);
        if (!isCorrect) {
          res.status(200).json({ correct: false });
          return;
        }

        room.players[playerId].score = (room.players[playerId].score || 0) + 1;
        const revealedName = target.pokemonName;
        target.pokemonId = null;
        target.pokemonName = null;

        // La manche ne se termine pas dès qu'un Pokémon est trouvé : elle continue
        // jusqu'à ce qu'il ne reste plus qu'UN SEUL joueur non trouvé. À ce moment,
        // la partie relance automatiquement une nouvelle manche pour tout le monde,
        // en conservant les scores, et le dernier joueur restant reçoit +1 point
        // bonus pour avoir survécu jusqu'au bout de la manche.
        let roundEnded = false;
        let lastPlayerName = null;
        const allPids = Object.keys(room.players);
        if (room.status === 'playing' && allPids.length >= 2) {
          const stillHiding = allPids.filter(pid => room.players[pid].pokemonId);
          if (stillHiding.length === 1) {
            roundEnded = true;
            const lastPid = stillHiding[0];
            room.players[lastPid].score = (room.players[lastPid].score || 0) + 1;
            lastPlayerName = room.players[lastPid].name;
            await startNewRound(room); // ré-attribue un secret à tout le monde, scores conservés
          }
        }

        await saveRoom(code, room);
        res.status(200).json({ correct: true, name: revealedName, roundEnded, lastPlayerName });
        return;
      }

      // ---- Quitter la partie ----
      if (action === 'leave') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const room = await getRoom(code);
        if (room && room.players[playerId]) {
          delete room.players[playerId];
          // Si l'hôte quitte, on transfère le rôle au joueur restant le plus ancien
          // pour que la partie ne reste pas bloquée sans personne pour lancer de manche.
          if (room.hostId === playerId) {
            const remaining = Object.keys(room.players);
            room.hostId = remaining.length ? remaining[0] : null;
          }
          await saveRoom(code, room);
        }
        res.status(200).json({ ok: true });
        return;
      }

      // ---- Lancer le mode "Devinette par questions" (réservé à l'hôte) ----
      // Indépendant du mode "deviner le nom" : les deux peuvent tourner en même temps
      // dans la même partie, sans se marcher dessus.
      if (action === 'quiz_start') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        if (room.hostId !== playerId) {
          res.status(403).json({ error: "Seul l'hôte de la partie peut lancer le mode questions" });
          return;
        }
        const turnOrder = shuffle(Object.keys(room.players));
        room.quiz = {
          turnOrder,
          turnNumber: 1,
          currentAskerId: turnOrder[0] || null,
          pending: null,
          usedQuestionIds: [],
          history: []
        };
        await saveRoom(code, room);
        res.status(200).json({ ok: true });
        return;
      }

      // ---- Le joueur dont c'est le tour pose une question ----
      if (action === 'quiz_ask') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const { playerId, questionId } = body;
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        if (!room.quiz) {
          res.status(400).json({ error: "Le mode questions n'a pas encore été lancé" });
          return;
        }
        // Au cas où un tour précédent aurait expiré sans qu'aucun sondage ne soit
        // passé entre-temps (ne devrait pas arriver en pratique, mais on sécurise).
        maybeFinalizeQuizTurn(room);
        if (room.quiz.currentAskerId !== playerId) {
          res.status(403).json({ error: "Ce n'est pas ton tour de poser une question" });
          return;
        }
        if (room.quiz.pending) {
          res.status(409).json({ error: 'Une question est déjà en cours pour ce tour' });
          return;
        }
        const question = QUESTIONS_BY_ID[questionId];
        if (!question) {
          res.status(400).json({ error: 'Question inconnue' });
          return;
        }
        if (room.quiz.usedQuestionIds.includes(questionId)) {
          res.status(409).json({ error: 'Cette question a déjà été posée pendant cette partie' });
          return;
        }
        room.quiz.pending = {
          questionId: question.id,
          questionText: question.text,
          askedAt: Date.now(),
          deadlineAt: Date.now() + QUIZ_ANSWER_DELAY_MS,
          answers: {}
        };
        await saveRoom(code, room);
        res.status(200).json({ ok: true });
        return;
      }

      // ---- Un joueur interrogé répond Oui/Non à la question en cours ----
      if (action === 'quiz_answer') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const { playerId, answer } = body;
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        if (!room.quiz || !room.quiz.pending) {
          res.status(400).json({ error: 'Aucune question en cours' });
          return;
        }
        if (room.quiz.currentAskerId === playerId) {
          res.status(403).json({ error: "Le joueur qui pose la question ne répond pas" });
          return;
        }
        if (answer !== 'oui' && answer !== 'non') {
          res.status(400).json({ error: 'Réponse invalide' });
          return;
        }
        room.quiz.pending.answers[playerId] = answer;
        maybeFinalizeQuizTurn(room); // clôture immédiatement si c'était le dernier joueur attendu
        await saveRoom(code, room);
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'Action inconnue' });
      return;
    }

    res.status(405).json({ error: 'Méthode non supportée' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur', detail: String((e && e.message) || e) });
  }
};
