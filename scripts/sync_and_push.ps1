# PowerShell Automation Script: Auto-sync and push to GitHub for automatic Vercel deployment
param(
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor DarkYellow
Write-Host " [RV64-Doc] Synchronizing Documentation to Git for Vercel" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor DarkYellow

# Verify Git is available
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git is not installed or not in PATH."
    exit 1
}

# Check git status
$status = git status --porcelain
if (-not $status) {
    Write-Host "`n✓ No unstaged changes detected. Working tree is clean." -ForegroundColor Green
    
    # Try pushing unpushed commits if any
    Write-Host "Checking for unpushed commits..." -ForegroundColor Cyan
    git push origin main 2>&1
    Write-Host "✓ Remote is fully up to date." -ForegroundColor Green
    exit 0
}

# Determine commit message
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
if (-not $Message) {
    $Message = "docs: update RV64 project documentation ($timestamp)"
}

Write-Host "`n1. Staging files..." -ForegroundColor Cyan
git add -A

Write-Host "2. Committing changes: '$Message'..." -ForegroundColor Cyan
git commit -m "$Message"

# Check current branch
$currentBranch = (git branch --show-current).Trim()
if (-not $currentBranch) {
    $currentBranch = "main"
}

Write-Host "3. Pushing to origin $currentBranch..." -ForegroundColor Cyan
try {
    git push -u origin $currentBranch
    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host "✓ SUCCESS: Changes pushed to GitHub origin/$currentBranch!" -ForegroundColor Green
    Write-Host "⚡ Vercel will automatically detect this push and redeploy within 15-30 seconds." -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green
} catch {
    Write-Host "`n! Push encountered an issue: $_" -ForegroundColor Red
    Write-Host "Ensure your GitHub credentials or SSH keys are configured, or check repository permissions." -ForegroundColor Yellow
    exit 1
}
