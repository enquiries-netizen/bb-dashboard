// ═══════════════════════════════════════════════════════════════
// BB Building Services — Google Sheets API Reader
// ═══════════════════════════════════════════════════════════════

const _cache = {};

async function fetchSheet(tabName) {
  if (_cache[tabName]) return _cache[tabName];

  if (!CONFIG.API_KEY || CONFIG.API_KEY === 'PASTE_YOUR_API_KEY_HERE') {
    console.warn('[Sheets] API key not set in config.js — returning empty data.');
    return [];
  }

  const url =
    'https://sheets.googleapis.com/v4/spreadsheets/' +
    CONFIG.SHEET_ID + '/values/' +
    encodeURIComponent(tabName) + '?key=' + CONFIG.API_KEY;

  const response = await fetch(url);
  if (!response.ok) throw new Error('Sheets API error ' + response.status + ' for tab: ' + tabName);

  const json = await response.json();
  const rows = json.values || [];

  if (rows.length < 2) {
    console.warn('[Sheets] Tab "' + tabName + '" is empty or headers-only.');
    _cache[tabName] = [];
    return [];
  }

  const headers = rows[0].map(h => String(h).trim());
  const data = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  }).filter(row => {
    // Skip completely empty rows (metadata/notes at bottom of sheet)
    return Object.values(row).some(v => v !== '');
  });

  _cache[tabName] = data;
  console.log('[Sheets] ' + data.length + ' rows loaded from "' + tabName + '"');
  return data;
}

function clearSheetsCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

/**
 * Filters rows by brand.
 * The Master Sheet has pre-aggregated rows per brand (ALL / BBBS / RMH).
 * We always filter to the exact brand — 'ALL' shows the aggregated ALL rows,
 * not every row. This prevents triple-counting.
 * For tabs with no Brand column, all rows are returned.
 */
function filterByBrand(rows, brand) {
  if (!rows || rows.length === 0) return rows;
  const hasBrandCol = rows[0]['Brand'] !== undefined || rows[0]['brand'] !== undefined;
  if (!hasBrandCol) return rows;
  const target = (brand || 'ALL').toUpperCase();
  return rows.filter(r => {
    const b = String(r['Brand'] || r['brand'] || '').toUpperCase().trim();
    return b === target;
  });
}

/**
 * Filters rows by selected year.
 * year = 'ALL' means show all years.
 */
function filterByYear(rows, year) {
  if (!year || year === 'ALL') return rows;
  return rows.filter(function(r) {
    var y = String(r['Year'] || r['year'] || '');
    if (y) return y === String(year);
    // Try extracting from date columns
    var dateStr = r['Week Start'] || r['week_start'] || r['Date'] || r['date'] || '';
    if (dateStr) {
      var parts = String(dateStr).split('/');
      if (parts.length === 3) return parts[2] === String(year);
    }
    return true;
  });
}

/**
 * Filters rows by selected months.
 * months = [] means show all. months = ['Apr','May'] shows only those months.
 * Reads from Month column or extracts from date columns.
 */
function filterByMonths(rows, months) {
  if (!months || months.length === 0) return rows;
  return rows.filter(function(r) {
    var m = getRowMonth(r);
    if (!m) return true; // no month info — keep row
    return months.some(function(sel) {
      return m.toLowerCase().startsWith(sel.toLowerCase().substring(0, 3));
    });
  });
}

/** Extracts a 3-letter month abbreviation from a row */
function getRowMonth(row) {
  // Try Month column first (Targets, Marketing_Paid)
  var m = row['Month'] || row['month'] || '';
  if (m) return String(m).substring(0, 3);

  // Try parsing from Week Start or Date column (Weekly_Summary, Marketing_Paid)
  var dateStr = row['Week Start'] || row['week_start'] || row['Date'] || row['date'] || '';
  if (dateStr) {
    // Handle DD/MM/YYYY format
    var parts = String(dateStr).split('/');
    if (parts.length === 3) {
      var d = new Date(parts[2] + '-' + parts[1] + '-' + parts[0]);
      if (!isNaN(d)) return d.toLocaleString('en-AU', { month: 'short' });
    }
    var d2 = new Date(dateStr);
    if (!isNaN(d2)) return d2.toLocaleString('en-AU', { month: 'short' });
  }
  return '';
}

/**
 * Safely parses a value to a number.
 * Handles "$1,234.56", "40%", "1,234", blanks.
 */
function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/[$,%\s]/g, '').replace(/,/g, ''));
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
