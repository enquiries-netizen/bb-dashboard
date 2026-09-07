/**
 * Marketing aggregation automations (weekly/monthly summaries, classification, Meta token check).
 *
 * Paste into the master spreadsheet Apps Script project.
 * Spreadsheet: 17gNgYCC2rwAKGHtuhaApxeCa-6qxyI0gBB71ifciNv8
 *
 * After pasting, run setupTriggers() once from the Apps Script editor to install triggers.
 */
// ============================================================
// BB BUILDING SERVICES & RMH — Marketing Aggregation Script
// ============================================================
// FUNCTION 1: aggregateWeeklyToSummary()
//   → Schedule: Every Friday at 7:00am AEST
//   → Reads Marketing_Paid → writes aggregated rows to Weekly Summary(Marketing)
//   → Groups by Brand + Department (separate row per combo)
//
// FUNCTION 2: aggregateMonthlyToSummary()
//   → Schedule: 30th of each month at 6:00am AEST
//   → Reads Weekly Summary(Marketing) → updates Marketing Report summary (Monthly) D2
//
// FUNCTION 3: addBestTimeToReportD2()
//   → Run manually before sending monthly report
//   → Reads Markting Time_Analysis → appends top hours to D2
//
// FUNCTION 4: addCampaignsToD2()
//   → Run manually before sending monthly report
//   → Reads Marketing_Paid → appends top campaigns per brand to D2
//
// FUNCTION 5: classifyMarketingPaid()
//   → Schedule: Every Friday at 8:00am AEST (after Make writes data at 3am)
//   → Scans Campaign Name in Marketing_Paid, sets Brand + Department columns
//   → Keywords: 'rmh','bedroom','farm' -> RMH/Modular Building; 'shed' -> BBBS/Sheds;
//     'modular' -> BBBS/Modular Building; everything else -> BBBS/Roofing
//
// FUNCTION 6: saveMetaTokenExpiry()
//   → Run ONCE (and again after each token renewal)
//   → Saves the Meta API token expiry date to Script Properties
//
// FUNCTION 7: checkMetaTokenExpiry()
//   → Schedule: Daily at 9:00am AEST
//   → Emails lorelieads@gmail.com when token is 7 days or fewer from expiry
// ============================================================


// ============================================================
// HELPER FUNCTIONS
// ============================================================

function parseAnyDate(val) {
  // Handles: JS Date object, DD/MM/YYYY, YYYY-MM-DD
  if (!val) return null;
  if (val instanceof Date) return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  var s = val.toString().trim();
  var p = s.split('/');
  if (p.length === 3) return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  p = s.split('-');
  if (p.length === 3) return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
  return null;
}

function parseDDMMYYYY(dateStr) {
  if (!dateStr) return null;
  var parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  var d = parseInt(parts[0]);
  var m = parseInt(parts[1]) - 1;
  var y = parseInt(parts[2]);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  return new Date(y, m, d);
}

