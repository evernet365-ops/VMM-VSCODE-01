param(
  [string]$EnvFile = ".env.vivotek.local",
  [switch]$Help
)

if ($Help) {
  Write-Host "Usage: powershell -ExecutionPolicy Bypass -File scripts/vivotek-smoke.ps1 [-EnvFile <path>]"
  Write-Host "Default EnvFile: .env.vivotek.local"
  Write-Host "Example: powershell -ExecutionPolicy Bypass -File scripts/vivotek-smoke.ps1 -EnvFile .env.vivotek.example"
  exit 0
}

if (Test-Path -LiteralPath $EnvFile) {
  Get-Content -LiteralPath $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    $parts = $line -split "=", 2
    if ($parts.Length -ne 2) {
      return
    }

    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
} else {
  Write-Warning "Env file not found: $EnvFile"
}

node scripts/vivotek-smoke.mjs
exit $LASTEXITCODE
