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

  // Map each cell by its row-1 header string — never by column letter/index.
  // Adding or deleting columns in the sheet is safe as long as headers stay named.
  const headers = rows[0].map(h => String(h).trim());
  const data = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      if (!h) return; // skip blank header cells
      obj[h] = row[i] !== undefined ? row[i] : '';
    });
    return obj;
  }).filter(row => {
    // Skip completely empty rows (metadata/notes at bottom of sheet)
    return Object.values(row).some(v => v !== '');
  });

  _cache[tabName] = data;
  console.log('[Sheets] ' + data.length + ' rows loaded from "' + tabName + '" (headers: ' + headers.filter(Boolean).join(', ') + ')');
  return data;
}

function clearSheetsCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

/** Clear one tab from the in-memory cache (e.g. re-check Staff_Access on sign-in). */
function clearSheetCache(tabName) {
  if (tabName && Object.prototype.hasOwnProperty.call(_cache, tabName)) {
    delete _cache[tabName];
  }
}

/**
 * Filters rows by brand.
 *
 * Two types of tabs exist:
 * 1. Pre-aggregated tabs (Weekly_Summary, Targets) — have explicit ALL/BBBS/RMH rows.
 *    When ALL is selected, return only the "ALL" rows to avoid triple-counting.
 * 2. Raw campaign tabs (Marketing_Paid) — have individual rows per brand, no "ALL" row.
 *    When ALL is selected, return all rows so totals aggregate correctly.
 *
 * For tabs with no Brand column, all rows are returned.
 */
function filterByBrand(rows, brand) {
  if (!rows || rows.length === 0) return rows;
  var hasBrandCol = rows[0]['Brand'] !== undefined || rows[0]['brand'] !== undefined;
  if (!hasBrandCol) return rows;

  var target = (brand || 'ALL').toUpperCase();

  if (target === 'ALL') {
    // Check if this tab has pre-aggregated "ALL" rows
    var hasAllRows = rows.some(function(r) {
      return String(r['Brand'] || r['brand'] || '').toUpperCase().trim() === 'ALL';
    });
    if (hasAllRows) {
      // Return only the pre-aggregated ALL rows (prevents triple-counting)
      return rows.filter(function(r) {
        return String(r['Brand'] || r['brand'] || '').toUpperCase().trim() === 'ALL';
      });
    } else {
      // No pre-aggregated ALL rows — return everything (e.g. Marketing_Paid)
      return rows;
    }
  }

  return rows.filter(function(r) {
    var b = String(r['Brand'] || r['brand'] || '').toUpperCase().trim();
    return b === target;
  });
}

var _MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Prefer create/activity dates over close dates when filtering GHL / Quotes rows. */
function getRowDateStr(row) {
  return row['Week Start'] || row['week_start'] || row['Date'] || row['date'] ||
         row['Date Logged'] || row['Date Raised'] || row['Date Approved'] ||
         row['Date Sent'] || row['Date Quoted'] ||
         row['Date Created'] || row['Created Date'] || row['Last Activity Date'] ||
         row['Expected Close Date'] || row['Close Date'] ||
         row['Planned End Date'] || row['Planned End date'] || row['End Date'] ||
         row['Shift Date'] || row['shift_date'] || '';
}

/** Parse DD/MM/YYYY (or Date) into { year, month } where month is Jan..Dec. */
function parseRowDateParts(dateStr) {
  if (!dateStr) return null;
  var s = String(dateStr).trim();
  var parts = s.split('/');
  if (parts.length === 3) {
    var day = parseInt(parts[0], 10);
    var mon = parseInt(parts[1], 10);
    var yr  = parseInt(parts[2], 10);
    if (mon >= 1 && mon <= 12 && yr > 1900) {
      return { year: String(yr), month: _MONTH_ABBR[mon - 1] };
    }
  }
  var d = new Date(s);
  if (!isNaN(d)) {
    return { year: String(d.getFullYear()), month: _MONTH_ABBR[d.getMonth()] };
  }
  return null;
}

/**
 * Filters rows by selected year.
 * year = 'ALL' means show all years.
 * Rows with no year/date info are excluded when a year is selected.
 */
function filterByYear(rows, year) {
  if (!year || year === 'ALL') return rows;
  return rows.filter(function(r) {
    var y = String(r['Year'] || r['year'] || '').trim();
    if (y) return y === String(year);
    var parsed = parseRowDateParts(getRowDateStr(r));
    if (parsed) return parsed.year === String(year);
    return false;
  });
}

/**
 * Filters rows by selected months.
 * months = [] means show all. months = ['Apr','May'] shows only those months.
 * Reads from Month column or extracts from date columns.
 * Rows with no month/date info are excluded when months are selected.
 */
function filterByMonths(rows, months) {
  if (!months || months.length === 0) return rows;
  return rows.filter(function(r) {
    var m = String(getRowMonth(r) || '').trim();
    if (!m) return false;
    return months.some(function(sel) {
      var needle = String(sel || '').trim().toLowerCase().substring(0, 3);
      return needle && m.toLowerCase().startsWith(needle);
    });
  });
}

