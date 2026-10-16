$ErrorActionPreference = 'Stop'
$nativeDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'native'
$sources = @('Pen.cs', 'Diagnostics.cs', 'Bridge.cs') | ForEach-Object { Join-Path $nativeDir $_ }
$sources += Join-Path $PSScriptRoot 'NativeStateTests.cs'
Add-Type -Path $sources -ReferencedAssemblies 'System.Web.Extensions'
[PenStateTests]::Run()
