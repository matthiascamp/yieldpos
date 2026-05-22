# test-scale.ps1 -- Mettler Toledo Viva / 8217 protocol scale test
# Usage: powershell -ExecutionPolicy Bypass -File test-scale.ps1 [-Port COM3] [-Baud 9600]
param(
    [string]$Port = "",
    [int]$Baud = 9600
)

Write-Host "`n=== Mettler Toledo Viva Scale Test ===" -ForegroundColor Cyan
Write-Host "Protocol: MT 8217 (7-E-1 @ ${Baud} baud)`n"

# ── Step 1: Find COM ports ──────────────────────────────────────────────────
if (-not $Port) {
    Write-Host "[1/5] Scanning COM ports..." -ForegroundColor Yellow
    $ports = [System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object
    if ($ports.Count -eq 0) {
        Write-Host "  ERROR: No COM ports found!" -ForegroundColor Red
        Write-Host "  Check: Is the USB-to-Serial adapter plugged in?" -ForegroundColor Red
        Write-Host "  Check: Does it show in Device Manager > Ports?" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Found: $($ports -join ', ')" -ForegroundColor Green

    # Try to identify which port has the scale
    $Port = $ports[0]
    foreach ($p in $ports) {
        # Try each port -- pick the first one that responds
        try {
            $testPort = New-Object System.IO.Ports.SerialPort $p, $Baud, ([System.IO.Ports.Parity]::Even), 7, ([System.IO.Ports.StopBits]::One)
            $testPort.ReadTimeout = 2000
            $testPort.WriteTimeout = 2000
            $testPort.DtrEnable = $true
            $testPort.RtsEnable = $true
            $testPort.Open()
            $testPort.Write("W")
            Start-Sleep -Milliseconds 500
            $bytesAvail = $testPort.BytesToRead
            $testPort.Close()
            $testPort.Dispose()
            if ($bytesAvail -gt 0) {
                $Port = $p
                Write-Host "  Scale responds on: $p" -ForegroundColor Green
                break
            }
        } catch {
            try { $testPort.Close() } catch {}
            try { $testPort.Dispose() } catch {}
        }
    }
    Write-Host "  Using port: $Port`n"
} else {
    Write-Host "[1/5] Using specified port: $Port`n" -ForegroundColor Yellow
}

# ── Step 2: Open serial port ────────────────────────────────────────────────
Write-Host "[2/5] Opening $Port (${Baud} baud, 7-E-1, DTR+RTS)..." -ForegroundColor Yellow
try {
    $serial = New-Object System.IO.Ports.SerialPort $Port, $Baud, ([System.IO.Ports.Parity]::Even), 7, ([System.IO.Ports.StopBits]::One)
    $serial.ReadTimeout = 3000
    $serial.WriteTimeout = 2000
    $serial.DtrEnable = $true
    $serial.RtsEnable = $true
    $serial.Open()
    Write-Host "  Port opened OK" -ForegroundColor Green
} catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Message -match "Access") {
        Write-Host "  Another program (Profit Track? PuTTY?) is using this port." -ForegroundColor Red
        Write-Host "  Close it and try again." -ForegroundColor Red
    }
    exit 1
}

# ── Helper: send command and read framed response ───────────────────────────
function Send-ScaleCommand {
    param([string]$Cmd, [string]$Label)

    # Flush input buffer
    if ($serial.BytesToRead -gt 0) { $serial.DiscardInBuffer() }

    Write-Host "  Sending '$Cmd' command..." -NoNewline
    $serial.Write($Cmd)

    # Wait for response (up to 3 seconds)
    $deadline = (Get-Date).AddSeconds(3)
    $rawBytes = @()
    $gotSTX = $false
    $frameBytes = @()

    while ((Get-Date) -lt $deadline) {
        if ($serial.BytesToRead -gt 0) {
            $b = $serial.ReadByte()
            $rawBytes += $b

            if ($b -eq 0x02) {
                # STX -- start of frame
                $gotSTX = $true
                $frameBytes = @()
                continue
            }
            if ($gotSTX) {
                if ($b -eq 0x0D) {
                    # CR -- end of frame
                    break
                }
                $frameBytes += $b
            }
        } else {
            Start-Sleep -Milliseconds 50
        }
    }

    if ($rawBytes.Count -eq 0) {
        Write-Host " NO RESPONSE" -ForegroundColor Red
        return $null
    }

    $hexStr = ($rawBytes | ForEach-Object { $_.ToString("X2") }) -join " "
    $asciiStr = -join ($rawBytes | ForEach-Object {
        if ($_ -ge 0x20 -and $_ -le 0x7E) { [char]$_ } else { "?" }
    })
    Write-Host " got $($rawBytes.Count) bytes" -ForegroundColor Green
    Write-Host "    Raw hex:   $hexStr" -ForegroundColor Gray
    Write-Host "    Raw ASCII: $asciiStr" -ForegroundColor Gray

    if ($gotSTX -and $frameBytes.Count -gt 0) {
        $frameHex = ($frameBytes | ForEach-Object { $_.ToString("X2") }) -join " "
        Write-Host "    Frame:     $frameHex ($($frameBytes.Count) bytes)" -ForegroundColor Gray
        return $frameBytes
    }

    return $rawBytes
}