function formatDateDisplay(date) {
  var months = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  return months[date.getMonth()] + ' ' + date.getDate();
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

function buildReportText(periodStart, periodEnd, results) {
  var b = results['BBBS'];
  var r = results['RMH'];

  return 'CURRENT PERIOD: ' + periodStart + '- ' + periodEnd + '\n\n' +

    'BB BUILDING SERVICES (BBBS):\n' +
    'Ad Spend: A$' + b.spend + '\n' +
    'Impressions: ' + b.impressions.toLocaleString() + '\n' +
    'Clicks: ' + b.clicks + '\n' +
    'CTR: ' + b.ctr + '%\n' +
    'CPC: A$' + b.cpc + '\n' +
    'Leads Generated: ' + b.leads + '\n' +
    'Cost Per Lead: A$' + b.cpl + '\n' +
    'Won Jobs: ' + b.wonJobs + '\n' +
    'Revenue from Won Jobs: A$' + b.revenue + '\n\n' +

    'RAPID MODULAR HOMES (RMH):\n' +
    'Ad Spend: A$' + r.spend + '\n' +
    'Impressions: ' + r.impressions.toLocaleString() + '\n' +
    'Clicks: ' + r.clicks + '\n' +
    'CTR: ' + r.ctr + '%\n' +
    'CPC: A$' + r.cpc + '\n' +
    'Leads Generated: ' + r.leads + '\n' +
    'Cost Per Lead: A$' + r.cpl + '\n' +
    'Won Jobs: ' + r.wonJobs + '\n' +
    'Revenue from Won Jobs: A$' + r.revenue;
}


// ============================================================
// HELPER - CLASSIFY BRAND + DEPARTMENT FROM CAMPAIGN NAME
// ============================================================
// RMH keywords: 'rmh', 'bedroom', 'rapid modular', 'farm', 'farm/ag',
//               'workers accommodation', 'site office'
// BBBS Sheds: 'shed'
// BBBS Modular Building: 'modular'
// BBBS Roofing: default (everything else)
function classifyRow(campaignName) {
  var name = (campaignName || '').toLowerCase();

  // RMH brand detection
  if (name.indexOf('rmh') !== -1 ||
      name.indexOf('bedroom') !== -1 ||
      name.indexOf('rapid modular') !== -1 ||
      name.indexOf('farm') !== -1 ||
      name.indexOf('farm/ag') !== -1 ||
      name.indexOf('workers accommodation') !== -1 ||
      name.indexOf('site office') !== -1) {
    return { brand: 'RMH', department: 'Modular Building' };
  }

  // BBBS Sheds
  if (name.indexOf('shed') !== -1) {
    return { brand: 'BBBS', department: 'Sheds' };
  }

  // BBBS Modular Building
  if (name.indexOf('modular') !== -1) {
    return { brand: 'BBBS', department: 'Modular Building' };
  }

  // Default: BBBS Roofing
  return { brand: 'BBBS', department: 'Roofing' };
}


// ============================================================
// FUNCTION 1 - WEEKLY AGGREGATION
// ============================================================
// Aggregates Marketing_Paid into Weekly Summary grouped by Brand + Department.
// Writes one row per Brand+Department combo (e.g. BBBS/Roofing, RMH/Modular Building).
function aggregateWeeklyToSummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var paidSheet = ss.getSheetByName('Marketing_Paid');
  var weeklySheet = ss.getSheetByName('Weekly Summary(Marketing)');

  if (!paidSheet || !weeklySheet) {
    Logger.log('ERROR: Could not find Marketing_Paid or Weekly Summary(Marketing) tab.');
    return;
  }

  var paidData = paidSheet.getDataRange().getValues();

  // Find the most recent date in column A
  var latestDateObj = null;
  var latestDateFormatted = '';

  for (var i = 1; i < paidData.length; i++) {
    var row = paidData[i];
    if (!row[0]) continue;
    var dateObj = parseAnyDate(row[0]);
    if (!dateObj) continue;
    if (!latestDateObj || dateObj > latestDateObj) {
      latestDateObj = dateObj;
      latestDateFormatted = ('0' + dateObj.getDate()).slice(-2) + '/' +
                            ('0' + (dateObj.getMonth() + 1)).slice(-2) + '/' +
                            dateObj.getFullYear();
    }
  }

  if (!latestDateObj) {
    Logger.log('No data found in Marketing_Paid.');
    return;
  }

  // Check if this week already exists in Weekly Summary to avoid duplicates
  var weeklyData = weeklySheet.getDataRange().getValues();
  for (var j = 1; j < weeklyData.length; j++) {
    if (weeklyData[j][0].toString().trim() === latestDateFormatted) {
      Logger.log('Weekly data for ' + latestDateFormatted + ' already exists. Skipping.');
      return;
    }
  }

  // Aggregate by Brand + Department
  var totals = {};  // key: 'Brand||Department'

  for (var i = 1; i < paidData.length; i++) {
    var row = paidData[i];
    if (!row[0]) continue;
    var rowDateObj = parseAnyDate(row[0]);
    if (!rowDateObj) continue;
    if (rowDateObj.getTime() !== latestDateObj.getTime()) continue;

    var rowCampaign = row[6] ? row[6].toString() : '';
    var cls = classifyRow(rowCampaign);
    var rowBrand = cls.brand;
    var rowDept  = cls.department;

    var key = rowBrand + '||' + rowDept;
    if (!totals[key]) {
      totals[key] = { brand: rowBrand, department: rowDept,
                      spend: 0, impressions: 0, clicks: 0,
                      leads: 0, wonJobs: 0, revenue: 0 };
    }
    totals[key].spend       += parseFloat(row[11]) || 0;
    totals[key].impressions += parseInt(row[12])   || 0;
    totals[key].clicks      += parseInt(row[13])   || 0;
    totals[key].leads       += parseInt(row[14])   || 0;
    totals[key].wonJobs     += parseInt(row[9])    || 0;
    totals[key].revenue     += parseFloat(row[10]) || 0;
  }

  if (Object.keys(totals).length === 0) {
    Logger.log('No data found for ' + latestDateFormatted + '. Skipping.');
    return;
  }

  Object.keys(totals).sort().forEach(function(key) {
    var t = totals[key];
    var cpl = t.leads       > 0 ? t.spend / t.leads                : 0;
    var cpc = t.clicks      > 0 ? t.spend / t.clicks               : 0;
    var ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;

    weeklySheet.appendRow([
      latestDateFormatted,
      t.brand,
      round2(t.spend),
      t.impressions,
      t.clicks,
      t.leads,
      round2(cpl),
      round2(cpc),
      round2(ctr),
      t.wonJobs,
      round2(t.revenue),
      t.department
    ]);

    Logger.log('Written: ' + t.brand + ' | ' + t.department + ' | ' + latestDateFormatted);
  });
}


