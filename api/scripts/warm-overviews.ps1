# Pre-generate the AI overview of every person so the demo shows them instantly.
# Calls POST /api/persons/{id}/overview one by one. Waits between new generations
# to stay under the Azure OpenAI rate limit (gpt-4o capacity 10 = ~10K tokens/min).
#   powershell -ExecutionPolicy Bypass -File api/scripts/warm-overviews.ps1
param(
    [string]$Api = "https://app-kyotsuchi-map-api.azurewebsites.net",
    [int]$WaitSeconds = 20,
    [switch]$Force
)
$ErrorActionPreference = "Stop"

function Get-Json($url, $method = "Get") {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $url -Method $method -ContentType "application/json" -Body $(if ($method -eq "Post") { "{}" } else { $null }) -TimeoutSec 120
    return [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
}

$graph = Get-Json "$Api/api/graph"
$persons = $graph.persons
Write-Host "persons: $($persons.Count)"
$i = 0
foreach ($p in $persons) {
    $i++
    $url = "$Api/api/persons/$($p.id)/overview" + $(if ($Force) { "?force=true" } else { "" })
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $o = Get-Json $url "Post"
        $state = if ($o.cached) { "cached" } else { "generated" }
        Write-Host ("[{0}/{1}] {2} {3} ({4:N1}s, {5} bullets, mode={6})" -f $i, $persons.Count, $p.id, $state, $sw.Elapsed.TotalSeconds, $o.bullets.Count, $o.mode)
        if (-not $o.cached -and $i -lt $persons.Count) { Start-Sleep -Seconds $WaitSeconds }
    }
    catch {
        Write-Host ("[{0}/{1}] {2} FAILED: {3}  (waiting 60s, then continuing)" -f $i, $persons.Count, $p.id, $_.Exception.Message)
        Start-Sleep -Seconds 60
    }
}
Write-Host "done"
