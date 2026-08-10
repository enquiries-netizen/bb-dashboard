// ═══════════════════════════════════════════════════════════════
// BB Building Services — Dashboard Config
//
// HOW TO USE THIS FILE:
// 1. Replace PASTE_YOUR_API_KEY_HERE with your actual Google
//    Cloud API key (found in Google Cloud Console → Credentials)
// 2. The API key is restricted to bb-dashboard-eight.vercel.app
//    by HTTP referrer in Google Cloud — safe to leave here.
// 3. Do NOT commit a real API key to a public repo.
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
  },

  // ─── P12 staff unlock (crew Site Diaries only) ─────────────
  // Temporary shared pass unlocks P12 *content* only.
  // restrictNavToP12: when true (production BB-email staff accounts), hide/block
  // P1–P11 at route level. When false (current temp pass), admin/owner keeps full
  // dashboard; pass only opens Site Diaries content. Scope keys are cleared on load
  // if restrictNavToP12 is false so an earlier staff unlock cannot trap the admin.
  P12_STAFF_GATE: {
    sessionKey: 'bb_p12_staff_unlock',
    /** sessionStorage key for nav access scope (only used when restrictNavToP12) */
    scopeKey: 'bb_access_scope',
    /** value stored when crew nav is locked to P12 only */
    staffScope: 'p12_only',
    /**
     * false = temporary shared pass (content unlock only; full P1–P11 always available)
     * true  = production staff role: sidebar + loaders limited to P12 until lock/exit
     */
    restrictNavToP12: false,
    // Change freely; temporary shared crew unlock
    pass: 'bbcrew'
  }

};