// ============================================================
// FUNCTION 2 - MONTHLY AGGREGATION
// ============================================================
function aggregateMonthlyToSummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var weeklySheet  = ss.getSheetByName('Weekly Summary(Marketing)');
  var monthlySheet = ss.getSheetByName('Marketing Report summary (Monthly)');

  if (!weeklySheet || !monthlySheet) {
    Logger.log('ERROR: Could not find Weekly Summary(Marketing) or Marketing Report summary (Monthly) tab.');
    return;
  }

  var now = new Date();
  var periodStart = new Date(now.getFullYear(), now.getMonth() - 2, 24);
  var periodEnd   = new Date(now.getFullYear(), now.getMonth() - 1, 23);

  var weeklyData = weeklySheet.getDataRange().getValues();

  var totals = {
    'BBBS': { spend: 0, impressions: 0, clicks: 0, leads: 0, wonJobs: 0, revenue: 0 },
    'RMH':  { spend: 0, impressions: 0, clicks: 0, leads: 0, wonJobs: 0, revenue: 0 }
  };

  for (var i = 1; i < weeklyData.length; i++) {
    var row = weeklyData[i];
    if (!row[0]) continue;
    var rowDate  = parseDDMMYYYY(row[0].toString().trim());
    var rowBrand = row[1].toString().trim();
    if (!rowDate) continue;
    if (rowDate >= periodStart && rowDate <= periodEnd && totals[rowBrand]) {
      totals[rowBrand].spend       += parseFloat(row[2])  || 0;
      totals[rowBrand].impressions += parseInt(row[3])    || 0;
      totals[rowBrand].clicks      += parseInt(row[4])    || 0;
      totals[rowBrand].leads       += parseInt(row[5])    || 0;
      totals[rowBrand].wonJobs     += parseInt(row[9])    || 0;
      totals[rowBrand].revenue     += parseFloat(row[10]) || 0;
    }
  }

  var results = {};
  ['BBBS', 'RMH'].forEach(function(brand) {
    var t = totals[brand];
    results[brand] = {
      spend:       round2(t.spend),
      impressions: t.impressions,
      clicks:      t.clicks,
      leads:       t.leads,
      cpl:         t.leads       > 0 ? round2(t.spend / t.leads)                : 0,
      cpc:         t.clicks      > 0 ? round2(t.spend / t.clicks)               : 0,
      ctr:         t.impressions > 0 ? round2((t.clicks / t.impressions) * 100) : 0,
      wonJobs:     t.wonJobs,
      revenue:     round2(t.revenue)
    };
  });

  var periodStartDisplay = formatDateDisplay(periodStart);
  var periodEndDisplay   = formatDateDisplay(periodEnd);

  var reportText = buildReportText(periodStartDisplay, periodEndDisplay, results);
  monthlySheet.getRange('D2').setValue(reportText);
  monthlySheet.getRange('B2').setValue(periodStartDisplay);
  monthlySheet.getRange('C2').setValue(periodEndDisplay);

  Logger.log('Monthly summary updated: ' + periodStartDisplay + ' to ' + periodEndDisplay);
  Logger.log('BBBS spend: A$' + results['BBBS'].spend);
  Logger.log('RMH spend: A$'  + results['RMH'].spend);
}


