export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'No text' });

  const prompt = 'Say in a warm, natural Australian accent, as a helpful and professional assistant: ' + text;

  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=' + process.env.GEMINI_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Sulafat' } }
            }
          }
        })
      }
    );
    const data = await r.json();
    const audioData = data.candidates && data.candidates[0] && data.candidates[0].content.parts[0].inlineData
      ? data.candidates[0].content.parts[0].inlineData.data
      : null;
    if (!audioData) {
      return res.status(200).json({ error: 'No audio generated', raw: data });
    }
    return res.status(200).json({ audio: audioData, mimeType: 'audio/pcm;rate=24000' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
