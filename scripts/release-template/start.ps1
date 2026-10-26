# 在发布包目录加载可选的 KEY=VALUE 配置并启动 Web Share Go 服务
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $scriptDir

$configPath = Join-Path $scriptDir 'config.env'
if (Test-Path -LiteralPath $configPath -PathType Leaf) {
  foreach ($line in Get-Content -LiteralPath $configPath -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }

    if ($trimmed -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      throw "config.env 仅支持 KEY=VALUE 行：$line"
    }

    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    # config.env 中显式配置的值覆盖继承值；空值会传入 Go 并按配置规则使用默认值
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

$executable = Join-Path $scriptDir 'web-share.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw '找不到 web-share.exe'
}

& $executable
exit $LASTEXITCODE