// ============================================================
// FUNCTION 3 - APPEND BEST TIME TO POST TO D2
// ============================================================
function addBestTimeToReportD2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var summarySheet = ss.getSheetByName('Marketing Report summary (Monthly)');
  var timeSheet    = ss.getSheetByName('Markting Time_Analysis');

  if (!summarySheet || !timeSheet) {
    Logger.log('ERROR: Could not find required tabs.');
    return;
  }

  var timeData = timeSheet.getDataRange().getValues();
  if (timeData.length <= 1) { Logger.log('No data in Time_Analysis.'); return; }

  var hourlyTotals = {};
  for (var i = 1; i < timeData.length; i++) {
    var row = timeData[i];
    if (!row[2]) continue;
    var hour = row[2].toString().trim();
    if (!hourlyTotals[hour]) hourlyTotals[hour] = { clicks: 0, impressions: 0, spend: 0 };
    hourlyTotals[hour].clicks      += parseInt(row[4])   || 0;
    hourlyTotals[hour].impressions += parseInt(row[3])   || 0;
    hourlyTotals[hour].spend       += parseFloat(row[5]) || 0;
  }

  var sortedHours = Object.keys(hourlyTotals).sort(function(a, b) {
    return hourlyTotals[b].clicks - hourlyTotals[a].clicks;
  });

  var bestTimeText = '\n\nBEST TIME TO POST (BBBS - ranked by clicks):\n';
  for (var h = 0; h < Math.min(5, sortedHours.length); h++) {
    var hr = sortedHours[h];
    var t  = hourlyTotals[hr];
    bestTimeText += hr + ': ' + t.clicks + ' clicks | ' +
                   t.impressions + ' impressions | A$' +
                   round2(t.spend) + ' spend\n';
  }

  var currentD2 = summarySheet.getRange('D2').getValue().toString();
  var cutIdx = currentD2.indexOf('\n\nBEST TIME TO POST');
  if (cutIdx !== -1) currentD2 = currentD2.substring(0, cutIdx);

  summarySheet.getRange('D2').setValue(currentD2 + bestTimeText);
  Logger.log('Best time appended. Top hour: ' + sortedHours[0]);
}


