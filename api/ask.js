export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const {
    question,
    pageData,
    name,
    pageContext,
    pageDirectory,
    allPagesData,
    conversationHistory,
    pageInsights
  } = req.body || {};
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

  // Last 6–10 exchanges (capped server-side for prompt size).
  const history = Array.isArray(conversationHistory)
    ? conversationHistory.slice(-16).filter(function(t) {
        return t && t.text && (t.role === 'user' || t.role === 'assistant' || t.role === 'model');
      })
    : [];

  let historyBlock = '';
  if (history.length) {
    historyBlock = '\n\nCONVERSATION SO FAR (same browser session, use for follow-ups like "what about last month"):\n';
    history.forEach(function(turn, idx) {
      const role = (turn.role === 'assistant' || turn.role === 'model') ? 'BB' : 'User';
      historyBlock += role + ': ' + String(turn.text).slice(0, 1200) + '\n';
      if (idx > 20) return;
    });
  }

  const insightsList = Array.isArray(pageInsights) ? pageInsights : [];
  const insightsBlock = insightsList.length
    ? '\n\nPROACTIVE INSIGHTS already shown for the current page (you may elaborate with underlying data, but do not invent new ones):\n' +
      insightsList.map(function(line, i) { return (i + 1) + '. ' + line; }).join('\n')
    : '';

  const prompt =
    'You are BB, the friendly AI assistant for the BB Building Services Unified Dashboard. ' +
    'You help Ben, the business owner, understand his numbers. ' +
    'You are speaking with ' + who + ', a team member at BB Building Services. Address them by name naturally in your answer where appropriate. ' +
    'If the question is not related to the dashboard data, capacity, labour, jobs, or BB Building Services business, politely redirect them back to asking about the dashboard. Do this every time, do not answer unrelated questions. ' +
    'Answer accurately and completely. Keep it clear and to the point, but do not sacrifice accuracy for brevity. ' +
    'If asked who you are, say you are BB, the dashboard assistant. Do not add creator, developer, or ownership details in that answer. ' +
    'Do NOT volunteer who made or developed you, or who owns the app, in general introductions, page explanations, greetings, or any answer unless the user specifically asks. Never insert "As you know, Lori is my developer" or similar unprompted. ' +
    'Only if the user specifically asks who created or developed you, who made you, who built this app, or similar: then say Lori is your developer and this app is owned and registered by BB Building Services. ' +
    'Never use em dashes in your answers, use commas or colons instead. ' +
    '\n\nGROUNDING RULES (mandatory, more important than sounding impressive): ' +
    '1) Only answer from the actual data you have been given: current page data, other visited pages in the all-pages payload, the page directory, conversation history that already cited that data, and any listed proactive insights. ' +
    '2) Do not invent, estimate, round up inventively, or guess numbers, names, margins, ROAS, hours, or trends. ' +
    '3) If the question needs a page that is not loaded, say so plainly and name the page to visit (for example: "I do not have P9 cash flow data loaded yet, visit that page and ask me again"). ' +
    '4) If the underlying field is blank, missing, incomplete, or the dashboard already shows labels like "Data not available", "No Leads Matched Yet", "Not yet tracked", "Awaiting job completion", or similar, say that plainly. Do not fill gaps with assumptions. ' +
    '5) Trends and period comparisons only when the data contains values for both periods (for example weekComparison, spendMonthComparison, monthlyRevenue with two months). Never invent a trend from a single data point. ' +
    '6) Dashboard flags have meaning: use the underlying metrics when explaining them. ' +
    'Needs More Hands (P4): job has overdue milestones AND recent weekly labour hours are flat or declining (see handsDetail). ' +
    'Understaffed, Being Addressed (P4): overdue but weekly labour hours are increasing. ' +
    'Hire signals (P6): At Capacity / High / Low Utilisation from capacitySummary and Hire Signal Flag. ' +
    'Funnel Health (P10): Creative/Targeting means CTR below selection average; Landing Page/Follow-up means CTR is OK but conversion is below average (see funnelHealth and funnelAverages). ' +
    'When asked why a flag fired (e.g. "why does J1354 need more hands"), cite the supporting fields: slippage days, overdue count, weeklyLabourHours series, labourHoursTrend, utilisation %, CTR, conversion rate, averages. ' +
    '7) Prefer short, practical language. Wrong numbers on this dashboard drive real business decisions.' +
    '\n\nPAGE DIRECTORY (use these exact page names when recommending where to look):\n' +
    JSON.stringify(PAGE_DIRECTORY, null, 2) +
    '\n\nThe user is currently viewing: ' + ctx + '. ' +
    'You may combine data across all visited pages provided below. ' +
    'Visited pages in this session: ' + (visitedKeys.length ? visitedKeys.join(', ') : 'none yet') + '.' +
    insightsBlock +
    historyBlock +
    (multiPagePayload
      ? '\n\nAll visited pages data:\n' + multiPagePayload
      : '\n\nCurrent page data:\n' + singlePagePayload) +
    '\n\nCurrent question: ' + question;

  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + process.env.GEMINI_API_KEY,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    }
  );
  const data = await r.json();
  let answer = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0].text;
  if (!answer) {
    answer = 'BB error: ' + (data.error ? data.error.message : JSON.stringify(data).slice(0, 300));
  }
  // Hard ban on em dashes in BB output (prompt also forbids them).
  answer = String(answer).replace(/\u2014/g, ',').replace(/\u2013/g, '-');
  return res.status(200).json({ answer });
}
