Add-Type -AssemblyName System.Drawing

$Dir       = $PSScriptRoot
$IconPath  = Join-Path $Dir 'dreams.ico'
$BatPath   = Join-Path $Dir 'Dreams.bat'
$LinkName  = 'Dreams.lnk'
$LinkPath  = Join-Path ([Environment]::GetFolderPath('Desktop')) $LinkName

# ---- Draw 256x256 icon ----
$size = 256
$bmp  = New-Object System.Drawing.Bitmap $size, $size
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'

# Palette (ARGB), matching the app's CSS
$bgColor     = [System.Drawing.Color]::FromArgb(255, 19, 19, 22)    # #131316
$accentColor = [System.Drawing.Color]::FromArgb(255, 214, 207, 184) # #d6cfb8
$borderColor = [System.Drawing.Color]::FromArgb(90,  214, 207, 184) # muted cream

# Rounded-square background, filling the canvas
$bgRect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
$bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 44
$bgPath.AddArc($bgRect.X,                  $bgRect.Y,                   $r*2, $r*2, 180, 90)
$bgPath.AddArc($bgRect.Right - $r*2,       $bgRect.Y,                   $r*2, $r*2, 270, 90)
$bgPath.AddArc($bgRect.Right - $r*2,       $bgRect.Bottom - $r*2,       $r*2, $r*2, 0,   90)
$bgPath.AddArc($bgRect.X,                  $bgRect.Bottom - $r*2,       $r*2, $r*2, 90,  90)
$bgPath.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush $bgColor), $bgPath)

# Subtle inner stroke
$strokeRect = New-Object System.Drawing.Rectangle 5, 5, ($size - 10), ($size - 10)
$strokePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$sr = 40
$strokePath.AddArc($strokeRect.X,                  $strokeRect.Y,                   $sr*2, $sr*2, 180, 90)
$strokePath.AddArc($strokeRect.Right - $sr*2,      $strokeRect.Y,                   $sr*2, $sr*2, 270, 90)
$strokePath.AddArc($strokeRect.Right - $sr*2,      $strokeRect.Bottom - $sr*2,      $sr*2, $sr*2, 0,   90)
$strokePath.AddArc($strokeRect.X,                  $strokeRect.Bottom - $sr*2,      $sr*2, $sr*2, 90,  90)
$strokePath.CloseFigure()
$g.DrawPath((New-Object System.Drawing.Pen $borderColor, 2), $strokePath)

# Crescent moon: full circle then "bite" with bg color
$moonD = 150
$moonX = [int](($size - $moonD) / 2)
$moonY = [int](($size - $moonD) / 2)
$g.FillEllipse((New-Object System.Drawing.SolidBrush $accentColor), $moonX, $moonY, $moonD, $moonD)

$biteD = 140
$biteOffsetX = 36
$biteOffsetY = -14
$g.FillEllipse((New-Object System.Drawing.SolidBrush $bgColor), ($moonX + $biteOffsetX), ($moonY + $biteOffsetY), $biteD, $biteD)

# Two small star accents in the dark corners (big enough to survive 32x32)
$starColor = [System.Drawing.Color]::FromArgb(180, 214, 207, 184)
$starBrush = New-Object System.Drawing.SolidBrush $starColor
$g.FillEllipse($starBrush, 38, 198, 10, 10)
$g.FillEllipse($starBrush, 206, 50, 8, 8)

$g.Dispose()

# ---- Wrap PNG into ICO (PNG-in-ICO is supported Vista+) ----
$ms  = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()
$ms.Close()
$bmp.Dispose()

if (Test-Path $IconPath) { Remove-Item $IconPath -Force }
$fs = New-Object System.IO.FileStream $IconPath, 'Create'
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([uint16]0)              # Reserved
$bw.Write([uint16]1)              # Type: icon
$bw.Write([uint16]1)              # Count
$bw.Write([byte]0)                # Width 0 = 256
$bw.Write([byte]0)                # Height 0 = 256
$bw.Write([byte]0)                # Palette
$bw.Write([byte]0)                # Reserved
$bw.Write([uint16]1)              # Color planes
$bw.Write([uint16]32)             # Bits per pixel
$bw.Write([uint32]$png.Length)    # Image size
$bw.Write([uint32]22)             # Offset
$bw.Write($png)
$bw.Close()
$fs.Close()

# ---- Build .lnk on Desktop ----
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($LinkPath)
$lnk.TargetPath       = $BatPath
$lnk.WorkingDirectory = $Dir
$lnk.IconLocation     = "$IconPath,0"
$lnk.Description      = 'Dreams reading app - local launcher'
$lnk.WindowStyle      = 7
$lnk.Save()

Write-Host "[ok] Icon written:     $IconPath"
Write-Host "[ok] Shortcut placed:  $LinkPath"