# ── Helper: parse 8217 weight frame ─────────────────────────────────────────
function Parse-8217Frame {
    param([byte[]]$Frame)

    $ascii = -join ($Frame | ForEach-Object { [char]$_ })

    # ECR format: ASCII weight with decimal point (e.g. "00.000", "05.250")
    # This is what the Viva sends -- no binary status bytes, just the weight string
    if ($ascii -match "^(-?\d+\.?\d*)$") {
        $weight = [double]$Matches[1]
        Write-Host ""
        Write-Host "    Format:    ECR (ASCII weight with decimal point)" -ForegroundColor Cyan
        Write-Host "    Raw:       '$ascii'" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "    WEIGHT: $weight kg (STABLE)" -ForegroundColor Green
        return
    }

    # Status-only response: "?X" means scale not ready / in motion / error
    if ($ascii -match "^\?(.?)") {
        $code = $Matches[1]
        $meaning = switch ($code) {
            "M" { "scale in motion" }
            "O" { "over capacity" }
            "U" { "under zero" }
            "P" { "power-up / initializing" }
            "E" { "error" }
            "Z" { "zero error" }
            default { "status code: $code" }
        }
        Write-Host ""
        Write-Host "    STATUS: $meaning" -ForegroundColor Yellow
        return
    }

    if ($Frame.Count -lt 7) {
        Write-Host "    Unrecognized short frame ($($Frame.Count) bytes): '$ascii'" -ForegroundColor Yellow
        return
    }

    $sta = $Frame[0]
    $stb = $Frame[1]
    $digitBytes = $Frame[2..6]

    # Check if bytes 2-6 are ASCII digits
    $allDigits = $true
    foreach ($b in $digitBytes) {
        if ($b -lt 0x30 -or $b -gt 0x39) { $allDigits = $false; break }
    }

    if (-not $allDigits) {
        Write-Host "    Weight bytes are not ASCII digits -- unexpected format" -ForegroundColor Yellow
        $ascii = -join ($Frame | ForEach-Object { if ($_ -ge 0x20 -and $_ -le 0x7E) { [char]$_ } else { "?" } })
        Write-Host "    Trying ASCII parse: '$ascii'" -ForegroundColor Yellow

        if ($ascii -match "(\d+\.?\d*)") {
            Write-Host "    ECR weight: $($Matches[1])" -ForegroundColor Cyan
        }
        return
    }

    # Parse STA -- decimal position (bits 0-2)
    $decPos = $sta -band 0x07
    $decLabels = @("*100", "*10", "*1", "/10 (1dp)", "/100 (2dp)", "/1000 (3dp)", "/10000 (4dp)", "/100000 (5dp)")
    Write-Host ""
    Write-Host "    STA byte:  0x$($sta.ToString('X2')) (decimal position: $($decLabels[$decPos]))" -ForegroundColor Cyan

    # Parse STB -- status flags
    $netMode    = ($stb -band 0x01) -ne 0
    $negative   = ($stb -band 0x02) -ne 0
    $outOfRange = ($stb -band 0x04) -ne 0
    $inMotion   = ($stb -band 0x08) -ne 0
    $isKg       = ($stb -band 0x10) -ne 0
    $inPowerUp  = ($stb -band 0x40) -ne 0
    Write-Host "    STB byte:  0x$($stb.ToString('X2'))" -ForegroundColor Cyan
    Write-Host "      Net mode:     $netMode"
    Write-Host "      Negative:     $negative"
    Write-Host "      Out of range: $outOfRange"
    Write-Host "      In motion:    $inMotion"
    Write-Host "      Unit:         $(if ($isKg) { 'kg' } else { 'lb' })"
    Write-Host "      Power-up:     $inPowerUp"

    # Parse weight
    $weightStr = -join ($digitBytes | ForEach-Object { [char]$_ })
    $weightInt = [int]$weightStr
    $weight = $weightInt * [Math]::Pow(10, 2 - $decPos)
    if ($negative) { $weight = -$weight }
    $weight = [Math]::Round($weight, 5)
    $unit = $(if ($isKg) { "kg" } else { "lb" })

    Write-Host "    Digits:    $weightStr" -ForegroundColor Cyan
    Write-Host ""

    if ($outOfRange) {
        Write-Host "    STATUS: OUT OF RANGE" -ForegroundColor Red
    } elseif ($inMotion) {
        Write-Host "    WEIGHT: $weight $unit (IN MOTION)" -ForegroundColor Yellow
    } elseif ($inPowerUp) {
        Write-Host "    STATUS: POWERING UP" -ForegroundColor Yellow
    } else {
        Write-Host "    WEIGHT: $weight $unit (STABLE)" -ForegroundColor Green
    }
}

