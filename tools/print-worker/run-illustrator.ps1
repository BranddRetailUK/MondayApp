param([Parameter(Mandatory=$true)][string]$ScriptPath)
$ErrorActionPreference = 'Stop'
try {
    try { $illustrator = [Runtime.InteropServices.Marshal]::GetActiveObject('Illustrator.Application') }
    catch { $illustrator = New-Object -ComObject Illustrator.Application }
    $null = $illustrator.DoJavaScriptFile((Resolve-Path -LiteralPath $ScriptPath).Path)
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
