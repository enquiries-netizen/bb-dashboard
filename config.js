// ═══════════════════════════════════════════════════════════════
// BB Building Services — Dashboard Config
//
// HOW TO USE THIS FILE:
// 1. Replace PASTE_YOUR_API_KEY_HERE with your actual Google
//    Cloud API key (found in Google Cloud Console → Credentials)
// 2. The API key is restricted to bb-dashboard-eight.vercel.app
//    by HTTP referrer in Google Cloud — safe to leave here.
// 3. Do NOT commit a real API key to a public repo.
// 4. Firebase web config: fill CONFIG.FIREBASE from Firebase Console
//    (Project settings → Your apps → Web). Client keys are public.
//    See AUTH.md for Google sign-in and Staff_Access setup.
//
// ═══════════════════════════════════════════════════════════════

const CONFIG = {

  // Master Dashboard Google Sheet ID
  SHEET_ID: '17gNgYCC2rwAKGHtuhaApxeCa-6qxyI0gBB71ifciNv8',
  // Standalone Internal Hub guides (Library_Guides tab). Server-side fetch in api/ask.js.
  LIBRARY_SHEET_ID: '1R5NEdGGU4dzTqedxy0q3BezqYglz3vGxhYSVa8nKgl0',

  // Google Sheets API Key (restricted to Vercel domain)
  API_KEY: 'AIzaSyAKxn54VIagSCHmKHQ6MZeD9n8fnWWs3Wk',

  // Fixed master department list (Capacity / Labour / page filters)
  // Do not derive from sparse page-specific tabs (e.g. Defects_Rework).
  DEPARTMENTS: [
    'Administration',
    'Apprentices',
    'General Building and Maintenance',
    'Managers',
    'Modular Building',
    'Roofing',
    'Sheds',
    'Supervisors',
    'Tradesmen'
  ],

  // ─── Tab Names ─────────────────────────────────────────────
  // Must match the exact tab names in Google Sheets (case sensitive)
  TABS: {
    WEEKLY_SUMMARY:      'Weekly_Summary',
    // Pre-aggregated marketing week rows (Brand + Department per week)
    // Sheet name has a space + parentheses: Weekly Summary(Marketing)
    WEEKLY_SUMMARY_MARKETING: 'Weekly Summary(Marketing)',
    TARGETS:             'Targets',
    GHL_LEADS:           'GHL_Leads',
    GHL_PIPELINE:        'GHL_Pipeline',
    // Sheet was GHL_Quotes; renamed to Quotes. Same physical tab as QUOTES below
    // (P2 sales probe + P3 estimating share one sheet name after rename).
    GHL_QUOTES:          'Quotes',
    QUOTES:              'Quotes',
    XERO_FINANCIALS:     'Xero_Financials',
    XERO_INVOICES:       'Xero_Invoices',
    XERO_PROJECTS:       'Xero_Projects',
    XERO_OVERHEAD:       'Xero_Overhead',
    XERO_OVERHEADS:      'Xero_Overhead', // alias — sheet tab is singular
    BUILDPASS_SCHEDULE:  'Buildpass_Schedules',
    // P4 joins IN_PROGRESS (construction) and UPCOMING (pre-construction) Job #s
    // to this tab. Nightly pull should include UPCOMING milestones when present.
    // Status filter is not in this repo (Make.com / Apps Script).
    // Nightly AppScript rewrite of Google Calendar job events (J# tagged).
    // P4 uses this only as fallback when a project has no Buildpass schedule rows.
    GOOGLE_CALENDAR_SCHEDULE: 'Google_Calendar_Schedule',
    // Buildpass project list (UPCOMING / IN_PROGRESS). P4 Upcoming Projects
    // uses UPCOMING rows only. IN_PROGRESS jobs stay on Xero_Projects.
    // Department is a column on this tab (Buildpass GET /projects/{id}), not a Xero join.
    BUILDPASS_PROJECT_SYNC: 'Buildpass_Project_Sync',
    BUILDPASS_LABOUR:    'Buildpass_Labour',
    // Approved Xero timesheets (break already deducted). P6 attendance discrepancy only.
    XERO_TIMESHEETS_APPROVED: 'Xero_Timesheets_Approved',
    // Xero leave applications. P6 On Leave (current/upcoming) and util labels only.
    // Not an input to At Capacity / overload.
    XERO_LEAVE: 'Xero_Leave',
    // Sheet tab is "Buildpass_Site Diaries" (space, not underscore)
    BUILDPASS_DIARIES:      'Buildpass_Site Diaries',
    BUILDPASS_SITE_DIARIES: 'Buildpass_Site Diaries', // alias
    // Sign-on/sign-off rows (30-day rolling). Shared by P6 labour metrics + P12.
    BUILDPASS_ATTENDANCE: 'Buildpass_Attendance',
    CAPACITY:            'Capacity',
    CLIENT_REVIEWS:      'Client_Reviews',
    MARKETING_PAID:      'Marketing_Paid',
    MARKETING_SOURCES:   'Marketing_Sources',
    ESTIMATING_ACCURACY: 'Estimating_Accuracy',
    VARIATIONS_LOG:      'Variations_Log',
    DEFECTS_REWORK:      'Defects_Rework',
    CASHFLOW_FORECAST:  'CashFlow_Forecast',
    // Manual tender pipeline (Emily). Duplicate GST / Total (Inc GST) headers
    // (quote vs final) are disambiguated in fetchTendersParsed (sheets.js).
    // P13 shows Quote Total / Final Price Total (ex GST). Monthly $ target is
    // Targets ALL/ALL column P; conversion-rate target is column Q.
    // Nightly open-opportunity snapshots for P2 pipeline movement waterfall.
    PIPELINE_SNAPSHOTS:  'Pipeline_Snapshots',
    TENDERS:             'Tenders',
    // Email → Role → Active → Access (page allowlist text). Access column is
    // parsed dynamically for page ids (P13 only, P11&12, Full access, etc.).
    STAFF_ACCESS:        'Staff_Access',
    // BBBS Internal Hub guides. Fetched server-side in /api/ask.js from
    // CONFIG.LIBRARY_SHEET_ID (standalone sheet, not the Master Dashboard file).
    // Expected columns (header-name match, not letter index):
    //   A Guide ID | B Title | C Category | D Content/Steps
    //   E Department/Role Tag (or legacy Division/Role Tag) | F Media Link | G Access Level | H Doc ID (optional)
    // Access Level: "All Staff" (default if blank) or "Admin".
    // Admin rows are omitted unless Staff_Access Role is Admin or Access is Full access.
    // Media Link / Doc ID: Google Doc URL or ID. Used when Content/Steps is empty.
    LIBRARY_GUIDES:      'Library_Guides',
  },

  // ─── Firebase Auth (Google sign-in) ─────────────────────────
  // Client-side web config is public by design (restricted by Firebase Auth rules
  // + Staff_Access sheet). Paste values from Firebase Console → Project settings
  // → Your apps → Web app config object.
  //
  // Optional Vercel env names (if you later inject at build / edge; this SPA
  // currently reads CONFIG.FIREBASE with no build step):
  //   FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
  //   FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID
  //
  // Leave PASTE_ placeholders until Lori creates the Firebase web app.
  // App shows "Sign-in not configured" (does not grant open dashboard access).
  FIREBASE: {
    apiKey:            'AIzaSyB5JsjElEf3BmckHX7k3mGP3mQcVa56b20',
    authDomain:        'bb-dashboard-authentication.firebaseapp.com',
    projectId:         'bb-dashboard-authentication',
    storageBucket:     'bb-dashboard-authentication.firebasestorage.app',
    messagingSenderId: '992671300884',
    appId:             '1:992671300884:web:92d2b302e37049bb911601'
  }

};
