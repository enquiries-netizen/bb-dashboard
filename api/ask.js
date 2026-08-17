import { createVerify } from 'node:crypto';

const SHEET_ID =
  process.env.SHEET_ID || '17gNgYCC2rwAKGHtuhaApxeCa-6qxyI0gBB71ifciNv8';

// Standalone Internal Hub guides spreadsheet (not the Master Dashboard file).
const LIBRARY_SHEET_ID =
  process.env.LIBRARY_SHEET_ID || '1R5NEdGGU4dzTqedxy0q3BezqYglz3vGxhYSVa8nKgl0';

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'bb-dashboard-authentication';

// Internal Hub access: hardcoded email only. Independent of Staff_Access and BB_ALLOW.
const HUB_ALLOW_EMAILS = ['enquiries@bbbuildingservices.com.au'];

function isHubEmailAllowed(email) {
  var n = String(email || '').trim().toLowerCase();
  if (!n) return false;
  for (var i = 0; i < HUB_ALLOW_EMAILS.length; i++) {
    if (String(HUB_ALLOW_EMAILS[i] || '').toLowerCase() === n) return true;
  }
  return false;
}

function parseBearerToken(authHeader) {
  var m = String(authHeader || '').match(/^Bearer\s+(\S+)/i);
  return m ? m[1].trim() : '';
}

function b64urlToBuffer(str) {
  var s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
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
  if (!r.ok) throw new Error('securetoken certs HTTP ' + r.status);
  var certs = await r.json();
  _secureTokenCerts = { at: now, certs: certs };
  return certs;
}

async function verifyFirebaseIdTokenWithCerts(token) {
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
  var certs = await getSecureTokenCerts();
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
  return payload;
}

async function verifyHubIdToken(authHeader) {
  var token = parseBearerToken(authHeader);
  if (!token) return null;
  var saRaw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
  if (saRaw) {
    try {
      var adminMod = await import('firebase-admin');
      var admin = adminMod.default || adminMod;
      if (!admin.apps.length) {
        var cred = JSON.parse(saRaw);
        admin.initializeApp({
          credential: admin.credential.cert(cred),
          projectId: FIREBASE_PROJECT_ID
        });
      }
      return await admin.auth().verifyIdToken(token);
    } catch (e) {
      console.warn('[ask] firebase-admin verifyIdToken failed', e && e.message);
      return null;
    }
  }
  try {
    return await verifyFirebaseIdTokenWithCerts(token);
  } catch (e2) {
    console.warn('[ask] Firebase ID token cert verify failed', e2 && e2.message);
    return null;
  }
}

function hubLibraryDenied(res, action) {
  if (action === 'bootstrap') {
    return res.status(200).json({ empty: true, visibleCount: 0 });
  }
  return res.status(200).json({
    answer: 'BBBS Internal Hub is not available for your account yet.'
  });
}

// Division tags only, keyed by email. Staff_Access "Division" column overrides
// when present and non-blank. Does not grant Hub page access.
const HUB_STAFF_DIVISIONS = {
  'enquiries@bbbuildingservices.com.au': ['General', 'Admin/Office']
};

function tagNorm(t) {
  return String(t || '').trim().toLowerCase();
}

function splitTags(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return ['General'];
  return s.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
}

