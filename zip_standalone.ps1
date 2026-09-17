# Package .next/standalone as the release zip.
#
# Next's standalone output is not a release on its own: it omits the static
# assets and the public folder, and it copies two things from the project root
# that must never reach a server.
#
#   .env      the LOCAL environment — mysql://root@127.0.0.1/resale_local and
#             NEXTAUTH_URL=http://localhost:3001. Extracting the zip on the
#             host overwrites the server's own .env with it, which points
#             production at a database that does not exist there and breaks
#             every session cookie. This is what update_env.ps1 was written to
#             paper over; pruning it here is the actual fix.
#
#   uploads/  captured evidence, which in dev is the demo photographs. Shipping
#             them drops files into the live upload directory that no vehicle
#             record points at, so the retention sweep can never remove them.
#             In production UPLOAD_DIR points outside the deployment anyway.

# REFUSE TO PACKAGE A STALE BUILD.
#
# `npm run build` starts with `prisma generate`, which cannot rename its temp
# file while the dev server holds the query engine — it fails with EPERM, the
# build never runs, and this script would then happily zip whatever was in
# .next/standalone from last time. That is the worst failure available here: a
# release that looks fine, uploads fine, and is missing the change it was cut
# for. Stop the dev server and build again.
$stamp = Get-Item ".next/standalone/server.js" -ErrorAction SilentlyContinue
if (-not $stamp) {
    Write-Error "No .next/standalone/server.js — run `npm run build` first."
    exit 1
}
$newest = Get-ChildItem -Path "src", "prisma/schema.prisma", "next.config.ts", "package.json" -Recurse -File |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($newest.LastWriteTime -gt $stamp.LastWriteTime) {
    Write-Error "The build is older than $($newest.Name). It did not run, or it failed — check for an EPERM from prisma generate with the dev server running."
    exit 1
}

Copy-Item -Path "public" -Destination ".next\standalone\public" -Recurse -Force
New-Item -ItemType Directory -Force -Path ".next\standalone\.next" | Out-Null
Copy-Item -Path ".next\static" -Destination ".next\standalone\.next\static" -Recurse -Force

# The migration and credential scripts, so the database work can be done ON the
# server. They are plain .mjs against @prisma/client, which is already inside
# this bundle — no tsx, no dev dependencies, nothing to install on a shared
# host. See HOSTING.md for the order, which is not optional.
Copy-Item -Path "deploy" -Destination ".next/standalone/deploy" -Recurse -Force

# The schema travels with them: `prisma db push` needs it, and a release whose
# code and schema can drift apart is a release that can be half-applied.
New-Item -ItemType Directory -Force -Path ".next/standalone/prisma" | Out-Null
Copy-Item -Path "prisma/schema.prisma" -Destination ".next/standalone/prisma/schema.prisma" -Force

Remove-Item -Path ".next\standalone\.env*" -Force -ErrorAction SilentlyContinue
Remove-Item -Path ".next\standalone\uploads" -Recurse -Force -ErrorAction SilentlyContinue

# Orphaned Windows query engines. A `prisma generate` that cannot rename its
# temp file — which happens whenever the dev server is holding the DLL — leaves
# a ~24 MB .tmp<pid> behind, and the tracer copies every one of them. Twenty-six
# of them had turned a 200 MB release into 733 MB.
Remove-Item -Path ".next\standalone\node_modules\.prisma\client\*.tmp*" -Force -ErrorAction SilentlyContinue

# The Windows query engine, which is 24 MB of a release that only ever runs on
# Linux. The four linux targets in schema.prisma stay: cPanel hosts differ on
# OpenSSL version and the client picks the right one at run time.
Remove-Item -Path ".next/standalone/node_modules/.prisma/client/query_engine-windows.dll.node" -Force -ErrorAction SilentlyContinue

Set-Location -Path ".next\standalone"
tar.exe -a -c -f standalone.zip *
Move-Item -Path "standalone.zip" -Destination "..\..\standalone.zip" -Force
Set-Location -Path "..\.."

$size = (Get-Item "standalone.zip").Length / 1MB
Write-Host ("standalone.zip  {0:N1} MB" -f $size)
