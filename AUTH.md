# Staff Google sign-in (Firebase + Staff_Access)

Everyone signs in with Google. Access is controlled by the master sheet tab **Staff_Access**, not by domain restriction (personal emails allowed).

## Staff_Access columns

| Column | Values |
|--------|--------|
| Email  | Google account email |
| Role   | `Staff`, `User`, or `Admin` (match is case-insensitive) |
| Active | `Yes` / `No` (case-insensitive) |

- **Staff** + Active Yes → P12 only (crew Site Diaries)
- **User** + Active Yes → P11 and P12 only (lands on P11)
- **Admin** + Active Yes → full dashboard (lands on P1 or last page)
- Missing email or Active No → “Not authorized. Contact Lori.”

## 1. Fill Firebase in `config.js`

1. Open [Firebase Console](https://console.firebase.google.com/) → create or select project.
2. Add a **Web** app if needed.
3. Copy the web config into `CONFIG.FIREBASE` in `config.js`:
   - `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`
4. **Authentication** → Sign-in method → enable **Google**.
5. **Authentication** → Settings → **Authorized domains**:
   - `localhost` (local test)
   - `bb-dashboard-eight.vercel.app` (production)
   - any custom domain you use
6. Do **not** set Google `hd` (hosted domain) restriction. Personal Gmail is allowed.

There is no build step. The SPA reads `CONFIG.FIREBASE` directly. Client Firebase keys are public; access is enforced by Staff_Access after sign-in.

### Optional Vercel env names (future injection)

If you later inject config server-side or at build time:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

Until then, paste values into `config.js` only. Do not commit secrets that are truly private (Sheets API may already be referrer-restricted).

## 2. Sheets API access to Staff_Access

The same Google Sheets API key / sheet ID as other tabs loads `Staff_Access`. The tab must be in the master spreadsheet (`CONFIG.SHEET_ID`) and readable by the API key.

## 3. Local review checklist

1. Paste real `CONFIG.FIREBASE` values (placeholders show “Sign-in not configured”).
2. Confirm your email is on Staff_Access with Role and Active Yes.
3. Open the site → Sign in with Google → correct landing page and nav.
4. Sign out works from the header.
5. Wrong email / Active No → unauthorized message, no pages.

## What was removed

Temporary shared pass `CONFIG.P12_STAFF_GATE` and session unlock `bb_p12_staff_unlock` are gone. Auth is Google + Staff_Access only.
