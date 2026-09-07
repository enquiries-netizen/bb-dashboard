/**
 * Probe Buildpass_Project_Sync / Buildpass_Labour headers.
 * Optional: GET https://api.buildpass.global/projects/{id} when a Buildpass
 * token is already in the environment. Does not invent secrets.
 *
 * Usage (from repo root):
 *   node automations/backfill-buildpass-project-sync-department.cjs
 *   node automations/backfill-buildpass-project-sync-department.cjs --fetch
 *   node automations/backfill-buildpass-project-sync-department.cjs --fetch --write
 *
 * Sheet writes belong in Apps Script:
 *   backfillBuildpassProjectSyncDepartment
 *   fillEmptyBuildpassProjectSyncDepartment
 *   createDepartmentFillTrigger
 *
 * Env (do not commit):
 *   BUILDPASS_API_KEY or BUILDPASS_TOKEN   - same key as Make Scenario 9b
 *   GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON  - required for --write
 */

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var cfg = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
var sheetId = (cfg.match(/SHEET_ID:\s*'([^']+)'/) || [])[1];
var sheetsKey = (cfg.match(/API_KEY:\s*'([^']+)'/) || [])[1];
var referer = 'https://bb-dashboard-eight.vercel.app/';
var SYNC_TAB = 'Buildpass_Project_Sync';
var LABOUR_TAB = 'Buildpass_Labour';
var API_BASE = 'https://api.buildpass.global/projects/';

var args = process.argv.slice(2);
var doFetch = args.indexOf('--fetch') !== -1;
var doWrite = args.indexOf('--write') !== -1;

function buildpassKey() {
  return process.env.BUILDPASS_API_KEY ||
    process.env.BUILDPASS_TOKEN ||
    process.env.BUILDPASS_API_TOKEN ||
    process.env.BUILD_PASS_API_KEY ||
    '';
}

function fetchTab(name) {
  var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId +
    '/values/' + encodeURIComponent(name) + '?key=' + sheetsKey;
  return fetch(url, { headers: { Referer: referer } }).then(function(r) {
    return r.json().then(function(j) {
      return {
        name: name,
        http: r.status,
        error: j.error && j.error.message,
        values: j.values || []
      };
    });
  });
}

function headerIndex(headers, names) {
  var lower = headers.map(function(h) { return String(h || '').trim().toLowerCase(); });
  for (var i = 0; i < names.length; i++) {
    var k = lower.indexOf(String(names[i]).toLowerCase());
    if (k >= 0) return k;
  }
  return -1;
}

function extractDepartment(payload) {
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

function authHeaders(token) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/json'
  };
}

async function fetchDepartment(projectId, token) {
  var url = API_BASE + encodeURIComponent(projectId);
  var res = await fetch(url, { headers: authHeaders(token) });
  var text = await res.text();
  var json = {};
  try { json = JSON.parse(text); } catch (e) { json = { raw: text.slice(0, 200) }; }
  if (res.status === 404) return { department: '', status: 404 };
  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ' for ' + projectId + ' ' + text.slice(0, 180));
  }
  return { department: extractDepartment(json), status: res.status, keys: Object.keys(json) };
}

