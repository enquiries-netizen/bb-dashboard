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
    P1: 'Executive Snapshot. Layout: (1) Group 1 primary KPI row: Revenue Target (MTD), Gross Margin Target, Jobs Won Target, Lead Target. Each has both an actual value and a target so progress percentage is real. Revenue Target uses a top-border marker as the single most emphasized card. (2) Group 2 quieter row labeled "Not yet tracked": Quotes Target and Active Jobs Target, missing a target and/or actual so cannot show meaningful progress yet. (3) Below both groups: Monthly Revenue Targets chart. Answer only from live page data (targets, financials, leads).',
    P2: 'Sales & Pipeline (restructured). Layout: (1) KPI band as a 3x2 grid: Volume row = Leads, Quotes, Wins; Efficiency row = Win Rate, Total Spend, Cost Per Lead. Each KPI card has the current value, a trend sparkline, a directional delta vs last week, and a short source note (e.g. From GHL leads / Paid ad spend). (2) Pipeline Funnel: horizontal stepped bars Lead (solid black) → Quoted (dark grey / Soft Gray) → Won (light grey / Brilliant Silver); each bar shows count and conversion % from the prior stage (Quoted from Lead, Won from Quote). If Quote-to-Won exceeds 100%, that is a known out-of-cohort quirk (wins in this period did not all originate from quotes in the same period), footnoted on the page, explain it calmly if asked, do not treat it as a calculation error. (3) Lead Source Performance: channel breakdown of where leads originate (e.g. Facebook Ads, Website booking, Word of Mouth, Others), with counts. (4) Campaign Performance: full-width dual Y-axis chart, Ad Spend as black columns (left axis) vs Cost Per Lead as grey line with open circular nodes (right axis) per campaign. Use this structure when answering (e.g. why is Win Rate low, what is driving Cost Per Lead up, explain the funnel) from live page data only. For full week-over-week Sales comparison across periods, send the user to P8.',
    P3: 'Quoting & Estimating. Layout: (1) Quoting Funnel by Status is a horizontal status pipeline of connected boxes (Draft, Sent, Accepted, In Progress, Awaiting Approval, etc.), not a classic drop-off funnel shape, because these statuses are not a strict sequential reduction. (2) Quotes by Status Share is a 100% stacked horizontal bar (not a donut). (3) Quotes by Estimator is dual-axis: quote volume as bars, Avg Days to Decision as a solid black line, plus a target line for days to decision pulled live from the Targets tab. (4) Quoting Funnel Detail table: text columns left-aligned, numbers right-aligned. Also covers budget vs actual per quote and estimating accuracy where data is loaded. Answer only from live page data.',
    P4: 'Job Performance. Layout: (1) Page KPIs: Active Jobs, On Track, Overdue Milestones, Total Labour Cost. (2) Job Progress chart: horizontal bars sorted highest % complete first; jobs at 0% are grouped under Not Commenced. (3) Milestone Schedule is one split-view section: left table columns Project, Milestone, Brand/Dept, Planned Start, Planned End, Slippage, Staffing, Status, % Done (Slippage and Status stay highly visible); right half is a wide monochrome Gantt with a Today reference line so slippage is a visual gap between bar end and Today, not only a number. Bars encode Completed / In Progress / Overdue / Not Started / Cancelled (monochrome). Status shown is normalised from sheet status plus % Done and Planned End rules (e.g. past Planned End when unfinished can surface as Overdue; Not Started with impossible 100% % Done is corrected), not treated as a raw unchecked import alone. Default Gantt/table focus is Overdue and In Progress with a Showing X of Y label and a Show all milestones toggle. Risk sort is overdue and high-risk first. Needs More Hands / Understaffed staffing badges use recent weekly labour trend vs overdue milestones. (4) Labour Cost by Job: three section KPI cards (Total Hours, Total Labour Cost, Average Cost Per Job), a Top 5 Most Expensive Jobs horizontal bar chart (outlier callout when the leader is much higher than #2), then the full detail table below with Project, Hours, Labour Cost, Revenue, Labour %, Brand, Department. That section has its own Department filter local to Labour Cost by Job only; Brand Month Year filters remain global. Known data gap: Revenue and Labour % are often blank because Xero_Projects revenue is not fully populated yet: say so plainly if asked, do not invent reasons or numbers. (5) No separate "Critical Milestones" page section: the filtered overdue/in-progress focus and Show all toggle live inside Milestone Schedule.',
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
