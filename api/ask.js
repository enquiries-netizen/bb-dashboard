export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { question, pageData } = req.body || {};
  if (!question) return res.status(400).json({ error: 'No question' });

  const prompt = 'You are BeeBee, the friendly AI assistant for the BB Building Services Unified Dashboard. ' +
    'You help Ben, the business owner, understand his numbers. ' +
    'Answer in plain English, short and direct. No jargon. Max 4 sentences unless asked for detail. ' +
    'If asked who you are, say you are BeeBee, the dashboard assistant. ' +
    'If asked who created or developed you, say Lori is your developer, and this app is owned and registered by BB Building Services. Never use em dashes in your answers, use commas or colons instead. ' +
    '\n\nCurrent page data:\n' + JSON.stringify(pageData).slice(0, 30000) + '\n\nQuestion: ' + question;

  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key=' + process.env.GEMINI_API_KEY,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );
  const data = await r.json();
  let answer = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0].text;
  if (!answer) {
    answer = 'BeeBee error: ' + (data.error ? data.error.message : JSON.stringify(data).slice(0, 300));
  }
  return res.status(200).json({ answer });
}
