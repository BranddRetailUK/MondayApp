param([string]$ScriptPath, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$stage = 'attaching to Illustrator'
try {
    try { $illustrator = [Runtime.InteropServices.Marshal]::GetActiveObject('Illustrator.Application') }
    catch { throw 'Start Illustrator normally and dismiss any startup or plug-in dialogs before starting the worker.' }
    if ($CheckOnly) {
        $stage = 'checking Illustrator responsiveness'
        $null = $illustrator.DoJavaScript('void(0);')
        exit 0
    }
    if (-not $ScriptPath) { throw 'ScriptPath is required.' }
    $stage = 'running the artwork exporter'
    $null = $illustrator.DoJavaScriptFile((Resolve-Path -LiteralPath $ScriptPath).Path)
} catch {
    $code = if ($_.Exception.HResult) { ' (HRESULT 0x{0:X8})' -f ($_.Exception.HResult -band 0xffffffff) } else { '' }
    [Console]::Error.WriteLine("Illustrator $stage failed$code`: $($_.Exception.Message)")
    exit 1
}
