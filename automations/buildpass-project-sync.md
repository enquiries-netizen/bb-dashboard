# Buildpass_Project_Sync: Department from Buildpass Projects API

P4 Upcoming Projects reads **Department** from this tab. It does **not** join Xero_Projects.
Xero_Projects only fills after cost data flows. `Xero Created? = Yes` is not enough.

The live Make scenario is **not in this repo**. Lori/Ben must add the HTTP call in Make
(or paste the Apps Script in this folder). The dashboard already expects header **Department**.

---

## Where Labour already calls GET /projects/{id}

**Make.com Scenario 9b** (Buildpass_Labour). That scenario is not in this repo.

It already:

1. Has a Buildpass Project ID for the timesheet/project.
2. Calls `GET https://api.buildpass.global/projects/{id}` (same host/path as below).
3. Maps Department from that JSON onto **Buildpass_Labour** column **G**, header `Department`.

The dashboard only **reads** that Labour column. It never calls Buildpass itself.

Reuse Scenario 9b's **HTTP connection, headers, and Department JSON path**. Do not invent a new API key.

---

## Expected sheet column

Tab: `Buildpass_Project_Sync`  
Spreadsheet: `17gNgYCC2rwAKGHtuhaApxeCa-6qxyI0gBB71ifciNv8`

| Col | Header (row 1) |
|-----|-----------------|
| A | Buildpass Project ID |
| B | Project Name |
| C | Job # |
| D | Buildpass Status |
| E | Date First Added |
| F | Last Status Change |
| G | Xero Created? |
| H | Estimated Amount |
| I | Xero Contact ID |
| J | Xero Project ID |
| **K (or next empty)** | **Department** |

Dashboard match is by **header name** `Department` (also accepts `department`, `Dept`, `dept`).
Do not rely on column index. Do not join another tab.

If Department is blank or the header is missing, P4 shows **Unassigned** for that row only.

---

## Make.com: what Lori/Ben must add

Open the existing **Buildpass_Project_Sync** scenario (the one that writes this tab).

After the module that already has **Buildpass Project ID** (column A):

1. **HTTP → Make a request**
   - Method: `GET`
   - URL: `https://api.buildpass.global/projects/{{Buildpass Project ID}}`
   - Headers: **copy Scenario 9b exactly** (usually `Authorization: Bearer <token>` and `Accept: application/json`)
   - Parse response as JSON
   - Error handling: if 404/blank department, write a blank Department (dashboard shows Unassigned for that row)

2. **Department mapping** (copy the same JSON path as Scenario 9b). Try, in order:
   - `department` (string)
   - `department.name`
   - `departmentName`
   - `data.department` / `data.department.name`

3. **Google Sheets write/update**
   - Add header `Department` on row 1 of `Buildpass_Project_Sync` (next empty column; do not shuffle A–J).
   - Map the parsed department string into that column on every upsert.
   - If the scenario rewrites the whole tab each run, include Department in the row array.
   - If it only inserts new IDs, also add a one-off pass over existing rows (step 4).

4. **Backfill**
   - Run the scenario once so every existing row (UPCOMING and IN_PROGRESS) gets Department.
   - If the scenario only writes new projects, use the Apps Script or node helper in this folder, then keep Make for ongoing sync.

Do not put API keys in git.

---

## Apps Script (paste into the master sheet)

File: `automations/Buildpass_Project_Sync_Department.gs`

1. Extensions → Apps Script on the master spreadsheet.
2. Paste the `.gs` file.
3. Project Settings → Script properties → `BUILDPASS_API_KEY` = the same key Scenario 9b uses.
   If 9b uses a different header than Bearer, edit `authHeaders_()` in the script.
4. Run `backfillBuildpassProjectSyncDepartment` once.
5. Keep Make as the ongoing writer, or call the same function on a time trigger.

---

## Node helper (this repo)

`automations/backfill-buildpass-project-sync-department.cjs`

- Default: probe live headers on `Buildpass_Project_Sync` and `Buildpass_Labour` (Sheets API key already in `config.js`).
- `--fetch`: `GET /projects/{id}` when `BUILDPASS_API_KEY` (or `BUILDPASS_TOKEN`) is in the environment. Prints a paste table. Does not write the sheet.
- `--write`: only if `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_SERVICE_ACCOUNT_JSON` is set. Otherwise paste column K from the `--fetch` output.

---

## Dashboard

P4 Upcoming reads `Department` from `Buildpass_Project_Sync` by header name.
Isolated 5s fetch is unchanged and is still not awaited by `loadP4`.