// ============================================================
// FUNCTION 4 - APPEND CAMPAIGN DATA TO D2 (safe, non-destructive)
// ============================================================
function addCampaignsToD2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var summarySheet = ss.getSheetByName('Marketing Report summary (Monthly)');
  var paidSheet    = ss.getSheetByName('Marketing_Paid');

  if (!summarySheet || !paidSheet) {
    Logger.log('ERROR: Could not find required tabs.');
    return;
  }

  var now = new Date();
  var periodStart = new Date(now.getFullYear(), now.getMonth() - 2, 24);
  var periodEnd   = new Date(now.getFullYear(), now.getMonth() - 1, 23);

  var paidData = paidSheet.getDataRange().getValues();
  var campaignMap = {};

  for (var p = 1; p < paidData.length; p++) {
    var pr = paidData[p];
    if (!pr[0]) continue;
    var prDate  = parseAnyDate(pr[0]);
    var prName  = pr[6].toString().trim();
    if (!prDate || !prName) continue;
    if (prDate < periodStart || prDate > periodEnd) continue;
    var cls = classifyRow(prName);
    var prBrand = cls.brand;
    var ck = prBrand + '||' + prName;
    if (!campaignMap[ck]) campaignMap[ck] = { brand: prBrand, name: prName, spend: 0, leads: 0 };
    campaignMap[ck].spend += parseFloat(pr[11]) || 0;
    campaignMap[ck].leads += parseInt(pr[14])   || 0;
  }

  var topCampaigns = { 'BBBS': [], 'RMH': [] };
  Object.keys(campaignMap).forEach(function(ck) {
    var c = campaignMap[ck];
    c.cpl = c.leads > 0 ? round2(c.spend / c.leads) : null;
    if (topCampaigns[c.brand]) topCampaigns[c.brand].push(c);
  });
  ['BBBS', 'RMH'].forEach(function(brand) {
    topCampaigns[brand].sort(function(a, b) {
      if (a.cpl === null && b.cpl === null) return 0;
      if (a.cpl === null) return 1;
      if (b.cpl === null) return -1;
      return a.cpl - b.cpl;
    });
    topCampaigns[brand] = topCampaigns[brand].slice(0, 2);
  });

  function formatCampaignList(list) {
    if (!list || list.length === 0) return 'No campaign data available.\n';
    var text = '';
    list.forEach(function(c, i) {
      text += (i + 1) + '. ' + c.name +
              ' | Spend: A$' + round2(c.spend) +
              ' | Leads: ' + c.leads +
              ' | CPL: ' + (c.cpl !== null ? 'A$' + c.cpl : 'N/A') + '\n';
    });
    return text;
  }

  var campaignText = '\n\nTOP CAMPAIGNS (BBBS - by lowest CPL):\n' + formatCampaignList(topCampaigns['BBBS']) +
                     '\nTOP CAMPAIGNS (RMH - by lowest CPL):\n'  + formatCampaignList(topCampaigns['RMH']);

  var currentD2 = summarySheet.getRange('D2').getValue().toString();

  var cutIdx = currentD2.indexOf('\n\nTOP CAMPAIGNS');
  if (cutIdx !== -1) currentD2 = currentD2.substring(0, cutIdx);

  var bestTimeIdx = currentD2.indexOf('\n\nBEST TIME TO POST');
  var bestTimePart = '';
  if (bestTimeIdx !== -1) {
    bestTimePart = currentD2.substring(bestTimeIdx);
    currentD2 = currentD2.substring(0, bestTimeIdx);
  }

  summarySheet.getRange('D2').setValue(currentD2 + campaignText + bestTimePart);
  Logger.log('Done. BBBS: ' + topCampaigns['BBBS'].length + ' campaigns, RMH: ' + topCampaigns['RMH'].length + ' campaigns');
}


// ============================================================
// SETUP TRIGGERS
// ============================================================
// Run this ONCE manually after adding new functions.
// Only removes triggers owned by this file, then re-creates them.
var MARKETING_AGG_TRIGGER_HANDLERS = [
  'aggregateWeeklyToSummary',
  'classifyMarketingPaid',
  'checkMetaTokenExpiry',
  'aggregateMonthlyToSummary'
];

function deleteMarketingAggTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (MARKETING_AGG_TRIGGER_HANDLERS.indexOf(triggers[i].getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  Logger.log('Removed ' + removed + ' marketing aggregation trigger(s)');
}

function setupTriggers() {
  deleteMarketingAggTriggers_();

  // Friday 7am AEST: aggregate weekly to summary
  ScriptApp.newTrigger('aggregateWeeklyToSummary')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(7)
    .create();

  // Friday 8am AEST: classify brand/department in Marketing_Paid (after Make at 3am)
  ScriptApp.newTrigger('classifyMarketingPaid')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(8)
    .create();

  // Daily 9am AEST: check Meta API token expiry
  ScriptApp.newTrigger('checkMetaTokenExpiry')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();

  // Monthly 30th 6am AEST: update Marketing Report summary (Monthly) tab
  ScriptApp.newTrigger('aggregateMonthlyToSummary')
    .timeBased()
    .onMonthDay(30)
    .atHour(6)
    .create();

  Logger.log('Triggers set up: Weekly Fri 7am, Classify Fri 8am, Token daily 9am, Monthly 30th 6am AEST');
}


// ============================================================
// DEBUG HELPER
// ============================================================
function debugMarketingPaid() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var paidSheet = ss.getSheetByName('Marketing_Paid');
  if (!paidSheet) { Logger.log('Cannot find Marketing_Paid'); return; }

  var data = paidSheet.getDataRange().getValues();
  Logger.log('HEADERS: ' + JSON.stringify(data[0]));
  Logger.log('Total rows: ' + data.length);

  for (var i = 1; i <= Math.min(3, data.length - 1); i++) {
    var row = data[i];
    Logger.log('--- Row ' + (i+1) + ' ---');
    Logger.log('Col A (date): ' + row[0] + ' | type: ' + typeof row[0] + ' | isDate: ' + (row[0] instanceof Date));
    Logger.log('Col E (index 4): ' + row[4]);
    Logger.log('Col G (index 6): ' + row[6]);
    Logger.log('Col L (index 11): ' + row[11]);
    Logger.log('Col O (index 14): ' + row[14]);
    Logger.log('Col T (index 19): ' + row[19]);
    Logger.log('Classify result: ' + JSON.stringify(classifyRow(row[6])));
  }

  var now = new Date();
  var periodStart = new Date(now.getFullYear(), now.getMonth() - 2, 24);
  var periodEnd   = new Date(now.getFullYear(), now.getMonth() - 1, 23);
  Logger.log('Period: ' + periodStart + ' to ' + periodEnd);
}


// ============================================================
// FUNCTION 5 - CLASSIFY BRAND + DEPARTMENT IN MARKETING_PAID
// ============================================================
// Triggered every Friday at 8am AEST (after Make writes data at 3am).
// Can also be run manually at any time to fix existing rows.
//
// Logic:
//   Campaign name contains 'rmh', 'bedroom', 'farm', etc. -> Brand: RMH, Dept: Modular Building
//   Campaign name contains 'shed'                         -> Brand: BBBS, Dept: Sheds
//   Campaign name contains 'modular'                      -> Brand: BBBS, Dept: Modular Building
//   Everything else                                       -> Brand: BBBS, Dept: Roofing
//
// Columns updated:
//   Col E (index 4)  = Brand
//   Col T (index 19) = Department
function classifyMarketingPaid() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var paidSheet = ss.getSheetByName('Marketing_Paid');
  if (!paidSheet) { Logger.log('ERROR: Cannot find Marketing_Paid tab.'); return; }

  var data = paidSheet.getDataRange().getValues();
  var updated = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;  // skip empty rows

    var campaignName = row[6] ? row[6].toString().trim() : '';
    if (!campaignName) continue;

    var cls = classifyRow(campaignName);

    var currentBrand = row[4] ? row[4].toString().trim() : '';
    var currentDept  = row[19] ? row[19].toString().trim() : '';

    if (currentBrand !== cls.brand || currentDept !== cls.department) {
      paidSheet.getRange(i + 1, 5).setValue(cls.brand);        // Col E = Brand
      paidSheet.getRange(i + 1, 20).setValue(cls.department);  // Col T = Department
      updated++;
      Logger.log('Row ' + (i + 1) + ': "' + campaignName + '" -> ' + cls.brand + ' / ' + cls.department);
    }
  }

  Logger.log('classifyMarketingPaid complete. ' + updated + ' row(s) updated.');
}


