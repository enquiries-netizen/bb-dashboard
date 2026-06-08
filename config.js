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
  AAPI_KEY: 'AIzaSyAKxn54VIagSCHmKHQ6MZeD9n8fnWWs3Wk',

  // ─── Tab Names ─────────────────────────────────────────────
  // Must match the exact tab names in Google Sheets (case sensitive)
  TABS: {
    WEEKLY_SUMMARY:      'Weekly_Summary',
    TARGETS:             'Targets',
    GHL_LEADS:           'GHL_Leads',
    GHL_PIPELINE:        'GHL_Pipeline',
    GHL_QUOTES:          'GHL_Quotes',
    XERO_FINANCIALS:     'Xero_Financials',
    XERO_INVOICES:       'Xero_Invoices',
    XERO_PROJECTS:       'Xero_Projects',
    XERO_OVERHEADS:      'Xero_Overheads',
    BUILDPASS_LABOUR:    'Buildpass_Labour',
    BUILDPASS_DIARIES:   'Buildpass_Diaries',
    CAPACITY:            'Capacity',
    CLIENT_REVIEWS:      'Client_Reviews',
    MARKETING_PAID:      'Marketing_Paid',
    MARKETING_SOURCES:   'Marketing_Sources',
    ESTIMATING_ACCURACY: 'Estimating_Accuracy',
    VARIATIONS_LOG:      'Variations_Log',
    DEFECTS_REWORK:      'Defects_Rework',
    CASHFLOW_FORECAST:   'CashFlow_Forecast',
  }
