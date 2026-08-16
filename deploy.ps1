npx prisma generate
npm run build
.\zip_standalone.ps1

curl.exe -k -s -u 'cvacimot:9J9q]91tYYyzB)' 'https://s1.sitechai.com:2083/json-api/cpanel?cpanel_jsonapi_apiversion=2&cpanel_jsonapi_module=Fileman&cpanel_jsonapi_func=fileop&op=unlink&sourcefiles=public_html/resale/standalone.zip&dir=/home/cvacimot/public_html/resale'
curl.exe -k -s -u 'cvacimot:9J9q]91tYYyzB)' -F "dir=/home/cvacimot/public_html/resale" -F "overwrite=1" -F "file-1=@standalone.zip" "https://s1.sitechai.com:2083/execute/Fileman/upload_files"
curl.exe -k -s -u 'cvacimot:9J9q]91tYYyzB)' 'https://s1.sitechai.com:2083/json-api/cpanel?cpanel_jsonapi_apiversion=2&cpanel_jsonapi_module=Fileman&cpanel_jsonapi_func=fileop&op=extract&sourcefiles=public_html/resale/standalone.zip&destfiles=/home/cvacimot/public_html/resale&doubledecode=1'
curl.exe -k -s -u 'cvacimot:9J9q]91tYYyzB)' 'https://s1.sitechai.com:2083/execute/Fileman/save_file_content?dir=/home/cvacimot/public_html/resale/tmp&file=restart.txt&content=restartexec4'
Start-Sleep -Seconds 3
curl.exe -sI http://resale.cv-acimotors.com