/** Extracts a 3-letter month abbreviation from a row */
function getRowMonth(row) {
  // Try Month column first (Targets, Marketing_Paid)
  var m = row['Month'] || row['month'] || '';
  if (m) {
    // Trim so " April" / "June " still normalize to Apr / Jun
    var token = String(m).trim().split(/[\s\/\-]/)[0] || '';
    return token.substring(0, 3);
  }

  var parsed = parseRowDateParts(getRowDateStr(row));
  return parsed ? parsed.month : '';
}

/**
 * Tenders tab parser for P13.
 * The sheet has duplicate header labels (GST, Total (Inc GST)) for quote vs final
 * price blocks, so generic fetchSheet header maps collide. We map A-M by position
 * and resolve Month / Monthly Target by header name when present (cols O/P).
 *
 * Returns { tenders: [...], targets: [...], rawRowCount }.
 * Target rows: Month and/or Monthly Target filled, no tender Description.
 * Tender rows: Description present.
 */
async function fetchTendersParsed(tabName) {
  tabName = tabName || ((typeof CONFIG !== 'undefined' && CONFIG.TABS && CONFIG.TABS.TENDERS)
    ? CONFIG.TABS.TENDERS
    : 'Tenders');
  var cacheKey = tabName + '::__tenders_parsed';
  if (_cache[cacheKey]) return _cache[cacheKey];

  if (!CONFIG.API_KEY || CONFIG.API_KEY === 'PASTE_YOUR_API_KEY_HERE') {
    console.warn('[Sheets] API key not set — Tenders empty.');
    var empty = { tenders: [], targets: [], rawRowCount: 0 };
    _cache[cacheKey] = empty;
    return empty;
  }

  var url =
    'https://sheets.googleapis.com/v4/spreadsheets/' +
    CONFIG.SHEET_ID + '/values/' +
    encodeURIComponent(tabName) + '?key=' + CONFIG.API_KEY;

  var response = await fetch(url);
  if (!response.ok) {
    throw new Error('Sheets API error ' + response.status + ' for tab: ' + tabName);
  }

  var json = await response.json();
  var values = json.values || [];
  if (values.length < 2) {
    console.warn('[Sheets] Tab "' + tabName + '" is empty or headers-only.');
    var empty2 = { tenders: [], targets: [], rawRowCount: 0 };
    _cache[cacheKey] = empty2;
    return empty2;
  }

  var headers = values[0].map(function(h) { return String(h == null ? '' : h).trim(); });

  function normH(h) {
    return String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  var monthIdx = -1;
  var targetIdx = -1;
  for (var hi = 0; hi < headers.length; hi++) {
    var nh = normH(headers[hi]);
    if (monthIdx < 0 && (nh === 'month' || nh === 'targetmonth')) monthIdx = hi;
    if (targetIdx < 0 && (
      nh === 'monthlytarget' ||
      nh === 'monthtarget' ||
      nh.indexOf('monthlytarget') !== -1
    )) targetIdx = hi;
  }
  // Prefer O/P (index 14/15) when headers not yet renamed
  if (monthIdx < 0 && headers.length > 14) monthIdx = 14;
  if (targetIdx < 0 && headers.length > 15) targetIdx = 15;

  var tenders = [];
  var targets = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    function cell(i) {
      if (i < 0 || i >= row.length) return '';
      return row[i] !== undefined && row[i] !== null ? row[i] : '';
    }
    var description = String(cell(0)).trim();
    var monthRaw = monthIdx >= 0 ? String(cell(monthIdx)).trim() : '';
    var targetRaw = targetIdx >= 0 ? String(cell(targetIdx)).trim() : '';

    var anyCell = row.some(function(v) { return v !== undefined && v !== null && String(v).trim() !== ''; });
    if (!anyCell) continue;

    if (!description && (monthRaw || targetRaw)) {
      targets.push({
        Month: monthRaw,
        'Monthly Target': targetRaw,
        _rowIndex: r + 1
      });
      continue;
    }

    if (!description) continue;

    tenders.push({
      Description: description,
      'Tender Submitted?': String(cell(1)).trim(),
      'Where?': String(cell(2)).trim(),
      ClientName: String(cell(3)).trim(),
      'Quote Total (ex GST)': cell(4),
      'Quote GST': cell(5),
      'Quoted Total (Inc GST)': cell(6),
      'Lodgement Date': String(cell(7)).trim(),
      'Won?': String(cell(8)).trim(),
      Notes: String(cell(9)).trim(),
      'Final Price Total (ex GST)': cell(10),
      'Final GST': cell(11),
      'Final Total (Inc GST)': cell(12),
      Month: monthRaw,
      'Monthly Target': targetRaw,
      _rowIndex: r + 1
    });
  }

  var out = { tenders: tenders, targets: targets, rawRowCount: values.length - 1 };
  _cache[cacheKey] = out;
  console.log(
    '[Sheets] Tenders parsed: ' + tenders.length + ' tenders, ' +
    targets.length + ' monthly target rows from "' + tabName + '"'
  );
  return out;
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
