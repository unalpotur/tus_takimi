param(
    [ValidateRange(1,65535)][int]$Port = 3000,
    [string]$Release,
    [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
$taskName = 'TusAtolyesi'
$ruleGroup = 'TusAtolyesi LAN'
$state = Join-Path $env:ProgramData 'TusAtolyesi'
$log = Join-Path $state 'setup.log'
$portFile = Join-Path $state 'port.txt'
$account = ([Security.Principal.SecurityIdentifier]'S-1-5-19').Translate([Security.Principal.NTAccount]).Value
$oldXml = $null
$newRule = $null
$taskChanged = $false

function Remove-AppRules([string]$Except) {
    Get-NetFirewallRule -Group $ruleGroup -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne $Except } |
        Remove-NetFirewallRule
}

try {
    if ($Uninstall) {
        if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
            Stop-ScheduledTask -TaskName $taskName
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        }
        Remove-AppRules
        Remove-Item -LiteralPath $portFile -ErrorAction SilentlyContinue
        exit 0
    }

    if (-not $Release) { throw 'The application release path is required.' }
    $node = Join-Path $Release 'node.exe'
    $server = Join-Path $Release 'server.cjs'
    if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or -not (Test-Path -LiteralPath $server -PathType Leaf)) {
        throw 'The packaged runtime or server is missing.'
    }

    New-Item -ItemType Directory -Path $state -Force | Out-Null
    # The application account can traverse the state folder and write its database only.
    & icacls.exe $state /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)(F)' '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-19:(RX)' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The state directory permissions could not be set.' }
    $data = Join-Path $state 'data'
    New-Item -ItemType Directory -Path $data -Force | Out-Null
    & icacls.exe $data /grant:r '*S-1-5-19:(OI)(CI)(M)' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The database directory permissions could not be set.' }

    $old = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    $previousPort = if (Test-Path -LiteralPath $portFile) { (Get-Content -LiteralPath $portFile -Raw).Trim() } else { '' }
    if ((-not $old -or $previousPort -ne [string]$Port) -and (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) {
        throw "TCP port $Port is already in use."
    }
    if ($old) {
        $oldXml = Export-ScheduledTask -TaskName $taskName
        Stop-ScheduledTask -TaskName $taskName
        $taskChanged = $true
    }

    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Any, $Port)
    try {
        for ($retry = 0; ; $retry++) {
            try { $listener.Start(); break }
            catch {
                if ($retry -ge 14) { throw "TCP port $Port could not be opened. It may be in use." }
                Start-Sleep -Milliseconds 250
            }
        }
    } finally { $listener.Stop() }

    $taskArgs = ('"{0}" --host 0.0.0.0 --port {1} --data "{2}"' -f $server, $Port, $data)
    $action = New-ScheduledTaskAction -Execute $node -Argument $taskArgs -WorkingDirectory $Release
    $principal = New-ScheduledTaskPrincipal -UserId $account -LogonType ServiceAccount -RunLevel Limited
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
    $taskChanged = $true
    Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName

    $healthy = $false
    for ($retry = 0; $retry -lt 30; $retry++) {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:${Port}/api/health" -TimeoutSec 2
            if ($health.ok -and $health.app -eq 'tus-atolyesi' -and $health.port -eq $Port) {
                $healthy = $true
                break
            }
        } catch { Start-Sleep -Milliseconds 400 }
    }
    if (-not $healthy) { throw "The server did not respond on port $Port." }

    $candidate = 'TusAtolyesi-' + [guid]::NewGuid().ToString('N')
    New-NetFirewallRule -Name $candidate -DisplayName "Tus Atolyesi (TCP $Port)" -Group $ruleGroup `
        -Direction Inbound -Action Allow -Enabled True -Profile Any -RemoteAddress LocalSubnet `
        -Program $node -Protocol TCP -LocalPort $Port | Out-Null
    $newRule = $candidate
    Set-Content -LiteralPath $portFile -Value $Port -Encoding Ascii
    try { Remove-AppRules -Except $newRule }
    catch { Add-Content -LiteralPath $log -Value ('Old firewall rule cleanup: ' + $_.Exception.Message) }
    Add-Content -LiteralPath $log -Value ("Ready on TCP {0} at {1}" -f $Port, (Get-Date -Format o)) -ErrorAction SilentlyContinue
    exit 0
} catch {
    $message = $_.Exception.Message
    if ($newRule) { Remove-NetFirewallRule -Name $newRule -ErrorAction SilentlyContinue }
    if ($taskChanged) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        if ($oldXml) {
            try {
                Register-ScheduledTask -TaskName $taskName -Xml $oldXml -Force | Out-Null
                Start-ScheduledTask -TaskName $taskName
            } catch { $message += ' Rollback: ' + $_.Exception.Message }
        }
    }
    if (Test-Path -LiteralPath $state) { Add-Content -LiteralPath $log -Value $message -ErrorAction SilentlyContinue }
    Write-Error $message -ErrorAction Continue
    exit 1
}
