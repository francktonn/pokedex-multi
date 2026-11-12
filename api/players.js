// Fonction serverless Vercel : « Joueurs ». Annuaire persistant des profils de tous les amis qui ont déjà ouvert le site.
// Pas de comptes : chaque navigateur reçoit un identifiant public (`pub`, affiché dans la liste) et un jeton secret (`tok`,
// jamais renvoyé dans la liste) qui lui permet de mettre à jour SA fiche et seulement la sienne.
// Les fiches n'expirent jamais (aucun TTL) : elles sont rangées dans un seul hash Redis `players:all`.
//
//   GET  /api/players                                -> { players: [{ id, name, avatar, card, seen, since }], now }
//   POST /api/players {action:'sync', pub?, tok?, name, avatar, card}
//                                                    -> { pub, tok }   (tok n'est renvoyé qu'à la création)
//   POST /api/players {action:'remove', pub, tok}    -> { ok: true }
const Redis = require('ioredis');
const crypto = require('crypto');

const MAX_DEX_ID = 1025;
const MAX_PLAYERS = 500;
const HASH = 'players:all';

let redisClient = null;
function getRedis() {
  if (!redisClient) {
    if (!process.env.REDIS_URL) throw new Error("Variable d'environnement REDIS_URL manquante");
    redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return redisClient;
}

const rid = n => crypto.randomBytes(n).toString('hex');
const cleanName = v => (v || '').toString().replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
function cleanAvatar(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_DEX_ID ? n : null;
}
// Même nettoyage que api/group.js : c'est exactement la « carte » que le site affiche (cadre, fond, équipe, stats…).
function cleanCard(v) {
  const n = (x, max) => { x = Number(x); return Number.isInteger(x) && x >= 0 && x <= max ? x : 0; };
  if (!v || typeof v !== 'object') return { s: 0, c: 0, t: 0, m: '', x: null, b: 0, ti: 0, l: 1, tm: [], f: 0, h: 0, e: 0, j: 0, nf: 0, nc: 0 };
  const src = v.x && typeof v.x === 'object' ? v.x : {};
  const x = {};
  ['wp', 'ww', 'wb', 'qp', 'qc', 'qb', 'gf', 'gm'].forEach(k => { x[k] = n(src[k], 10000000); });
  const tm = (Array.isArray(v.tm) ? v.tm : []).map(Number).filter(id => Number.isInteger(id) && id >= 1 && id <= MAX_DEX_ID).slice(0, 6);
  return { s: n(v.s, 2), c: n(v.c, 15), t: n(v.t, 18), m: String(v.m || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40), x, b: n(v.b, 21), ti: 0, l: Math.max(1, n(v.l, 99)), tm,
    f: n(v.f, 10), h: n(v.h, 6), e: n(v.e, 10), j: n(v.j, 16), nf: n(v.nf, 6), nc: n(v.nc, 11) };
}
const parse = raw => { try { return JSON.parse(raw); } catch (e) { return null; } };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const r = getRedis();

    if (req.method === 'GET') {
      const all = await r.hgetall(HASH);
      const players = Object.keys(all || {}).map(id => {
        const p = parse(all[id]);
        if (!p || !p.name) return null;
        return { id, name: p.name, avatar: p.avatar || null, card: p.card || null, seen: Number(p.seen) || 0, since: Number(p.since) || 0 };
      }).filter(Boolean).sort((a, b) => b.seen - a.seen);
      res.status(200).json({ players, now: Date.now() });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    const action = (body.action || '').toString();
    const pub = (body.pub || '').toString().slice(0, 40);
    const tok = (body.tok || '').toString().slice(0, 80);

    if (action === 'sync') {
      const name = cleanName(body.name);
      if (!name) { res.status(400).json({ error: 'Pseudo manquant' }); return; }
      const now = Date.now();
      const mine = pub && tok ? parse(await r.hget(HASH, pub)) : null;
      if (mine && mine.tok === tok) {
        // Mise à jour de MA fiche.
        mine.name = name; mine.avatar = cleanAvatar(body.avatar); mine.card = cleanCard(body.card); mine.seen = now;
        await r.hset(HASH, pub, JSON.stringify(mine));
        res.status(200).json({ pub });
        return;
      }
      // Nouvelle fiche (premier passage, ou jeton inconnu : on ne laisse jamais écraser la fiche de quelqu'un d'autre).
      if ((await r.hlen(HASH)) >= MAX_PLAYERS) { res.status(409).json({ error: 'Annuaire complet' }); return; }
      const newPub = 'p' + rid(5), newTok = rid(12);
      await r.hset(HASH, newPub, JSON.stringify({ tok: newTok, name, avatar: cleanAvatar(body.avatar), card: cleanCard(body.card), seen: now, since: now }));
      res.status(200).json({ pub: newPub, tok: newTok });
      return;
    }

    if (action === 'remove') {
      const mine = pub && tok ? parse(await r.hget(HASH, pub)) : null;
      if (!mine || mine.tok !== tok) { res.status(403).json({ error: 'Fiche introuvable' }); return; }
      await r.hdel(HASH, pub);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : 'Erreur serveur' });
  }
};