(async function main() {
  console.log('Sheet', sheetId);
  var tabs = await Promise.all([fetchTab(SYNC_TAB), fetchTab(LABOUR_TAB)]);
  tabs.forEach(function(t) {
    var headers = (t.values[0] || []).map(function(h) { return String(h || '').trim(); });
    console.log('\n' + t.name + ' http=' + t.http + (t.error ? ' error=' + t.error : ''));
    console.log('headers:', headers.filter(Boolean).join(' | ') || '(none)');
  });

  var sync = tabs[0];
  var labour = tabs[1];
  var sh = (sync.values[0] || []).map(function(h) { return String(h || '').trim(); });
  var lh = (labour.values[0] || []).map(function(h) { return String(h || '').trim(); });
  var syncDept = headerIndex(sh, ['Department', 'department', 'Dept', 'dept']);
  var labourDept = headerIndex(lh, ['Department', 'department', 'Dept', 'dept']);
  var idIdx = headerIndex(sh, ['Buildpass Project ID', 'Buildpass Project Id', 'Project ID']);
  var statusIdx = headerIndex(sh, ['Buildpass Status', 'Status', 'status']);
  var jobIdx = headerIndex(sh, ['Job #', 'Job Number', 'job_number']);
  var nameIdx = headerIndex(sh, ['Project Name', 'project_name', 'Job Name']);

  console.log('\nBuildpass_Project_Sync Department column:', syncDept >= 0 ? colLetter(syncDept) + ' "' + sh[syncDept] + '"' : 'MISSING (dashboard will show Unassigned per row)');
  console.log('Buildpass_Labour Department column:', labourDept >= 0 ? colLetter(labourDept) + ' "' + lh[labourDept] + '"' : 'MISSING');

  var upcoming = [];
  sync.values.slice(1).forEach(function(row, i) {
    var st = String((statusIdx >= 0 ? row[statusIdx] : '') || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (st !== 'UPCOMING') return;
    upcoming.push({
      row: i + 2,
      id: idIdx >= 0 ? String(row[idIdx] || '').trim() : '',
      job: jobIdx >= 0 ? String(row[jobIdx] || '').trim() : '',
      name: nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '',
      department: syncDept >= 0 ? String(row[syncDept] || '').trim() : ''
    });
  });
  console.log('UPCOMING rows:', upcoming.length);
  console.log('sample:', JSON.stringify(upcoming.slice(0, 5), null, 2));

  var token = buildpassKey();
  if (!doFetch) {
    if (token) console.log('\nBuildpass token is present in env. Re-run with --fetch to call GET /projects/{id}.');
    else console.log('\nNo BUILDPASS_API_KEY / BUILDPASS_TOKEN in env. Skipping API calls. Lori: run Make Scenario or Apps Script backfill.');
    return;
  }
  if (!token) {
    console.log('\n--fetch requested but no Buildpass token in env. Not inventing a key.');
    return;
  }

  var ids = [];
  var seen = {};
  sync.values.slice(1).forEach(function(row) {
    var id = idIdx >= 0 ? String(row[idIdx] || '').trim() : '';
    if (!id || seen[id]) return;
    seen[id] = true;
    ids.push(id);
  });
  console.log('\nFetching Department for', ids.length, 'project ids...');
  var results = [];
  var sampleKeys = null;
  for (var i = 0; i < ids.length; i++) {
    var got = await fetchDepartment(ids[i], token);
    if (!sampleKeys && got.keys) sampleKeys = got.keys;
    results.push({ id: ids[i], department: got.department, status: got.status });
    await new Promise(function(r) { setTimeout(r, 80); });
  }
  if (sampleKeys) console.log('Sample JSON keys:', sampleKeys.join(', '));
  console.log('Fetched', results.filter(function(r) { return r.department; }).length, 'with Department,', results.filter(function(r) { return !r.department; }).length, 'blank');
  console.log('\nPaste into Department column (row 2+ in sheet order of unique IDs):');
  results.forEach(function(r) {
    console.log(r.id + '\t' + r.department);
  });

  if (!doWrite) {
    console.log('\nNo --write. To write the sheet you need GOOGLE_APPLICATION_CREDENTIALS or paste the table into column Department.');
    return;
  }
  var saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
  var saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if (!saPath && !saJson) {
    console.log('\n--write set but no Google service account in env. Not writing. Paste the TSV into the Department column instead.');
    return;
  }
  console.log('\nService account detected. Sheets write via googleapis is not wired in this helper; use Apps Script Buildpass_Project_Sync_Department.gs to write.');
})().catch(function(err) {
  console.error(err && err.stack || err);
  process.exit(1);
});

function colLetter(idx) {
  var n = idx + 1;
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
