Add-Type -AssemblyName System.Drawing

$Dir       = $PSScriptRoot
$IconPath  = Join-Path $Dir 'folio.ico'
$BatPath   = Join-Path $Dir 'Folio.bat'
$LinkName  = 'Folio.lnk'
$LinkPath  = Join-Path ([Environment]::GetFolderPath('Desktop')) $LinkName
$OldLink   = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Dreams.lnk'

# ---- Draw 256x256 icon ----
$size = 256
$bmp  = New-Object System.Drawing.Bitmap $size, $size
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode    = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'

# Palette (ARGB)
$bgColor     = [System.Drawing.Color]::FromArgb(255, 19, 19, 22)
$accentColor = [System.Drawing.Color]::FromArgb(255, 214, 207, 184)
$borderColor = [System.Drawing.Color]::FromArgb(90,  214, 207, 184)
$faintColor  = [System.Drawing.Color]::FromArgb(70,  214, 207, 184)

# Rounded-square background
$bgRect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
$bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 44
$bgPath.AddArc($bgRect.X,            $bgRect.Y,             $r*2, $r*2, 180, 90)
$bgPath.AddArc($bgRect.Right - $r*2, $bgRect.Y,             $r*2, $r*2, 270, 90)
$bgPath.AddArc($bgRect.Right - $r*2, $bgRect.Bottom - $r*2, $r*2, $r*2, 0,   90)
$bgPath.AddArc($bgRect.X,            $bgRect.Bottom - $r*2, $r*2, $r*2, 90,  90)
$bgPath.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush $bgColor), $bgPath)

# Subtle inner stroke
$strokeRect = New-Object System.Drawing.Rectangle 5, 5, ($size - 10), ($size - 10)
$strokePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$sr = 40
$strokePath.AddArc($strokeRect.X,             $strokeRect.Y,             $sr*2, $sr*2, 180, 90)
$strokePath.AddArc($strokeRect.Right - $sr*2, $strokeRect.Y,             $sr*2, $sr*2, 270, 90)
$strokePath.AddArc($strokeRect.Right - $sr*2, $strokeRect.Bottom - $sr*2, $sr*2, $sr*2, 0,   90)
$strokePath.AddArc($strokeRect.X,             $strokeRect.Bottom - $sr*2, $sr*2, $sr*2, 90,  90)
$strokePath.CloseFigure()
$g.DrawPath((New-Object System.Drawing.Pen $borderColor, 2), $strokePath)

# Three stacked "pages" behind the F to evoke a stack of folio leaves
$g.FillRectangle((New-Object System.Drawing.SolidBrush $faintColor), 68, 196, 120, 4)
$g.FillRectangle((New-Object System.Drawing.SolidBrush $faintColor), 76, 206, 104, 4)
$g.FillRectangle((New-Object System.Drawing.SolidBrush $faintColor), 86, 216, 84,  4)

# Italic serif "F"
try {
    $family = New-Object System.Drawing.FontFamily 'Georgia'
} catch {
    $family = [System.Drawing.FontFamily]::GenericSerif
}
$font   = New-Object System.Drawing.Font $family, 200, ([System.Drawing.FontStyle]::Italic), ([System.Drawing.GraphicsUnit]::Pixel)
$brush  = New-Object System.Drawing.SolidBrush $accentColor
$format = New-Object System.Drawing.StringFormat
$format.Alignment     = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$textRect = New-Object System.Drawing.RectangleF 0, -10, $size, $size
$g.DrawString('F', $font, $brush, $textRect, $format)
$font.Dispose()
$family.Dispose()

$g.Dispose()

# ---- Wrap PNG into ICO ----
$ms  = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()
$ms.Close()
$bmp.Dispose()

if (Test-Path $IconPath) { Remove-Item $IconPath -Force }
$fs = New-Object System.IO.FileStream $IconPath, 'Create'
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]1)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([uint16]1)
$bw.Write([uint16]32)
$bw.Write([uint32]$png.Length)
$bw.Write([uint32]22)
$bw.Write($png)
$bw.Close()
$fs.Close()

# ---- Tidy up the old Dreams shortcut if present ----
if (Test-Path $OldLink) {
    Remove-Item $OldLink -Force
    Write-Host "[ok] Removed old shortcut: $OldLink"
}

# ---- Build new .lnk on Desktop ----
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($LinkPath)
$lnk.TargetPath       = $BatPath
$lnk.WorkingDirectory = $Dir
$lnk.IconLocation     = "$IconPath,0"
$lnk.Description      = 'Folio reading app - local launcher'
$lnk.WindowStyle      = 7
$lnk.Save()

Write-Host "[ok] Icon written:     $IconPath"
Write-Host "[ok] Shortcut placed:  $LinkPath"
