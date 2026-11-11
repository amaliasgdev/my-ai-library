$ErrorActionPreference = 'Stop'
if (Test-Path Env:OPENAI_API_KEY) {
    throw 'Use a separate shell without OPENAI_API_KEY for offline validation.'
}
if (Get-NetTCPConnection -State Listen -LocalPort 8082 -ErrorAction SilentlyContinue) {
    throw 'Port 8082 is occupied; no process will be stopped.'
}
. (Join-Path $PSScriptRoot 'Use-TestDatabase.ps1')
$env:SERVER_ADDRESS = '127.0.0.1'
$env:SERVER_PORT = '8082'
$env:SPRING_PROFILES_ACTIVE = 'test'
$env:SPRING_FLYWAY_ENABLED = 'false'
$env:SPRING_JPA_HIBERNATE_DDL_AUTO = 'validate'
$env:PHOTO_IMPORT_ENABLED = 'true'
$env:PHOTO_IMPORT_PROVIDER = 'mock'
$env:EXTERNAL_BOOKS_OPENLIBRARY_BASEURL = 'https://offline.invalid'
$env:SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE = '2'
$env:SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE = '0'
$backend = Join-Path (Split-Path $PSScriptRoot -Parent) 'backend/book-service'
Push-Location $backend
try {
    & .\mvnw.cmd spring-boot:test-run '-Dspring-boot.run.main-class=com.mibiblioteca.bookservice.book.photoimport.PhotoImportOfflineApplication'
    if ($LASTEXITCODE -ne 0) { throw 'Offline application exited with an error.' }
} finally {
    Pop-Location
}
