export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { question, pageData, name, pageContext, pageDirectory, allPagesData } = req.body || {};
  if (!question) return res.status(400).json({ error: 'No question' });

  const who = (name && String(name).trim()) || 'a team member';
  const ctx = (pageContext && String(pageContext).trim()) || 'unknown page';

  const PAGE_DIRECTORY = pageDirectory || {
    P1: 'Executive Snapshot — revenue, margin, lead, quote, and jobs-won targets vs actuals',
    P2: 'Sales & Pipeline — leads by source, pipeline funnel (Contacted / Quoted / Won)',
    P3: 'Quoting & Estimating — quote funnel, budget vs actual per quote, estimator accuracy',
    P4: 'Job Performance — milestone/schedule slippage per job, labour hours per job, Needs More Hands flag',
    P5: 'Profitability — revenue, margin, and overhead by brand and department',
    P6: 'Capacity & Labour — team utilisation %, hiring signal, hours by department',
    P7: 'Client Satisfaction — reviews and ratings',
    P8: 'Weekly Overview — weekly KPI summary',
    P9: 'Cash Flow & Forecast — 13-week rolling forecast, AR ageing',
    P10: 'Marketing — ad spend, leads, CPL, ROAS, campaign performance',
    P11: 'Quality & Variations — defects/rework, variations log, site diary issues'
  };

  const visitedKeys = allPagesData && typeof allPagesData === 'object'
    ? Object.keys(allPagesData)
    : [];

  const multiPagePayload = allPagesData && typeof allPagesData === 'object' && visitedKeys.length
    ? JSON.stringify(allPagesData).slice(0, 80000)
    : null;

  const singlePagePayload = pageData != null
    ? JSON.stringify(pageData).slice(0, 30000)
    : '{}';

  const prompt = 'You are BB, the friendly AI assistant for the BB Building Services Unified Dashboard. ' +
    'You help Ben, the business owner, understand his numbers. ' +
    'You are speaking with ' + who + ', a team member at BB Building Services. Address them by name naturally in your answer where appropriate. ' +
    'If the question is not related to the dashboard data, capacity, labour, jobs, or BB Building Services business, politely redirect them back to asking about the dashboard. Do this every time, do not answer unrelated questions. ' +
    'Answer accurately and completely. Keep it clear and to the point, but do not sacrifice accuracy for brevity. ' +
    'If asked who you are, say you are BB, the dashboard assistant. ' +
    'If asked who created or developed you, say Lori is your developer, and this app is owned and registered by BB Building Services. Never use em dashes in your answers, use commas or colons instead. ' +
    '\n\nPAGE DIRECTORY (use these exact page names when recommending where to look):\n' +
    JSON.stringify(PAGE_DIRECTORY, null, 2) +
    '\n\nThe user is currently viewing: ' + ctx + '. ' +
    'You may combine data across all visited pages provided below. ' +
    'If a question needs data from a page that is NOT present in the loaded page data, say so plainly and name the specific page to visit ' +
    '(for example: "I don\'t have P9\'s cash flow data loaded yet, visit that page and ask me again for the full picture"). ' +
    'Do not guess or invent numbers for missing pages. ' +
    'Visited pages in this session: ' + (visitedKeys.length ? visitedKeys.join(', ') : 'none yet') + '.' +
    (multiPagePayload
      ? '\n\nAll visited pages data:\n' + multiPagePayload
      : '\n\nCurrent page data:\n' + singlePagePayload) +
    '\n\nQuestion: ' + question;

  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + process.env.GEMINI_API_KEY,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );
  const data = await r.json();
  let answer = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0].text;
  if (!answer) {
    answer = 'BB error: ' + (data.error ? data.error.message : JSON.stringify(data).slice(0, 300));
  }
  return res.status(200).json({ answer });
}
