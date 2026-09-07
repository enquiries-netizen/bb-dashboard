/**
 * Fill Department on Buildpass_Project_Sync from Buildpass Projects API.
 *
 * Source: GET https://api.buildpass.global/projects/{id}
 * using Buildpass Project ID on this tab. Do not join Xero_Projects.
 *
 * Auth matches Make Scenario 9b / Buildpass_Labour notes in this repo:
 *   Authorization: Bearer <token>
 *   Accept: application/json
 * Token lives in Script property BUILDPASS_API_KEY (never hardcode).
 *
 * Project Sync itself is Make, not Apps Script. There is nothing here
 * to chain after. createDepartmentFillTrigger() runs the empty-only fill
 * daily at 06:30 Australia/Sydney (about 30 min after a typical 06:00 Make
 * run). Confirm the live Make finish time in Make scenario history and
 * change TRIGGER_HOUR / TRIGGER_MINUTE if needed.
 *
 * Paste this file into the master spreadsheet Apps Script project.
 * Spreadsheet: 17gNgYCC2rwAKGHtuhaApxeCa-6qxyI0gBB71ifciNv8
 * Tab: Buildpass_Project_Sync
 */

var SPREADSHEET_ID = '17gNgYCC2rwAKGHtuhaApxeCa-6qxyI0gBB71ifciNv8';
var SYNC_TAB = 'Buildpass_Project_Sync';
var DEPT_HEADER = 'Department';
var ID_HEADER = 'Buildpass Project ID';
var API_BASE = 'https://api.buildpass.global/projects/';
var UNASSIGNED = 'Unassigned';
var REQUEST_PAUSE_MS = 80;

// Typical Make Project Sync is not in this repo. Overnight Make jobs
// in this workspace usually finish around 06:00 Australia/Sydney.
// Run the empty-only fill 30 minutes later. nearMinute is 0/15/30/45.
var TRIGGER_TIMEZONE = 'Australia/Sydney';
var TRIGGER_HOUR = 6;
var TRIGGER_MINUTE = 30;

/**
 * One-time full backfill. Overwrites Department on every data row from the API.
 */
function backfillBuildpassProjectSyncDepartment() {
  runDepartmentFill_({ overwrite: true });
}

/**
 * Scheduled fill. Only rows where Department is currently empty.
 * Does not call the API for rows that already have a value.
 */
function fillEmptyBuildpassProjectSyncDepartment() {
  runDepartmentFill_({ overwrite: false });
}

/**
 * Install (or replace) the daily empty-only trigger.
 * Run once from the Apps Script editor after setting BUILDPASS_API_KEY.
 */
function createDepartmentFillTrigger() {
  deleteDepartmentFillTriggers_();
  ScriptApp.newTrigger('fillEmptyBuildpassProjectSyncDepartment')
    .timeBased()
    .atHour(TRIGGER_HOUR)
    .nearMinute(TRIGGER_MINUTE)
    .everyDays(1)
    .inTimezone(TRIGGER_TIMEZONE)
    .create();
  Logger.log(
    'Installed fillEmptyBuildpassProjectSyncDepartment daily at ' +
      pad2_(TRIGGER_HOUR) + ':' + pad2_(TRIGGER_MINUTE) + ' ' + TRIGGER_TIMEZONE +
      '. Confirm Make Project Sync usually finishes by then; move this trigger 15-30 min after that run if needed.'
  );
}

function deleteDepartmentFillTriggers() {
  deleteDepartmentFillTriggers_();
}

function deleteDepartmentFillTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'fillEmptyBuildpassProjectSyncDepartment') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  Logger.log('Removed ' + removed + ' fillEmptyBuildpassProjectSyncDepartment trigger(s)');
}

