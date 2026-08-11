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
    BUILDPASS_LABOUR:    'Buildpass_Labour',
    // Sheet tab is "Buildpass_Site Diaries" (space, not underscore)
    BUILDPASS_DIARIES:      'Buildpass_Site Diaries',
    BUILDPASS_SITE_DIARIES: 'Buildpass_Site Diaries', // alias
    CAPACITY:            'Capacity',
    CLIENT_REVIEWS:      'Client_Reviews',
    MARKETING_PAID:      'Marketing_Paid',
    MARKETING_SOURCES:   'Marketing_Sources',
    ESTIMATING_ACCURACY: 'Estimating_Accuracy',
    VARIATIONS_LOG:      'Variations_Log',
    DEFECTS_REWORK:      'Defects_Rework',
    CASHFLOW_FORECAST:  'CashFlow_Forecast',
    // Email → Role (Staff | User | Admin) → Active (Yes | No). Case-insensitive match.
    STAFF_ACCESS:        'Staff_Access',
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
    apiKey:            'PASTE_FIREBASE_API_KEY',
    authDomain:        'PASTE_PROJECT_ID.firebaseapp.com',
    projectId:         'PASTE_PROJECT_ID',
    storageBucket:     'PASTE_PROJECT_ID.appspot.com',
    messagingSenderId: 'PASTE_MESSAGING_SENDER_ID',
    appId:             'PASTE_APP_ID'
  }

};
