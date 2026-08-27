/**
 * One-off / backup writer: Department on Buildpass_Project_Sync
 * via GET https://api.buildpass.global/projects/{id}
 *
 * Paste into the master spreadsheet's Apps Script project.
 * Do not commit API keys. Set Script property BUILDPASS_API_KEY
 * (same credential as Make Scenario 9b / Buildpass_Labour).
 *
 * If Scenario 9b uses a header other than Authorization: Bearer,
 * change authHeaders_() to match it.
 */

var SYNC_TAB = 'Buildpass_Project_Sync';
var DEPT_HEADER = 'Department';
var ID_HEADER = 'Buildpass Project ID';
var API_BASE = 'https://api.buildpass.global/projects/';

function backfillBuildpassProjectSyncDepartment() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SYNC_TAB);
  if (!sheet) throw new Error('Tab not found: ' + SYNC_TAB);

  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  if (lastRow < 1) throw new Error('Empty sheet');

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h == null ? '' : h).trim();
  });
  var idIdx = headerIndex_(headers, [ID_HEADER, 'Buildpass Project Id', 'Project ID']);
  if (idIdx < 0) throw new Error('Missing header: ' + ID_HEADER);

  var deptIdx = headerIndex_(headers, [DEPT_HEADER, 'department', 'Dept', 'dept']);
  if (deptIdx < 0) {
    deptIdx = headers.length;
    sheet.getRange(1, deptIdx + 1).setValue(DEPT_HEADER);
    headers[deptIdx] = DEPT_HEADER;
  }

  var apiKey = PropertiesService.getScriptProperties().getProperty('BUILDPASS_API_KEY');
  if (!apiKey) throw new Error('Set script property BUILDPASS_API_KEY (do not hardcode)');

  if (lastRow < 2) {
    Logger.log('No data rows');
    return;
  }

  var values = sheet.getRange(2, 1, lastRow - 1, Math.max(lastCol, deptIdx + 1)).getValues();
  var written = 0;
  var skipped = 0;
  var failed = 0;

  for (var i = 0; i < values.length; i++) {
    var projectId = String(values[i][idIdx] || '').trim();
    if (!projectId) {
      skipped++;
      continue;
    }
    try {
      var dept = fetchProjectDepartment_(projectId, apiKey);
      sheet.getRange(i + 2, deptIdx + 1).setValue(dept);
      written++;
    } catch (err) {
      failed++;
      Logger.log('Row ' + (i + 2) + ' id=' + projectId + ' ' + err);
      // Leave cell as-is so a later run can retry. Dashboard shows Unassigned if blank.
    }
    Utilities.sleep(80);
  }

  Logger.log('Department backfill written=' + written + ' skipped=' + skipped + ' failed=' + failed);
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
    throw new Error('HTTP ' + code + ' ' + res.getContentText().slice(0, 180));
  }
  var payload = JSON.parse(res.getContentText() || '{}');
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
  var candidates = [
    payload.department,
    payload.departmentName,
    payload.department_name,
    payload.data && payload.data.department,
    payload.data && payload.data.departmentName
  ];
  for (var i = 0; i < candidates.length; i++) {
    var d = candidates[i];
    if (d && typeof d === 'object') {
      d = d.name || d.title || d.label || '';
    }
    d = String(d || '').trim();
    if (d) return d;
  }
  return '';
}

function headerIndex_(headers, names) {
  var lower = headers.map(function(h) { return String(h || '').trim().toLowerCase(); });
  for (var i = 0; i < names.length; i++) {
    var k = lower.indexOf(String(names[i]).toLowerCase());
    if (k >= 0) return k;
  }
  return -1;
}
