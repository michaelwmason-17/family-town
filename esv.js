// Returns a Bible passage from the ESV API (api.esv.org), keeping the API key secret on the server.
// Needs the ESV_API_KEY environment variable in Vercel. Usage: /api/esv?q=John+3
// ESV terms: non-commercial use, show the copyright notice (included in the returned text), no more than 500 verses at once.
module.exports = async (req, res) => {
  const q = String((req.query && req.query.q) || '').slice(0, 60);
  if (!q) return res.status(400).json({ error: 'Which passage?' });
  const key = process.env.ESV_API_KEY;
  if (!key) return res.status(503).json({ error: 'The ESV key has not been added yet.' });
  const params = new URLSearchParams({
    q, 'include-footnotes': 'false', 'include-audio-link': 'false', 'include-first-verse-numbers': 'true',
    'include-headings': 'true', 'include-passage-references': 'false', 'include-short-copyright': 'true', 'include-css-link': 'false',
  });
  try {
    const r = await fetch('https://api.esv.org/v3/passage/html/?' + params, { headers: { Authorization: 'Token ' + key } });
    if (!r.ok) return res.status(502).json({ error: 'The ESV service did not answer. Try again in a moment.' });
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=86400');
    return res.status(200).json({ title: data.canonical || q, html: (data.passages || []).join('') });
  } catch (e) {
    return res.status(502).json({ error: 'The ESV text could not load.' });
  }
};