function pickCol(row, names) {
  var keys = Object.keys(row || {});
  var i;
  var k;
  var want;
  var normKey;
  for (i = 0; i < names.length; i++) {
    want = String(names[i] || '').toLowerCase().replace(/\s+/g, ' ').trim();
    for (k = 0; k < keys.length; k++) {
      normKey = String(keys[k] || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (normKey === want) {
        var v = row[keys[k]];
        return v == null ? '' : String(v);
      }
    }
  }
  return '';
}

function rowsToObjects(values) {
  if (!values || values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  var out = [];
  var r;
  var c;
  for (r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var obj = {};
    var any = false;
    for (c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var cell = row[c] !== undefined && row[c] !== null ? String(row[c]) : '';
      obj[headers[c]] = cell;
      if (cell) any = true;
    }
    if (any) out.push(obj);
  }
  return out;
}

function parseGvizTable(text) {
  var start = String(text || '').indexOf('{');
  var end = String(text || '').lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  var data = JSON.parse(text.slice(start, end + 1));
  var table = data && data.table;
  if (!table) return [];
  var headers = (table.cols || []).map(function (col) {
    return String((col && (col.label || col.id)) || '').trim();
  });
  var values = [headers];
  (table.rows || []).forEach(function (row) {
    var cells = row && row.c ? row.c : [];
    var vals = headers.map(function (_h, i) {
      var cell = cells[i];
      if (!cell) return '';
      if (cell.f != null && String(cell.f) !== '') return String(cell.f);
      if (cell.v == null) return '';
      return String(cell.v);
    });
    values.push(vals);
  });
  return values;
}

async function fetchSheetValues(tabName, spreadsheetId) {
  var sid = spreadsheetId || SHEET_ID;
  var key =
    process.env.GOOGLE_SHEETS_API_KEY ||
    process.env.SHEETS_API_KEY ||
    'AIzaSyAKxn54VIagSCHmKHQ6MZeD9n8fnWWs3Wk';
  var apiUrl =
    'https://sheets.googleapis.com/v4/spreadsheets/' +
    sid +
    '/values/' +
    encodeURIComponent(tabName) +
    '?key=' +
    key;
  try {
    var apiRes = await fetch(apiUrl);
    if (apiRes.ok) {
      var apiJson = await apiRes.json();
      return apiJson.values || [];
    }
    // Missing/renamed tab: do not fall through to gviz (it returns INDEX).
    if (apiRes.status === 400 || apiRes.status === 404) {
      console.warn('[ask] Sheets API missing tab', tabName, apiRes.status);
      return [];
    }
    console.warn('[ask] Sheets API fetch failed for', tabName, apiRes.status);
  } catch (e) {
    console.warn('[ask] Sheets API fetch error for', tabName, e && e.message);
  }
  var gviz =
    'https://docs.google.com/spreadsheets/d/' +
    sid +
    '/gviz/tq?tqx=out:json&sheet=' +
    encodeURIComponent(tabName);
  var gRes = await fetch(gviz);
  if (!gRes.ok) {
    console.warn('[ask] gviz fetch failed for', tabName, gRes.status);
    return [];
  }
  var text = await gRes.text();
  try {
    var values = parseGvizTable(text);
    var headerJoin = ((values[0] || []).join(' ')).toLowerCase();
    if (tabName === 'Library_Guides' && headerJoin.indexOf('guide') < 0 && headerJoin.indexOf('title') < 0) {
      console.warn('[ask] gviz did not return Library_Guides headers; treating as empty');
      return [];
    }
    if (tabName === 'Staff_Access' && headerJoin.indexOf('email') < 0) {
      console.warn('[ask] gviz did not return Staff_Access headers; treating as empty');
      return [];
    }
    return values;
  } catch (e2) {
    console.warn('[ask] gviz parse failed for', tabName, e2 && e2.message);
    return [];
  }
}

function normalizeLibraryGuides(rows) {
  if (!rows || !rows.length) return [];
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var r = rows[i];
    var title = String(pickCol(r, ['Title', 'Guide Title', 'Name']) || '').trim();
    var content = String(pickCol(r, [
      'Content / Steps', 'Content/Steps', 'Content', 'Steps', 'Guide Content'
    ]) || '').trim();
    var id = String(pickCol(r, ['Guide ID', 'GuideID', 'ID', 'Id']) || '').trim();
    if (!title && !content && !id) continue;
    out.push({
      guideId: id,
      title: title,
      category: String(pickCol(r, ['Category', 'Cat']) || '').trim(),
      content: content,
      divisionRoleTag: String(pickCol(r, [
        'Division/Role Tag',
        'Division / Role Tag',
        'Division',
        'Role Tag',
        'Role'
      ]) || '').trim(),
      mediaLink: String(pickCol(r, ['Media Link', 'Media', 'Link', 'URL']) || '').trim()
    });
  }
  return out;
}

function buildStaffDivisions(staffRows) {
  var map = {};
  Object.keys(HUB_STAFF_DIVISIONS).forEach(function (email) {
    map[String(email).trim().toLowerCase()] = HUB_STAFF_DIVISIONS[email].slice();
  });
  (staffRows || []).forEach(function (r) {
    var email = String(pickCol(r, ['Email', 'email', 'E-mail', 'Email Address']) || '')
      .trim()
      .toLowerCase();
    if (!email) return;
    var raw = pickCol(r, [
      'Division',
      'Divisions',
      'Division/Role Tag',
      'Hub Division',
      'Role Tag'
    ]);
    if (!String(raw || '').trim()) return;
    map[email] = String(raw)
      .split(',')
      .map(function (t) { return t.trim(); })
      .filter(Boolean);
  });
  return map;
}

function getVisibleGuides(currentUser, allGuides, staffDivisions) {
  var email = String((currentUser && currentUser.email) || '').trim().toLowerCase();
  var userDivisions = (staffDivisions[email] || []).map(tagNorm);
  return (allGuides || []).filter(function (guide) {
    var tags = splitTags(guide.divisionRoleTag);
    if (tags.some(function (t) { return tagNorm(t) === 'general'; })) return true;
    return tags.some(function (tag) { return userDivisions.indexOf(tagNorm(tag)) !== -1; });
  });
}

function libraryJsonFormatRules() {
  return (
    ' RESPONSE FORMAT (mandatory): Reply with a single JSON object only. No markdown fences. No extra text. Shape: ' +
    '{"answer":"plain text for the user","source":{"guideId":"exact Guide ID","title":"exact Title"},"confidence":{"label":"High"}} ' +
    'Set source to null when no guide matches, or when more than one guide is needed. Never invent a Guide ID or Title. ' +
    'confidence.label must be High, Medium, or Low: your own rough estimate of how directly the matched guide answers the question. ' +
    'This is not a calculated retrieval score. Use Low when source is null. ' +
    'Never use em dashes in answer text, use commas or colons instead.'
  );
}

function parseLibraryStructuredAnswer(raw) {
  var text = String(raw || '').trim();
  var fallback = { answer: text, source: null, confidenceLabel: 'Low' };
  if (!text) return { answer: '', source: null, confidenceLabel: 'Low' };
  var candidate = text;
  var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidate = fence[1].trim();
  var start = candidate.indexOf('{');
  var end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return fallback;
  try {
    var obj = JSON.parse(candidate.slice(start, end + 1));
    if (!obj || typeof obj !== 'object') return fallback;
    var answer = obj.answer != null ? String(obj.answer) : '';
    var source = obj.source;
    if (Array.isArray(source)) {
      source = source.length === 1 ? source[0] : null;
    } else if (!source || typeof source !== 'object') {
      source = null;
    }
    var conf = obj.confidence;
    var label = 'Low';
    if (typeof conf === 'string') label = conf;
    else if (conf && typeof conf === 'object' && conf.label != null) label = String(conf.label);
    else if (obj.confidenceLabel != null) label = String(obj.confidenceLabel);
    return {
      answer: answer || text,
      source: source,
      confidenceLabel: label
    };
  } catch (e) {
    return fallback;
  }
}

function normalizeConfidenceLabel(raw) {
  var s = String(raw || '').trim().toLowerCase();
  var pct = parseFloat(s.replace('%', ''));
  if (!isNaN(pct) && /[0-9]/.test(s)) {
    if (pct >= 75) return 'High';
    if (pct >= 40) return 'Medium';
    return 'Low';
  }
  if (s.indexOf('high') !== -1) return 'High';
  if (s.indexOf('med') !== -1) return 'Medium';
  if (s.indexOf('low') !== -1) return 'Low';
  return 'Low';
}

function resolveLibrarySource(claimed, guides) {
  if (!claimed || typeof claimed !== 'object' || !guides || !guides.length) return null;
  var id = String(claimed.guideId || claimed.guide_id || claimed.id || '').trim().toLowerCase();
  var title = String(claimed.title || '').trim().toLowerCase();
  var byId = [];
  var byTitle = [];
  guides.forEach(function (g) {
    var gid = String(g.guideId || '').trim().toLowerCase();
    var gt = String(g.title || '').trim().toLowerCase();
    if (id && gid && gid === id) byId.push(g);
    if (title && gt && gt === title) byTitle.push(g);
  });
  if (byId.length === 1) {
    return { guideId: byId[0].guideId || '', title: byId[0].title || '' };
  }
  if (!id && byTitle.length === 1) {
    return { guideId: byTitle[0].guideId || '', title: byTitle[0].title || '' };
  }
  return null;
}

function citationLabelFor(source) {
  if (!source) return 'No guide found';
  if (source.title) return source.title;
  if (source.guideId) return source.guideId;
  return 'No guide found';
}

function libraryMetaPayload(answer, claimedSource, confidenceRaw, guides) {
  var matched = resolveLibrarySource(claimedSource, guides);
  var confLabel = normalizeConfidenceLabel(confidenceRaw);
  if (!matched) confLabel = 'Low';
  return {
    answer: stripEmDashesLib(answer),
    source: matched,
    citationLabel: citationLabelFor(matched),
    confidence: {
      label: confLabel,
      estimated: true,
      note: 'Gemini self-estimate of how directly the guide answers, not a retrieval score'
    }
  };
}

function stripEmDashesLib(text) {
  return String(text || '').replace(/\u2014/g, ',').replace(/\u2013/g, '-');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const {
    question,
    pageData,
    name,
    pageContext,
    pageDirectory,
    allPagesData,
    conversationHistory,
    pageInsights,
    mode,
    libraryGuides,
    email,
    action,
    toolContinue,
    geminiContents,
    toolResults
  } = req.body || {};

  // Tool-continue rounds may omit question (already in geminiContents).
  // Library bootstrap also has no question.
  if (!toolContinue && !question && !(mode === 'library' && action === 'bootstrap')) {
    return res.status(400).json({ error: 'No question' });
  }

  const who = (name && String(name).trim()) || 'a team member';
  const ctx = (pageContext && String(pageContext).trim()) || 'unknown page';
  // Primary: stable Gemini Pro (billing enabled). Fallback: Flash on quota/404/429/etc.
  const GEMINI_PRIMARY = 'gemini-2.5-pro';
  const GEMINI_FALLBACK = 'gemini-flash-latest';
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  function stripEmDashes(text) {
    return String(text || '').replace(/\u2014/g, ',').replace(/\u2013/g, '-');
  }

  function geminiUrl(model) {
    return (
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      model +
      ':generateContent?key=' +
      GEMINI_KEY
    );
  }

  async function callGeminiOnce(model, body) {
    const r = await fetch(geminiUrl(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let data;
    try {
      data = await r.json();
    } catch (e) {
      data = { error: { message: 'Invalid JSON from Gemini (' + r.status + ')' } };
    }
    const ok = r.ok && !(data && data.error);
    return { ok: ok, status: r.status, data: data };
  }

  async function callGemini(body) {
    let primary;
    try {
      primary = await callGeminiOnce(GEMINI_PRIMARY, body);
    } catch (e) {
      primary = {
        ok: false,
        status: 0,
        data: { error: { message: String((e && e.message) || e) } }
      };
    }

    if (primary.ok) {
      console.log('[ask] model=', GEMINI_PRIMARY);
      return { data: primary.data, modelUsed: GEMINI_PRIMARY };
    }

    const errMsg =
      (primary.data && primary.data.error && primary.data.error.message) ||
      ('HTTP ' + primary.status);
    console.warn(
      '[ask] primary model failed; falling back to',
      GEMINI_FALLBACK,
      errMsg
    );

    let fallback;
    try {
      fallback = await callGeminiOnce(GEMINI_FALLBACK, body);
    } catch (e) {
      fallback = {
        ok: false,
        status: 0,
        data: { error: { message: String((e && e.message) || e) } }
      };
    }

    console.log('[ask] model=', GEMINI_FALLBACK);
    return { data: fallback.data, modelUsed: GEMINI_FALLBACK };
  }

  function extractAnswer(data) {
    const parts =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts;
    if (!parts || !parts.length) {
      return {
        answer:
          'BB error: ' +
          (data && data.error ? data.error.message : JSON.stringify(data || {}).slice(0, 300)),
        functionCalls: []
      };
    }
    const functionCalls = [];
    const textBits = [];
    parts.forEach(function (p) {
      if (p.functionCall && p.functionCall.name) {
        functionCalls.push({
          name: p.functionCall.name,
          args: p.functionCall.args || {}
        });
      } else if (p.text) {
        textBits.push(p.text);
      }
    });
    return {
      answer: textBits.length ? textBits.join('\n') : '',
      functionCalls: functionCalls,
      modelContent: { role: 'model', parts: parts }
    };
  }

  // ─── Library mode (BBBS Internal Hub): ground ONLY in Library_Guides ───
  // Separate path so BB AI dashboard prompting is unchanged.
  // API mode key stays "library"; page route is internal-hub.
  // Client-supplied libraryGuides are ignored: fetch + Division filter run here.
  if (mode === 'library') {
    const authHeader =
      (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
    let decoded = null;
    try {
      decoded = await verifyHubIdToken(authHeader);
    } catch (tokErr) {
      console.warn('[ask] library token verify error', tokErr && tokErr.message);
      decoded = null;
    }
    const userEmail =
      decoded && decoded.email ? String(decoded.email).trim().toLowerCase() : '';
    // Ignore client-posted email; only the verified Firebase token counts.
    void email;
    if (!userEmail || !isHubEmailAllowed(userEmail)) {
      console.log('[ask] library denied email=', userEmail || '(none)', 'token=', decoded ? 'ok' : 'missing/invalid');
      return hubLibraryDenied(res, action);
    }
    let allGuides = [];
    let staffDivisions = {};
    let sheetEmpty = true;
    try {
      const guideValues = await fetchSheetValues('Library_Guides', LIBRARY_SHEET_ID);
      const staffValues = await fetchSheetValues('Staff_Access', SHEET_ID);
      allGuides = normalizeLibraryGuides(rowsToObjects(guideValues));
      staffDivisions = buildStaffDivisions(rowsToObjects(staffValues));
      sheetEmpty = !allGuides.length;
    } catch (sheetErr) {
      console.warn('[ask] library sheet load failed', sheetErr && sheetErr.message);
      allGuides = [];
      sheetEmpty = true;
    }
    // Do not use client-posted libraryGuides (would bypass server-side ACL).
    void libraryGuides;

    const guides = getVisibleGuides({ email: userEmail }, allGuides, staffDivisions);
    console.log(
      '[ask] library filter email=',
      userEmail || '(none)',
      'divisions=',
      (staffDivisions[userEmail] || []).join(',') || '(none)',
      'visible=',
      guides.length,
      '/',
      allGuides.length
    );

    if (action === 'bootstrap') {
      return res.status(200).json({
        empty: sheetEmpty,
        visibleCount: guides.length
      });
    }

    const history = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-16).filter(function (t) {
          return t && t.text && (t.role === 'user' || t.role === 'assistant' || t.role === 'model');
        })
      : [];

    let historyBlock = '';
    if (history.length) {
      historyBlock = '\n\nCONVERSATION SO FAR (same browser session, use for follow-ups):\n';
      history.forEach(function (turn) {
        const role = turn.role === 'assistant' || turn.role === 'model' ? 'BB' : 'User';
        historyBlock += role + ': ' + String(turn.text).slice(0, 1200) + '\n';
      });
    }

    let prompt;
    if (sheetEmpty) {
      prompt =
        'You are BB, the BBBS Internal Hub assistant for BB Building Services. ' +
        'You are speaking with ' +
        who +
        '. ' +
        'The Library_Guides sheet is empty or not available yet. ' +
        'Reply with exactly this message (you may greet them by name first): ' +
        '"Internal Hub content is still being added, check back soon." ' +
        'Do not answer from general knowledge. Do not invent guides. ' +
        'Never use em dashes in your answers, use commas or colons instead.' +
        libraryJsonFormatRules() +
        historyBlock +
        '\n\nCurrent question: ' +
        question;
    } else if (!guides.length) {
      prompt =
        'You are BB, the BBBS Internal Hub assistant for BB Building Services. ' +
        'You are speaking with ' +
        who +
        '. ' +
        'No Internal Hub guides are available for this person\'s division. ' +
        'Say plainly that no guide was found for that topic. ' +
        'Do not answer from general knowledge. Do not invent guides. ' +
        'Never use em dashes in your answers, use commas or colons instead.' +
        libraryJsonFormatRules() +
        historyBlock +
        '\n\nCurrent question: ' +
        question;
    } else {
      const guidesPayload = JSON.stringify(guides).slice(0, 80000);
      prompt =
        'You are BB, the BBBS Internal Hub assistant for BB Building Services. ' +
        'You help team members find how-to guides and internal info from the company Internal Hub only. ' +
        'You are speaking with ' +
        who +
        '. Address them by name naturally where appropriate. ' +
        'GROUNDING RULES (mandatory): ' +
        '1) Answer ONLY from the INTERNAL HUB GUIDES data provided below. Do not use general knowledge. ' +
        '2) Do not invent steps, policies, tools, or guides that are not in the data. ' +
        '3) If no guide matches the question, say plainly that no guide was found for that topic. ' +
        'Do not guess or fill gaps. Suggest they try different wording only if helpful. ' +
        '4) When a guide matches, use its Title, Category, Content/Steps, and Media Link as relevant. ' +
        '5) Prefer clear, practical language. Never use em dashes; use commas or colons instead. ' +
        '6) If asked who you are, say you are BB, the BBBS Internal Hub assistant. ' +
        'Do not volunteer developer or ownership details unless specifically asked; ' +
        'if asked who built this app, say Lori is your developer and the app is owned by BB Building Services. ' +
        '7) Use CONVERSATION SO FAR only to interpret follow-up questions. It does not allow answers from general knowledge.' +
        libraryJsonFormatRules() +
        historyBlock +
        '\n\nINTERNAL HUB GUIDES (sole source of truth):\n' +
        guidesPayload +
        '\n\nCurrent question: ' +
        question;
    }

    const libResult = await callGemini({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });
    const dataLib = libResult.data;
    const extractedLib = extractAnswer(dataLib);
    let answerLib = extractedLib.answer;
    if (!answerLib) {
      answerLib =
        'BB error: ' +
        (dataLib.error ? dataLib.error.message : JSON.stringify(dataLib).slice(0, 300));
      return res.status(200).json(libraryMetaPayload(answerLib, null, 'Low', guides));
    }
    const parsedLib = parseLibraryStructuredAnswer(answerLib);
    return res.status(200).json(
      libraryMetaPayload(parsedLib.answer, parsedLib.source, parsedLib.confidenceLabel, guides)
    );
  }

  // ─── Cross-page tools. Client executes (sheets in browser); server only orchestrates. ───
  const BB_TOOLS = [
    {
      function_declarations: [
        {
          name: 'getPageData',
          description:
            'Load live dashboard data for any page (P1-P12) on demand without the user visiting that page. Use when the question needs Marketing, Cash Flow, Sales, Profitability, Capacity, Weekly Overview, or any other page that is not already in the visited-pages payload. Accepts page ids (P10, p10) or names (Marketing, Cash Flow). Call multiple times if the question spans pages. Prefer the specialised attendance/diary tools for worker hours or diary quality scores.',
          parameters: {
            type: 'object',
            properties: {
              pageName: {
                type: 'string',
                description:
                  'Page id or alias, e.g. P10, Marketing, P9, Cash Flow, P2, Sales, P8, Weekly Overview.'
              }
            },
            required: ['pageName']
          }
        },
        {
          name: 'getWorkerAttendance',
          description:
            'Get Buildpass attendance for one worker in a Fri-Thu payroll week: hours on site, missing sign-off count, auto sign-off count. Use when the user asks about a person hours, sign-off, or attendance. weekStart is optional YYYY-Www; omit for the current payroll week.',
          parameters: {
            type: 'object',
            properties: {
              workerName: {
                type: 'string',
                description: 'Team member name to look up (partial names ok).'
              },
              weekStart: {
                type: 'string',
                description:
                  'Optional payroll week key YYYY-Www (Fri-Thu week keyed by Friday ISO week). Omit for current payroll week.'
              }
            },
            required: ['workerName']
          }
        },
        {
          name: 'getJobAttendance',
          description:
            'Get Buildpass attendance hours on site for one job number or site in a Fri-Thu payroll week. Use for job/site attendance questions.',
          parameters: {
            type: 'object',
            properties: {
              jobNumberOrSite: {
                type: 'string',
                description: 'Job number and/or site name as shown in Buildpass_Attendance.'
              },
              weekStart: {
                type: 'string',
                description:
                  'Optional payroll week key YYYY-Www. Omit for current payroll week.'
              }
            },
            required: ['jobNumberOrSite']
          }
        },
        {
          name: 'getDiaryQuality',
          description:
            'Get site diary quality score and missing checklist summary for one job or person-only group in a payroll week. Reuses P12 diary quality rules.',
          parameters: {
            type: 'object',
            properties: {
              jobOrPersonGroup: {
                type: 'string',
                description:
                  'Job number, job name, or person-only group label (e.g. Melis Record Keeping).'
              },
              weekStart: {
                type: 'string',
                description:
                  'Optional payroll week key YYYY-Www. Omit for current payroll week.'
              }
            },
            required: ['jobOrPersonGroup']
          }
        },
        {
          name: 'getTeamDiaryQualitySummary',
          description:
            'Get the full Team Diary Quality leaderboard for a Fri-Thu payroll week (scores and missing summaries for all groups).',
          parameters: {
            type: 'object',
            properties: {
              weekStart: {
                type: 'string',
                description:
                  'Optional payroll week key YYYY-Www. Omit for current payroll week.'
              }
            }
          }
        }
      ]
    }
  ];

  // Continuation: client executed tools; feed function responses back to Gemini.
  if (toolContinue) {
    if (!Array.isArray(geminiContents) || !geminiContents.length) {
      return res.status(400).json({ error: 'Missing geminiContents for tool continue' });
    }
    if (!Array.isArray(toolResults) || !toolResults.length) {
      return res.status(400).json({ error: 'Missing toolResults for tool continue' });
    }

    const contents = geminiContents.slice();
    const responseParts = toolResults.map(function (tr) {
      return {
        functionResponse: {
          name: String(tr && tr.name ? tr.name : 'unknown'),
          response:
            tr && tr.response && typeof tr.response === 'object'
              ? tr.response
              : { result: tr && tr.response != null ? tr.response : 'No result' }
        }
      };
    });
    contents.push({ role: 'user', parts: responseParts });

    const contResult = await callGemini({
      contents: contents,
      tools: BB_TOOLS
    });
    const dataCont = contResult.data;
    const extractedCont = extractAnswer(dataCont);

    if (extractedCont.functionCalls.length) {
      const nextContents = contents.concat([extractedCont.modelContent]);
      return res.status(200).json({
        needsTools: true,
        toolCalls: extractedCont.functionCalls,
        geminiContents: nextContents
      });
    }

    let answerCont = extractedCont.answer;
    if (!answerCont) {
      answerCont =
        'BB error: ' +
        (dataCont.error ? dataCont.error.message : JSON.stringify(dataCont).slice(0, 300));
    }
    return res.status(200).json({ answer: stripEmDashes(answerCont) });
  }

  const PAGE_DIRECTORY = pageDirectory || {
    P1: 'Executive Snapshot (decision cockpit). Layout: (1) Six KPI cards: Revenue, Gross Margin, Operating Profit, Cash Position, Secured Workload, Project Health. Actual is hero; target/variance secondary; status On track/Watch/Off track. Jobs won and leads are P2 only. (2) Performance vs plan chart (Revenue / Gross Profit / Operating Profit toggle). (3) Portfolio health with P4 status rules + link to P4. (4) Cash outlook and Workload/capacity. (5) Executive action panel from real exceptions only. Pending or Awaiting data when sources not live - never invent numbers. Answer only from live page data.',
    P2: 'Sales & Pipeline (decision dashboard). Period filters: Date Created on leads and opportunities (labelled on page). Layout: (1) Six primary KPIs: Open Pipeline Value, Weighted Pipeline (value x Probability %), Target Coverage (weighted / future revenue targets - pending if no targets), Quotes Outstanding (count + $), Quote Win Rate by count and by value (wins / closed quotes ONLY - not lead-to-win), Stalled Pipeline (14+ days no activity - threshold confirm with Lori/Ben). Secondary: avg won job value, median sales cycle, pipeline added this month, funnel rates Lead-to-Quote / Quote-to-Win / Lead-to-Win labelled separately. (2) Pipeline funnel stages New Lead → Qualified → Site Visit → Quote Sent → Follow-up/Negotiation → Won/Lost with count/value toggle (default Value). (3) Revenue forecast by Expected Close month: committed / likely / early-stage stack + target line when Targets live. (4) Pipeline movement waterfall: Pending without opening/closing snapshots. (5) Source quality table + bubble chart; channel concentration risk callout if one source ~80-85%+ of leads; CPL labelled paid leads only when from Marketing_Paid; full ad analysis on P10. (6) Opportunities requiring action (exceptions first) + View all; deal-ageing Gantt top 10. Placeholder Value $1 display "Value not entered" and exclude from weighted totals. Pending/Awaiting when sheet or columns empty - never invent numbers. For week-over-week Sales go to P8.',
    P3: 'Quoting & Estimating (production-control dashboard). Period filters: Date Sent on Quotes / Date Quoted on accuracy (labelled). Layout: (1) Last updated line. (2) Six operational KPIs: In Progress, Due Next 7 Days, Overdue (accent only when overdue), Awaiting Decision ($), Average Turnaround with sample size and low-sample caveat when n is small, Average Quoted Margin (Pending if Est Margin blank - never fake 0%). (3) Quoting Work Queue stages in production order Brief Received to Scope Complete to Estimating to Internal Review to Sent/Awaiting Decision: count, value, avg days in stage, overdue, estimators - NOT a conversion funnel. (4) Production Schedule (collapsible): quote-production Gantt Scope/Site Measure/Estimating/Internal Review/Ready to Send with today line, submission milestone, overdue accent, margin-warning, unassigned hatched; missing inputs; upcoming submissions. (5) Estimator Capacity (hours preferred; pending/proxy if no booking hours) + Client-Decision Ageing value buckets 0-7 / 8-14 / 15-30 / 31+ days. (6) Action table exceptions first + View all quotes. (7) Estimating Accuracy historical only for completed jobs with final labour and material costs - else exact text that accuracy unavailable; estimator ranks only if 5+ completed jobs with data; job budget/actual on P4. Quotes is the production quoting source (formerly GHL_Quotes; same sheet after rename). Never invent hours or 0% accuracy gauges. Answer only from live page data.',
    P4: 'Job Performance (decision dashboard). Layout: (1) Filters: global Brand/Month/Year plus page Department and Status (On track / Watch / At risk). No Project Manager filter unless field exists in sheets. (2) Five KPIs: Active Projects, Contract Value (sum Total Budget, abbreviated), Forecast Gross Margin (Pending / Awaiting Xero_Bills when Total Actual incomplete), Labour Variance (Pending - budgeted labour source TBD), Projects at Risk (orange accent only for risk). (3) Project Health Gantt: one row per project with progress, pending margin/labour variance, status dots; muted planned bar + progress bar (orange only if at risk); Today dashed line; key milestone markers. (4) Budget consumption vs completion bubble chart (partial actuals = labour+variations until Total Actual live). (5) Exceptions table: top At risk then Watch; View all expands Job Costing Overview with exact figures and Labour cost as % of budget. (6) Project drawer: budget/actual/forecast bars (pending where incomplete) + milestone list. (7) Milestone Schedule Gantt preserved in collapsible section. Health rules: At risk = Needs More Hands, slip>=21d, overdue>=2, or late progress vs time; Watch = mild slip/understaffed/1 overdue; else On track. Live data only from Xero_Projects, Buildpass_Labour, Milestone Schedule. Never invent $0 for incomplete formulas.',
    P5: 'Profitability (exception-led financial dashboard, monthly not weekly). Layout: (1) Data-quality banner + Last updated + completeness; Partial when supplier bills incomplete, AR unassigned, Jul-Aug targets missing. (2) Six KPIs: Revenue YTD, Gross Profit YTD, Gross Margin, Net/Operating Profit, Overhead Variance (Favourable/Adverse), Margin at Risk. Small overdue debtors indicator only; full AR on P9 Cash Flow. (3) Metric-switch trend chart (Revenue/GP/Net Profit/GM%) for all 12 months: actual to current month, target line (Target not set when missing, never zero), forecast for future, prior year, current-month break mark; GM swings (e.g. May vs June) flagged as anomaly for validation. (4) Profit waterfall Revenue to Materials to Direct Labour to Subcontractors to Other Direct to GP to Overheads to Net with Consolidated/BBBS/RMH/Department toggles; Pending partial steps when cost splits unavailable. (5) Project margin health table + bubble (X completion %, Y forecast GM, size contract, colour status; incomplete = Data Incomplete neutral colour) and margin bridge for selected project. (6) Overhead exception heatmap categories x months + top exceptions table + Action panel max 5 real exceptions. Never invent numbers. Orange only for real margin/cost risk; data gaps use neutral grey. Answer only from live P5 page data.',
    P6: 'Capacity & Labour (dual-mode resource-planning workspace). Modes: Capacity Planning (default) | Actuals & Timesheets. Every visual shares one selected ISO planning week (not Month/Year primary). Planning KPIs: Available Capacity, Scheduled Hours, Forecast Utilisation (Scheduled/Available), Overallocated Capacity (people + excess hours), Unallocated Capacity, Forecast Labour Cost (vs project labour budget Pending when incomplete). Layout planning: full-width Crew Allocation Gantt (Dept to Crew to Employee, crews collapsed by default; People/Project view; daily weeks 1-4 + weekly 5-12); lower Planned vs Actual/Forecast chart + 8-week dept capacity heatmap + Capacity Actions; hybrid Weekly Capacity bars (available vs scheduled from Capacity series, util bands) + Assignment Summary (Project/Role/Planned/Actual/Labour Variance/Status from labour + projects; Pending when demand/role missing). Employee capacity detail table is drill-down only, not primary. Actuals mode: logged vs planned/available, productive/non-productive, overtime (not auto timesheet error), missing/unusual timesheets, labour cost once per employee-week, timesheet detail tables live here. Low logged is not spare capacity until missing timesheets ruled out. Never invent hours. Live: Capacity, Buildpass_Labour (deduped). Forward schedule, diaries allocation, project demand, labour budgets: Pending. Week-over-week Capacity totals on P8. Answer only from live page data.',
    P7: 'Client Satisfaction (customer-journey dashboard). Data types kept separate: CX Surveys (Quote Experience, Pre-construction, During-construction, Handover, 30-day post), Public Reputation (Google/Facebook/etc), Service Recovery (complaints/defects). Incomplete Client_Reviews rows (missing client, project, platform, rating, review content) go to a data-quality queue and are excluded from main KPIs unless salvaged identity+channel exist. Only records with a valid score OR comment count as feedback. Missing rating is never treated as zero; average/CSAT is "Not available" when no valid ratings. Six KPIs: CSAT (valid surveys only), NPS (only from a true 0-10 recommend question - never derived from 5-star), Survey Response Rate, At-Risk Clients, Resolution SLA, Public Review Response (within 48h); optional Review Conversion only when invite data exists. Layout: journey satisfaction table, at-risk action table, theme drivers with n= sample sizes (low-n greyed), closed-loop resolution, recent feedback table + side drawer. Monthly trend only when sample is enough. Orange only for at-risk/high severity. Pending/Not available for missing sources. Never invent numbers. Answer only from live P7 page data.',
    P8: 'Weekly Overview (management meeting dashboard). One reporting period for the whole page via Week Ending selector (ISO week Mon-Sun), shown as "Week ending D Month YYYY · range". Six KPI cards (Revenue, Leads and Qualified, Quotes Sent, Jobs Won, Productive Labour, Project Delivery) each with Actual, Target, Absolute Variance, Previous Week, 4-Week Average, Status. Secondary strip: Gross Margin, Cash Collected, Overdue AR, Variations Awaiting Approval, Safety/Quality Incidents, Customer Issues. Scorecard table (Area/KPI/This Week/Target/Last Week/4-Week Avg/Status) linking to P2/P3/P4/P5/P6. Management Attention table from real exceptions only. Four 8-week small-multiple trends (not dual-axis): Sales funnel, Financial, Delivery, Workforce, each with 4-week average line. Seven-day commitments timeline Mon-Fri. Wins/Risks/Decisions max 3 real items each. Data freshness table for Sales/CRM, Xero, Labour, Marketing. Never invent numbers; blanks use 0 | Not available | Not yet posted | Not applicable. Orange only for At Risk / overdue / high priority. Answer only from live P8 page data.',
    P9: 'Cash Flow (13-week liquidity control). When cash pressure happens, why, and what finance should do. Six KPIs, rolling position chart, AR ageing Current to 90+, collection priority, payment commitments, cash actions. Live CashFlow_Forecast + Xero_Invoices. Pending for facility/min cash when missing. Never invent balances.',
    P10: 'Marketing: ad spend, leads, CPL, ROAS, campaign performance. Has a lightweight this-week pulse (spend / leads) on KPI cards with a short trend, not full week-over-week comparison. For week-over-week Marketing, send the user to P8.',
    P11: 'Site Diary Quality and Variations Exceptions (NOT full QA). Data: Buildpass_Site Diaries, Variations_Log, Defects_Rework (soft-load). Six KPIs: Site Diary Entries, Issues/Blockers (same definition as exceptions table), Issue Rate, Photo Evidence, Defects Logged as N recorded never No defects, Variations Raised with $0-unconfirmed caveat. Rework cost: Unavailable source not connected never $0. Variation approval blank = Not recorded never inferred Pending. Work Stopped: No vs Not recorded. Safety: N not confirmed as no issue when ambiguous. Orange only for work stopped / safety / genuine exceptions. Missing defect data is not good quality. Answer only from live page data.',
    P12: 'Site Diaries (crew full-width diary summaries). Google sign-in + Staff_Access. No Ask BB. Week list+detail; photos column P only; Other Details from col Q when present for any entry. Variations description only. Not merged with P11. No Gantt/charts/financials.'
  };

  const visitedKeys =
    allPagesData && typeof allPagesData === 'object' ? Object.keys(allPagesData) : [];

  const multiPagePayload =
    allPagesData && typeof allPagesData === 'object' && visitedKeys.length
      ? JSON.stringify(allPagesData).slice(0, 80000)
      : null;

  const singlePagePayload = pageData != null ? JSON.stringify(pageData).slice(0, 30000) : '{}';

  // Last 6–10 exchanges (capped server-side for prompt size).
  const history = Array.isArray(conversationHistory)
    ? conversationHistory.slice(-16).filter(function (t) {
        return t && t.text && (t.role === 'user' || t.role === 'assistant' || t.role === 'model');
      })
    : [];

  let historyBlock = '';
  if (history.length) {
    historyBlock =
      '\n\nCONVERSATION SO FAR (same browser session, use for follow-ups like "what about last month"):\n';
    history.forEach(function (turn, idx) {
      const role = turn.role === 'assistant' || turn.role === 'model' ? 'BB' : 'User';
      historyBlock += role + ': ' + String(turn.text).slice(0, 1200) + '\n';
      if (idx > 20) return;
    });
  }

  const insightsList = Array.isArray(pageInsights) ? pageInsights : [];
  const insightsBlock = insightsList.length
    ? '\n\nPROACTIVE INSIGHTS already shown for the current page (you may elaborate with underlying data, but do not invent new ones):\n' +
      insightsList
        .map(function (line, i) {
          return i + 1 + '. ' + line;
        })
        .join('\n')
    : '';

  const prompt =
    'You are BB, the friendly AI assistant for the BB Building Services Unified Dashboard. ' +
    'You help Ben, the business owner, understand his numbers. ' +
    'You are speaking with ' +
    who +
    ', a team member at BB Building Services. Address them by name naturally in your answer where appropriate. ' +
    'If the question is not related to the dashboard data, capacity, labour, jobs, attendance, site diaries, or BB Building Services business, politely redirect them back to asking about the dashboard. Do this every time, do not answer unrelated questions. ' +
    'Answer accurately and completely. Keep it clear and to the point, but do not sacrifice accuracy for brevity. ' +
    'If asked who you are, say you are BB, the dashboard assistant. Do not add creator, developer, or ownership details in that answer. ' +
    'Do NOT volunteer who made or developed you, or who owns the app, in general introductions, page explanations, greetings, or any answer unless the user specifically asks. Never insert "As you know, Lori is my developer" or similar unprompted. ' +
    'Only if the user specifically asks who created or developed you, who made you, who built this app, or similar: then say Lori is your developer and this app is owned and registered by BB Building Services. ' +
    'Never use em dashes in your answers, use commas or colons instead. ' +
    '\n\nCROSS-PAGE TOOLS (use when needed from any page): ' +
    'Call getPageData(pageName) to load any page P1-P12 on demand (aliases like Marketing, Cash Flow, Sales work). ' +
    'Use it whenever the question needs another page that is not already in the visited-pages payload. You may call it multiple times for multi-topic questions. ' +
    'Also available: getWorkerAttendance, getJobAttendance, getDiaryQuality, getTeamDiaryQualitySummary for Buildpass attendance and diary quality (Fri-Thu payroll week). ' +
    'Default weekStart to the current payroll week when the user does not specify a week. ' +
    'If a tool returns found:false, notFound, or unavailable, say that clearly. Do not invent names, hours, scores, or page metrics. ' +
    'Keep using the current page context below for "what am I looking at" questions; tools are additive, not a replacement.' +
    '\n\nGROUNDING RULES (mandatory, more important than sounding impressive): ' +
    '1) Only answer from: current page data, other visited pages in the all-pages payload, the page directory, conversation history that already cited that data, listed proactive insights, and results returned by the cross-page tools (including getPageData). ' +
    '2) Do not invent, estimate, round up inventively, or guess numbers, names, margins, ROAS, hours, or trends. ' +
    '3) If the question needs another page, call getPageData first. Do not tell the user to visit that page unless getPageData returns notFound or unavailable. For attendance or diary quality scores, prefer the specialised tools. ' +
    '4) If the underlying field is blank, missing, incomplete, or the dashboard already shows labels like "Data not available", "No Leads Matched Yet", "Not yet tracked", "Awaiting job completion", or similar, say that plainly. Do not fill gaps with assumptions. ' +
    '5) Trends and period comparisons only when the data contains values for both periods (for example weekOverWeek on P8, weekComparison, spendMonthComparison, monthlyRevenue with two months). Never invent a trend from a single data point. ' +
    'A single weekPulse number on P2, P6, or P10 is not enough for full week comparison: direct the user to P8 (Weekly Overview) for the management meeting dashboard with shared Week Ending period, scorecard, and trends. ' +
    '6) Dashboard flags have meaning: use the underlying metrics when explaining them. ' +
    'Needs More Hands (P4): job has overdue milestones AND recent weekly labour hours are flat or declining (see handsDetail). ' +
    'Understaffed, Being Addressed (P4): overdue but weekly labour hours are increasing. ' +
    'Planning signals (P6): Underallocated / Healthy / Near Capacity / Overallocated / Allocation Conflict from capacitySummary; timesheet statuses Complete / Missing / Overtime Recorded / Unusual Hours are separate from planning. ' +
    'Funnel Health (P10): Creative/Targeting means CTR below selection average; Landing Page/Follow-up means CTR is OK but conversion is below average (see funnelHealth and funnelAverages). ' +
    'When asked why a flag fired (e.g. "why does J1354 need more hands"), cite the supporting fields: slippage days, overdue count, weeklyLabourHours series, labourHoursTrend, utilisation %, CTR, conversion rate, averages. ' +
    '7) Prefer short, practical language. Wrong numbers on this dashboard drive real business decisions. ' +
    'When something is not in the data, say "data not available" (or the exact label the dashboard uses) rather than guessing.' +
    '\n\nKNOWN DATA GAPS (static facts you already know; do not try to infer automation coverage from page numbers alone): ' +
    'RMH automation and data coverage is currently incomplete. ' +
    '1) RMH Meta Ads / marketing data is not fully covered yet: the RMH marketing scenario that would mirror the BBBS Make.com scenario 5186532 has not been built. ' +
    '2) RMH Xero financial data is still awaiting DIV approval, so revenue and related figures may be missing or empty in the sheet. ' +
    'When the brand filter is RMH (or the user asks about RMH) and they ask about revenue, marketing spend, ad performance, or other financial figures, ' +
    'and the loaded data shows $0, blank, missing values, "Not yet tracked", or something that looks like full miss such as "100% under target", ' +
    'proactively note that this may reflect incomplete RMH data coverage, not necessarily a true zero or true total miss against target. ' +
    'Do not state either that the business result is definitely zero or that the automation is definitely the sole cause. ' +
    'Suggest confirming with Ben or Emily. Apply this caution only for RMH in these gap areas; do not weaken clear BBBS numbers.' +
    '\n\nPAGE DIRECTORY (use these exact page names when recommending where to look):\n' +
    JSON.stringify(PAGE_DIRECTORY, null, 2) +
    '\n\nThe user is currently viewing: ' +
    ctx +
    '. ' +
    'You may combine data across visited pages and any pages returned by getPageData. ' +
    'Visited pages in this session: ' +
    (visitedKeys.length ? visitedKeys.join(', ') : 'none yet') +
    '.' +
    insightsBlock +
    historyBlock +
    (multiPagePayload
      ? '\n\nAll visited pages data:\n' + multiPagePayload
      : '\n\nCurrent page data:\n' + singlePagePayload) +
    '\n\nCurrent question: ' +
    question;

  const initialContents = [{ role: 'user', parts: [{ text: prompt }] }];
  const askResult = await callGemini({
    contents: initialContents,
    tools: BB_TOOLS
  });
  const data = askResult.data;
  const extracted = extractAnswer(data);

  if (extracted.functionCalls.length) {
    return res.status(200).json({
      needsTools: true,
      toolCalls: extracted.functionCalls,
      geminiContents: initialContents.concat([extracted.modelContent])
    });
  }

  let answer = extracted.answer;
  if (!answer) {
    answer =
      'BB error: ' + (data.error ? data.error.message : JSON.stringify(data).slice(0, 300));
  }
  // Hard ban on em dashes in BB output (prompt also forbids them).
  return res.status(200).json({ answer: stripEmDashes(answer) });
}

export { getVisibleGuides, buildStaffDivisions, normalizeLibraryGuides, fetchSheetValues, verifyHubIdToken, isHubEmailAllowed };
