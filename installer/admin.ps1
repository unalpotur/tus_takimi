param(
    [string]$Runtime = (Join-Path $PSScriptRoot 'node.exe'),
    [string]$Server = (Join-Path $PSScriptRoot 'server.cjs'),
    [string]$Data = (Join-Path $env:ProgramData 'TusAtolyesi\data')
)
$ErrorActionPreference = 'Stop'
try {
    if (-not $PSBoundParameters.ContainsKey('Data')) {
        $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
        if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
            Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $PSCommandPath)
            exit 0
        }
    }
    $password = Read-Host 'Ilk ogretmen icin kurulum parolasi (en az 8 karakter)' -AsSecureString
    if ($password.Length -lt 8 -or $password.Length -gt 128) { throw 'Parola 8-128 karakter olmali.' }

    $info = [Diagnostics.ProcessStartInfo]::new($Runtime)
    $info.UseShellExecute = $false
    $info.RedirectStandardInput = $true
    $info.Arguments = ('"{0}" --admin --data "{1}"' -f $Server, $Data)
    $process = [Diagnostics.Process]::Start($info)
    $secret = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes([Runtime.InteropServices.Marshal]::PtrToStringBSTR($secret))
        $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
        $process.StandardInput.Close()
    } finally {
        if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secret)
        $password.Dispose()
    }
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw 'Kurulum parolasi ayarlanamadi.' }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    $exitCode = 1
}
Read-Host 'Kapatmak icin Enter' | Out-Null
if ($exitCode) { exit $exitCode }
