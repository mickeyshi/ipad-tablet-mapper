$ErrorActionPreference = 'Stop'
Add-Type -Path @((Join-Path (Split-Path $PSScriptRoot -Parent) 'native/Pen.cs'), (Join-Path $PSScriptRoot 'ProbeCoordinates.cs')) -ReferencedAssemblies 'System.Windows.Forms','System.Drawing'
[TabletCoordinateProbe]::Run()
