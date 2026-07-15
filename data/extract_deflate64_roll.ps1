# Extract PACS roll members from a DEFLATE64-compressed zip (compress_type 9),
# which Python's zipfile, bsdtar/libarchive, and .NET Expand-Archive all REFUSE.
# Windows Explorer's own zip handler DOES support deflate64 — reach it via the
# Shell.Application COM object (the "Explorer-COM recipe").
#
# Usage (from PowerShell):
#   .\extract_deflate64_roll.ps1 -Zip <path\roll.zip> -Dest <extract-dir>
# then (Python): re-package the extracted *.TXT with ZIP_STORED (fast, no
# recompression) and feed to load_pacs_impdetail_attributes.py +
# load_pacs_appraisal_info.py as usual.
#
# Gotchas baked in:
#  - Shell hides the .TXT extension, so item names match WITHOUT it.
#  - CopyHere is ASYNC — poll until sizes stabilize and no 0-byte files remain.
#  - bsdtar will happily create full-size ZERO-FILLED files and exit 0; always
#    verify non-null content after extracting (this script waits on real bytes).
param(
  [Parameter(Mandatory=$true)][string]$Zip,
  [Parameter(Mandatory=$true)][string]$Dest,
  [int]$TimeoutMin = 8
)
if (-not (Test-Path $Dest)) { New-Item -ItemType Directory -Path $Dest | Out-Null }
Get-ChildItem $Dest -Filter *.TXT -ErrorAction SilentlyContinue | Remove-Item -Force
$shell = New-Object -ComObject Shell.Application
$zipNs = $shell.NameSpace((Resolve-Path $Zip).Path)
$destNs = $shell.NameSpace((Resolve-Path $Dest).Path)
$targets = @()
foreach ($item in $zipNs.Items()) {
  if ($item.Name -like '*APPRAISAL_INFO' -or
      $item.Name -like '*APPRAISAL_IMPROVEMENT_DETAIL' -or
      $item.Name -like '*APPRAISAL_IMPROVEMENT_DETAIL_ATTR') { $targets += $item }
}
Write-Output ("matched {0}: {1}" -f $targets.Count, (($targets | ForEach-Object { $_.Name }) -join '; '))
if ($targets.Count -eq 0) { Write-Output "NO MATCHES — check member names ($($zipNs.Items().Count) items)"; exit 1 }
foreach ($t in $targets) { $destNs.CopyHere($t, 16 -bor 512 -bor 1024) }  # 16 yes-all, 512 no-dir-confirm, 1024 no-UI
$deadline = (Get-Date).AddMinutes($TimeoutMin)
do {
  Start-Sleep -Seconds 6
  $files = @(Get-ChildItem $Dest -Filter *.TXT)
  $s1 = (($files | ForEach-Object { $_.Length }) -join ','); Start-Sleep -Seconds 4
  $s2 = ((Get-ChildItem $Dest -Filter *.TXT | ForEach-Object { $_.Length }) -join ',')
  $stable = ($s1 -eq $s2 -and $files.Count -ge $targets.Count -and
             @($files | Where-Object { $_.Length -eq 0 }).Count -eq 0 -and $files.Count -gt 0)
} while (-not $stable -and (Get-Date) -lt $deadline)
Write-Output ("stable={0}" -f $stable)
Get-ChildItem $Dest -Filter *.TXT | Select-Object Name, Length | Format-Table -AutoSize
if (-not $stable) { exit 2 }
