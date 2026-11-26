param(
    [string]$Compiler = ${env:ProgramFiles(x86)} + '\Inno Setup 6\ISCC.exe',
    [string]$NodeLicense
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    $runtime = (Get-Command node.exe).Source
    $arch = & $runtime -p process.arch
    if ($arch -ne 'x64') { throw 'Build the installer with an x64 Node.js runtime.' }
    if (-not (Test-Path -LiteralPath $Compiler -PathType Leaf)) { throw 'Inno Setup 6 ISCC.exe was not found.' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if (-not $NodeLicense) { $NodeLicense = Join-Path (Split-Path -Parent $runtime) 'LICENSE' }
    if (Test-Path -LiteralPath $NodeLicense -PathType Leaf) {
        Copy-Item -LiteralPath $NodeLicense -Destination 'dist/node-LICENSE.txt' -Force
    } elseif (-not (Test-Path -LiteralPath 'dist/node-LICENSE.txt')) {
        $version = & $runtime --version
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/nodejs/node/$version/LICENSE" -OutFile 'dist/node-LICENSE.txt'
    }
    & $Compiler /Qp "/DNodeRuntime=$runtime" 'installer\tus-atolyesi.iss'
    exit $LASTEXITCODE
} finally { Pop-Location }
