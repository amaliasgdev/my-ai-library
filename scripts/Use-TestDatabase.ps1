# Dot-source this file before invoking Maven or running tests in this shell.
$repository = Split-Path $PSScriptRoot -Parent
$secretsPath = Join-Path $repository '.env.test-db'
if (-not (Test-Path -LiteralPath $secretsPath -PathType Leaf)) {
    throw 'Missing .env.test-db. Initialize the isolated database first; no development fallback is allowed.'
}
$secrets = @{}
foreach ($line in [System.IO.File]::ReadAllLines($secretsPath)) {
    if ($line -match '^(TEST_DB_PASSWORD|TEST_DB_ADMIN_PASSWORD)=([a-f0-9]{64})$') {
        if ($secrets.ContainsKey($Matches[1])) { throw 'Duplicate test database secret.' }
        $secrets[$Matches[1]] = $Matches[2]
    } elseif ($line.Trim() -ne '') {
        throw 'Unexpected content in .env.test-db; refusing to load it.'
    }
}
if ($secrets.Count -ne 2) { throw 'Incomplete test database secrets.' }
$env:TEST_DB_URL = 'jdbc:postgresql://127.0.0.1:5433/bookdb_tests'
$env:TEST_DB_USERNAME = 'booktest'
$env:TEST_DB_PASSWORD = $secrets['TEST_DB_PASSWORD']
