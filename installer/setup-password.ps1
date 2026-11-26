param([Parameter(Mandatory=$true)][string]$PasswordFile)
$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot 'node.exe'
$server = Join-Path $PSScriptRoot 'server.cjs'
$data = Join-Path $env:ProgramData 'TusAtolyesi\data'
$info = [Diagnostics.ProcessStartInfo]::new($runtime)
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardInput = $true
$info.Arguments = ('"{0}" --admin --if-missing --data "{1}"' -f $server, $data)
$bytes = [IO.File]::ReadAllBytes($PasswordFile)
try {
    $process = [Diagnostics.Process]::Start($info)
    $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $process.StandardInput.Close()
    $process.WaitForExit()
    exit $process.ExitCode
} finally {
    [Array]::Clear($bytes, 0, $bytes.Length)
}