// ============================================================
// FUNCTION 6 - SAVE META TOKEN EXPIRY DATE
// ============================================================
// Run this ONCE after generating your Meta API token.
// Update expiryDate to the actual expiry date (token lasts 90 days).
// Run again after each token renewal.
function saveMetaTokenExpiry() {
  var expiryDate = '2026-08-24';  // <-- UPDATE THIS to your actual token expiry date (YYYY-MM-DD)
  PropertiesService.getScriptProperties().setProperty('META_TOKEN_EXPIRY', expiryDate);
  Logger.log('Meta token expiry saved: ' + expiryDate);
}


// ============================================================
// FUNCTION 7 - CHECK META TOKEN EXPIRY (runs daily at 9am)
// ============================================================
// Reads expiry date saved by saveMetaTokenExpiry().
// Sends email to lorelieads@gmail.com when 7 days or fewer remain.
function checkMetaTokenExpiry() {
  var expiryStr = PropertiesService.getScriptProperties().getProperty('META_TOKEN_EXPIRY');
  if (!expiryStr) {
    Logger.log('No Meta token expiry date saved. Run saveMetaTokenExpiry() first.');
    return;
  }

  var parts = expiryStr.split('-');
  var expiry = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  var now = new Date();
  now.setHours(0, 0, 0, 0);
  var daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

  Logger.log('Meta token expires: ' + expiryStr + ' | Days left: ' + daysLeft);

  if (daysLeft > 7) {
    // Token is fine, no action needed
    return;
  }

  if (daysLeft < 0) {
    Logger.log('WARNING: Meta token appears to have expired ' + Math.abs(daysLeft) + ' day(s) ago!');
  }

  var dayWord = daysLeft === 1 ? 'Day' : 'Days';
  var subject = daysLeft >= 0
    ? 'ACTION REQUIRED: Meta API Token Expires in ' + daysLeft + ' ' + dayWord
    : 'URGENT: Meta API Token Has Expired';

  var body =
    '<p>Hi Lori,</p>' +
    '<p>Your <strong>Meta API token</strong> for BB Building Services ' +
    (daysLeft >= 0
      ? 'expires on <strong>' + expiryStr + '</strong> (' + daysLeft + ' ' + dayWord.toLowerCase() + ' remaining).'
      : '<strong>has expired</strong> as of ' + expiryStr + '. The Make scenario will have stopped pulling data.') +
    '</p>' +
    '<p>Please generate a new token as soon as possible, otherwise the Make scenario will stop pulling Meta Ads data.</p>' +
    '<p><strong>Steps to renew:</strong></p>' +
    '<ol>' +
    '<li>Go to <a href="https://developers.facebook.com/tools/explorer/">developers.facebook.com/tools/explorer</a></li>' +
    '<li>Generate a new long-lived user access token</li>' +
    '<li>In Make, open scenario <strong>5186532</strong> and update the Meta API HTTP module with the new token</li>' +
    '<li>In Apps Script, update the <code>expiryDate</code> in <code>saveMetaTokenExpiry()</code> to the new expiry date and run it once</li>' +
    '</ol>' +
    '<p style="color:#999;font-size:12px;font-style:italic;">Generated automatically via BB Building Services Marketing Automation</p>';

  GmailApp.sendEmail(
    'lorelieads@gmail.com',
    subject,
    '',
    { htmlBody: body, name: 'BB Building Services Marketing Automation' }
  );

  Logger.log('Expiry warning email sent to lorelieads@gmail.com. Days left: ' + daysLeft);
}
