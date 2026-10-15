import {
  parseBearer,
  verifyFirebaseIdToken,
  loadServiceAccount,
  serviceAccountToken,
  readTab,
  rowsToObjects,
  pick,
  isActiveYes,
  isHrRole,
  lastStaffRow,
  blockedDriveLink,
  driveFileIdFromLink
} from './employee-files.js';

var PHOTO_MAX_BYTES = 2 * 1024 * 1024;
var PROFILE_CACHE_MS = 60 * 1000;
var PHOTO_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
].join(' ');

var profileCache = { at: 0, sheetId: '', rows: null };

function notFound(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(404).end();
}

function employeeIdFromReq(req) {
  var raw = req && req.query ? req.query.employeeId : '';
  if (Array.isArray(raw)) raw = raw[0];
  if ((raw == null || raw === '') && req && req.url) {
    try {
      var parsed = new URL(req.url, 'https://dashboard.local');
      raw = parsed.searchParams.get('employeeId');
    } catch (e) {
      raw = '';
    }
  }
  var id = String(raw || '').trim();
  if (!id || id.length > 64) return '';
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(id)) return '';
  return id;
}

function lastProfileRow(rows, employeeId) {
  var found = null;
  (rows || []).forEach(function (row) {
    var id = pick(row, ['Employee ID']).trim();
    if (!id || id !== employeeId) return;
    found = row;
  });
  return found;
}

async function cachedProfileRows(sheetId, accessToken) {
  var now = Date.now();
  if (profileCache.rows && profileCache.sheetId === sheetId && now - profileCache.at < PROFILE_CACHE_MS) {
    return profileCache.rows;
  }
  var values = await readTab(sheetId, 'Employees_Profile', accessToken);
  var rows = rowsToObjects(values);
  profileCache = { at: now, sheetId: sheetId, rows: rows };
  return rows;
}

function blockedPhotoPlace(name) {
  if (blockedDriveLink(name)) return true;
  return String(name || '').toLowerCase().indexOf('performance') >= 0;
}

function allowedMime(mime) {
  var type = String(mime || '').toLowerCase().split(';')[0].trim();
  if (type === 'image/jpg') type = 'image/jpeg';
  if (type === 'image/jpeg' || type === 'image/png' || type === 'image/webp') return type;
  return '';
}

function sniffImage(buf) {
  if (!buf || buf.length < 12) return '';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

async function driveJson(fileId, accessToken, fields) {
  var url =
    'https://www.googleapis.com/drive/v3/files/' +
    encodeURIComponent(fileId) +
    '?supportsAllDrives=true&fields=' +
    encodeURIComponent(fields);
  var response = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!response.ok) return null;
  try { return await response.json(); } catch (e) { return null; }
}

async function ancestorsBlocked(fileId, accessToken, seen, depth) {
  if (!fileId || depth > 8) return true;
  if (seen[fileId]) return false;
  seen[fileId] = true;
  var meta = await driveJson(fileId, accessToken, 'id,name,parents');
  if (!meta) return true;
  if (blockedPhotoPlace(meta.name || '')) return true;
  var parents = Array.isArray(meta.parents) ? meta.parents : [];
  if (!parents.length) return depth === 0;
  for (var i = 0; i < parents.length; i++) {
    if (await ancestorsBlocked(parents[i], accessToken, seen, depth + 1)) return true;
  }
  return false;
}

async function readImageBytes(fileId, accessToken) {
  var url =
    'https://www.googleapis.com/drive/v3/files/' +
    encodeURIComponent(fileId) +
    '?alt=media&supportsAllDrives=true';
  var response = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!response.ok || !response.body || typeof response.body.getReader !== 'function') return null;
  var reader = response.body.getReader();
  var chunks = [];
  var total = 0;
  try {
    while (true) {
      var step = await reader.read();
      if (step.done) break;
      var value = step.value;
      if (!value) continue;
      total += value.byteLength;
      if (total > PHOTO_MAX_BYTES) {
        try { await reader.cancel(); } catch (e) {}
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } catch (e2) {
    return null;
  }
  if (!total) return null;
  return Buffer.concat(chunks, total);
}

export default async function handler(req, res) {
  if (!req || req.method !== 'GET') return notFound(res);

  var token = parseBearer(req.headers && (req.headers.authorization || req.headers.Authorization));
  if (!token) return notFound(res);

  var employeeId = employeeIdFromReq(req);
  if (!employeeId) return notFound(res);

  var user;
  try {
    user = await verifyFirebaseIdToken(token);
  } catch (e) {
    user = null;
  }
  if (!user) return notFound(res);

  var privateSheetId = String(process.env.EMPLOYEE_FILES_SHEET_ID || '').trim();
  var cred = loadServiceAccount();
  if (!privateSheetId || !cred) return notFound(res);

  var accessToken;
  try {
    accessToken = await serviceAccountToken(cred, PHOTO_SCOPES);
  } catch (e2) {
    return notFound(res);
  }

  try {
    var staffValues = await readTab(privateSheetId, 'Staff_Access', accessToken);
    var staff = lastStaffRow(rowsToObjects(staffValues), user.email);
    if (!staff || !isActiveYes(pick(staff, ['Active', 'active', 'Enabled', 'Status']))) return notFound(res);
    if (!isHrRole(pick(staff, ['Role', 'role']))) return notFound(res);

    var profiles = await cachedProfileRows(privateSheetId, accessToken);
    var profile = lastProfileRow(profiles, employeeId);
    if (!profile) return notFound(res);

    var photoLink = pick(profile, ['Photo Drive Link']);
    if (!photoLink || blockedDriveLink(photoLink)) return notFound(res);
    var fileId = driveFileIdFromLink(photoLink);
    if (!fileId) return notFound(res);

    var meta = await driveJson(fileId, accessToken, 'id,name,mimeType,size,parents');
    if (!meta) return notFound(res);
    var mime = allowedMime(meta.mimeType);
    if (!mime) return notFound(res);
    var declared = Number(meta.size);
    if (meta.size != null && String(meta.size).trim() !== '') {
      if (!Number.isFinite(declared) || declared <= 0 || declared > PHOTO_MAX_BYTES) return notFound(res);
    }
    if (blockedPhotoPlace(meta.name || '')) return notFound(res);
    if (await ancestorsBlocked(fileId, accessToken, {}, 0)) return notFound(res);

    var bytes = await readImageBytes(fileId, accessToken);
    if (!bytes) return notFound(res);
    var sniffed = sniffImage(bytes);
    if (!sniffed || sniffed !== mime) return notFound(res);

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).end(bytes);
  } catch (e3) {
    return notFound(res);
  }
}

export { sniffImage, employeeIdFromReq, PHOTO_MAX_BYTES };
