<#
.SYNOPSIS
    Safely copy the local Pa11y MongoDB database (Docker) to another MongoDB, e.g. Railway.

.DESCRIPTION
    Three actions:

      Dump     Read-only export of the local database to backups\*.archive.gz plus a
               *.counts.json snapshot (collection counts and every scan result with its
               finding count). The source database is only read.

      Restore  Imports an archive into the TARGET MongoDB. It never uses --drop, refuses to
               run against a target that already contains tasks/results, and is a dry run
               unless -Execute is given. It never touches the local source database.

      Verify   Reads the TARGET and compares it with the snapshot taken by Dump
               (including each result's error/warning/notice counts and stored findings).

    The target connection string is read from an environment variable (default
    RAILWAY_MONGO_PUBLIC_URL) so the password never appears on the command line or in
    shell history. Use the base URL exactly as Railway shows it:
        mongodb://mongo:<password>@<host>:<port>
    The script appends "/?authSource=admin" itself.

    Requires Docker with the local Mongo container running (default: accessibility-mongo).
    The mongodump / mongorestore / mongosh tools inside that container are used, so
    nothing needs to be installed on Windows. The script never starts, stops, or removes
    containers.

.EXAMPLE
    .\deploy\mongo-migrate.ps1 -Action Dump
    $env:RAILWAY_MONGO_PUBLIC_URL = 'mongodb://mongo:...@xxxx.proxy.rlwy.net:12345'
    .\deploy\mongo-migrate.ps1 -Action Restore -ArchivePath .\backups\pa11y-....archive.gz
    .\deploy\mongo-migrate.ps1 -Action Restore -ArchivePath .\backups\pa11y-....archive.gz -Execute
    .\deploy\mongo-migrate.ps1 -Action Verify  -ArchivePath .\backups\pa11y-....archive.gz
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Dump', 'Restore', 'Verify')]
    [string]$Action,

    [string]$Container = 'accessibility-mongo',
    [string]$Database = 'pa11y',
    [string]$TargetDatabase = 'pa11y',
    [string]$TargetUriEnvVar = 'RAILWAY_MONGO_PUBLIC_URL',
    [string]$ArchivePath,
    [switch]$Execute
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

if ($Database -notmatch '^[A-Za-z0-9_-]+$' -or $TargetDatabase -notmatch '^[A-Za-z0-9_-]+$') {
    throw 'Database names may only contain letters, digits, "_" and "-".'
}

function Invoke-Docker {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & docker @Arguments 2>&1 | ForEach-Object { "$_" }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($code -ne 0) {
        # Only the first two arguments are echoed so credentials passed via -e never leak.
        throw ("docker $($Arguments[0]) $($Arguments[1]) failed (exit $code):`n" + ($output -join "`n"))
    }
    return $output
}

function Assert-ContainerRunning {
    $running = Invoke-Docker @('ps', '--filter', "name=^/$Container$", '--format', '{{.Names}}')
    if (-not ($running -contains $Container)) {
        throw "Container '$Container' is not running. Start it first (this script never starts or stops containers)."
    }
}

# Safe under Set-StrictMode even when the object has no properties (e.g. an empty database).
function Get-PropertyNames {
    param($Object)
    return @($Object.PSObject.Properties | ForEach-Object { $_.Name })
}

function Get-CountsPath {
    param([string]$Archive)
    return "$Archive.counts.json"
}

function Get-TargetServerUri {
    $base = [Environment]::GetEnvironmentVariable($TargetUriEnvVar)
    if ([string]::IsNullOrWhiteSpace($base)) {
        throw "Environment variable $TargetUriEnvVar is not set. Set it to Railway's MONGO_PUBLIC_URL (see DEPLOYMENT.md)."
    }
    $base = $base.Trim().TrimEnd('/')
    if ($base -notmatch '^mongodb://[^/?]+$') {
        throw "$TargetUriEnvVar must look like mongodb://user:password@host:port (no database path, no options)."
    }
    return "$base/?authSource=admin"
}

function Get-TargetHostLabel {
    param([string]$Uri)
    return ($Uri -replace '^mongodb://[^@]*@', '' -replace '[/?].*$', '')
}

# Runs a small mongosh script inside the container and returns the parsed JSON it prints.
function Invoke-MongoSnapshot {
    param([string]$DatabaseName, [string]$ServerUri)
    $js = @"
const database = db.getSiblingDB('$DatabaseName');
const snapshot = {collections: {}, results: []};
database.getCollectionNames().sort().forEach(name => {
    snapshot.collections[name] = database.getCollection(name).countDocuments();
});
if (snapshot.collections.results) {
    database.results.aggregate([
        {`$project: {task: 1, date: 1, count: 1, findings: {`$size: {`$ifNull: ['`$results', []]}}}},
        {`$sort: {date: 1}}
    ]).forEach(item => {
        snapshot.results.push({
            id: String(item._id),
            task: String(item.task),
            date: new Date(item.date).toISOString(),
            count: item.count,
            findings: item.findings
        });
    });
}
print('SNAPSHOT_JSON:' + JSON.stringify(snapshot));
"@
    $leaf = "snapshot-$([guid]::NewGuid().ToString('N')).js"
    $hostFile = Join-Path ([IO.Path]::GetTempPath()) $leaf
    [IO.File]::WriteAllText($hostFile, ($js -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding $false))
    try {
        Invoke-Docker @('cp', $hostFile, "${Container}:/tmp/$leaf") | Out-Null
        if ($ServerUri) {
            $output = Invoke-Docker @('exec', '-e', "SNAPSHOT_URI=$ServerUri", $Container, 'sh', '-c',
                "mongosh `"`$SNAPSHOT_URI`" --quiet --file /tmp/$leaf")
        } else {
            $output = Invoke-Docker @('exec', $Container, 'mongosh', '--quiet', '--file', "/tmp/$leaf")
        }
    } finally {
        Remove-Item -LiteralPath $hostFile -ErrorAction SilentlyContinue
        & docker exec $Container rm -f "/tmp/$leaf" 2>&1 | Out-Null
    }
    $line = $output | Where-Object { $_ -like 'SNAPSHOT_JSON:*' } | Select-Object -First 1
    if (-not $line) {
        throw ("Could not read a snapshot from MongoDB. Output was:`n" + ($output -join "`n"))
    }
    return ($line.Substring('SNAPSHOT_JSON:'.Length) | ConvertFrom-Json)
}

function Show-Snapshot {
    param($Snapshot, [string]$Title)
    Write-Host $Title -ForegroundColor Cyan
    foreach ($property in $Snapshot.collections.PSObject.Properties) {
        Write-Host ("  {0,-12} {1}" -f $property.Name, $property.Value)
    }
    foreach ($result in @($Snapshot.results)) {
        $c = $result.count
        Write-Host ("  result {0}  {1}  errors={2} warnings={3} notices={4} total={5}  findings stored={6}" -f `
            $result.id, $result.date, $c.error, $c.warning, $c.notice, $c.total, $result.findings)
    }
}

function Compare-WithSnapshot {
    param($Expected, $Actual)
    $problems = @()
    $actualNames = Get-PropertyNames $Actual.collections
    foreach ($property in $Expected.collections.PSObject.Properties) {
        $name = $property.Name
        $actualValue = $null
        if ($actualNames -contains $name) {
            $actualValue = $Actual.collections.$name
        }
        if ($actualValue -ne $property.Value) {
            $problems += "collection '$name': expected $($property.Value), found $actualValue"
        }
    }
    $expectedResults = @($Expected.results | ForEach-Object { $_ | ConvertTo-Json -Compress -Depth 5 })
    $actualResults = @($Actual.results | ForEach-Object { $_ | ConvertTo-Json -Compress -Depth 5 })
    if (($expectedResults -join '|') -ne ($actualResults -join '|')) {
        $problems += 'result documents differ (ids, dates, counts or stored finding totals)'
    }
    return $problems
}

# --------------------------------------------------------------------------------------
Assert-ContainerRunning

switch ($Action) {

    'Dump' {
        if (-not $ArchivePath) {
            $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
            $ArchivePath = Join-Path (Join-Path (Get-Location) 'backups') "pa11y-$stamp.archive.gz"
        }
        $ArchivePath = [IO.Path]::GetFullPath($ArchivePath)
        if (Test-Path -LiteralPath $ArchivePath) {
            throw "Refusing to overwrite existing file: $ArchivePath"
        }
        New-Item -ItemType Directory -Force -Path (Split-Path $ArchivePath) | Out-Null

        Write-Host "READ-ONLY export of '$Database' from container '$Container'. The source is not modified." -ForegroundColor Yellow
        $source = Invoke-MongoSnapshot -DatabaseName $Database
        if ((Get-PropertyNames $source.collections).Count -eq 0) {
            throw "Database '$Database' has no collections in '$Container'. Wrong database name?"
        }
        Show-Snapshot $source 'Source snapshot:'

        $leaf = "pa11y-dump-$([guid]::NewGuid().ToString('N')).archive.gz"
        try {
            Invoke-Docker @('exec', $Container, 'mongodump', "--db=$Database", "--archive=/tmp/$leaf", '--gzip', '--quiet') | Out-Null
            Invoke-Docker @('cp', "${Container}:/tmp/$leaf", $ArchivePath) | Out-Null
        } finally {
            & docker exec $Container rm -f "/tmp/$leaf" 2>&1 | Out-Null
        }

        $hash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
        $sidecar = [ordered]@{
            database = $Database
            takenAtUtc = (Get-Date).ToUniversalTime().ToString('o')
            archiveSha256 = $hash
            collections = $source.collections
            results = $source.results
        }
        [IO.File]::WriteAllText((Get-CountsPath $ArchivePath), ($sidecar | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding $false))

        Write-Host ''
        Write-Host "Archive : $ArchivePath" -ForegroundColor Green
        Write-Host "Snapshot: $(Get-CountsPath $ArchivePath)" -ForegroundColor Green
        Write-Host "SHA-256 : $hash"
        Write-Host 'Keep this file safe. It is git-ignored (backups/) and contains your scan data.'
    }

    'Restore' {
        if (-not $ArchivePath) { throw '-ArchivePath is required for Restore.' }
        $ArchivePath = [IO.Path]::GetFullPath($ArchivePath)
        if (-not (Test-Path -LiteralPath $ArchivePath)) { throw "Archive not found: $ArchivePath" }
        $countsPath = Get-CountsPath $ArchivePath
        if (-not (Test-Path -LiteralPath $countsPath)) { throw "Snapshot file not found next to the archive: $countsPath" }
        $expected = Get-Content -LiteralPath $countsPath -Raw | ConvertFrom-Json
        if ((Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash -ne $expected.archiveSha256) {
            throw 'Archive checksum does not match its snapshot file. The archive may be corrupted or modified.'
        }

        $serverUri = Get-TargetServerUri
        $targetLabel = Get-TargetHostLabel $serverUri

        Write-Host "Target : $targetLabel  (database '$TargetDatabase')" -ForegroundColor Cyan
        Write-Host "Archive: $ArchivePath"
        Write-Host 'Source database is never modified. No --drop is used: existing target documents are left alone.'

        $existing = Invoke-MongoSnapshot -DatabaseName $TargetDatabase -ServerUri $serverUri
        $already = 0
        $existingNames = Get-PropertyNames $existing.collections
        foreach ($name in @('tasks', 'results')) {
            if ($existingNames -contains $name) { $already += [int]$existing.collections.$name }
        }
        if ($already -gt 0) {
            Show-Snapshot $existing 'Target already contains data:'
            throw "Refusing to restore: target database '$TargetDatabase' already has $already task/result documents. Use an empty database."
        }

        if (-not $Execute) {
            Write-Host ''
            Write-Host 'DRY RUN - nothing was written. Target is reachable and empty. Re-run with -Execute to restore.' -ForegroundColor Yellow
            return
        }

        $leaf = "pa11y-restore-$([guid]::NewGuid().ToString('N')).archive.gz"
        try {
            Invoke-Docker @('cp', $ArchivePath, "${Container}:/tmp/$leaf") | Out-Null
            $nsArguments = "--nsInclude='$Database.*'"
            if ($Database -ne $TargetDatabase) { $nsArguments += " --nsFrom='$Database.*' --nsTo='$TargetDatabase.*'" }
            $restoreOutput = Invoke-Docker @('exec', '-e', "RESTORE_URI=$serverUri", $Container, 'sh', '-c',
                "mongorestore --uri=`"`$RESTORE_URI`" --archive=/tmp/$leaf --gzip $nsArguments")
            $restoreOutput | Select-Object -Last 2 | ForEach-Object { Write-Host "  $_" }
        } finally {
            & docker exec $Container rm -f "/tmp/$leaf" 2>&1 | Out-Null
        }

        Write-Host ''
        Write-Host 'Restore finished. Verifying against the snapshot taken at Dump time...' -ForegroundColor Cyan
        $actual = Invoke-MongoSnapshot -DatabaseName $TargetDatabase -ServerUri $serverUri
        Show-Snapshot $actual 'Target after restore:'
        $problems = @(Compare-WithSnapshot -Expected $expected -Actual $actual)
        if ($problems.Count -gt 0) {
            $problems | ForEach-Object { Write-Host "  MISMATCH: $_" -ForegroundColor Red }
            throw 'Verification FAILED. Do not point the app at this database yet.'
        }
        Write-Host 'VERIFIED: target matches the local snapshot exactly.' -ForegroundColor Green
    }

    'Verify' {
        $serverUri = Get-TargetServerUri
        $actual = Invoke-MongoSnapshot -DatabaseName $TargetDatabase -ServerUri $serverUri
        Show-Snapshot $actual "Target $(Get-TargetHostLabel $serverUri) / $TargetDatabase :"
        if ($ArchivePath) {
            $expected = Get-Content -LiteralPath (Get-CountsPath ([IO.Path]::GetFullPath($ArchivePath))) -Raw | ConvertFrom-Json
            $problems = @(Compare-WithSnapshot -Expected $expected -Actual $actual)
            if ($problems.Count -gt 0) {
                $problems | ForEach-Object { Write-Host "  MISMATCH: $_" -ForegroundColor Red }
                throw 'Verification FAILED.'
            }
            Write-Host 'VERIFIED: target matches the local snapshot exactly.' -ForegroundColor Green
        }
    }
}