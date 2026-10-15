# Employee files endpoint checks

No tokens, passwords, or account keys belong in this list. Use a signed-in browser session or a token you already hold. Do not paste it here.

Endpoint: GET /api/employee-files
Header when signed in: Authorization: Bearer, then the Firebase ID token.

The allow-list is the Staff_Access tab on the private spreadsheet (EMPLOYEE_FILES_SHEET_ID), not the master dashboard sheet. Columns: Email, Role, Active, Access. Active must be yes. Role must be hr or management. Email is trimmed, lower case, and must match exactly. If the same email appears more than once, the last row wins. An admin row on the master sheet does not grant this page.

1. No Authorization header. Expect HTTP 401 and the message "Sign-in required." The body must not contain an employees list or a compliance list.
2. A valid token for a signed-in person who is not on the private Staff_Access tab, or whose last row there is not Active yes with Role hr or management. An admin on the master sheet is in this group unless the private tab also allows them. Expect HTTP 403 and the message "You do not have access to employee files." The body must not contain rows.
3. EMPLOYEE_FILES_SHEET_ID unset, or EMPLOYEE_FILES_SERVICE_ACCOUNT unset. Expect HTTP 503 and the message "Employee files are not configured." No rows.
4. Both variables set, and the private Staff_Access last row for that email is Active yes and Role hr or management. If Employees_Profile has no rows, expect HTTP 200, mode sample, and the built-in sample people. If Employees_Profile has rows, expect HTTP 200 and mode live. The body must not include pay review or performance folder links, licence numbers, or free-text notes.
5. With the public browser Sheets key, request the private employee spreadsheet. That request must fail. The private file must not be shared as anyone with the link.
