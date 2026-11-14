// Shared helpers for the notification functions. (Files starting with _ are not web addresses.)
// Needs in Vercel: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PRIVATE_KEY (and CRON_SECRET for reminders).
const webpush = require('web-push');

const VAPID_PUBLIC = 'BAp43c74f9Nej5TzTZmytfQ2wmnNWCt2HS4cThCgZuRNcTWmMAua9hdNQHqlH7BEQYhMIHIOULYwImUn4-Z0Qcc';

function env() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!url || !key || !priv) return null;
  webpush.setVapidDetails('https://family-town-eta.vercel.app', VAPID_PUBLIC, priv);
  return { url, H: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' } };
}
async function rest(E, path, opts) {
  const r = await fetch(`${E.url}/rest/v1/${path}`, { headers: E.H, ...(opts || {}) });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.status === 204 ? null : r.json();
}
// Send one notification to a list of saved phones; forget phones that have unsubscribed.
async function sendAll(E, subs, payload) {
  let sent = 0;
  await Promise.all(subs.map(async s => {
    try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' }); sent++; }
    catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) await rest(E, `push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' }).catch(() => {});
    }
  }));
  return sent;
}
module.exports = { env, rest, sendAll };