function runDepartmentFill_(opts) {
  var overwrite = !!(opts && opts.overwrite);
  var sheet = getSyncSheet_();
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  if (lastRow < 1) throw new Error('Empty sheet: ' + SYNC_TAB);

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h == null ? '' : h).trim();
  });
  var idIdx = headerIndex_(headers, [ID_HEADER, 'Buildpass Project Id', 'Project ID']);
  if (idIdx < 0) throw new Error('Missing header: ' + ID_HEADER);

  var deptIdx = headerIndex_(headers, [DEPT_HEADER, 'department', 'Dept', 'dept']);
  if (deptIdx < 0) {
    throw new Error('Missing header: ' + DEPT_HEADER + ' (Lori added this at the end of the tab; locate by name, do not assume column letter)');
  }

  var apiKey = getBuildpassApiKey_();
  if (lastRow < 2) {
    Logger.log('No data rows');
    return;
  }

  var width = Math.max(lastCol, deptIdx + 1);
  var values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  var written = 0;
  var skipped = 0;
  var failed = 0;
  var emptySkipped = 0;

  for (var i = 0; i < values.length; i++) {
    var projectId = String(values[i][idIdx] || '').trim();
    var current = String(values[i][deptIdx] == null ? '' : values[i][deptIdx]).trim();
    if (!projectId) {
      skipped++;
      continue;
    }
    if (!overwrite && current) {
      emptySkipped++;
      continue;
    }
    try {
      var dept = fetchProjectDepartment_(projectId, apiKey);
      if (!dept) dept = UNASSIGNED;
      sheet.getRange(i + 2, deptIdx + 1).setValue(dept);
      written++;
    } catch (err) {
      failed++;
      Logger.log('Row ' + (i + 2) + ' id=' + projectId + ' ' + err);
    }
    Utilities.sleep(REQUEST_PAUSE_MS);
  }

  Logger.log(
    (overwrite ? 'Department backfill' : 'Department empty-fill') +
      ' written=' + written +
      ' skippedNoId=' + skipped +
      (overwrite ? '' : ' skippedAlreadyFilled=' + emptySkipped) +
      ' failed=' + failed +
      ' departmentCol=' + colLetter_(deptIdx)
  );
}

function getSyncSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss ? ss.getSheetByName(SYNC_TAB) : null;
  if (!sheet) {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    sheet = ss.getSheetByName(SYNC_TAB);
  }
  if (!sheet) throw new Error('Tab not found: ' + SYNC_TAB);
  return sheet;
}

function getBuildpassApiKey_() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('BUILDPASS_API_KEY');
  if (!apiKey) {
    throw new Error('Set script property BUILDPASS_API_KEY (same token as Make Scenario 9b). Do not hardcode.');
  }
  return apiKey;
}

function fetchProjectDepartment_(projectId, apiKey) {
  var url = API_BASE + encodeURIComponent(projectId);
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: authHeaders_(apiKey)
  });
  var code = res.getResponseCode();
  if (code === 404) return '';
  if (code < 200 || code >= 300) {
    throw new Error('HTTP ' + code + ' ' + String(res.getContentText() || '').slice(0, 180));
  }
  var payload = {};
  try {
    payload = JSON.parse(res.getContentText() || '{}');
  } catch (e) {
    throw new Error('Invalid JSON for ' + projectId);
  }
  return extractDepartment_(payload);
}

function authHeaders_(apiKey) {
  return {
    'Authorization': 'Bearer ' + apiKey,
    'Accept': 'application/json'
  };
}

function extractDepartment_(payload) {
  if (!payload || typeof payload !== 'object') return '';
  var roots = [payload];
  if (payload.data && typeof payload.data === 'object') roots.push(payload.data);
  if (payload.project && typeof payload.project === 'object') roots.push(payload.project);
  if (payload.data && payload.data.project && typeof payload.data.project === 'object') {
    roots.push(payload.data.project);
  }

  var keys = ['department', 'departmentName', 'department_name', 'Department'];
  for (var r = 0; r < roots.length; r++) {
    var obj = roots[r];
    for (var k = 0; k < keys.length; k++) {
      var d = valueFromDepartmentField_(obj[keys[k]]);
      if (d) return d;
    }
  }
  return '';
}

function valueFromDepartmentField_(d) {
  if (d == null || d === '') return '';
  if (Object.prototype.toString.call(d) === '[object Array]') {
    for (var i = 0; i < d.length; i++) {
      var one = valueFromDepartmentField_(d[i]);
      if (one) return one;
    }
    return '';
  }
  if (typeof d === 'object') {
    d = d.name || d.title || d.label || d.departmentName || d.department_name || '';
  }
  d = String(d || '').trim();
  return d;
}

function headerIndex_(headers, names) {
  var lower = headers.map(function (h) {
    return String(h || '').trim().toLowerCase();
  });
  for (var i = 0; i < names.length; i++) {
    var k = lower.indexOf(String(names[i]).toLowerCase());
    if (k >= 0) return k;
  }
  return -1;
}

function colLetter_(idx) {
  var n = idx + 1;
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}
