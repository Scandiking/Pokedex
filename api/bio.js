// Vercel serverless function — calls Claude to synthesize a Pokédex bio.
// Set ANTHROPIC_API_KEY in your Vercel project environment variables.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'API not configured' });

  const { name, entries } = req.body || {};
  if (!name || !Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Missing name or entries' });
  }

  // Deduplicate and cap entries to keep prompt size reasonable
  const unique = [...new Set(entries)].slice(0, 12);

  const prompt =
    `You are writing a Pokédex bio. Here are official Pokédex descriptions for ${name}:\n\n` +
    unique.map((e, i) => `${i + 1}. ${e}`).join('\n') +
    `\n\nWrite a single cohesive 2–4 sentence bio that synthesizes the most interesting ` +
    `and unique facts. Do not repeat the same fact twice. Write in factual, concise ` +
    `Pokédex style — no first person, no "this Pokémon". Do not begin with the Pokémon's name. ` +
    `Respond with only the bio text, nothing else.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 280,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'Upstream API error' });
    }

    const data = await response.json();
    const bio = data.content?.[0]?.text?.trim() ?? '';
    return res.status(200).json({ bio });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
