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
    pageInsights,
    mode,
    libraryGuides,
    toolContinue,
    geminiContents,
    toolResults
  } = req.body || {};

  // Tool-continue rounds may omit question (already in geminiContents).
  if (!toolContinue && !question) return res.status(400).json({ error: 'No question' });

  const who = (name && String(name).trim()) || 'a team member';
  const ctx = (pageContext && String(pageContext).trim()) || 'unknown page';
  const GEMINI_URL =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' +
    process.env.GEMINI_API_KEY;

  function stripEmDashes(text) {
    return String(text || '').replace(/\u2014/g, ',').replace(/\u2013/g, '-');
  }

  async function callGemini(body) {
    const r = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return r.json();
  }

  function extractAnswer(data) {
    const parts =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts;
    if (!parts || !parts.length) {
      return {
        answer:
          'BB error: ' +
          (data && data.error ? data.error.message : JSON.stringify(data || {}).slice(0, 300)),
        functionCalls: []
      };
    }
    const functionCalls = [];
    const textBits = [];
    parts.forEach(function (p) {
      if (p.functionCall && p.functionCall.name) {
        functionCalls.push({
          name: p.functionCall.name,
          args: p.functionCall.args || {}
        });
      } else if (p.text) {
        textBits.push(p.text);
      }
    });
    return {
      answer: textBits.length ? textBits.join('\n') : '',
      functionCalls: functionCalls,
      modelContent: { role: 'model', parts: parts }
    };
  }

  // ─── Library mode (BBBS Internal Hub): ground ONLY in Library_Guides ───
  // Separate path so BB AI dashboard prompting is unchanged.
  // API mode key stays "library"; page route is internal-hub.
  if (mode === 'library') {
    const guides = Array.isArray(libraryGuides) ? libraryGuides : [];
    const history = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-16).filter(function (t) {
          return t && t.text && (t.role === 'user' || t.role === 'assistant' || t.role === 'model');
        })
      : [];

    let historyBlock = '';
    if (history.length) {
      historyBlock = '\n\nCONVERSATION SO FAR (same browser session, use for follow-ups):\n';
      history.forEach(function (turn) {
        const role = turn.role === 'assistant' || turn.role === 'model' ? 'BB' : 'User';
        historyBlock += role + ': ' + String(turn.text).slice(0, 1200) + '\n';
      });
    }

    let prompt;
    if (!guides.length) {
      prompt =
        'You are BB, the BBBS Internal Hub assistant for BB Building Services. ' +
        'You are speaking with ' +
        who +
        '. ' +
        'The Library_Guides sheet is empty or not available yet. ' +
        'Reply with exactly this message (you may greet them by name first): ' +
        '"Internal Hub content is still being added, check back soon." ' +
        'Do not answer from general knowledge. Do not invent guides. ' +
        'Never use em dashes in your answers, use commas or colons instead.' +
        historyBlock +
        '\n\nCurrent question: ' +
        question;
    } else {
      const guidesPayload = JSON.stringify(guides).slice(0, 80000);
      prompt =
        'You are BB, the BBBS Internal Hub assistant for BB Building Services. ' +
        'You help team members find how-to guides and internal info from the company Internal Hub only. ' +
        'You are speaking with ' +
        who +
        '. Address them by name naturally where appropriate. ' +
        'GROUNDING RULES (mandatory): ' +
        '1) Answer ONLY from the INTERNAL HUB GUIDES data provided below. Do not use general knowledge. ' +
        '2) Do not invent steps, policies, tools, or guides that are not in the data. ' +
        '3) If no guide matches the question, say plainly that no guide was found for that topic. ' +
        'Do not guess or fill gaps. Suggest they try different wording only if helpful. ' +
        '4) When a guide matches, use its Title, Category, Content/Steps, and Media Link as relevant. ' +
        '5) Prefer clear, practical language. Never use em dashes; use commas or colons instead. ' +
        '6) If asked who you are, say you are BB, the BBBS Internal Hub assistant. ' +
        'Do not volunteer developer or ownership details unless specifically asked; ' +
        'if asked who built this app, say Lori is your developer and the app is owned by BB Building Services.' +
        historyBlock +
        '\n\nINTERNAL HUB GUIDES (sole source of truth):\n' +
        guidesPayload +
        '\n\nCurrent question: ' +
        question;
    }

    const dataLib = await callGemini({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const extractedLib = extractAnswer(dataLib);
    let answerLib = extractedLib.answer;
    if (!answerLib) {
      answerLib =
        'BB error: ' +
        (dataLib.error ? dataLib.error.message : JSON.stringify(dataLib).slice(0, 300));
    }
    return res.status(200).json({ answer: stripEmDashes(answerLib) });
  }

  // ─── Cross-page tools. Client executes (sheets in browser); server only orchestrates. ───
  const BB_TOOLS = [
    {
      function_declarations: [
        {
          name: 'getPageData',
          description:
            'Load live dashboard data for any page (P1-P12) on demand without the user visiting that page. Use when the question needs Marketing, Cash Flow, Sales, Profitability, Capacity, Weekly Overview, or any other page that is not already in the visited-pages payload. Accepts page ids (P10, p10) or names (Marketing, Cash Flow). Call multiple times if the question spans pages. Prefer the specialised attendance/diary tools for worker hours or diary quality scores.',
          parameters: {
            type: 'object',
            properties: {
              pageName: {
                type: 'string',
                description:
                  'Page id or alias, e.g. P10, Marketing, P9, Cash Flow, P2, Sales, P8, Weekly Overview.'
              }
            },
            required: ['pageName']
          }
        },
        {
          name: 'getWorkerAttendance',
          description:
            'Get Buildpass attendance for one worker in a Fri-Thu payroll week: hours on site, missing sign-off count, auto sign-off count. Use when the user asks about a person hours, sign-off, or attendance. weekStart is optional YYYY-Www; omit for the current payroll week.',
          parameters: {
            type: 'object',
            properties: {
              workerName: {
                type: 'string',
                description: 'Team member name to look up (partial names ok).'
              },
              weekStart: {
                type: 'string',
                description:
                  'Optional payroll week key YYYY-Www (Fri-Thu week keyed by Friday ISO week). Omit for current payroll week.'
              }
            },
            required: ['workerName']
          }
        },
        {
          name: 'getJobAttendance',
          description:
            'Get Buildpass attendance hours on site for one job number or site in a Fri-Thu payroll week. Use for job/site attendance questions.',
          parameters: {
            type: 'object',
            properties: {
              jobNumberOrSite: {
                type: 'string',
                description: 'Job number and/or site name as shown in Buildpass_Attendance.'
              },
              weekStart: {
                type: 'string',
                description:
                  'Optional payroll week key YYYY-Www. Omit for current payroll week.'
              }
            },
            required: ['jobNumberOrSite']
          }
        },
        {
          name: 'getDiaryQuality',
          description:
            'Get site diary quality score and missing checklist summary for one job or person-only group in a payroll week. Reuses P12 diary quality rules.',
          parameters: {
            type: 'object',
            properties: {
              jobOrPersonGroup: {
                type: 'string',
                description:
                  'Job number, job name, or person-only group label (e.g. Melis Record Keeping).'
              },
              weekStart: {
                type: 'string',
                description:
                  'Optional payroll week key YYYY-Www. Omit for current payroll week.'
              }
            },
            required: ['jobOrPersonGroup']
          }
        },
        {
          name: 'getTeamDiaryQualitySummary',
          description:
            'Get the full Team Diary Quality leaderboard for a Fri-Thu payroll week (scores and missing summaries for all groups).',
          parameters: {
            type: 'object',
            properties: {
              weekStart: {
                type: 'string',
                description:
                  'Optional payroll week key YYYY-Www. Omit for current payroll week.'
              }
            }
          }
        }
      ]
    }
  ];

  // Continuation: client executed tools; feed function responses back to Gemini.
  if (toolContinue) {
    if (!Array.isArray(geminiContents) || !geminiContents.length) {
      return res.status(400).json({ error: 'Missing geminiContents for tool continue' });
    }
    if (!Array.isArray(toolResults) || !toolResults.length) {
      return res.status(400).json({ error: 'Missing toolResults for tool continue' });
    }

    const contents = geminiContents.slice();
    const responseParts = toolResults.map(function (tr) {
      return {
        functionResponse: {
          name: String(tr && tr.name ? tr.name : 'unknown'),
          response:
            tr && tr.response && typeof tr.response === 'object'
              ? tr.response
              : { result: tr && tr.response != null ? tr.response : 'No result' }
        }
      };
    });
    contents.push({ role: 'user', parts: responseParts });

    const dataCont = await callGemini({
      contents: contents,
      tools: BB_TOOLS
    });
    const extractedCont = extractAnswer(dataCont);

    if (extractedCont.functionCalls.length) {
      const nextContents = contents.concat([extractedCont.modelContent]);
      return res.status(200).json({
        needsTools: true,
        toolCalls: extractedCont.functionCalls,
        geminiContents: nextContents
      });
    }

    let answerCont = extractedCont.answer;
    if (!answerCont) {
      answerCont =
        'BB error: ' +
        (dataCont.error ? dataCont.error.message : JSON.stringify(dataCont).slice(0, 300));
    }
    return res.status(200).json({ answer: stripEmDashes(answerCont) });
  }

  const PAGE_DIRECTORY = pageDirectory || {
    P1: 'Executive Snapshot (decision cockpit). Layout: (1) Six KPI cards: Revenue, Gross Margin, Operating Profit, Cash Position, Secured Workload, Project Health. Actual is hero; target/variance secondary; status On track/Watch/Off track. Jobs won and leads are P2 only. (2) Performance vs plan chart (Revenue / Gross Profit / Operating Profit toggle). (3) Portfolio health with P4 status rules + link to P4. (4) Cash outlook and Workload/capacity. (5) Executive action panel from real exceptions only. Pending or Awaiting data when sources not live - never invent numbers. Answer only from live page data.',
    P2: 'Sales & Pipeline (placeholder). Page shows title and notice that data is being finalised. Decision-dashboard rebuild paused until Sales & Pipeline data is finalised. Answer only that the page is parked / pending data finalisation; do not invent pipeline, quote, or funnel metrics.',
    P3: 'Quoting & Estimating (production-control dashboard). Period filters: Date Sent on Quotes / Date Quoted on accuracy (labelled). Layout: (1) Last updated line. (2) Six operational KPIs: In Progress, Due Next 7 Days, Overdue (accent only when overdue), Awaiting Decision ($), Average Turnaround with sample size and low-sample caveat when n is small, Average Quoted Margin (Pending if Est Margin blank - never fake 0%). (3) Quoting Work Queue stages in production order Brief Received to Scope Complete to Estimating to Internal Review to Sent/Awaiting Decision: count, value, avg days in stage, overdue, estimators - NOT a conversion funnel. (4) Production Schedule (collapsible): quote-production Gantt Scope/Site Measure/Estimating/Internal Review/Ready to Send with today line, submission milestone, overdue accent, margin-warning, unassigned hatched; missing inputs; upcoming submissions. (5) Estimator Capacity (hours preferred; pending/proxy if no booking hours) + Client-Decision Ageing value buckets 0-7 / 8-14 / 15-30 / 31+ days. (6) Action table exceptions first + View all quotes. (7) Estimating Accuracy historical only for completed jobs with final labour and material costs - else exact text that accuracy unavailable; estimator ranks only if 5+ completed jobs with data; job budget/actual on P4. Quotes is the production quoting source (formerly GHL_Quotes; same sheet after rename). Never invent hours or 0% accuracy gauges. Answer only from live page data.',
    P4: 'Job Performance (decision dashboard). Layout: (1) Filters: global Brand/Month/Year plus page Department and Status (On track / Watch / At risk). No Project Manager filter unless field exists in sheets. (2) Five KPIs: Active Projects, Contract Value (sum Total Budget, abbreviated), Forecast Gross Margin (Pending / Awaiting Xero_Bills when Total Actual incomplete), Labour Variance (Pending - budgeted labour source TBD), Projects at Risk (orange accent only for risk). (3) Project Health Gantt: one row per project with progress, pending margin/labour variance, status dots; muted planned bar + progress bar (orange only if at risk); Today dashed line; key milestone markers. (4) Budget consumption vs completion bubble chart (partial actuals = labour+variations until Total Actual live). (5) Exceptions table: top At risk then Watch; View all expands Job Costing Overview with exact figures and Labour cost as % of budget. (6) Project drawer: budget/actual/forecast bars (pending where incomplete) + milestone list. (7) Milestone Schedule Gantt preserved in collapsible section. Health rules: At risk = Needs More Hands, slip>=21d, overdue>=2, or late progress vs time; Watch = mild slip/understaffed/1 overdue; else On track. Live data only from Xero_Projects, Buildpass_Labour, Milestone Schedule. Never invent $0 for incomplete formulas.',
    P5: 'Profitability (exception-led financial dashboard, monthly not weekly). Layout: (1) Data-quality banner + Last updated + completeness; Partial when supplier bills incomplete, AR unassigned, Jul-Aug targets missing. (2) Six KPIs: Revenue YTD, Gross Profit YTD, Gross Margin, Net/Operating Profit, Overhead Variance (Favourable/Adverse), Margin at Risk. Small overdue debtors indicator only; full AR on P9 Cash Flow. (3) Metric-switch trend chart (Revenue/GP/Net Profit/GM%) for all 12 months: actual to current month, target line (Target not set when missing, never zero), forecast for future, prior year, current-month break mark; GM swings (e.g. May vs June) flagged as anomaly for validation. (4) Profit waterfall Revenue to Materials to Direct Labour to Subcontractors to Other Direct to GP to Overheads to Net with Consolidated/BBBS/RMH/Department toggles; Pending partial steps when cost splits unavailable. (5) Project margin health table + bubble (X completion %, Y forecast GM, size contract, colour status; incomplete = Data Incomplete neutral colour) and margin bridge for selected project. (6) Overhead exception heatmap categories x months + top exceptions table + Action panel max 5 real exceptions. Never invent numbers. Orange only for real margin/cost risk; data gaps use neutral grey. Answer only from live P5 page data.',
    P6: 'Capacity & Labour (dual-mode resource-planning workspace). Modes: Capacity Planning (default) | Actuals & Timesheets. Every visual shares one selected ISO planning week (not Month/Year primary). Planning KPIs: Available Capacity, Scheduled Hours, Forecast Utilisation (Scheduled/Available), Overallocated Capacity (people + excess hours), Unallocated Capacity, Forecast Labour Cost (vs project labour budget Pending when incomplete). Layout planning: full-width Crew Allocation Gantt (Dept to Crew to Employee, crews collapsed by default; People/Project view; daily weeks 1-4 + weekly 5-12); lower Planned vs Actual/Forecast chart + 8-week dept capacity heatmap + Capacity Actions; hybrid Weekly Capacity bars (available vs scheduled from Capacity series, util bands) + Assignment Summary (Project/Role/Planned/Actual/Labour Variance/Status from labour + projects; Pending when demand/role missing). Employee capacity detail table is drill-down only, not primary. Actuals mode: logged vs planned/available, productive/non-productive, overtime (not auto timesheet error), missing/unusual timesheets, labour cost once per employee-week, timesheet detail tables live here. Low logged is not spare capacity until missing timesheets ruled out. Never invent hours. Live: Capacity, Buildpass_Labour (deduped). Forward schedule, diaries allocation, project demand, labour budgets: Pending. Week-over-week Capacity totals on P8. Answer only from live page data.',
    P7: 'Client Satisfaction (placeholder). Page shows title and notice that data is being finalised. Full customer-journey rebuild paused until updated Client Satisfaction data arrives. Answer only that the page is parked / pending data finalisation; do not invent CSAT, NPS, or review metrics.',
    P8: 'Weekly Overview (management meeting dashboard). One reporting period for the whole page via Week Ending selector (ISO week Mon-Sun), shown as "Week ending D Month YYYY · range". Six KPI cards (Revenue, Leads and Qualified, Quotes Sent, Jobs Won, Productive Labour, Project Delivery) each with Actual, Target, Absolute Variance, Previous Week, 4-Week Average, Status. Secondary strip: Gross Margin, Cash Collected, Overdue AR, Variations Awaiting Approval, Safety/Quality Incidents, Customer Issues. Scorecard table (Area/KPI/This Week/Target/Last Week/4-Week Avg/Status) linking to P2/P3/P4/P5/P6. Management Attention table from real exceptions only. Four 8-week small-multiple trends (not dual-axis): Sales funnel, Financial, Delivery, Workforce, each with 4-week average line. Seven-day commitments timeline Mon-Fri. Wins/Risks/Decisions max 3 real items each. Data freshness table for Sales/CRM, Xero, Labour, Marketing. Never invent numbers; blanks use 0 | Not available | Not yet posted | Not applicable. Orange only for At Risk / overdue / high priority. Answer only from live P8 page data.',
    P9: 'Cash Flow (13-week liquidity control). When cash pressure happens, why, and what finance should do. Six KPIs, rolling position chart, AR ageing Current to 90+, collection priority, payment commitments, cash actions. Live CashFlow_Forecast + Xero_Invoices. Pending for facility/min cash when missing. Never invent balances.',
    P10: 'Marketing: ad spend, leads, CPL, ROAS, campaign performance. Has a lightweight this-week pulse (spend / leads) on KPI cards with a short trend, not full week-over-week comparison. For week-over-week Marketing, send the user to P8.',
    P11: 'Site Diary Quality and Variations Exceptions (NOT full QA). Data: Buildpass_Site Diaries, Variations_Log, Defects_Rework (soft-load). Six KPIs: Site Diary Entries, Issues/Blockers (same definition as exceptions table), Issue Rate, Photo Evidence, Defects Logged as N recorded never No defects, Variations Raised with $0-unconfirmed caveat. Rework cost: Unavailable source not connected never $0. Variation approval blank = Not recorded never inferred Pending. Work Stopped: No vs Not recorded. Safety: N not confirmed as no issue when ambiguous. Orange only for work stopped / safety / genuine exceptions. Missing defect data is not good quality. Answer only from live page data.',
    P12: 'Site Diaries (crew full-width diary summaries). Google sign-in + Staff_Access. No Ask BB. Week list+detail; photos column P only; Other Details from col Q when present for any entry. Variations description only. Not merged with P11. No Gantt/charts/financials.'
  };

  const visitedKeys =
    allPagesData && typeof allPagesData === 'object' ? Object.keys(allPagesData) : [];

  const multiPagePayload =
    allPagesData && typeof allPagesData === 'object' && visitedKeys.length
      ? JSON.stringify(allPagesData).slice(0, 80000)
      : null;

  const singlePagePayload = pageData != null ? JSON.stringify(pageData).slice(0, 30000) : '{}';

  // Last 6–10 exchanges (capped server-side for prompt size).
  const history = Array.isArray(conversationHistory)
    ? conversationHistory.slice(-16).filter(function (t) {
        return t && t.text && (t.role === 'user' || t.role === 'assistant' || t.role === 'model');
      })
    : [];

  let historyBlock = '';
  if (history.length) {
    historyBlock =
      '\n\nCONVERSATION SO FAR (same browser session, use for follow-ups like "what about last month"):\n';
    history.forEach(function (turn, idx) {
      const role = turn.role === 'assistant' || turn.role === 'model' ? 'BB' : 'User';
      historyBlock += role + ': ' + String(turn.text).slice(0, 1200) + '\n';
      if (idx > 20) return;
    });
  }

  const insightsList = Array.isArray(pageInsights) ? pageInsights : [];
  const insightsBlock = insightsList.length
    ? '\n\nPROACTIVE INSIGHTS already shown for the current page (you may elaborate with underlying data, but do not invent new ones):\n' +
      insightsList
        .map(function (line, i) {
          return i + 1 + '. ' + line;
        })
        .join('\n')
    : '';

  const prompt =
    'You are BB, the friendly AI assistant for the BB Building Services Unified Dashboard. ' +
    'You help Ben, the business owner, understand his numbers. ' +
    'You are speaking with ' +
    who +
    ', a team member at BB Building Services. Address them by name naturally in your answer where appropriate. ' +
    'If the question is not related to the dashboard data, capacity, labour, jobs, attendance, site diaries, or BB Building Services business, politely redirect them back to asking about the dashboard. Do this every time, do not answer unrelated questions. ' +
    'Answer accurately and completely. Keep it clear and to the point, but do not sacrifice accuracy for brevity. ' +
    'If asked who you are, say you are BB, the dashboard assistant. Do not add creator, developer, or ownership details in that answer. ' +
    'Do NOT volunteer who made or developed you, or who owns the app, in general introductions, page explanations, greetings, or any answer unless the user specifically asks. Never insert "As you know, Lori is my developer" or similar unprompted. ' +
    'Only if the user specifically asks who created or developed you, who made you, who built this app, or similar: then say Lori is your developer and this app is owned and registered by BB Building Services. ' +
    'Never use em dashes in your answers, use commas or colons instead. ' +
    '\n\nCROSS-PAGE TOOLS (use when needed from any page): ' +
    'Call getPageData(pageName) to load any page P1-P12 on demand (aliases like Marketing, Cash Flow, Sales work). ' +
    'Use it whenever the question needs another page that is not already in the visited-pages payload. You may call it multiple times for multi-topic questions. ' +
    'Also available: getWorkerAttendance, getJobAttendance, getDiaryQuality, getTeamDiaryQualitySummary for Buildpass attendance and diary quality (Fri-Thu payroll week). ' +
    'Default weekStart to the current payroll week when the user does not specify a week. ' +
    'If a tool returns found:false, notFound, or unavailable, say that clearly. Do not invent names, hours, scores, or page metrics. ' +
    'Keep using the current page context below for "what am I looking at" questions; tools are additive, not a replacement.' +
    '\n\nGROUNDING RULES (mandatory, more important than sounding impressive): ' +
    '1) Only answer from: current page data, other visited pages in the all-pages payload, the page directory, conversation history that already cited that data, listed proactive insights, and results returned by the cross-page tools (including getPageData). ' +
    '2) Do not invent, estimate, round up inventively, or guess numbers, names, margins, ROAS, hours, or trends. ' +
    '3) If the question needs another page, call getPageData first. Do not tell the user to visit that page unless getPageData returns notFound or unavailable. For attendance or diary quality scores, prefer the specialised tools. ' +
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
    '\n\nThe user is currently viewing: ' +
    ctx +
    '. ' +
    'You may combine data across visited pages and any pages returned by getPageData. ' +
    'Visited pages in this session: ' +
    (visitedKeys.length ? visitedKeys.join(', ') : 'none yet') +
    '.' +
    insightsBlock +
    historyBlock +
    (multiPagePayload
      ? '\n\nAll visited pages data:\n' + multiPagePayload
      : '\n\nCurrent page data:\n' + singlePagePayload) +
    '\n\nCurrent question: ' +
    question;

  const initialContents = [{ role: 'user', parts: [{ text: prompt }] }];
  const data = await callGemini({
    contents: initialContents,
    tools: BB_TOOLS
  });
  const extracted = extractAnswer(data);

  if (extracted.functionCalls.length) {
    return res.status(200).json({
      needsTools: true,
      toolCalls: extracted.functionCalls,
      geminiContents: initialContents.concat([extracted.modelContent])
    });
  }

  let answer = extracted.answer;
  if (!answer) {
    answer =
      'BB error: ' + (data.error ? data.error.message : JSON.stringify(data).slice(0, 300));
  }
  // Hard ban on em dashes in BB output (prompt also forbids them).
  return res.status(200).json({ answer: stripEmDashes(answer) });
}