Write-Host ""

# ── Step 3: Send 'W' (weight request) ──────────────────────────────────────
Write-Host "[3/5] Reading weight..." -ForegroundColor Yellow
$frame = Send-ScaleCommand -Cmd "W" -Label "Weight"
if ($frame) { Parse-8217Frame -Frame $frame }
Write-Host ""

# ── Step 4: Send 'Z' (zero) ────────────────────────────────────────────────
Write-Host "[4/5] Testing zero command..." -ForegroundColor Yellow
$frame = Send-ScaleCommand -Cmd "Z" -Label "Zero"
if ($frame) {
    Write-Host "    Zero command acknowledged" -ForegroundColor Green
}
Write-Host ""

# ── Step 5: Read weight 5 times (poll test) ────────────────────────────────
Write-Host "[5/5] Polling weight 5 times (500ms interval)..." -ForegroundColor Yellow
Write-Host "  Place something on the scale to see the weight change`n"
for ($i = 1; $i -le 5; $i++) {
    Write-Host "  Poll $i/5:" -NoNewline
    $frame = $null
    # Flush
    if ($serial.BytesToRead -gt 0) { $serial.DiscardInBuffer() }
    $serial.Write("W")
    $deadline = (Get-Date).AddSeconds(2)
    $rawBytes = @()
    $gotSTX = $false
    $frameBytes = @()
    while ((Get-Date) -lt $deadline) {
        if ($serial.BytesToRead -gt 0) {
            $b = $serial.ReadByte()
            $rawBytes += $b
            if ($b -eq 0x02) { $gotSTX = $true; $frameBytes = @(); continue }
            if ($gotSTX) {
                if ($b -eq 0x0D) { break }
                $frameBytes += $b
            }
        } else { Start-Sleep -Milliseconds 20 }
    }
    if ($gotSTX -and $frameBytes.Count -gt 0) {
        $frameStr = -join ($frameBytes | ForEach-Object { [char]$_ })
        # ECR format: ASCII weight with decimal point (e.g. "00.000", "05.250")
        if ($frameStr -match "^(-?\d+\.?\d*)$") {
            $weight = [double]$Matches[1]
            Write-Host " $weight kg (STABLE)" -ForegroundColor Green
        }
        # Status-only: "?X" means scale not ready / in motion / error
        elseif ($frameStr -match "^\?") {
            Write-Host " not ready ($frameStr)" -ForegroundColor Yellow
        }
        # Binary frame (STA+STB+5digits+BCC+ETX) -- 7+ bytes
        elseif ($frameBytes.Count -ge 7) {
            $sta = $frameBytes[0]
            $stb = $frameBytes[1]
            $decPos = $sta -band 0x07
            $digitBytes = $frameBytes[2..6]
            $allDigits = $true
            foreach ($b in $digitBytes) { if ($b -lt 0x30 -or $b -gt 0x39) { $allDigits = $false; break } }
            if ($allDigits) {
                $weightStr = -join ($digitBytes | ForEach-Object { [char]$_ })
                $weightInt = [int]$weightStr
                $weight = $weightInt * [Math]::Pow(10, 2 - $decPos)
                $inMotion = ($stb -band 0x08) -ne 0
                $isKg = ($stb -band 0x10) -ne 0
                $unit = $(if ($isKg) { "kg" } else { "lb" })
                $statusStr = $(if ($inMotion) { "IN MOTION" } else { "STABLE" })
                $color = $(if ($inMotion) { "Yellow" } else { "Green" })
                Write-Host " $weight $unit ($statusStr)" -ForegroundColor $color
            } else {
                Write-Host " unexpected: $frameStr" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host " unknown: $frameStr" -ForegroundColor Yellow
        }
    } elseif ($rawBytes.Count -gt 0) {
        $hexStr = ($rawBytes | ForEach-Object { $_.ToString("X2") }) -join " "
        $asciiStr = -join ($rawBytes | ForEach-Object { if ($_ -ge 0x20 -and $_ -le 0x7E) { [char]$_ } else { "?" } })
        Write-Host " raw: $hexStr ($asciiStr)" -ForegroundColor Yellow
    } else {
        Write-Host " no response" -ForegroundColor Red
    }
    Start-Sleep -Milliseconds 500
}

# ── Cleanup ─────────────────────────────────────────────────────────────────
Write-Host ""
$serial.Close()
$serial.Dispose()
Write-Host "Port closed. Done.`n" -ForegroundColor Cyan

Write-Host "=== Results ===" -ForegroundColor Cyan
Write-Host "If you saw weight readings above, the scale is working correctly."
Write-Host "Your Crisp POS should now auto-detect it on startup."
Write-Host "Settings: $Port, MT 8217, ${Baud} baud, 7-E-1, DTR+RTS`n"
