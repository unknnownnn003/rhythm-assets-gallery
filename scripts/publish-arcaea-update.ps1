param(
  [string]$LocalDir = "",
  [string]$Version = "",
  [string]$ConfigPath = "",
  [string]$RemoteGameDir = "",
  [string]$PreviousRemoteGameDir = "",
  [switch]$KeepPrevious,
  [switch]$SkipDeploy
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$curveArtName = -join ([char]0x66F2, [char]0x7ED8)
$fullWidthOpenParen = [string][char]0xFF08
$fullWidthCloseParen = [string][char]0xFF09
$localUpdateDirPattern = "^" + [regex]::Escape($curveArtName + $fullWidthOpenParen) + "\d+" + [regex]::Escape($fullWidthCloseParen) + "(\d+(?:\.\d+)+)"
$defaultArcaeaRoot = Join-Path (Join-Path "D:\Files" $curveArtName) "Arcaea"

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
  param(
    [hashtable]$Config,
    [string]$Name,
    [string]$DefaultValue = "",
    [switch]$Required
  )

  if ($Config.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace($Config[$Name])) {
    return $Config[$Name].Trim()
  }

  $envValue = [Environment]::GetEnvironmentVariable($Name)
  if (-not [string]::IsNullOrWhiteSpace($envValue)) {
    return $envValue.Trim()
  }

  if ($Required) {
    throw "Missing required deploy config value: $Name"
  }

  return $DefaultValue
}

