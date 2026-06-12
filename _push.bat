@echo off
cd /d "C:\Users\inday\BB dashbboard web APP"
echo === Pushing to GitHub ===
git add -A
git commit -m "P4 Job Performance: milestone schedule + labour cost from Buildpass

- Replace placeholder with full KPI grid (Active Jobs, On Track, Overdue, Labour Cost)
- Horizontal bar chart: job completion % (red = has overdue milestone)
- Milestone schedule table with overdue row highlighting
- Labour cost by job table grouped from Buildpass_Labour tab
- config.js: add BUILDPASS_SCHEDULE tab reference"
git push origin master:main
echo.
echo === Done ===
pause
