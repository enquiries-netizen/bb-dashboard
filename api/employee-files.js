import { createSign, createVerify } from 'node:crypto';

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'bb-dashboard-authentication';

const EMPLOYMENT_TYPES = ['Full time', 'Part time', 'Subcontractor', 'VA'];

const PROFILE_HEADERS = [
  'Employee ID',
  'Name',
  'Position',
  'Brand',
  'Department',
  'Employment Type',
  'Start Date',
  'Reports To',
  'Work Phone',
  'Work Email',
  'Emergency Contact on file (Y/N)',
  'Company',
  'Agency',
  'Photo Drive Link',
  'Employee Drive Folder Link',
  'Status (Active or Archived)',
  'Archived Date'
];

const COMPLIANCE_HEADERS = [
  'Employee ID',
  'Employee Name',
  'Document Type',
  'Issue Date',
  'Expiry Date',
  'Days to Expiry (formula)',
  'Status (formula)',
  'Drive Link',
  'Verified By',
  'Verified Date',
  'Last Reminder Sent',
  'Notes'
];

function deny(res, status, message) {
  return res.status(status).json({ error: message });
}

function b64urlToBuffer(str) {
  var s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

var _secureTokenCerts = { at: 0, certs: null };

async function getSecureTokenCerts() {
  var now = Date.now();
  if (_secureTokenCerts.certs && now - _secureTokenCerts.at < 50 * 60 * 1000) {
    return _secureTokenCerts.certs;
  }
  var r = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!r.ok) throw new Error('certs');
  var certs = await r.json();
  _secureTokenCerts = { at: now, certs: certs };
  return certs;
}

async function verifyFirebaseIdToken(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  var header;
  var payload;
  try {
    header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
    payload = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!header || header.alg !== 'RS256' || !header.kid) return null;
  var certs;
  try {
    certs = await getSecureTokenCerts();
  } catch (e2) {
    return null;
  }
  var pem = certs[header.kid];
  if (!pem) return null;
  var verifier = createVerify('RSA-SHA256');
  verifier.update(parts[0] + '.' + parts[1]);
  verifier.end();
  if (!verifier.verify(pem, b64urlToBuffer(parts[2]))) return null;
  var now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) return null;
  if (payload.aud !== FIREBASE_PROJECT_ID) return null;
  if (payload.iss !== 'https://securetoken.google.com/' + FIREBASE_PROJECT_ID) return null;
  if (!payload.sub) return null;
  if (payload.email_verified !== true) return null;
  var email = String(payload.email || '').trim().toLowerCase();
  if (!email) return null;
  return { email: email };
}

function parseBearer(authHeader) {
  var m = String(authHeader || '').match(/^Bearer\s+(\S+)/i);
  return m ? m[1].trim() : '';
}

function isActiveYes(raw) {
  var s = String(raw == null ? '' : raw).trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1';
}

function isHrRole(raw) {
  var role = String(raw || '').trim().toLowerCase();
  return role === 'hr' || role === 'management';
}

function loadServiceAccount() {
  var raw = process.env.EMPLOYEE_FILES_SERVICE_ACCOUNT || '';
  if (!raw.trim()) return null;
  try {
    var cred = JSON.parse(raw);
    if (!cred || !cred.client_email || !cred.private_key) return null;
    return cred;
  } catch (e) {
    return null;
  }
}

async function serviceAccountToken(cred, scope) {
  var now = Math.floor(Date.now() / 1000);
  var header = b64urlJson({ alg: 'RS256', typ: 'JWT' });
  var claim = b64urlJson({
    iss: cred.client_email,
    scope: scope || 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  var signer = createSign('RSA-SHA256');
  signer.update(header + '.' + claim);
  signer.end();
  var sig = signer.sign(cred.private_key).toString('base64url');
  var r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: header + '.' + claim + '.' + sig
    })
  });
  if (!r.ok) throw new Error('token');
  var data = await r.json();
  if (!data || !data.access_token) throw new Error('token');
  return data.access_token;
}

