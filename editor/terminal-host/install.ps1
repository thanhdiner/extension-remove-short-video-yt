param([Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId)
$ErrorActionPreference = 'Stop'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$hostDirectory = $PSScriptRoot
if (!(Test-Path -LiteralPath (Join-Path $hostDirectory 'node_modules\node-pty'))) {
    throw 'Missing native host dependencies. Run npm ci --prefix editor/terminal-host from the DinKit directory first.'
}
$launcherPath = Join-Path $hostDirectory 'launch.cmd'
$manifestPath = Join-Path $hostDirectory 'native-host.json'
$hostScript = Join-Path $hostDirectory 'host.js'
$launcher = "@echo off`r`n`"$nodePath`" `"$hostScript`"`r`n"
[System.IO.File]::WriteAllText($launcherPath, $launcher, [System.Text.Encoding]::ASCII)
$manifest = @{ name = 'dinkit.editor'; description = 'Local Text Editor terminal'; path = $launcherPath; type = 'stdio'; allowed_origins = @("chrome-extension://$ExtensionId/") }
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
$key = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\dinkit.editor'
New-Item -Path $key -Force | Out-Null
Set-Item -Path $key -Value $manifestPath
Write-Output "Terminal host registered for extension $ExtensionId."
