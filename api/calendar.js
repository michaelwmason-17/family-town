// A private calendar feed of your Family Town events, for Apple Calendar (Calendar > Add Subscription).
// The link contains a secret token unique to your family. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.
const LABELS = ['', '', 'Family', 'Margo'];

const pad = n => String(n).padStart(2, '0');
const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const day = d => d.replace(/-/g, '');                       // 2026-11-13 -> 20261113
const nextDay = d => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
const stamp = () => { const n = new Date(); return `${n.getUTCFullYear()}${pad(n.getUTCMonth() + 1)}${pad(n.getUTCDate())}T${pad(n.getUTCHours())}${pad(n.getUTCMinutes())}00Z`; };
const fold = line => { const out = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); } out.push(line); return out.join('\r\n'); };

module.exports = async (req, res) => {
  const t = String((req.query && req.query.t) || '');
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!/^[a-f0-9]{32}$/.test(t)) return res.status(404).send('Not found');
  if (!url || !key) return res.status(503).send('Calendar is not set up yet.');
  const H = { apikey: key, Authorization: 'Bearer ' + key };
  try {
    const fam = await (await fetch(`${url}/rest/v1/families?ics_token=eq.${t}&select=id`, { headers: H })).json();
    if (!Array.isArray(fam) || !fam.length) return res.status(404).send('Not found');
    const rows = await (await fetch(`${url}/rest/v1/kv?family_id=eq.${fam[0].id}&key=in.(events,names)&select=key,value`, { headers: H })).json();
    const val = k => (rows.find(r => r.key === k) || {}).value;
    const events = val('events') || [], names = val('names') || [];
    const who = w => (w === 0 || w === 1) && names[w] ? names[w][0] + names[w].slice(1).toLowerCase() : LABELS[w] || '';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family Town//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:Family Town', 'X-WR-TIMEZONE:America/Los_Angeles', 'REFRESH-INTERVAL;VALUE=DURATION:PT2H', 'X-PUBLISHED-TTL:PT2H'];
    for (const e of events) {
      if (!e || !e.date || !e.title) continue;
      lines.push('BEGIN:VEVENT', `UID:${e.id}@familytown`, `DTSTAMP:${stamp()}`, fold(`SUMMARY:${esc(e.title)}`));
      if (e.time) {
        const tm = e.time.replace(':', '') + '00', endTm = (e.endTime || '').replace(':', '');
        lines.push(`DTSTART;TZID=America/Los_Angeles:${day(e.date)}T${tm}`);
        if (endTm) lines.push(`DTEND;TZID=America/Los_Angeles:${day(e.end || e.date)}T${endTm}00`);
        else lines.push('DURATION:PT1H');
      } else {
        lines.push(`DTSTART;VALUE=DATE:${day(e.date)}`, `DTEND;VALUE=DATE:${day(nextDay(e.end || e.date))}`);
      }
      if (e.repeat === 'weekly' || e.repeat === 'monthly' || e.repeat === 'yearly') lines.push(`RRULE:FREQ=${e.repeat.toUpperCase()}`);
      const note = [who(e.who), e.note].filter(Boolean).join(' · ');
      if (note) lines.push(fold(`DESCRIPTION:${esc(note)}`));
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=900');
    return res.status(200).send(lines.join('\r\n'));
  } catch (e) {
    return res.status(502).send('Calendar unavailable');
  }
};
