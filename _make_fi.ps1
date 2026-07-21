$content = Get-Content -Raw -Encoding UTF8 "index.html"
$msg = "P6: fix labour table headers, remove hourly rate"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
$fi = @"
commit refs/heads/master
parent fb62573e108ced48c432851b35fa5f912efe5a1c
committer Lori <enquiries@bbbuildingservices.com.au> 1784630900 +1000
data $($msg.Length)
$msg

from fb62573e108ced48c432851b35fa5f912efe5a1c
M 100644 index.html
data $($bytes.Length)
"@
[System.IO.File]::WriteAllText("import.fi", $fi, [System.Text.Encoding]::ASCII)
$fs = [System.IO.File]::Open("import.fi", [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write)
$fs.Write($bytes, 0, $bytes.Length)
$fs.Write([byte[]][char]10, 0, 1)
$fs.Close()