async function readTab(spreadsheetId, tabName, accessToken) {
  var url =
    'https://sheets.googleapis.com/v4/spreadsheets/' +
    encodeURIComponent(spreadsheetId) +
    '/values/' +
    encodeURIComponent(tabName);
  var r = await fetch(url, {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  if (!r.ok) throw new Error('sheet');
  var data = await r.json();
  return data.values || [];
}

function rowsToObjects(values) {
  if (!values || values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var obj = {};
    var any = false;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var cell = row[c] !== undefined && row[c] !== null ? String(row[c]) : '';
      obj[headers[c]] = cell;
      if (cell) any = true;
    }
    if (any) out.push(obj);
  }
  return out;
}

function pick(row, names) {
  var keys = Object.keys(row || {});
  for (var i = 0; i < names.length; i++) {
    var want = String(names[i] || '').toLowerCase().replace(/\s+/g, ' ').trim();
    for (var k = 0; k < keys.length; k++) {
      var norm = String(keys[k] || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (norm === want) {
        var v = row[keys[k]];
        return v == null ? '' : String(v);
      }
    }
  }
  return '';
}

function blockedDriveLink(link) {
  var s = String(link || '').toLowerCase();
  if (s.indexOf('01. pay review') >= 0 || s.indexOf('01.%20pay%20review') >= 0) return true;
  if (s.indexOf('03. performance') >= 0 || s.indexOf('03.%20performance') >= 0) return true;
  if (s.indexOf('pay review') >= 0 || s.indexOf('pay%20review') >= 0) return true;
  return false;
}

function safeLink(link) {
  var s = String(link || '').trim();
  if (!s || blockedDriveLink(s)) return '';
  return s;
}

function driveFileIdFromLink(link) {
  var s = safeLink(link);
  if (!/^https:\/\//i.test(s)) return '';
  var url;
  try { url = new URL(s); } catch (e) { return ''; }
  var host = String(url.hostname || '').toLowerCase();
  if (host !== 'drive.google.com' && host !== 'docs.google.com') return '';
  var ids = [];
  var pathMatch = String(url.pathname || '').match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) ids.push(pathMatch[1]);
  var queryId = '';
  try { queryId = url.searchParams.get('id') || ''; } catch (e2) { queryId = ''; }
  if (/^[a-zA-Z0-9_-]+$/.test(queryId)) ids.push(queryId);
  var unique = [];
  ids.forEach(function (id) {
    if (unique.indexOf(id) < 0) unique.push(id);
  });
  if (unique.length !== 1) return '';
  if (unique[0].length < 10 || unique[0].length > 128) return '';
  return unique[0];
}

function profileHasPhoto(link) {
  return !!driveFileIdFromLink(link);
}

function lastStaffRow(rows, email) {
  var found = null;
  (rows || []).forEach(function (r) {
    var rowEmail = pick(r, ['Email', 'email', 'E-mail', 'Email Address']).trim().toLowerCase();
    if (!rowEmail || rowEmail !== email) return;
    found = r;
  });
  return found;
}

function samplePayload() {
  return {
    mode: 'sample',
    employees: [
      {
        employeeId: 'SAMPLE-001',
        name: 'Alex Sample',
        position: 'Site Supervisor',
        brand: 'BBBS',
        department: 'Supervisors',
        employmentType: 'Full time',
        startDate: '01/02/2024',
        reportsTo: 'Sam Sample',
        workPhone: '',
        workEmail: 'alex.sample@example.com',
        emergencyContactOnFile: 'Y',
        hasPhoto: false,
        employeeDriveFolderLink: '',
        status: 'Active',
        archivedDate: '',
        company: ''
      },
      {
        employeeId: 'SAMPLE-002',
        name: 'Jordan Sample',
        position: 'Administrator',
        brand: 'BBBS',
        department: 'Administration',
        employmentType: 'Part time',
        startDate: '15/06/2025',
        reportsTo: 'Sam Sample',
        workPhone: '',
        workEmail: 'jordan.sample@example.com',
        emergencyContactOnFile: 'N',
        hasPhoto: false,
        employeeDriveFolderLink: '',
        status: 'Active',
        archivedDate: '',
        company: ''
      },
      {
        employeeId: 'SAMPLE-003',
        name: 'Riley Sample',
        position: 'Trade contractor',
        brand: 'RMH',
        department: 'Tradesmen',
        employmentType: 'Subcontractor',
        startDate: '01/08/2025',
        reportsTo: 'Sam Sample',
        workPhone: '',
        workEmail: 'riley.sample@example.com',
        emergencyContactOnFile: 'Y',
        hasPhoto: false,
        employeeDriveFolderLink: '',
        status: 'Active',
        archivedDate: '',
        company: 'Sample Trade Co',
        agency: ''
      },
      {
        employeeId: 'SAMPLE-004',
        name: 'Casey Sample',
        position: 'Former supervisor',
        brand: 'BBBS',
        department: 'Supervisors',
        employmentType: 'Full time',
        startDate: '01/01/2020',
        reportsTo: '',
        workPhone: '',
        workEmail: 'casey.sample@example.com',
        emergencyContactOnFile: 'Y',
        hasPhoto: false,
        employeeDriveFolderLink: '',
        status: 'Archived',
        archivedDate: '01/05/2026',
        company: '',
        agency: ''
      },
      {
        employeeId: 'SAMPLE-005',
        name: 'Morgan Sample',
        position: 'Virtual assistant',
        brand: 'BBBS',
        department: 'Administration',
        employmentType: 'VA',
        startDate: '01/03/2026',
        reportsTo: 'Sam Sample',
        workPhone: '',
        workEmail: 'morgan.sample@example.com',
        emergencyContactOnFile: 'Y',
        hasPhoto: false,
        employeeDriveFolderLink: '',
        status: 'Active',
        archivedDate: '',
        company: 'Sample Admin Co',
        agency: ''
      },
      {
        employeeId: 'SAMPLE-006',
        name: 'Taylor Sample',
        position: 'Virtual assistant',
        brand: 'RMH',
        department: 'Administration',
        employmentType: 'VA',
        startDate: '12/04/2026',
        reportsTo: 'Sam Sample',
        workPhone: '',
        workEmail: 'taylor.sample@example.com',
        emergencyContactOnFile: 'N',
        hasPhoto: false,
        employeeDriveFolderLink: '',
        status: 'Active',
        archivedDate: '',
        company: '',
        agency: 'Sample Support Agency'
      }
    ],
    compliance: [
      {
        employeeId: 'SAMPLE-001',
        employeeName: 'Alex Sample',
        documentType: 'White card',
        issueDate: '01/03/2024',
        expiryDate: '',
        daysToExpiry: '',
        status: 'Valid',
        driveLink: '',
        verifiedBy: 'Sample reviewer',
        verifiedDate: '02/03/2024',
        lastReminderSent: ''
      },
      {
        employeeId: 'SAMPLE-001',
        employeeName: 'Alex Sample',
        documentType: 'First aid',
        issueDate: '01/09/2023',
        expiryDate: '01/11/2026',
        daysToExpiry: '45',
        status: 'Expiring in 60 days',
        driveLink: '',
        verifiedBy: 'Sample reviewer',
        verifiedDate: '02/09/2023',
        lastReminderSent: ''
      },
      {
        employeeId: 'SAMPLE-002',
        employeeName: 'Jordan Sample',
        documentType: 'Driver licence',
        issueDate: '01/01/2024',
        expiryDate: '01/11/2026',
        daysToExpiry: '20',
        status: 'Expiring in 30 days',
        driveLink: '',
        verifiedBy: 'Sample reviewer',
        verifiedDate: '02/01/2024',
        lastReminderSent: ''
      },
      {
        employeeId: 'SAMPLE-002',
        employeeName: 'Jordan Sample',
        documentType: 'Working at heights',
        issueDate: '01/06/2026',
        expiryDate: '20/10/2026',
        daysToExpiry: '5',
        status: 'Expiring in 7 days',
        driveLink: '',
        verifiedBy: 'Sample reviewer',
        verifiedDate: '02/06/2026',
        lastReminderSent: ''
      },
      {
        employeeId: 'SAMPLE-003',
        employeeName: 'Riley Sample',
        documentType: 'Public liability',
        issueDate: '01/01/2025',
        expiryDate: '01/01/2026',
        daysToExpiry: '-200',
        status: 'Expired',
        driveLink: '',
        verifiedBy: 'Sample reviewer',
        verifiedDate: '02/01/2025',
        lastReminderSent: ''
      },
      {
        employeeId: 'SAMPLE-003',
        employeeName: 'Riley Sample',
        documentType: 'White card',
        issueDate: '',
        expiryDate: '',
        daysToExpiry: '',
        status: 'Missing',
        driveLink: '',
        verifiedBy: '',
        verifiedDate: '',
        lastReminderSent: ''
      },
      {
        employeeId: 'SAMPLE-005',
        employeeName: 'Morgan Sample',
        documentType: 'White card',
        issueDate: '01/03/2026',
        expiryDate: '',
        daysToExpiry: '',
        status: 'Valid',
        driveLink: '',
        verifiedBy: 'Sample reviewer',
        verifiedDate: '02/03/2026',
        lastReminderSent: ''
      },
      {
        employeeId: 'SAMPLE-005',
        employeeName: 'Morgan Sample',
        documentType: 'First aid',
        issueDate: '01/04/2026',
        expiryDate: '01/12/2026',
        daysToExpiry: '40',
        status: 'Expiring in 60 days',
        driveLink: '',
        verifiedBy: 'Sample reviewer',
        verifiedDate: '02/04/2026',
        lastReminderSent: ''
      },
      {
        employeeId: 'SAMPLE-006',
        employeeName: 'Taylor Sample',
        documentType: 'First aid',
        issueDate: '01/05/2026',
        expiryDate: '01/11/2026',
        daysToExpiry: '18',
        status: 'Expiring in 30 days',
        driveLink: '',
        verifiedBy: 'Sample reviewer',
        verifiedDate: '02/05/2026',
        lastReminderSent: ''
      },
      {
        employeeId: 'SAMPLE-006',
        employeeName: 'Taylor Sample',
        documentType: 'White card',
        issueDate: '',
        expiryDate: '',
        daysToExpiry: '',
        status: 'Missing',
        driveLink: '',
        verifiedBy: '',
        verifiedDate: '',
        lastReminderSent: ''
      }
    ]
  };
}

function shapeProfile(row) {
  return {
    employeeId: pick(row, ['Employee ID']),
    name: pick(row, ['Name']),
    position: pick(row, ['Position']),
    brand: pick(row, ['Brand']),
    department: pick(row, ['Department']),
    employmentType: pick(row, ['Employment Type']),
    startDate: pick(row, ['Start Date']),
    reportsTo: pick(row, ['Reports To']),
    workPhone: pick(row, ['Work Phone']),
    workEmail: pick(row, ['Work Email']),
    emergencyContactOnFile: pick(row, ['Emergency Contact on file (Y/N)', 'Emergency Contact on file']),
    company: pick(row, ['Company', 'Company Name']),
    agency: pick(row, ['Agency', 'Agency Name']),
    hasPhoto: profileHasPhoto(pick(row, ['Photo Drive Link'])),
    employeeDriveFolderLink: safeLink(pick(row, ['Employee Drive Folder Link'])),
    status: pick(row, ['Status (Active or Archived)', 'Status']),
    archivedDate: pick(row, ['Archived Date'])
  };
}

function shapeCompliance(row) {
  return {
    employeeId: pick(row, ['Employee ID']),
    employeeName: pick(row, ['Employee Name']),
    documentType: pick(row, ['Document Type']),
    issueDate: pick(row, ['Issue Date']),
    expiryDate: pick(row, ['Expiry Date']),
    daysToExpiry: pick(row, ['Days to Expiry (formula)', 'Days to Expiry']),
    status: pick(row, ['Status (formula)', 'Status']),
    driveLink: safeLink(pick(row, ['Drive Link'])),
    verifiedBy: pick(row, ['Verified By']),
    verifiedDate: pick(row, ['Verified Date']),
    lastReminderSent: pick(row, ['Last Reminder Sent'])
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return deny(res, 405, 'Method not allowed.');

  var token = parseBearer(req.headers.authorization || req.headers.Authorization);
  if (!token) return deny(res, 401, 'Sign-in required.');

  var user;
  try {
    user = await verifyFirebaseIdToken(token);
  } catch (e) {
    user = null;
  }
  if (!user) return deny(res, 401, 'Sign-in required.');

  var privateSheetId = String(process.env.EMPLOYEE_FILES_SHEET_ID || '').trim();
  var cred = loadServiceAccount();
  if (!privateSheetId || !cred) return deny(res, 503, 'Employee files are not configured.');

  var accessToken;
  var staffValues;
  try {
    accessToken = await serviceAccountToken(cred);
    staffValues = await readTab(privateSheetId, 'Staff_Access', accessToken);
  } catch (e2) {
    return deny(res, 503, 'Employee files are temporarily unavailable.');
  }

  var staffRows = rowsToObjects(staffValues);
  var staff = lastStaffRow(staffRows, user.email);
  if (!staff || !isActiveYes(pick(staff, ['Active', 'active', 'Enabled', 'Status']))) {
    return deny(res, 403, 'You do not have access to employee files.');
  }
  if (!isHrRole(pick(staff, ['Role', 'role']))) {
    return deny(res, 403, 'You do not have access to employee files.');
  }

  try {
    var profileValues = await readTab(privateSheetId, 'Employees_Profile', accessToken);
    var complianceValues = await readTab(privateSheetId, 'Employee_Compliance', accessToken);
    var employees = rowsToObjects(profileValues).map(shapeProfile);
    var compliance = rowsToObjects(complianceValues).map(shapeCompliance);
    if (!employees.length) {
      var sample = samplePayload();
      return res.status(200).json(sample);
    }
    return res.status(200).json({
      mode: 'live',
      employees: employees,
      compliance: compliance
    });
  } catch (e3) {
    return deny(res, 503, 'Employee files are temporarily unavailable.');
  }
}

export {
  EMPLOYMENT_TYPES,
  PROFILE_HEADERS,
  COMPLIANCE_HEADERS,
  isActiveYes,
  isHrRole,
  blockedDriveLink,
  driveFileIdFromLink,
  profileHasPhoto,
  parseBearer,
  verifyFirebaseIdToken,
  loadServiceAccount,
  serviceAccountToken,
  readTab,
  rowsToObjects,
  pick,
  lastStaffRow,
  samplePayload
};
