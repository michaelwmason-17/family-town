// Daily reminders, run by Vercel on a schedule (see vercel.json): a morning rundown and an evening nudge.
const { env, rest, sendAll } = require('./_lib');

const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tc = s => String(s || '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
const tf = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)}${h < 12 ? 'am' : 'pm'}`; };
function occursOn(e, k) {
  if (!e || !e.date || k < e.date) return false;
  if (k === e.date || (e.end && k <= e.end)) return true;
  const a = new Date(e.date + 'T12:00'), b = new Date(k + 'T12:00');
  return e.repeat === 'weekly' ? a.getDay() === b.getDay() : e.repeat === 'monthly' ? a.getDate() === b.getDate() : e.repeat === 'yearly' ? e.date.slice(5) === k.slice(5) : false;
}

module.exports = when => async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== 'Bearer ' + secret) return res.status(401).json({ error: 'Not allowed.' });
  const E = env();
  if (!E) return res.status(503).json({ error: 'Notifications are not set up yet.' });
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const today = key(now), idx = (now.getDay() + 6) % 7;
  const mon = new Date(now); mon.setDate(mon.getDate() - idx); const week = key(mon);
  let total = 0;
  try {
    const subsAll = await rest(E, 'push_subs?select=endpoint,sub,prefs,slot,family_id');
    const fams = [...new Set(subsAll.map(s => s.family_id))];
    for (const fam of fams) {
      const rows = await rest(E, `kv?family_id=eq.${fam}&key=in.(events,names,checkin0,checkin1,meals,petcare,chorelog,dq0,dq1)&select=key,value`);
      const val = k => (rows.find(r => r.key === k) || {}).value;
      const names = val('names') || ['', ''], events = val('events') || [], meals = val('meals') || {}, pets = val('petcare') || [], chores = val('chorelog') || [];
      for (const slot of [0, 1]) {
        const subs = subsAll.filter(s => s.family_id === fam && s.slot === slot && (!s.prefs || s.prefs.remind !== false));
        if (!subs.length) continue;
        const name = tc(names[slot]) || 'friend', bits = [];
        let title;
        if (when === 'morning') {
          title = `Good morning, ${name}`;
          const evs = events.filter(e => occursOn(e, today) && (e.who === slot || e.who >= 2)).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
          if (evs.length) bits.push('Today: ' + evs.slice(0, 3).map(e => `${e.time ? tf(e.time) + ' ' : ''}${e.title}`).join(', ') + (evs.length > 3 ? ` +${evs.length - 3} more` : ''));
          const dinner = meals.week === week && meals.days && meals.days[idx];
          bits.push(dinner ? `Dinner: ${dinner.dish}` : 'No dinner planned yet. Chef Marco at the Galley has ideas.');
          const due = pets.filter(p => p && p.last && Math.round((new Date(p.last + 'T12:00') - new Date(today + 'T12:00')) / 864e5) + p.every <= 0);
          if (due.length) bits.push('Due: ' + due.map(p => p.name).join(', '));
          if (now.getDay() === 1) bits.push('A new week and 4 new quests in Family Town.');
        } else {
          title = now.getDay() === 0 ? 'Your week in review is ready' : `Evening, ${name}`;
          if (now.getDay() === 0) bits.push('See who won the crown, your awards, and plan next week.');
          const ci = val('checkin' + slot) || {};
          if (!ci[today]) bits.push('How was today? Do your check-in.');
          const q = val('dq' + slot), left = q && q.date === today ? q.picks.length - q.done.length : 4;
          if (left > 0) bits.push(`${left} quest${left === 1 ? '' : 's'} left today (+5 pts each).`);
          const usesDogs = chores.some(c => c.id === 'feed_dogs' && Date.now() - c.at < 7 * 864e5), dogsToday = chores.filter(c => c.id === 'feed_dogs' && c.day === today).length;
          if (usesDogs && dogsToday < 2) bits.push('Have Moose & Maisy had dinner?');
        }
        if (!bits.length) continue;
        total += await sendAll(E, subs, { title, body: bits.join(' · ').slice(0, 220), tag: 'remind-' + when, url: '/' });
      }
    }
    return res.status(200).json({ sent: total });
  } catch (e) {
    return res.status(500).json({ error: 'Reminders failed.' });
  }
};
