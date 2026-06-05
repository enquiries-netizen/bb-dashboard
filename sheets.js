// ═══════════════════════════════════════════════════════════════
// BB Building Services — Google Sheets API Reader
//
// Single reusable module used by all 11 dashboard pages.
// Call fetchSheet(CONFIG.TABS.TAB_NAME) to get data from any tab.
// ═══════════════════════════════════════════════════════════════

// In-session cache — cleared when user clicks Refresh
const _cache = {};

/**
 * Fetches a tab from the Master Dashboard Google Sheet.
 * Returns an array of row objects (keys = header row values).
 * Results are cached for the session to avoid repeat API calls.
 *
 * @param {string} tabName — must match exactly a tab name in the Sheet
 * @returns {Promise<Array<Object>>}
 */
async function fetchSheet(tabName) {
  if (_cache[tabName]) {
    return _cache[tabName];
  }

  if (!CONFIG.API_KEY || CONFIG.API_KEY === 'PASTE_YOUR_API_KEY_HERE') {
    console.warn('[Sheets] API key not set in config.js — returning empty data.');
    return [];
  }

  const url =
    'https://sheets.googleapis.com/v4/spreadsheets/' +
    CONFIG.SHEET_ID +
    '/values/' +
    encodeURIComponent(tabName) +
    '?key=' +
    CONFIG.API_KEY;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Sheets API error ' + response.status + ' for tab: ' + tabName);
  }

  const json   = await response.json();
  const rows   = json.values || [];

  if (rows.length < 2) {
    console.warn('[Sheets] Tab "' + tabName + '" is empty or headers-only.');
    _cache[tabName] = [];
    return [];
  }

  const headers = rows[0].map(h => String(h).trim());
  const data    = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  });

  _cache[tabName] = data;
  console.log('[Sheets] ' + data.length + ' rows loaded from "' + tabName + '"');
  return data;
}

/**
 * Clears all cached sheet data.
 * Called when user clicks the Refresh button.
 */
function clearSheetsCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

/**
 * Filters rows to a specific brand.
 * Looks for a column named 'Brand' in the data.
 *
 * @param {Array<Object>} rows
 * @param {string} brand — 'ALL', 'BBBS', or 'RMH'
 * @returns {Array<Object>}
 */
function filterByBrand(rows, brand) {
  if (!brand || brand === 'ALL') return rows;
  return rows.filter(r => {
    const b = String(r['Brand'] || r['brand'] || '').toUpperCase().trim();
    return b === brand.toUpperCase();
  });
}

/**
 * Safely parses a value to a number.
 * Handles "$1,234.56", "1234", blanks. Returns 0 for anything invalid.
 */
function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

/** Formats a number as $1,234 (Australian) */
function formatCurrency(n) {
  return '$' + Math.round(n).toLocaleString('en-AU');
}

/** Formats a percentage to 1 decimal place */
function formatPct(n) {
  return n.toFixed(1) + '%';
}
