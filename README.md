# BB Building Services – Unified Dashboard

Vanilla SPA on Vercel (static files + `api/` serverless routes).

## Staff access (Google sign-in)

Everyone signs in with Google. Roles come from the master sheet tab **Staff_Access**. Setup steps for Firebase and `CONFIG.FIREBASE` are in [AUTH.md](./AUTH.md).

| Role  | Active | Pages                         |
|-------|--------|-------------------------------|
| Staff | Yes    | P12 only                      |
| User  | Yes    | P11 + P12 (lands on P11)      |
| Admin | Yes    | Full dashboard                |

Missing email or Active No → *Not authorized. Contact Lori.*

## Local tips

1. Fill `CONFIG.FIREBASE` in `config.js` (placeholders intentionally block open access).
2. Ensure your email is on **Staff_Access** with Active Yes.
3. Enable Google provider and authorized domains in Firebase Console.
