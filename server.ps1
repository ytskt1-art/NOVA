$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root '.env'
$pollinationsKey = $null
$fishAudioKey = $null

if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*POLLINATIONS_API_KEY\s*=\s*(.*?)\s*$') {
      $pollinationsKey = $Matches[1].Trim('"', "'")
    }
    if ($line -match '^\s*FISH_AUDIO_API_KEY\s*=\s*(.*?)\s*$') {
      $fishAudioKey = $Matches[1].Trim('"', "'")
    }
  }
}
if ([string]::IsNullOrWhiteSpace($pollinationsKey)) {
  throw 'POLLINATIONS_API_KEY is missing from the local .env file.'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://127.0.0.1:8000/')
$listener.Start()
$httpClient = [System.Net.Http.HttpClient]::new()
$httpClient.Timeout = [TimeSpan]::FromMinutes(3)
Write-Host 'NOVA is running at http://127.0.0.1:8000'
Start-Process 'http://127.0.0.1:8000/'

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $request = $context.Request
  $response = $context.Response
  $response.Headers['Cache-Control'] = 'no-store'
  $status = 200
  $contentType = 'application/json; charset=utf-8'

  try {
    if ($request.HttpMethod -eq 'GET') {
      $name = switch ($request.Url.AbsolutePath) {
        '/' { 'index.html' }
        '/index.html' { 'index.html' }
        '/script.js' { 'script.js' }
        '/style.css' { 'style.css' }
        '/nova-logo.png' { 'nova-logo.png' }
        '/future-background.png' { 'future-background.png' }
        default { $null }
      }
      if (-not $name) {
        $status = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes('Not found')
        $contentType = 'text/plain; charset=utf-8'
      } else {
        $path = Join-Path $root $name
        $bytes = [IO.File]::ReadAllBytes($path)
        $contentType = switch ([IO.Path]::GetExtension($path)) {
          '.html' { 'text/html; charset=utf-8' }
          '.js' { 'text/javascript; charset=utf-8' }
          '.css' { 'text/css; charset=utf-8' }
          '.png' { 'image/png' }
        }
      }
    } elseif ($request.HttpMethod -eq 'POST' -and $request.Url.AbsolutePath -eq '/api/image') {
      if ($request.ContentLength64 -gt 10000) { throw 'Image prompt is too long.' }
      $reader = [IO.StreamReader]::new($request.InputStream, $request.ContentEncoding)
      $incoming = $reader.ReadToEnd() | ConvertFrom-Json
      $reader.Dispose()
      $prompt = [string]$incoming.prompt
      if ([string]::IsNullOrWhiteSpace($prompt)) { throw 'Enter a description for the image.' }
      if ($prompt.Length -gt 4000) { throw 'Image prompt must be 4,000 characters or less.' }

      $encodedPrompt = [Uri]::EscapeDataString($prompt)
      $imageUri = "https://gen.pollinations.ai/image/$encodedPrompt?model=black-forest-labs%2Fflux.1-schnell&width=1024&height=1024"
      $imageRequest = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $imageUri)
      $imageRequest.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $pollinationsKey)
      $imageResponse = $httpClient.SendAsync($imageRequest).GetAwaiter().GetResult()
      if (-not $imageResponse.IsSuccessStatusCode) {
        $details = $imageResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $status = 502
        $bytes = [Text.Encoding]::UTF8.GetBytes((@{ error = "Pollinations error ($([int]$imageResponse.StatusCode)): $details" } | ConvertTo-Json -Compress))
      } else {
        $bytes = $imageResponse.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        $contentType = $imageResponse.Content.Headers.ContentType.MediaType
        if (-not $contentType.StartsWith('image/')) { throw 'Pollinations did not return an image.' }
      }
      $imageResponse.Dispose()
      $imageRequest.Dispose()
    } elseif ($request.HttpMethod -eq 'POST' -and $request.Url.AbsolutePath -eq '/api/speech') {
      if ([string]::IsNullOrWhiteSpace($fishAudioKey)) { throw 'FISH_AUDIO_API_KEY is missing from the local .env file.' }
      if ($request.ContentLength64 -gt 20000) { throw 'Speech text is too long.' }
      $reader = [IO.StreamReader]::new($request.InputStream, $request.ContentEncoding)
      $incoming = $reader.ReadToEnd() | ConvertFrom-Json
      $reader.Dispose()
      $speechText = [string]$incoming.text
      if ([string]::IsNullOrWhiteSpace($speechText)) { throw 'Speech text cannot be empty.' }
      if ($speechText.Length -gt 1000) { throw 'Speech text must be 1,000 characters or less.' }

      $speechBody = @{ text = $speechText; format = 'mp3' } | ConvertTo-Json -Compress
      $speechRequest = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, 'https://api.fish.audio/v1/tts')
      $speechRequest.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $fishAudioKey)
      $speechRequest.Headers.Add('model', 's2.1-pro-free')
      $speechRequest.Content = [System.Net.Http.StringContent]::new($speechBody, [Text.Encoding]::UTF8, 'application/json')
      $speechResponse = $httpClient.SendAsync($speechRequest).GetAwaiter().GetResult()
      if (-not $speechResponse.IsSuccessStatusCode) {
        $details = $speechResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $status = 502
        $bytes = [Text.Encoding]::UTF8.GetBytes((@{ error = "Fish Audio error ($([int]$speechResponse.StatusCode)): $details" } | ConvertTo-Json -Compress))
      } else {
        $bytes = $speechResponse.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        $contentType = 'audio/mpeg'
      }
      $speechResponse.Dispose()
      $speechRequest.Dispose()
    } else {
      $status = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes((@{ error = 'Not found' } | ConvertTo-Json -Compress))
    }
  } catch {
    $status = 502
    $bytes = [Text.Encoding]::UTF8.GetBytes((@{ error = $_.Exception.Message } | ConvertTo-Json -Compress))
    $contentType = 'application/json; charset=utf-8'
  }

  $response.StatusCode = $status
  $response.ContentType = $contentType
  $response.ContentLength64 = $bytes.Length
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.Close()
}