function Quote-RemotePath {
  param([string]$Value)

  return "'" + $Value.Replace("'", "'""'""'") + "'"
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

function Get-VersionFromPath {
  param([string]$Path)

  $name = Split-Path -Leaf $Path
  if ($name -match $script:localUpdateDirPattern) {
    return $matches[1]
  }
  if ($name -match '(\d+(?:\.\d+)+)') {
    return $matches[1]
  }
  return ""
}

function Get-VersionKey {
  param([string]$Value)

  return [version]$Value
}

function Resolve-LocalDir {
  param(
    [string]$InputPath,
    [string]$InputVersion
  )

  if (-not [string]::IsNullOrWhiteSpace($InputPath)) {
    if (-not (Test-Path -LiteralPath $InputPath -PathType Container)) {
      throw "Local update directory does not exist: $InputPath"
    }
    return (Resolve-Path -LiteralPath $InputPath).Path
  }

  if (-not (Test-Path -LiteralPath $defaultArcaeaRoot -PathType Container)) {
    throw "Default Arcaea directory does not exist: $defaultArcaeaRoot"
  }

  $candidates = Get-ChildItem -LiteralPath $defaultArcaeaRoot -Directory |
    Where-Object { $_.Name -match $script:localUpdateDirPattern } |
    ForEach-Object {
      [pscustomobject]@{
        Path = $_.FullName
        Version = [version]$matches[1]
      }
    }

  if (-not [string]::IsNullOrWhiteSpace($InputVersion)) {
    $match = $candidates |
      Where-Object { $_.Version -eq [version]$InputVersion } |
      Select-Object -First 1
    if ($null -eq $match) {
      throw "Local update directory for version $InputVersion does not exist under $defaultArcaeaRoot"
    }
    return $match.Path
  }

  $latest = $candidates | Sort-Object Version -Descending | Select-Object -First 1
  if ($null -eq $latest) {
    throw "No Arcaea update directory found under $defaultArcaeaRoot. Pass -LocalDir explicitly."
  }

  return $latest.Path
}

function Get-UploadDirectories {
  param([string]$Root)

  $dirs = @()
  foreach ($dir in Get-ChildItem -LiteralPath $Root -Directory) {
    if ($dir.Name -eq "_metadata") {
      continue
    }

    $hasFiles = @(Get-ChildItem -LiteralPath $dir.FullName -Recurse -File -Include *.png,*.jpg,*.jpeg,*.webp,*.avif,*.gif).Count -gt 0
    if ($hasFiles) {
      $dirs += $dir.FullName
    }
  }

  if ($dirs.Count -eq 0) {
    throw "No uploadable image directories found under $Root."
  }

  return $dirs
}

function Get-RemoteArcaeaDirs {
  param(
    [string[]]$SshArgs,
    [string]$Remote,
    [string]$RemoteAssetRoot
  )

  $quotedRoot = Quote-RemotePath $RemoteAssetRoot
  $remoteScript = "if [ -d $quotedRoot ]; then find $quotedRoot -mindepth 1 -maxdepth 1 -type d -name 'Arcaea*' -printf '%f\n' | sort; fi"
  $output = & ssh @SshArgs $Remote $remoteScript
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to list remote Arcaea directories."
  }

  return @($output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Select-PreviousRemoteGameDir {
  param(
    [string[]]$Candidates,
    [string]$Target
  )

  $versioned = @()
  foreach ($candidate in $Candidates) {
    if ($candidate -eq $Target) {
      continue
    }
    if ($candidate -like "Arcaea*" -and $candidate -match '(\d+(?:\.\d+)+)') {
      $versioned += [pscustomobject]@{
        Name = $candidate
        Version = [version]$matches[1]
      }
    }
  }

  if ($versioned.Count -eq 0) {
    return ""
  }

  return ($versioned | Sort-Object Version -Descending | Select-Object -First 1).Name
}

function Join-RemotePath {
  param(
    [string]$Parent,
    [string]$Child
  )

  return $Parent.TrimEnd("/") + "/" + $Child.Trim("/")
}

$resolvedConfigPath = if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  Join-Path $projectRoot ".deploy.env"
} else {
  $ConfigPath
}

$resolvedLocalDir = Resolve-LocalDir -InputPath $LocalDir -InputVersion $Version
$resolvedVersion = if ([string]::IsNullOrWhiteSpace($Version)) { Get-VersionFromPath $resolvedLocalDir } else { $Version }
if ([string]::IsNullOrWhiteSpace($resolvedVersion)) {
  throw "Could not infer Arcaea version from local directory. Pass -Version explicitly."
}

if ([string]::IsNullOrWhiteSpace($RemoteGameDir)) {
  $targetRemoteGameDir = "Arcaea" + $fullWidthOpenParen + ([char]0x81F3) + $resolvedVersion + $fullWidthCloseParen
} else {
  $targetRemoteGameDir = $RemoteGameDir
}

$uploadDirs = Get-UploadDirectories -Root $resolvedLocalDir

Assert-Command "ssh"
Assert-Command "scp"

$deployConfig = Read-DeployConfig -Path $resolvedConfigPath
$deployHost = Get-ConfigValue -Config $deployConfig -Name "DEPLOY_HOST" -Required
$deployUser = Get-ConfigValue -Config $deployConfig -Name "DEPLOY_USER" -Required
$deployPort = Get-ConfigValue -Config $deployConfig -Name "DEPLOY_PORT" -DefaultValue "22"
$deployIdentityFile = Get-ConfigValue -Config $deployConfig -Name "DEPLOY_IDENTITY_FILE"
$deployUseSshConfig = Get-ConfigValue -Config $deployConfig -Name "DEPLOY_USE_SSH_CONFIG" -DefaultValue "false"
$remoteAssetRoot = (Get-ConfigValue -Config $deployConfig -Name "DEPLOY_REMOTE_ASSET_ROOT" -Required).TrimEnd("/")
$remoteWorkPath = (Get-ConfigValue -Config $deployConfig -Name "DEPLOY_REMOTE_WORK_PATH" -DefaultValue "/tmp/rhythm-assets-gallery-build-work").TrimEnd("/")

$remote = "${deployUser}@${deployHost}"
$sshBaseArgs = @()
$scpBaseArgs = @()

if ($deployUseSshConfig.ToLowerInvariant() -ne "true") {
  $emptySshConfigPath = Join-Path ([System.IO.Path]::GetTempPath()) "rhythm-assets-gallery-empty-ssh-config"
  if (-not (Test-Path -LiteralPath $emptySshConfigPath)) {
    New-Item -ItemType File -Path $emptySshConfigPath | Out-Null
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

$targetRemoteDir = Join-RemotePath -Parent $remoteAssetRoot -Child $targetRemoteGameDir
$remoteCandidates = Get-RemoteArcaeaDirs -SshArgs $sshBaseArgs -Remote $remote -RemoteAssetRoot $remoteAssetRoot
$sourceRemoteGameDir = if ([string]::IsNullOrWhiteSpace($PreviousRemoteGameDir)) {
  Select-PreviousRemoteGameDir -Candidates $remoteCandidates -Target $targetRemoteGameDir
} else {
  $PreviousRemoteGameDir
}

Write-Host "publish-arcaea-update: local=$resolvedLocalDir"
Write-Host "publish-arcaea-update: version=$resolvedVersion"
Write-Host "publish-arcaea-update: remoteAssetRoot=$remoteAssetRoot"
Write-Host "publish-arcaea-update: target=$targetRemoteDir"
if (-not [string]::IsNullOrWhiteSpace($sourceRemoteGameDir)) {
  Write-Host "publish-arcaea-update: previous=$sourceRemoteGameDir"
}

Invoke-Step "Prepare remote Arcaea directory" {
  $quotedTarget = Quote-RemotePath $targetRemoteDir
  $scriptParts = @("set -e")

  if (-not [string]::IsNullOrWhiteSpace($sourceRemoteGameDir) -and $sourceRemoteGameDir -ne $targetRemoteGameDir) {
    $sourceRemoteDir = Join-RemotePath -Parent $remoteAssetRoot -Child $sourceRemoteGameDir
    $quotedSource = Quote-RemotePath $sourceRemoteDir
    $scriptParts += "if [ ! -d $quotedTarget ]; then mkdir -p $quotedTarget; if [ -d $quotedSource ]; then cp -a $quotedSource/. $quotedTarget/; fi; fi"
  } else {
    $scriptParts += "mkdir -p $quotedTarget"
  }

  & ssh @sshBaseArgs $remote ($scriptParts -join "; ")
}

Invoke-Step "Upload Arcaea image directories" {
  $quotedTarget = Quote-RemotePath $targetRemoteDir
  & ssh @sshBaseArgs $remote "mkdir -p $quotedTarget"
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  foreach ($dir in $uploadDirs) {
    $scpArgs = @()
    $scpArgs += $scpBaseArgs
    $scpArgs += "-r"
    $scpArgs += $dir
    $scpArgs += "${remote}:$targetRemoteDir/"
    Write-Host "Uploading: $dir"
    & scp @scpArgs
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
}

if (-not $KeepPrevious -and -not [string]::IsNullOrWhiteSpace($sourceRemoteGameDir) -and $sourceRemoteGameDir -ne $targetRemoteGameDir) {
  Invoke-Step "Move previous Arcaea directory out of asset root" {
    $sourceRemoteDir = Join-RemotePath -Parent $remoteAssetRoot -Child $sourceRemoteGameDir
    $backupRoot = Join-RemotePath -Parent $remoteWorkPath -Child "asset-backups/arcaea"
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-RemotePath -Parent $backupRoot -Child $stamp
    $quotedSource = Quote-RemotePath $sourceRemoteDir
    $quotedBackupDir = Quote-RemotePath $backupDir
    $remoteScript = "set -e; if [ -d $quotedSource ]; then mkdir -p $quotedBackupDir; mv $quotedSource $quotedBackupDir/; fi"
    & ssh @sshBaseArgs $remote $remoteScript
  }
}

if (-not $SkipDeploy) {
  Invoke-Step "Remote build deploy" {
    $deployScript = Join-Path $PSScriptRoot "deploy.ps1"
    & $deployScript -Mode remote-build -ConfigPath $resolvedConfigPath
  }
}

Write-Host ""
Write-Host "publish-arcaea-update: done"
