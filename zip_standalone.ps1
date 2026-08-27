Copy-Item -Path "public" -Destination ".next\standalone\public" -Recurse -Force
New-Item -ItemType Directory -Force -Path ".next\standalone\.next"
Copy-Item -Path ".next\static" -Destination ".next\standalone\.next\static" -Recurse -Force
Set-Location -Path ".next\standalone"
tar.exe -a -c -f standalone.zip *
Move-Item -Path "standalone.zip" -Destination "..\..\standalone.zip" -Force
Set-Location -Path "..\.."
