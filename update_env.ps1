# Write the server's .env over the cPanel API.
#
# THIS IS NO LONGER PART OF A DEPLOY. It used to be: the release zip carried
# this machine's own .env — DATABASE_URL pointing at mysql://root@127.0.0.1/
# resale_local and NEXTAUTH_URL at localhost:3001 — and extracting it on the
# host overwrote the server's environment with it, so every deploy had to be
# followed by rewriting the file from here. zip_standalone.ps1 now prunes .env
# out of the archive, which fixes the cause rather than the symptom.
#
# Kept for the first-time setup case, and for rotating the session secret.
# Prefer the Node.js App's own environment panel in cPanel: Passenger reads
# that directly, and it is the one place the values are not also sitting in a
# file on disk.
#
# Credentials and values come from the environment. Nothing is written here:
#
#   $env:CPANEL_HOST = "s1.sitechai.com:2083"
#   $env:CPANEL_USER = "cvacimot"
#   $env:CPANEL_PASS = "..."
#   $env:CPANEL_PATH = "/home/cvacimot/public_html/resale"
#   $env:APP_DATABASE_URL   = "mysql://user:pass@localhost:3306/db"
#   $env:APP_NEXTAUTH_SECRET = "..."   # 48 random bytes, base64
#   $env:APP_NEXTAUTH_URL    = "https://resale.cv-acimotors.com"
#   $env:APP_UPLOAD_DIR      = "/home/cvacimot/resale-uploads"

$ErrorActionPreference = "Stop"

$required = @(
    "CPANEL_HOST", "CPANEL_USER", "CPANEL_PASS", "CPANEL_PATH",
    "APP_DATABASE_URL", "APP_NEXTAUTH_SECRET", "APP_NEXTAUTH_URL", "APP_UPLOAD_DIR"
)
foreach ($name in $required) {
    if (-not (Get-Item "env:$name" -ErrorAction SilentlyContinue)) {
        Write-Error "$name is not set. See the header of this file."
        exit 1
    }
}

if ($env:APP_NEXTAUTH_SECRET.Length -lt 32) {
    Write-Error "NEXTAUTH_SECRET is too short to be a secret. Generate one: node -e ""console.log(require('crypto').randomBytes(48).toString('base64'))"""
    exit 1
}
if ($env:APP_UPLOAD_DIR.StartsWith($env:CPANEL_PATH)) {
    Write-Error "UPLOAD_DIR is inside the deployment directory. The next release would destroy every photograph in the system."
    exit 1
}

$lines = @(
    "DATABASE_URL=""$($env:APP_DATABASE_URL)"""
    "NEXTAUTH_SECRET=""$($env:APP_NEXTAUTH_SECRET)"""
    "NEXTAUTH_URL=""$($env:APP_NEXTAUTH_URL)"""
    "UPLOAD_DIR=""$($env:APP_UPLOAD_DIR)"""
)
$content = [uri]::EscapeDataString(($lines -join "`n"))
$auth = "$($env:CPANEL_USER):$($env:CPANEL_PASS)"

curl.exe -k -s -u $auth -d "dir=$($env:CPANEL_PATH)&file=.env&content=$content" "https://$($env:CPANEL_HOST)/execute/Fileman/save_file_content"

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
curl.exe -k -s -u $auth "https://$($env:CPANEL_HOST)/execute/Fileman/save_file_content?dir=$($env:CPANEL_PATH)/tmp&file=restart.txt&content=env updated $stamp"

Write-Host "`n.env written and the app restarted. Changing NEXTAUTH_SECRET signs everybody out." -ForegroundColor Cyan
