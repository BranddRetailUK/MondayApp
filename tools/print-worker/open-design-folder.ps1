param([Parameter(Mandatory=$true)][string]$Folder)
$ErrorActionPreference = 'Stop'
try {
  if (-not (Test-Path -LiteralPath $Folder -PathType Container)) { throw 'Design folder is unavailable' }
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DesignFolderWindow {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int command);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
'@
  $shell = New-Object -ComObject Shell.Application
  $expected = [IO.Path]::GetFullPath($Folder).TrimEnd('\')
  function Find-FolderWindow {
    foreach ($window in $shell.Windows()) {
      try {
        if ([IO.Path]::GetFileName($window.FullName) -ine 'explorer.exe') { continue }
        $uri = [Uri]$window.LocationURL
        if ($uri.IsFile -and $uri.LocalPath.TrimEnd('\') -ieq $expected) { return [IntPtr]$window.HWND }
      } catch { }
    }
    return [IntPtr]::Zero
  }
  $handle = Find-FolderWindow
  if ($handle -eq [IntPtr]::Zero) {
    Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList ('"' + $Folder + '"')
    for ($attempt=0; $attempt -lt 40; $attempt++) {
      Start-Sleep -Milliseconds 200
      $handle = Find-FolderWindow
      if ($handle -ne [IntPtr]::Zero) { break }
    }
  }
  if ($handle -eq [IntPtr]::Zero) { exit 2 }
  if ([DesignFolderWindow]::IsIconic($handle)) { [void][DesignFolderWindow]::ShowWindowAsync($handle,9) }
  # Raise once, then remove topmost immediately so Explorer behaves normally afterwards.
  try { [void][DesignFolderWindow]::SetWindowPos($handle,[IntPtr](-1),0,0,0,0,0x43) }
  finally { [void][DesignFolderWindow]::SetWindowPos($handle,[IntPtr](-2),0,0,0,0,0x43) }
  [void][DesignFolderWindow]::SetForegroundWindow($handle)
  Start-Sleep -Milliseconds 150
  if ([DesignFolderWindow]::GetForegroundWindow() -ne $handle) { exit 3 }
  exit 0
} catch { exit 1 }
