<#
.SYNOPSIS
  一键启动 DS 展示站开发环境（后端 + 前端）。
.DESCRIPTION
  自动：
  1. 用 uv 准备后端虚拟环境并安装依赖（无 uv 时退回系统 python --user）
  2. 确保 frontend/.env 写入 VITE_USE_MOCK=false
  3. 若前端未安装依赖则 npm install
  4. 清理 5173/5174 残留前端进程，启动后端 uvicorn 和前端 vite
.PARAMETER SkipInstall
  跳过依赖安装，仅启动。
.PARAMETER NoBrowser
  启动后不自动打开浏览器。
.EXAMPLE
  ./start-dev.ps1
  ./start-dev.ps1 -SkipInstall
#>
param(
  [switch]$SkipInstall,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$WebRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $WebRoot "backend"
$Frontend = Join-Path $WebRoot "frontend"
$BackendPython = Join-Path $Backend ".venv\Scripts\python.exe"
$BackendRequirements = Join-Path $Backend "requirements.txt"

if (-not (Test-Path $Backend)) { throw "找不到后端目录: $Backend" }
if (-not (Test-Path $Frontend)) { throw "找不到前端目录: $Frontend" }

# 清理指定端口上的残留 node 进程（防止旧 Vite 占住 5173 导致新服务起在 5174）
function Stop-NodeOnPort([int]$Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conn) {
    $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'node') {
      Write-Host "  关闭残留 node 进程 PID $($p.Id)（端口 $Port）..." -ForegroundColor Yellow
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

# ---------- 1. 后端依赖 ----------
# 预检（自愈）：venv 的**解释器必须能真正 import 依赖**。
# 为什么需要这一步：`uv venv --python <版本>` 会在本机没有该版本时**自动下载**
# 一个托管解释器并装对应 ABI 的编译扩展（如 cp314 的 _pydantic_core.*.pyd）。
# 若之后 venv 又被另一个解释器（如 python -m venv，3.12）覆盖重建，
# site-packages 里的旧 ABI 二进制会**原地残留**，症状是启动即崩、且报错极具误导性：
#   ModuleNotFoundError: No module named 'pydantic_core._pydantic_core'
# （包目录在、只有里面的 .pyd 与解释器版本不匹配。）
# 这里发现不匹配就整目录重建 + 重装一次，避免"能装不能跑"。
function Test-BackendDeps {
  param([string]$Python)
  if (-not (Test-Path $Python)) { return $false }
  & $Python -c "import pydantic_core, fastapi, sqlalchemy" 2>$null
  return ($LASTEXITCODE -eq 0)
}

if (-not $SkipInstall) {
  if ((Test-Path $BackendPython) -and -not (Test-BackendDeps $BackendPython)) {
    Write-Host "[1/4] 检测到 venv 依赖不可用（常见于 venv 被跨 Python 版本重建、残留旧 ABI 的 .pyd）——重建 ..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force (Join-Path $Backend ".venv") -ErrorAction SilentlyContinue
  }
  if (-not (Test-Path $BackendPython)) {
    Write-Host "[1/4] 创建后端虚拟环境并安装依赖 ..." -ForegroundColor Cyan
    if (Get-Command uv -ErrorAction SilentlyContinue) {
      Push-Location $Backend
      try {
        # 不写死 --python 3.14：本机没装时 uv 会静默下载一个，随后极易与系统解释器混用。
        # 交给 uv 选默认解释器（与随后的安装保持一致），版本一致性由上面的预检兜底。
        uv venv .venv
        uv pip install --python .venv\Scripts\python.exe -r requirements.txt
      } finally {
        Pop-Location
      }
    } else {
      Write-Host "未检测到 uv，改用系统 Python 安装（--user）..." -ForegroundColor Yellow
      Push-Location $Backend
      try {
        python -m pip install --user -r requirements.txt
      } finally {
        Pop-Location
      }
      $BackendPython = "python"
    }
  } else {
    Write-Host "[1/4] 后端虚拟环境已存在，同步依赖 ..." -ForegroundColor Cyan
    if (Get-Command uv -ErrorAction SilentlyContinue) {
      Push-Location $Backend
      try {
        uv pip install --python .venv\Scripts\python.exe -r requirements.txt
      } finally {
        Pop-Location
      }
    } else {
      Write-Host "已存在 .venv 但未检测到 uv，跳过依赖同步（如缺包请手动安装）。" -ForegroundColor Yellow
    }
  }
} else {
  Write-Host "[1/4] 跳过依赖安装 (-SkipInstall)" -ForegroundColor DarkGray
}

# ---------- 2. 前端真实后端开关 ----------
$EnvFile = Join-Path $Frontend ".env"
if (-not (Test-Path $EnvFile)) {
  New-Item -ItemType File -Path $EnvFile -Force | Out-Null
}
$envText = Get-Content $EnvFile -Raw -ErrorAction SilentlyContinue
if ($envText -match '(?m)^\uFEFF?VITE_USE_MOCK=') {
  $envText = $envText -replace '(?m)^\uFEFF?VITE_USE_MOCK=.*$', 'VITE_USE_MOCK=false'
} else {
  $envText = $envText.TrimEnd("`r", "`n") + "`nVITE_USE_MOCK=false`n"
}
[System.IO.File]::WriteAllText($EnvFile, $envText, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "[2/4] frontend/.env 已确保 VITE_USE_MOCK=false" -ForegroundColor Cyan

# ---------- 3. 前端依赖 ----------
if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
  Write-Host "[3/4] 安装前端依赖 npm install ..." -ForegroundColor Cyan
  Push-Location $Frontend
  try {
    npm install
  } finally {
    Pop-Location
  }
} else {
  Write-Host "[3/4] 前端依赖已存在，跳过 npm install" -ForegroundColor DarkGray
}

# ---------- 4. 启动服务 ----------
Write-Host "[4/4] 启动服务 ..." -ForegroundColor Cyan

# 4.1 后端：若 8000 已在运行则跳过，否则启动
$backendRunning = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
$backendProc = $null
if ($backendRunning) {
  Write-Host "后端 8000 已在运行，跳过启动。" -ForegroundColor Green
} else {
  $backendProc = Start-Process -FilePath $BackendPython `
    -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload") `
    -WorkingDirectory $Backend -PassThru
}

# 4.2 前端：先清残留 node 进程，再启动
Stop-NodeOnPort 5173
Stop-NodeOnPort 5174
Start-Sleep -Milliseconds 500
$npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source
$frontendProc = Start-Process -FilePath $npmCmd `
  -ArgumentList @("run", "dev") `
  -WorkingDirectory $Frontend -PassThru

Write-Host ""
if ($backendProc) {
  Write-Host "后端  http://127.0.0.1:8000  (PID $($backendProc.Id))" -ForegroundColor Green
} else {
  Write-Host "后端  http://127.0.0.1:8000  (已存在的服务)" -ForegroundColor Green
}
Write-Host "前端  http://localhost:5173       (PID $($frontendProc.Id))" -ForegroundColor Green
Write-Host "API   http://localhost:5173/api/v1 (经 Vite 代理到 8000)" -ForegroundColor Green
Write-Host "默认管理员: admin / admin123" -ForegroundColor Yellow
Write-Host "提示: 后端/前端运行在独立窗口，关闭对应窗口即停止服务。" -ForegroundColor DarkGray

if (-not $NoBrowser) {
  Start-Sleep -Seconds 3
  Start-Process "http://localhost:5173"
}