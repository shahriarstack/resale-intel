# Build, package and upload a release to cPanel.
#
# CREDENTIALS DO NOT LIVE IN THIS FILE ANY MORE. The previous version carried
# the cPanel account password in plaintext on four lines, in a folder that gets
# zipped, copied and shared — which makes one password the whole hosting
# account, the database behind it and every file in it.
#
# They come from the environment instead. Set them once per shell:
#
#   $env:CPANEL_HOST = "s1.sitechai.com:2083"
#   $env:CPANEL_USER = "cvacimot"
#   $env:CPANEL_PASS = "..."          # or a cPanel API token
#   $env:CPANEL_PATH = "/home/cvacimot/public_html/resale"
#   $env:CPANEL_SITE_URL = "https://resale.cv-acimotors.com"
#
# — or put them in a file OUTSIDE this project and dot-source it. If you keep
# them in a file, keep it out of any folder that gets zipped or shared.
#
# THIS UPLOADS TO A LIVE SITE. It replaces the running application; it does not
# touch the database. Read HOSTING.md before the first run of a release whose
# schema has changed — the migration has an order, and getting it wrong loses
# every officer's territory.

$ErrorActionPreference = "Stop"

foreach ($name in @("CPANEL_HOST", "CPANEL_USER", "CPANEL_PASS", "CPANEL_PATH", "CPANEL_SITE_URL")) {
    if (-not (Get-Item "env:$name" -ErrorAction SilentlyContinue)) {
        Write-Error "$name is not set. See the header of this file."
        exit 1
    }
}

$host_   = $env:CPANEL_HOST
$auth    = "$($env:CPANEL_USER):$($env:CPANEL_PASS)"
$dir     = $env:CPANEL_PATH
$relDir  = $dir -replace "^/home/[^/]+/", ""     # cPanel wants both forms

Write-Host "Building..." -ForegroundColor Cyan
npx prisma generate
npm run build
.\zip_standalone.ps1

Write-Host "Uploading to $host_ ..." -ForegroundColor Cyan

# Remove the previous archive first: the extract step below merges into the
# directory rather than replacing it, and a stale zip is the one file that
# would otherwise be extracted over the new one.
curl.exe -k -s -u $auth "https://$host_/json-api/cpanel?cpanel_jsonapi_apiversion=2&cpanel_jsonapi_module=Fileman&cpanel_jsonapi_func=fileop&op=unlink&sourcefiles=$relDir/standalone.zip&dir=$dir"

curl.exe -k -s -u $auth -F "dir=$dir" -F "overwrite=1" -F "file-1=@standalone.zip" "https://$host_/execute/Fileman/upload_files"

curl.exe -k -s -u $auth "https://$host_/json-api/cpanel?cpanel_jsonapi_apiversion=2&cpanel_jsonapi_module=Fileman&cpanel_jsonapi_func=fileop&op=extract&sourcefiles=$relDir/standalone.zip&destfiles=$dir&doubledecode=1"

# Passenger restarts when this file's timestamp changes. The content is
# irrelevant; writing the time makes it obvious in the file manager when the
# app was last cycled.
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
curl.exe -k -s -u $auth "https://$host_/execute/Fileman/save_file_content?dir=$dir/tmp&file=restart.txt&content=restarted $stamp"

Write-Host "Waiting for the app to come back..." -ForegroundColor Cyan
Start-Sleep -Seconds 6
curl.exe -sI $env:CPANEL_SITE_URL
