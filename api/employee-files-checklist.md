# Employee files endpoint checks

No tokens, passwords, or account keys belong in this list. Use a signed-in browser session or a token you already hold. Do not paste it here.

Endpoint: GET /api/employee-files
Header when signed in: Authorization: Bearer, then the Firebase ID token.

The allow-list is the Staff_Access tab on the private spreadsheet (EMPLOYEE_FILES_SHEET_ID), not the master dashboard sheet. Columns: Email, Role, Active, Access. Active must be yes. Role must be hr or management. Email is trimmed, lower case, and must match exactly. If the same email appears more than once, the last row wins. An admin row on the master sheet does not grant this page.

1. No Authorization header. Expect HTTP 401 and the message "Sign-in required." The body must not contain an employees list or a compliance list.
2. A valid token for a signed-in person who is not on the private Staff_Access tab, or whose last row there is not Active yes with Role hr or management. An admin on the master sheet is in this group unless the private tab also allows them. Expect HTTP 403 and the message "You do not have access to employee files." The body must not contain rows.
3. EMPLOYEE_FILES_SHEET_ID unset, or both Google OIDC settings and EMPLOYEE_FILES_SERVICE_ACCOUNT missing. Expect HTTP 503 and the message "Employee files are not configured." No rows. The photo route returns an empty 404.
4. EMPLOYEE_FILES_SHEET_ID set, Google OIDC settings present (or a valid optional EMPLOYEE_FILES_SERVICE_ACCOUNT backup), and the private Staff_Access last row for that email is Active yes and Role hr or management. If Employees_Profile has no rows, expect HTTP 200, mode sample, and the built-in sample people. If Employees_Profile has rows, expect HTTP 200 and mode live. Each person has hasPhoto true or false. The body must not include photoDriveLink. The body must not include pay review or performance folder links, licence numbers, or free-text notes.
5. With the public browser Sheets key, request the private employee spreadsheet. That request must fail. The private file must not be shared as anyone with the link.
6. If the service account cannot read a Drive file, or a parent folder of that file, the link is left blank. The rest of the employee file is still returned. The same blanking applies to a link that is still unchecked when the 4 second parent check ends.
7. On the Vercel preview, GCP OIDC settings are present and Google accepts the login. EMPLOYEE_FILES_SERVICE_ACCOUNT may be unset. Expect the same HTTP 200 result as item 4. The photo route returns an image when the person has a valid photo.
8. Any of GCP_PROJECT_NUMBER, GCP_WORKLOAD_IDENTITY_POOL_ID, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID, or GCP_SERVICE_ACCOUNT_EMAIL is missing, and EMPLOYEE_FILES_SERVICE_ACCOUNT is unset. Expect HTTP 503 and the message "Employee files are not configured." No rows. The photo route returns an empty 404.
9. OIDC settings are present but Google rejects the login, and EMPLOYEE_FILES_SERVICE_ACCOUNT is unset. Expect HTTP 503 and the message "Employee files are temporarily unavailable." No rows. The photo route returns an empty 404.
10. OIDC settings are present but Google rejects the login, and EMPLOYEE_FILES_SERVICE_ACCOUNT holds a valid backup key. Expect HTTP 200 and mode live or sample, the same as item 4. The photo route uses that same backup.
11. In every case above, responses and server logs must not contain a token, a private key, a service account email, a Google project number, or a Workload Identity pool id. Allowed server logs for OIDC failures are only these fixed labels: "package import failed", "OIDC client setup failed", and "token exchange failed".

Photo route: GET /api/employee-photo?employeeId= then the person id from Employees_Profile. Same Authorization header. The route does not accept a Drive file id. Cache-Control on every response is private, no-store. Any failure returns an empty 404 so the page keeps the initials circle.

1. No token. Expect 404 with an empty body. 401 would also mean no image. This route uses 404.
2. A signed-in person who is not Active yes with Role hr or management on the private Staff_Access tab. Expect no image (404, empty body).
3. An employeeId with no Photo Drive Link, or a link that is not a Drive file. Expect 404.
4. The Photo Drive Link points at a file that is not jpeg, png, or webp. Expect 404.
5. The file is over 2 MB. Expect 404.
6. The file, or any parent folder, has a name containing pay review, 01. Pay Review, 03. Performance, or performance. Expect 404. If the parent folder names cannot be read, expect 404 as well.
