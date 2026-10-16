$ErrorActionPreference = 'Stop'
try {
    $sources = @('Pen.cs', 'Diagnostics.cs', 'Bridge.cs') | ForEach-Object { Join-Path $PSScriptRoot $_ }
    Add-Type -Path $sources -ReferencedAssemblies 'System.Web.Extensions'
    [TabletBridge]::Run()
} catch {
    @{ type = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress | Write-Output
    exit 1
}
