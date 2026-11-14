// The Chef: dinner ideas, "here's what I have", and reading a recipe from a screenshot.
// Only signed-in members of your family can use it. Needs ANTHROPIC_API_KEY in Vercel
// (plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, which are already there).
const sdk = require('@anthropic-ai/sdk');
const Anthropic = sdk.default || sdk;

const MODEL = 'claude-opus-5-5';
const IDEAS = { type: 'object', additionalProperties: false, required: ['ideas'], properties: { ideas: { type: 'array', items: { type: 'object', additionalProperties: false,
  required: ['title', 'why', 'minutes', 'ingredients', 'steps', 'uses', 'missing'],
  properties: { title: { type: 'string' }, why: { type: 'string' }, minutes: { type: 'integer' }, ingredients: { type: 'array', items: { type: 'string' } }, steps: { type: 'array', items: { type: 'string' } }, uses: { type: 'array', items: { type: 'string' } }, missing: { type: 'array', items: { type: 'string' } } } } } } };
const RECIPE = { type: 'object', additionalProperties: false, required: ['title', 'servings', 'minutes', 'ingredients', 'steps', 'notes'],
  properties: { title: { type: 'string' }, servings: { type: 'integer' }, minutes: { type: 'integer' }, ingredients: { type: 'array', items: { type: 'string' } }, steps: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } } };
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.ANTHROPIC_API_KEY || !url || !key) return res.status(503).json({ error: 'The Chef is not set up yet.', code: 'not_set_up' });
  // signed-in family members only
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const who = token ? await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: 'Bearer ' + token } }) : null;
  if (!who || !who.ok) return res.status(401).json({ error: 'Sign in first.' });
  const me = (await who.json()).id;
  const fam = await (await fetch(`${url}/rest/v1/members?user_id=eq.${me}&select=family_id`, { headers: { apikey: key, Authorization: 'Bearer ' + key } })).json();
  if (!Array.isArray(fam) || !fam.length) return res.status(403).json({ error: 'No family.' });

  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const kind = ['ideas', 'pantry', 'parse'].includes(b.kind) ? b.kind : null;
  const prompt = String(b.prompt || '').slice(0, 12000);
  if (!kind || !prompt) return res.status(400).json({ error: 'Bad request.' });
  const content = [];
  if (kind === 'parse' && b.image) {
    const mt = IMAGE_TYPES.has(b.mediaType) ? b.mediaType : 'image/jpeg';
    content.push({ type: 'image', source: { type: 'base64', media_type: mt, data: String(b.image).replace(/\s/g, '') } });
  }
  content.push({ type: 'text', text: prompt });

  try {
    const client = new Anthropic();
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: kind === 'parse' ? RECIPE : IDEAS } },
      messages: [{ role: 'user', content }],
    });
    if (msg.stop_reason === 'refusal') return res.status(422).json({ error: "The Chef couldn't help with that one.", code: 'refusal' });
    const text = msg.content.filter(c => c.type === 'text').map(c => c.text).join('');
    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'The AI key in Vercel is not working.', code: 'not_set_up' });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'The Chef is busy. Try again in a minute.' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: 'The Chef could not answer just now.' });
    return res.status(500).json({ error: 'The Chef could not answer just now.' });
  }
};
