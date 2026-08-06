export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  // CORS headers so ChatGPT Action can call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    
    // Accept either { rows: [...] } or raw array
    let rows = Array.isArray(body) ? body : body.rows;
    
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows provided' });
    }

    // Normalise: each element must be { values: [...] }
    const normalised = rows.map(r => Array.isArray(r) ? { values: r } : r);

    // Validate: each row must have 10 values
    const invalid = normalised.filter(r => !r.values || r.values.length !== 10);
    if (invalid.length > 0) {
      return res.status(400).json({ 
        error: `${invalid.length} rows have wrong column count (expected 10)`,
        sample: invalid[0]
      });
    }

    const MAKE_WEBHOOK = 'https://hook.us2.make.com/925nhbrojtbqmziir9tgtjc5m5fv1inb';
    
    const makeRes = await fetch(MAKE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: normalised })
    });

    const makeText = await makeRes.text();

    if (!makeRes.ok && makeText !== 'Accepted') {
      return res.status(502).json({ error: 'Make webhook failed', detail: makeText });
    }

    return res.status(200).json({
      success: true,
      rowsReceived: normalised.length,
      makeResponse: makeText,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}