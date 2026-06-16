param(
  [ValidateSet("full", "local-build", "remote-build", "incremental")]
  [string]$Mode = "full",
  [string]$ConfigPath = "",
  [switch]$SkipLocalSnapshot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Assert-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Read-DeployConfig {
  param([string]$Path)

  $config = @{}

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Deploy config file not found: $Path"
  }

  $lines = Get-Content -LiteralPath $Path -Encoding UTF8
  foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -lt 1) {
      throw "Invalid deploy config line: $line"
    }

    $name = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $config[$name] = $value
  }

  return $config
}

function Get-ConfigValue {
  param([string]$Name)

  $value = $null
  if ($script:DeployConfig.ContainsKey($Name)) {
    $value = $script:DeployConfig[$Name]
  }

  if ([string]::IsNullOrWhiteSpace($value)) {
    $value = [Environment]::GetEnvironmentVariable($Name)
  }

  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing required deploy config value: $Name"
  }

  return $value.Trim()
}

function Get-OptionalConfigValue {
  param(
    [string]$Name,
    [string]$DefaultValue = ""
  )

  if ($script:DeployConfig.ContainsKey($Name)) {
    $value = $script:DeployConfig[$Name]
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }
  }

  $envValue = [Environment]::GetEnvironmentVariable($Name)
  if (-not [string]::IsNullOrWhiteSpace($envValue)) {
    return $envValue.Trim()
  }

  return $DefaultValue
}

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Name"
  $global:LASTEXITCODE = 0
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
  Write-Host "OK: $Name"
}

function Quote-RemotePath {
  param([string]$Value)

  return "'" + $Value.Replace("'", "'""'""'") + "'"
}

function Normalize-RemoteScript {
  param([string]$Script)

  return $Script -replace "`r`n?", "`n"
}

function Get-RemoteParentPath {
  param([string]$Path)

  $normalized = $Path.TrimEnd("/")
  $lastSlashIndex = $normalized.LastIndexOf("/")
  if ($lastSlashIndex -le 0) {
    return "/"
  }

  return $normalized.Substring(0, $lastSlashIndex)
}

function Format-ByteSize {
  param([double]$Bytes)

  if ($Bytes -ge 1GB) {
    return "{0:N2} GB" -f ($Bytes / 1GB)
  }

  if ($Bytes -ge 1MB) {
    return "{0:N1} MB" -f ($Bytes / 1MB)
  }

  if ($Bytes -ge 1KB) {
    return "{0:N1} KB" -f ($Bytes / 1KB)
  }

  return "{0:N0} B" -f $Bytes
}

function Format-Duration {
  param([double]$Seconds)

  if ($Seconds -lt 0 -or [double]::IsInfinity($Seconds) -or [double]::IsNaN($Seconds)) {
    return "unknown"
  }

  $span = [TimeSpan]::FromSeconds([Math]::Max(0, $Seconds))
  if ($span.TotalHours -ge 1) {
    return "{0}h {1}m {2}s" -f [int]$span.TotalHours, $span.Minutes, $span.Seconds
  }

  if ($span.TotalMinutes -ge 1) {
    return "{0}m {1}s" -f $span.Minutes, $span.Seconds
  }

  return "{0}s" -f $span.Seconds
}

