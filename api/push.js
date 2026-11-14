// The app calls this when something happens (a message, a check-in, a photo, a prayer candle).
// It sends a notification to the other person's phones in the same family. Never to anyone else.
const { env, rest, sendAll } = require('./_lib');
const KINDS = new Set(['message', 'checkin', 'photo', 'prayer', 'test']);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const E = env();
  if (!E) return res.status(503).json({ error: 'Notifications are not set up yet.' });
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const who = await fetch(`${E.url}/auth/v1/user`, { headers: { apikey: E.H.apikey, Authorization: 'Bearer ' + token } });
    if (!token || !who.ok) return res.status(401).json({ error: 'Sign in first.' });
    const me = (await who.json()).id;
    const mine = await rest(E, `members?user_id=eq.${me}&select=family_id`);
    if (!mine.length) return res.status(403).json({ error: 'No family.' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const kind = KINDS.has(b.kind) ? b.kind : null;
    if (!kind) return res.status(400).json({ error: 'Unknown kind.' });
    const title = String(b.title || 'Family Town').slice(0, 60), body = String(b.body || '').slice(0, 160);
    // a test goes to your own phones; everything else goes to the other person's
    const filter = kind === 'test' ? `user_id=eq.${me}` : `user_id=neq.${me}`;
    const subs = (await rest(E, `push_subs?family_id=eq.${mine[0].family_id}&${filter}&select=endpoint,sub,prefs`))
      .filter(s => kind === 'test' || !s.prefs || s.prefs[kind] !== false);
    const sent = await sendAll(E, subs, { title, body, tag: kind === 'message' ? undefined : kind, url: '/' });
    return res.status(200).json({ sent });
  } catch (e) {
    return res.status(500).json({ error: 'Could not send.' });
  }
};
