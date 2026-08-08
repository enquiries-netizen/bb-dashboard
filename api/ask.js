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
    P3: 'Quoting & Estimating (production-control dashboard). Period filters: Date Sent on Quotes / Date Quoted on accuracy (labelled). Layout: (1) Last updated line. (2) Six operational KPIs: In Progress, Due Next 7 Days, Overdue (accent only when overdue), Awaiting Decision ($), Average Turnaround with sample size and low-sample caveat when n is small, Average Quoted Margin (Pending if Est Margin blank - never fake 0%). (3) Quoting Work Queue stages in production order Brief Received → Scope Complete → Estimating → Internal Review → Sent/Awaiting Decision: count, value, avg days in stage, overdue, estimators - NOT a conversion funnel. (4) Production Schedule (collapsible): quote-production Gantt Scope/Site Measure/Estimating/Internal Review/Ready to Send with today line, submission milestone, overdue accent, margin-warning, unassigned hatched; missing inputs; upcoming submissions. (5) Estimator Capacity (hours preferred; pending/proxy if no booking hours) + Client-Decision Ageing value buckets 0-7 / 8-14 / 15-30 / 31+ days. (6) Action table exceptions first + View all quotes. (7) Estimating Accuracy historical only for completed jobs with final labour and material costs - else exact text that accuracy unavailable; estimator ranks only if ≥5 completed jobs with data; job budget/actual on P4. Quotes is the production quoting source (formerly GHL_Quotes; same sheet after rename). Never invent hours or 0% accuracy gauges. Answer only from live page data.',
    P4: 'Job Performance (decision dashboard). Layout: (1) Filters: global Brand/Month/Year plus page Department and Status (On track / Watch / At risk). No Project Manager filter unless field exists in sheets. (2) Five KPIs: Active Projects, Contract Value (sum Total Budget, abbreviated), Forecast Gross Margin (Pending / Awaiting Xero_Bills when Total Actual incomplete), Labour Variance (Pending - budgeted labour source TBD), Projects at Risk (orange accent only for risk). (3) Project Health Gantt: one row per project with progress, pending margin/labour variance, status dots; muted planned bar + progress bar (orange only if at risk); Today dashed line; key milestone markers. (4) Budget consumption vs completion bubble chart (partial actuals = labour+variations until Total Actual live). (5) Exceptions table: top At risk then Watch; View all expands Job Costing Overview with exact figures and Labour cost as % of budget. (6) Project drawer: budget/actual/forecast bars (pending where incomplete) + milestone list. (7) Milestone Schedule Gantt preserved in collapsible section. Health rules: At risk = Needs More Hands, slip>=21d, overdue>=2, or late progress vs time; Watch = mild slip/understaffed/1 overdue; else On track. Live data only from Xero_Projects, Buildpass_Labour, Milestone Schedule. Never invent $0 for incomplete formulas.',
    P5: 'Profitability (exception-led financial dashboard, monthly not weekly). Layout: (1) Data-quality banner + Last updated + completeness; Partial when supplier bills incomplete, AR unassigned, Jul-Aug targets missing. (2) Six KPIs: Revenue YTD, Gross Profit YTD, Gross Margin, Net/Operating Profit, Overhead Variance (Favourable/Adverse), Margin at Risk. Small overdue debtors indicator only; full AR on P9 Cash Flow. (3) Metric-switch trend chart (Revenue/GP/Net Profit/GM%) for all 12 months: actual to current month, target line (Target not set when missing, never zero), forecast for future, prior year, current-month break mark; GM swings (e.g. May vs June) flagged as anomaly for validation. (4) Profit waterfall Revenue→Materials→Direct Labour→Subcontractors→Other Direct→GP→Overheads→Net with Consolidated/BBBS/RMH/Department toggles; Pending partial steps when cost splits unavailable. (5) Project margin health table + bubble (X completion %, Y forecast GM, size contract, colour status; incomplete = Data Incomplete neutral colour) and margin bridge for selected project. (6) Overhead exception heatmap categories x months + top exceptions table + Action panel max 5 real exceptions. Never invent numbers. Orange only for real margin/cost risk; data gaps use neutral grey. Answer only from live P5 page data.',
    P6: 'Capacity & Labour (dual-mode resource-planning workspace). Modes: Capacity Planning (default) | Actuals & Timesheets. Every visual shares one selected ISO planning week (not Month/Year primary). Planning KPIs: Available Capacity, Scheduled Hours, Forecast Utilisation (Scheduled/Available), Overallocated Capacity (people + excess hours), Unallocated Capacity, Forecast Labour Cost (vs project labour budget Pending when incomplete). Layout planning: left ~70% Crew Allocation Gantt (Dept → Crew → Employee, crews collapsed by default; People/Project view; daily weeks 1-4 + weekly 5-12; muted project bars, tentative outlined, leave hatched, overallocation accent stripe, actual overlay); right ~30% 12-week department capacity heatmap (util vs dept availability; bands <60 under / 60-85 healthy / 85-100 watch / >100 over / grey gap); lower Planned vs Actual/Forecast chart + Capacity Exceptions action table (Priority, Issue, Impact, Action). Employee detail tables behind drill-down only on planning. Actuals mode: logged vs planned/available, productive/non-productive, overtime (not auto timesheet error), missing/unusual timesheets, labour cost once per employee-week, timesheet detail tables live here. Low logged is not spare capacity until missing timesheets ruled out. Never invent hours. Live: Capacity, Buildpass_Labour (deduped). Forward schedule, diaries allocation, project demand, labour budgets: Pending. Week-over-week Capacity totals on P8. Answer only from live page data.',
    P7: 'Client Satisfaction (placeholder). Page shows title and notice that data is being finalised. Full customer-journey rebuild paused until updated Client Satisfaction data arrives. Answer only that the page is parked / pending data finalisation; do not invent CSAT, NPS, or review metrics.',
    P8: 'Weekly Overview (management meeting dashboard). One reporting period for the whole page via Week Ending selector (ISO week Mon-Sun), shown as "Week ending D Month YYYY · range". Six KPI cards (Revenue, Leads and Qualified, Quotes Sent, Jobs Won, Productive Labour, Project Delivery) each with Actual, Target, Absolute Variance, Previous Week, 4-Week Average, Status. Secondary strip: Gross Margin, Cash Collected, Overdue AR, Variations Awaiting Approval, Safety/Quality Incidents, Customer Issues. Scorecard table (Area/KPI/This Week/Target/Last Week/4-Week Avg/Status) linking to P2/P3/P4/P5/P6. Management Attention table from real exceptions only. Four 8-week small-multiple trends (not dual-axis): Sales funnel, Financial, Delivery, Workforce, each with 4-week average line. Seven-day commitments timeline Mon-Fri. Wins/Risks/Decisions max 3 real items each. Data freshness table for Sales/CRM, Xero, Labour, Marketing. Never invent numbers; blanks use 0 | Not available | Not yet posted | Not applicable. Orange only for At Risk / overdue / high priority. Answer only from live P8 page data.',
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
    'A single weekPulse number on P2, P6, or P10 is not enough for full week comparison: direct the user to P8 (Weekly Overview) for the management meeting dashboard with shared Week Ending period, scorecard, and trends. ' +
    '6) Dashboard flags have meaning: use the underlying metrics when explaining them. ' +
    'Needs More Hands (P4): job has overdue milestones AND recent weekly labour hours are flat or declining (see handsDetail). ' +
    'Understaffed, Being Addressed (P4): overdue but weekly labour hours are increasing. ' +
    'Planning signals (P6): Underallocated / Healthy / Near Capacity / Overallocated / Allocation Conflict from capacitySummary; timesheet statuses Complete / Missing / Overtime Recorded / Unusual Hours are separate from planning. ' +
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
