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
    P1: 'Executive Snapshot (decision cockpit). Layout: (1) Six KPI cards: Revenue, Gross Margin, Operating Profit, Cash Position, Secured Workload, Project Health. Actual is hero; target/variance secondary; status On track/Watch/Off track. Jobs won and leads are P2 only. (2) Performance vs plan chart (Revenue / Gross Profit / Operating Profit toggle). (3) Portfolio health with P4 status rules + link to P4. (4) Cash outlook and Workload/capacity. (5) Executive action panel from real exceptions only. Pending or Awaiting data when sources not live - never invent numbers. Answer only from live page data.',
    P2: 'Sales & Pipeline (decision dashboard). Period filters: Date Created on leads and opportunities (labelled on page). Layout: (1) Six primary KPIs: Open Pipeline Value, Weighted Pipeline (value x Probability %), Target Coverage (weighted / future revenue targets - pending if no targets), Quotes Outstanding (count + $), Quote Win Rate by count and by value (wins / closed quotes ONLY - not lead-to-win), Stalled Pipeline (14+ days no activity - threshold confirm with Lori/Ben). Secondary: avg won job value, median sales cycle, pipeline added this month, funnel rates Lead-to-Quote / Quote-to-Win / Lead-to-Win labelled separately. (2) Pipeline funnel stages New Lead → Qualified → Site Visit → Quote Sent → Follow-up/Negotiation → Won/Lost with count/value toggle (default Value). (3) Revenue forecast by Expected Close month: committed / likely / early-stage stack + target line when Targets live. (4) Pipeline movement waterfall: Pending without opening/closing snapshots. (5) Source quality table + bubble chart; channel concentration risk callout if one source ~80-85%+ of leads; CPL labelled paid leads only when from Marketing_Paid; full ad analysis on P10. (6) Opportunities requiring action (exceptions first) + View all; deal-ageing Gantt top 10. Placeholder Value $1 display "Value not entered" and exclude from weighted totals. Pending/Awaiting when sheet or columns empty - never invent numbers. For week-over-week Sales go to P8.',
    P3: 'Quoting & Estimating. Layout: (1) Quoting Funnel by Status is a horizontal status pipeline of connected boxes (Draft, Sent, Accepted, In Progress, Awaiting Approval, etc.), not a classic drop-off funnel shape, because these statuses are not a strict sequential reduction. (2) Quotes by Status Share is a 100% stacked horizontal bar (not a donut). (3) Quotes by Estimator is dual-axis: quote volume as bars, Avg Days to Decision as a solid black line, plus a target line for days to decision pulled live from the Targets tab. (4) Quoting Funnel Detail table: text columns left-aligned, numbers right-aligned. Also covers budget vs actual per quote and estimating accuracy where data is loaded. Answer only from live page data.',
    P4: 'Job Performance (decision dashboard). Layout: (1) Filters: global Brand/Month/Year plus page Department and Status (On track / Watch / At risk). No Project Manager filter unless field exists in sheets. (2) Five KPIs: Active Projects, Contract Value (sum Total Budget, abbreviated), Forecast Gross Margin (Pending / Awaiting Xero_Bills when Total Actual incomplete), Labour Variance (Pending - budgeted labour source TBD), Projects at Risk (orange accent only for risk). (3) Project Health Gantt: one row per project with progress, pending margin/labour variance, status dots; muted planned bar + progress bar (orange only if at risk); Today dashed line; key milestone markers. (4) Budget consumption vs completion bubble chart (partial actuals = labour+variations until Total Actual live). (5) Exceptions table: top At risk then Watch; View all expands Job Costing Overview with exact figures and Labour cost as % of budget. (6) Project drawer: budget/actual/forecast bars (pending where incomplete) + milestone list. (7) Milestone Schedule Gantt preserved in collapsible section. Health rules: At risk = Needs More Hands, slip>=21d, overdue>=2, or late progress vs time; Watch = mild slip/understaffed/1 overdue; else On track. Live data only from Xero_Projects, Buildpass_Labour, Milestone Schedule. Never invent $0 for incomplete formulas.',
    P5: 'Profitability (monthly focus, not weekly). Layout: (1) KPI row of five cards: Revenue, Gross Margin, Net Profit, Net Margin, and Accounts Receivable (renamed from Outstanding Invoices). AR is a balance shown as At [date], not a period P&L flow, and has a top-border attention marker. (2) Brand-level charts: Revenue vs Target and Net Profit vs Target use solid actual bars with a target reference line and direct variance labels (not dual competing bar series). Immaterial variances under about $500 are omitted or shown as roughly zero. (3) Overhead Variance is a months-by-brand variance matrix table with small inline micro-bars, not a dual grey chart. (4) Reporting periods use explicit date ranges (e.g. 1 Apr - 31 Jul 2026), never ambiguous shorthand. Monthly only: say so if asked for weekly P5. Planned later, not built yet: a second KPI band for working capital/cash style metrics and a risk/exceptions intervention table; both wait on fuller Xero data. If asked for those or for cash/WC on P5, say they are not available yet on this page, do not invent figures. Answer only from live P5 page data.',
    P6: 'Capacity & Labour. Layout: (1) Utilisation shape encoding (monochrome, not traffic colours): solid black circle At Capacity/Overworked (over 100%), half-filled circle High (75-100%), open circle Healthy (50-75%), light grey circle or down marker Low (under 50%). Utilisation over roughly 120% is flagged as a data/timesheet check (likely a timesheet data error, not trusted real hours), not treated as normal overwork. (2) Team Utilisation is a bullet-style chart with a 100% capacity reference line; hours beyond 100% render as a distinct overtime segment. (3) Total Team Hours Trend uses a stepped line (weekly hours are discrete), not a smooth curve. (4) Labour Detail shows Pending Timesheet instead of a calculated cost when hours are blank/missing. (5) Department hiring callout (separate banner, not per person) only when a department average utilisation stays above 100% for 3 or more consecutive weeks; hidden entirely if none qualify. Also has a lightweight this-week hours pulse with a short trend, not full week-over-week comparison. For week-over-week Capacity hours, send the user to P8. Answer only from live page data (capacitySummary, labour rows, departmentHiringSignals).',
    P7: 'Client Satisfaction: reviews and ratings',
    P8: 'Weekly Overview: the week-over-week comparison hub. Full this-week vs last-week for Sales (leads, won), Capacity (hours logged), and Marketing (spend, leads), all on one page. Use P8 when asked for week-over-week on P2/P6/P10.',
    P9: 'Cash Flow & Forecast: 13-week rolling forecast, AR ageing (monthly cash focus, not the Sales/Capacity/Marketing week-over-week hub)',
    P10: 'Marketing: ad spend, leads, CPL, ROAS, campaign performance. Has a lightweight this-week pulse (spend / leads) on KPI cards with a short trend, not full week-over-week comparison. For week-over-week Marketing, send the user to P8.',
    P11: 'Quality & Variations: defects/rework, variations log, site diary issues'
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
    '5) Trends and period comparisons only when the data contains values for both periods (for example weekOverWeek on P8, weekComparison, spendMonthComparison, monthlyRevenue with two months). Never invent a trend from a single data point. ' +
    'A single weekPulse number on P2, P6, or P10 is not enough for week-over-week: direct the user to P8 (Weekly Overview) for full this-week vs last-week across Sales, Capacity, and Marketing. ' +
    '6) Dashboard flags have meaning: use the underlying metrics when explaining them. ' +
    'Needs More Hands (P4): job has overdue milestones AND recent weekly labour hours are flat or declining (see handsDetail). ' +
    'Understaffed, Being Addressed (P4): overdue but weekly labour hours are increasing. ' +
    'Hire signals (P6): At Capacity / High / Low Utilisation from capacitySummary and Hire Signal Flag. ' +
    'Funnel Health (P10): Creative/Targeting means CTR below selection average; Landing Page/Follow-up means CTR is OK but conversion is below average (see funnelHealth and funnelAverages). ' +
    'When asked why a flag fired (e.g. "why does J1354 need more hands"), cite the supporting fields: slippage days, overdue count, weeklyLabourHours series, labourHoursTrend, utilisation %, CTR, conversion rate, averages. ' +
    '7) Prefer short, practical language. Wrong numbers on this dashboard drive real business decisions. ' +
    'When something is not in the data, say "data not available" (or the exact label the dashboard uses) rather than guessing.' +
    '\n\nKNOWN DATA GAPS (static facts you already know; do not try to infer automation coverage from page numbers alone): ' +
    'RMH automation and data coverage is currently incomplete. ' +
    '1) RMH Meta Ads / marketing data is not fully covered yet: the RMH marketing scenario that would mirror the BBBS Make.com scenario 5186532 has not been built. ' +
    '2) RMH Xero financial data is still awaiting DIV approval, so revenue and related figures may be missing or empty in the sheet. ' +
    'When the brand filter is RMH (or the user asks about RMH) and they ask about revenue, marketing spend, ad performance, or other financial figures, ' +
    'and the loaded data shows $0, blank, missing values, "Not yet tracked", or something that looks like full miss such as "100% under target", ' +
    'proactively note that this may reflect incomplete RMH data coverage, not necessarily a true zero or true total miss against target. ' +
    'Do not state either that the business result is definitely zero or that the automation is definitely the sole cause. ' +
    'Suggest confirming with Ben or Emily. Apply this caution only for RMH in these gap areas; do not weaken clear BBBS numbers.' +
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