function ConvertTo-CommandLineArgument {
  param([string]$Value)

  if ($Value.Length -eq 0) {
    return '""'
  }

  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  $result = '"'
  $backslashCount = 0
  foreach ($char in $Value.ToCharArray()) {
    if ($char -eq '\') {
      $backslashCount++
      continue
    }

    if ($char -eq '"') {
      $result += ('\' * (($backslashCount * 2) + 1))
      $result += '"'
      $backslashCount = 0
      continue
    }

    if ($backslashCount -gt 0) {
      $result += ('\' * $backslashCount)
      $backslashCount = 0
    }
    $result += $char
  }

  if ($backslashCount -gt 0) {
    $result += ('\' * ($backslashCount * 2))
  }

  $result += '"'
  return $result
}

function Invoke-ScpWithProgress {
  param(
    [string[]]$ScpArgs,
    [string[]]$SshArgs,
    [string]$Remote,
    [string]$RemotePath,
    [int64]$TotalBytes,
    [int]$PollSeconds
  )

  if ($TotalBytes -le 0) {
    & scp @ScpArgs
    return
  }

  $scpPath = (Get-Command "scp").Source
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo.FileName = $scpPath
  $process.StartInfo.Arguments = ($ScpArgs | ForEach-Object { ConvertTo-CommandLineArgument $_ }) -join " "
  $process.StartInfo.UseShellExecute = $false

  $started = $process.Start()
  if (-not $started) {
    throw "Failed to start scp"
  }

  $startTime = Get-Date
  $lastBytes = 0L
  $lastCheck = $startTime
  $quotedRemotePath = Quote-RemotePath $RemotePath

  try {
    while (-not $process.HasExited) {
      Start-Sleep -Seconds $PollSeconds

      $remoteScript = "if [ -d $quotedRemotePath ]; then du -sb -- $quotedRemotePath 2>/dev/null | awk '{print `$1}'; else echo 0; fi"
      $sizeOutput = & ssh @SshArgs $Remote $remoteScript
      if ($LASTEXITCODE -ne 0) {
        continue
      }

      $sizeText = ($sizeOutput | Select-Object -Last 1)
      $uploadedBytes = 0L
      if (-not [int64]::TryParse($sizeText, [ref]$uploadedBytes)) {
        continue
      }

      $uploadedBytes = [Math]::Min($uploadedBytes, $TotalBytes)
      $now = Get-Date
      $elapsedSeconds = [Math]::Max(1, ($now - $startTime).TotalSeconds)
      $averageBytesPerSecond = $uploadedBytes / $elapsedSeconds
      $recentSeconds = [Math]::Max(1, ($now - $lastCheck).TotalSeconds)
      $recentBytesPerSecond = [Math]::Max(0, ($uploadedBytes - $lastBytes) / $recentSeconds)
      $displayBytesPerSecond = if ($recentBytesPerSecond -gt 0) { $recentBytesPerSecond } else { $averageBytesPerSecond }
      $remainingSeconds = if ($averageBytesPerSecond -gt 0) { ($TotalBytes - $uploadedBytes) / $averageBytesPerSecond } else { -1 }
      $percent = [Math]::Min(100, [Math]::Round(($uploadedBytes / $TotalBytes) * 100, 1))

      $status = "{0} / {1} ({2:N1}%), {3}/s, ETA {4}" -f `
        (Format-ByteSize $uploadedBytes),
        (Format-ByteSize $TotalBytes),
        $percent,
        (Format-ByteSize $displayBytesPerSecond),
        (Format-Duration $remainingSeconds)

      Write-Progress -Activity "Uploading dist with scp" -Status $status -PercentComplete $percent

      $lastBytes = $uploadedBytes
      $lastCheck = $now
    }
  }
  finally {
    Write-Progress -Activity "Uploading dist with scp" -Completed
  }

  $process.WaitForExit()
  $global:LASTEXITCODE = $process.ExitCode
}

function Copy-DistSnapshot {
  param(
    [string]$SourcePath,
    [string]$SnapshotRoot
  )

  if (Test-Path -LiteralPath $SnapshotRoot) {
    Remove-Item -LiteralPath $SnapshotRoot -Recurse -Force
  }

  New-Item -ItemType Directory -Path $SnapshotRoot -Force | Out-Null

  $robocopyArgs = @(
    $SourcePath,
    $SnapshotRoot,
    "/MIR",
    "/FFT",
    "/R:2",
    "/W:2",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP"
  )

  & robocopy @robocopyArgs | Out-Host
  if ($LASTEXITCODE -ge 8) {
    throw "Failed to create local dist snapshot with robocopy exit code $LASTEXITCODE"
  }

  $global:LASTEXITCODE = 0
}

function New-RemoteSourceArchive {
  param(
    [string]$ArchivePath
  )

  if (Test-Path -LiteralPath $ArchivePath) {
    Remove-Item -LiteralPath $ArchivePath -Force
  }

  $tarArgs = @(
    "-czf",
    $ArchivePath,
    "--exclude=.astro",
    "--exclude=.deploy-work",
    "--exclude=.git",
    "--exclude=.env",
    "--exclude=.env.production",
    "--exclude=.deploy.env",
    "--exclude=automation/incoming",
    "--exclude=automation/logs",
    "--exclude=automation/processed",
    "--exclude=automation/rejected",
    "--exclude=dist",
    "--exclude=node_modules",
    "--exclude=public/assets",
    "--exclude=public/data",
    "--exclude=public/downloads",
    "--exclude=public/thumbs",
    "--exclude=preview-server.log",
    "--exclude=preview-server.err.log",
    "--exclude=dev-server.log",
    "--exclude=dev-server.err.log",
    "."
  )

  & tar @tarArgs
}

function Get-RemoteSwitchScript {
  param(
    [string]$DeployPath,
    [string]$TempPath,
    [string]$OldPath,
    [string]$CleanupPath = ""
  )

  $quotedDeployPath = Quote-RemotePath $DeployPath
  $quotedTempPath = Quote-RemotePath $TempPath
  $quotedOldPath = Quote-RemotePath $OldPath
  $cleanupCommand = ""
  if (-not [string]::IsNullOrWhiteSpace($CleanupPath)) {
    $quotedCleanupPath = Quote-RemotePath $CleanupPath
    $cleanupCommand = "rm -rf -- $quotedCleanupPath"
  }

  return @"
set -e
if [ ! -d $quotedTempPath ]; then
  echo "Temporary release directory does not exist: $TempPath" >&2
  exit 1
fi
if [ -e $quotedOldPath ]; then
  if command -v chattr >/dev/null 2>&1; then
    find $quotedOldPath -name .user.ini -exec chattr -i {} \; 2>/dev/null || true
  fi
  rm -rf -- $quotedOldPath
fi
if [ -e $quotedDeployPath ]; then
  mv -- $quotedDeployPath $quotedOldPath
fi
if ! mv -- $quotedTempPath $quotedDeployPath; then
  if [ -e $quotedOldPath ] && [ ! -e $quotedDeployPath ]; then
    mv -- $quotedOldPath $quotedDeployPath
  fi
  exit 1
fi
$cleanupCommand
"@
}

function Get-RemoteCleanupScript {
  param(
    [string]$DeployPath,
    [string]$RemoteWorkPath
  )

  $deployParent = Get-RemoteParentPath $DeployPath
  $deployName = $DeployPath.TrimEnd("/").Substring($DeployPath.TrimEnd("/").LastIndexOf("/") + 1)
  $quotedDeployParent = Quote-RemotePath $deployParent
  $quotedRemoteWorkPath = Quote-RemotePath $RemoteWorkPath

  return @"
set -e
mkdir -p -- $quotedRemoteWorkPath
find $quotedRemoteWorkPath -mindepth 1 -maxdepth 1 \( -name 'source-*' -o -name 'source-*.tar.gz' \) -exec rm -rf -- {} +
if [ -d $quotedDeployParent ]; then
  find $quotedDeployParent -mindepth 1 -maxdepth 1 -name '$deployName.release-*' -exec rm -rf -- {} +
fi
"@
}

Assert-Command "npm.cmd"
Assert-Command "ssh"
Assert-Command "scp"
Assert-Command "robocopy"
Assert-Command "tar"

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $ConfigPath = Join-Path $projectRoot ".deploy.env"
}

$script:DeployConfig = Read-DeployConfig $ConfigPath

$deployHost = Get-ConfigValue "DEPLOY_HOST"
$deployUser = Get-ConfigValue "DEPLOY_USER"
$deployPath = (Get-ConfigValue "DEPLOY_PATH").TrimEnd("/")
$deployPort = Get-OptionalConfigValue "DEPLOY_PORT" "22"
$deployIdentityFile = Get-OptionalConfigValue "DEPLOY_IDENTITY_FILE"
$deployUseSshConfig = Get-OptionalConfigValue "DEPLOY_USE_SSH_CONFIG" "false"
$deploySiteUrl = Get-OptionalConfigValue "DEPLOY_SITE_URL"
$remoteAssetRoot = Get-OptionalConfigValue "DEPLOY_REMOTE_ASSET_ROOT"
$remoteWorkPath = (Get-OptionalConfigValue "DEPLOY_REMOTE_WORK_PATH" "${deployPath}.build-work").TrimEnd("/")
$minFreeMbValue = Get-OptionalConfigValue "DEPLOY_MIN_FREE_MB" "2048"
$uploadProgressPollSecondsValue = Get-OptionalConfigValue "DEPLOY_PROGRESS_POLL_SECONDS" "3"
$remoteSharpConcurrency = Get-OptionalConfigValue "DEPLOY_REMOTE_SHARP_CONCURRENCY" "1"
$remoteSharpCacheMemoryMb = Get-OptionalConfigValue "DEPLOY_REMOTE_SHARP_CACHE_MEMORY_MB" "64"
$minFreeBytes = [int64]$minFreeMbValue * 1MB
$uploadProgressPollSeconds = [Math]::Max(1, [int]$uploadProgressPollSecondsValue)

if ($deployHost -notmatch "^[A-Za-z0-9.-]+$") {
  throw "DEPLOY_HOST must be an IP address or DNS hostname. Current value: $deployHost"
}

if (-not $deployPath.StartsWith("/")) {
  throw "DEPLOY_PATH must be an absolute server path, for example /www/wwwroot/www.unknnownnn.homes"
}

if ($Mode -eq "incremental") {
  throw "Incremental deploy mode is reserved but not implemented yet. Use -Mode full."
}

$distPath = Join-Path $projectRoot "dist"
$deployWorkPath = Join-Path $projectRoot ".deploy-work"
$snapshotPath = Join-Path $deployWorkPath "dist-snapshot"
$sourceArchivePath = Join-Path $deployWorkPath "source.tar.gz"
$remote = "${deployUser}@${deployHost}"
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$tempPath = "${deployPath}.release-${timestamp}"
$oldPath = "${deployPath}.old"
$deployParentPath = Get-RemoteParentPath $deployPath
$remoteSourcePath = "${remoteWorkPath}/source-${timestamp}"
$remoteArchivePath = "${remoteWorkPath}/source-${timestamp}.tar.gz"

$sshBaseArgs = @()
$scpBaseArgs = @()

if ($deployUseSshConfig -ne "true") {
  $emptySshConfigPath = Join-Path ([System.IO.Path]::GetTempPath()) "rhythm-assets-gallery-empty-ssh-config"
  if (-not (Test-Path -LiteralPath $emptySshConfigPath -PathType Leaf)) {
    Set-Content -LiteralPath $emptySshConfigPath -Value "" -Encoding ASCII
  }

  $sshBaseArgs += @("-F", $emptySshConfigPath)
  $scpBaseArgs += @("-F", $emptySshConfigPath)
}

if (-not [string]::IsNullOrWhiteSpace($deployPort)) {
  $sshBaseArgs += @("-p", $deployPort)
  $scpBaseArgs += @("-P", $deployPort)
}

if (-not [string]::IsNullOrWhiteSpace($deployIdentityFile)) {
  $sshBaseArgs += @("-i", $deployIdentityFile)
  $scpBaseArgs += @("-i", $deployIdentityFile)
}

Write-Host "Deploy target: ${remote}:$deployPath"
if (-not [string]::IsNullOrWhiteSpace($deploySiteUrl)) {
  Write-Host "Site URL: $deploySiteUrl"
}

if ($Mode -eq "remote-build") {
  if ([string]::IsNullOrWhiteSpace($remoteAssetRoot)) {
    throw "DEPLOY_REMOTE_ASSET_ROOT is required for -Mode remote-build. Set it to the absolute server path of the existing asset directory."
  }

  if (-not $remoteAssetRoot.StartsWith("/")) {
    throw "DEPLOY_REMOTE_ASSET_ROOT must be an absolute server path."
  }

  $normalizedRemoteAssetRoot = $remoteAssetRoot.TrimEnd("/")
  $normalizedDeployPath = $deployPath.TrimEnd("/")
  if ($normalizedRemoteAssetRoot -eq $normalizedDeployPath -or $normalizedRemoteAssetRoot.StartsWith("${normalizedDeployPath}/")) {
    throw "DEPLOY_REMOTE_ASSET_ROOT must not be inside DEPLOY_PATH. Keep original assets outside the atomic website directory."
  }

  Invoke-Step "Create local source archive" {
    New-Item -ItemType Directory -Path $deployWorkPath -Force | Out-Null
    New-RemoteSourceArchive -ArchivePath $sourceArchivePath
  }

  $sourceArchiveBytes = (Get-Item -LiteralPath $sourceArchivePath).Length

  Invoke-Step "Clean old remote build files" {
    $remoteScript = Get-RemoteCleanupScript -DeployPath $deployPath -RemoteWorkPath $remoteWorkPath
    & ssh @sshBaseArgs $remote (Normalize-RemoteScript $remoteScript)
  }

  Invoke-Step "Check remote free disk space" {
    $quotedDeployParentPath = Quote-RemotePath $deployParentPath
    $quotedRemoteWorkPath = Quote-RemotePath $remoteWorkPath
    $remoteScript = @"
set -e
mkdir -p -- $quotedDeployParentPath
mkdir -p -- $quotedRemoteWorkPath
df -Pk -- $quotedDeployParentPath | awk 'NR==2 {print `$4}'
"@
    $availableKbOutput = & ssh @sshBaseArgs $remote (Normalize-RemoteScript $remoteScript)
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to check remote disk space"
    }

    $availableKb = [int64](($availableKbOutput | Select-Object -Last 1).Trim())
    $availableBytes = $availableKb * 1KB
    $requiredBytes = [int64]$sourceArchiveBytes + $minFreeBytes

    Write-Host ("source archive: {0}" -f (Format-ByteSize $sourceArchiveBytes))
    Write-Host ("remote available: {0}" -f (Format-ByteSize $availableBytes))
    Write-Host ("reserved free space after upload: {0}" -f (Format-ByteSize $minFreeBytes))

    if ($availableBytes -lt $requiredBytes) {
      throw ("Not enough remote disk space. Need at least {0}, found {1}." -f (Format-ByteSize $requiredBytes), (Format-ByteSize $availableBytes))
    }
  }

  Invoke-Step "Upload source archive with scp" {
    $uploadTarget = "${remote}:${remoteArchivePath}"
    $scpArgs = @()
    $scpArgs += $scpBaseArgs
    $scpArgs += $sourceArchivePath
    $scpArgs += $uploadTarget
    & scp @scpArgs
  }

  Invoke-Step "Build site on remote server" {
    $quotedRemoteArchivePath = Quote-RemotePath $remoteArchivePath
    $quotedRemoteSourcePath = Quote-RemotePath $remoteSourcePath
    $quotedRemoteAssetRoot = Quote-RemotePath $remoteAssetRoot
    $quotedRemoteCurrentThumbsPath = Quote-RemotePath "$($deployPath.TrimEnd("/"))/thumbs"
    $quotedTempPath = Quote-RemotePath $tempPath
    $remoteScript = @"
set -e
rm -rf -- $quotedRemoteSourcePath
mkdir -p -- $quotedRemoteSourcePath
tar -xzf $quotedRemoteArchivePath -C $quotedRemoteSourcePath
cd $quotedRemoteSourcePath
mkdir -p -- public
if [ -d $quotedRemoteCurrentThumbsPath ]; then
  echo "Reuse existing deployed thumbnails"
  cp -a -- $quotedRemoteCurrentThumbsPath public/thumbs
fi
command -v node >/dev/null 2>&1 || { echo "Node.js is not installed on the remote server." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is not installed on the remote server." >&2; exit 1; }
node_version=`$(node -p 'process.versions.node')
node_major=`${node_version%%.*}
node_rest=`${node_version#*.}
node_minor=`${node_rest%%.*}
if [ "`$node_major" -lt 22 ] || { [ "`$node_major" -eq 22 ] && [ "`$node_minor" -lt 12 ]; }; then
  echo "Remote Node.js >=22.12.0 is required, current is v`$node_version" >&2
  exit 1
fi
if [ ! -d $quotedRemoteAssetRoot ]; then
  echo "Remote asset root does not exist: $remoteAssetRoot" >&2
  exit 1
fi
asset_count=`$(find $quotedRemoteAssetRoot -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.avif' -o -iname '*.gif' \) | wc -l)
echo "Remote asset root: $remoteAssetRoot"
echo "Remote image count: `$asset_count"
if [ "`$asset_count" -eq 0 ]; then
  echo "No supported image files found under DEPLOY_REMOTE_ASSET_ROOT." >&2
  exit 1
fi
cat > .env <<EOF
ASSET_ROOT=$remoteAssetRoot
PUBLIC_ASSET_BASE_URL=/assets
PUBLIC_THUMB_BASE_URL=/thumbs
SHARP_CONCURRENCY=$remoteSharpConcurrency
SHARP_CACHE_MEMORY_MB=$remoteSharpCacheMemoryMb
SHARP_CACHE_ITEMS=32
SHARP_CACHE_FILES=0
EOF
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npm run update
npm run build
rm -rf -- $quotedTempPath
mv -- dist $quotedTempPath
rm -f -- $quotedRemoteArchivePath
"@
    & ssh @sshBaseArgs $remote (Normalize-RemoteScript $remoteScript)
  }

  Invoke-Step "Switch remote release atomically" {
    $remoteScript = Get-RemoteSwitchScript -DeployPath $deployPath -TempPath $tempPath -OldPath $oldPath -CleanupPath $remoteSourcePath
    & ssh @sshBaseArgs $remote (Normalize-RemoteScript $remoteScript)
  }

  Write-Host ""
  Write-Host "Deploy complete: ${remote}:$deployPath"
  if (-not [string]::IsNullOrWhiteSpace($deploySiteUrl)) {
    Write-Host "Site URL: $deploySiteUrl"
  }
  exit 0
}

Invoke-Step "Update asset indexes and thumbnails" {
  & npm.cmd run update
}

Invoke-Step "Build static site" {
  & npm.cmd run build
}

if (-not (Test-Path $distPath -PathType Container)) {
  throw "Build output directory not found: $distPath"
}

$distItems = @(Get-ChildItem -LiteralPath $distPath -Force)
if ($distItems.Count -eq 0) {
  throw "Build output directory is empty: $distPath"
}

$uploadSourcePath = $distPath
if (-not $SkipLocalSnapshot) {
  Invoke-Step "Create local upload snapshot" {
    Copy-DistSnapshot -SourcePath $distPath -SnapshotRoot $snapshotPath
  }
  $uploadSourcePath = $snapshotPath
}

$distItems = @(Get-ChildItem -LiteralPath $uploadSourcePath -Force)
if ($distItems.Count -eq 0) {
  throw "Upload source directory is empty: $uploadSourcePath"
}

$distSizeBytes = (Get-ChildItem -LiteralPath $uploadSourcePath -Recurse -Force -File | Measure-Object -Property Length -Sum).Sum
if ($null -eq $distSizeBytes) {
  $distSizeBytes = 0
}

Invoke-Step "Check remote free disk space" {
  $quotedDeployParentPath = Quote-RemotePath $deployParentPath
  $remoteScript = @"
set -e
mkdir -p -- $quotedDeployParentPath
df -Pk -- $quotedDeployParentPath | awk 'NR==2 {print `$4}'
"@
  $availableKbOutput = & ssh @sshBaseArgs $remote (Normalize-RemoteScript $remoteScript)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to check remote disk space"
  }

  $availableKb = [int64](($availableKbOutput | Select-Object -Last 1).Trim())
  $availableBytes = $availableKb * 1KB
  $requiredBytes = [int64]$distSizeBytes + $minFreeBytes

  Write-Host ("dist size: {0:N1} MB" -f ($distSizeBytes / 1MB))
  Write-Host ("remote available: {0:N1} MB" -f ($availableBytes / 1MB))
  Write-Host ("reserved free space after upload: {0:N0} MB" -f ($minFreeBytes / 1MB))

  if ($availableBytes -lt $requiredBytes) {
    throw ("Not enough remote disk space. Need at least {0:N1} MB available, found {1:N1} MB." -f ($requiredBytes / 1MB), ($availableBytes / 1MB))
  }
}

Invoke-Step "Create remote temporary directory" {
  $quotedTempPath = Quote-RemotePath $tempPath
  & ssh @sshBaseArgs $remote "mkdir -p -- $quotedTempPath"
}

Invoke-Step "Upload dist contents with scp" {
  $uploadTarget = "${remote}:${tempPath}/"
  $scpArgs = @()
  $scpArgs += $scpBaseArgs
  $scpArgs += "-r"
  $scpArgs += $distItems.FullName
  $scpArgs += $uploadTarget
  Invoke-ScpWithProgress -ScpArgs $scpArgs -SshArgs $sshBaseArgs -Remote $remote -RemotePath $tempPath -TotalBytes $distSizeBytes -PollSeconds $uploadProgressPollSeconds
}

Invoke-Step "Switch remote release atomically" {
  $remoteScript = Get-RemoteSwitchScript -DeployPath $deployPath -TempPath $tempPath -OldPath $oldPath
  & ssh @sshBaseArgs $remote (Normalize-RemoteScript $remoteScript)
}

Write-Host ""
Write-Host "Deploy complete: ${remote}:$deployPath"
if (-not [string]::IsNullOrWhiteSpace($deploySiteUrl)) {
  Write-Host "Site URL: $deploySiteUrl"
}
