use serde::Serialize;

use crate::utils::powershell::run_powershell;

/// Individual health category score
#[derive(Debug, Serialize, Clone)]
pub struct HealthCategory {
    pub name: String,
    pub score: u32,        // 0–100
    pub icon: String,      // Lucide icon name for frontend
    pub status: String,    // "good", "warning", "critical"
    pub detail: String,    // Human-readable explanation
    pub action: Option<String>, // Recommended action if score is low
}

/// Aggregate system health score
#[derive(Debug, Serialize, Clone)]
pub struct SystemHealthScore {
    pub overall_score: u32,
    pub overall_status: String, // "excellent", "good", "fair", "poor"
    pub categories: Vec<HealthCategory>,
}

/// Compute the system health score by checking multiple factors.
/// Each factor is scored independently and averaged into an overall score.
#[tauri::command]
pub async fn get_health_score() -> Result<SystemHealthScore, String> {
    tokio::task::spawn_blocking(|| {
        let categories: Vec<HealthCategory> = vec![
            check_disk_space(),
            check_memory(),
            check_pending_updates(),
            check_startup_load(),
            check_uptime(),
            check_recent_errors(),
            check_disk_health(),
            check_security(),
        ];

        // Compute overall score as weighted average
        let total: u32 = categories.iter().map(|c| c.score).sum();
        let overall_score = total / categories.len().max(1) as u32;

        let overall_status = match overall_score {
            90..=100 => "excellent",
            70..=89 => "good",
            50..=69 => "fair",
            _ => "poor",
        }
        .to_string();

        Ok(SystemHealthScore {
            overall_score,
            overall_status,
            categories,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Check free disk space on the system drive
fn check_disk_space() -> HealthCategory {
    let result = run_powershell(
        r#"$d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object FreeSpace, Size; "$($d.FreeSpace)|$($d.Size)""#,
    );

    match result {
        Ok(output) => {
            let parts: Vec<&str> = output.trim().split('|').collect();
            if parts.len() == 2 {
                let free: f64 = parts[0].parse().unwrap_or(0.0);
                let total: f64 = parts[1].parse().unwrap_or(1.0);
                let free_gb = free / 1_073_741_824.0;
                let pct_free = (free / total * 100.0) as u32;

                let (score, status, detail, action) = if pct_free >= 25 {
                    (100, "good", format!("{:.1} GB free ({pct_free}%)", free_gb), None)
                } else if pct_free >= 15 {
                    (75, "good", format!("{:.1} GB free ({pct_free}%)", free_gb), None)
                } else if pct_free >= 10 {
                    (50, "warning", format!("Only {:.1} GB free ({pct_free}%)", free_gb),
                     Some("Run Disk Cleanup or Clear Temp Files".to_string()))
                } else {
                    (20, "critical", format!("Critical: {:.1} GB free ({pct_free}%)", free_gb),
                     Some("Urgently free disk space via Quick Tools → Performance".to_string()))
                };

                HealthCategory {
                    name: "Disk Space".to_string(),
                    score,
                    icon: "HardDrive".to_string(),
                    status: status.to_string(),
                    detail,
                    action,
                }
            } else {
                fallback_category("Disk Space", "HardDrive")
            }
        }
        Err(_) => fallback_category("Disk Space", "HardDrive"),
    }
}

/// Check RAM usage
fn check_memory() -> HealthCategory {
    let result = run_powershell(
        r#"$os = Get-CimInstance Win32_OperatingSystem; "$($os.FreePhysicalMemory)|$($os.TotalVisibleMemorySize)""#,
    );

    match result {
        Ok(output) => {
            let parts: Vec<&str> = output.trim().split('|').collect();
            if parts.len() == 2 {
                // Values are in KB
                let free_kb: f64 = parts[0].parse().unwrap_or(0.0);
                let total_kb: f64 = parts[1].parse().unwrap_or(1.0);
                let used_pct = ((1.0 - free_kb / total_kb) * 100.0) as u32;
                let free_gb = free_kb / 1_048_576.0;

                let (score, status, detail, action) = if used_pct <= 60 {
                    (100, "good", format!("{:.1} GB available ({used_pct}% used)", free_gb), None)
                } else if used_pct <= 80 {
                    (70, "good", format!("{:.1} GB available ({used_pct}% used)", free_gb), None)
                } else if used_pct <= 90 {
                    (40, "warning", format!("Memory pressure: {used_pct}% used"),
                     Some("Close unused applications to free memory".to_string()))
                } else {
                    (15, "critical", format!("Critical memory usage: {used_pct}%"),
                     Some("Close apps or check Process Manager for memory hogs".to_string()))
                };

                HealthCategory {
                    name: "Memory".to_string(),
                    score,
                    icon: "MemoryStick".to_string(),
                    status: status.to_string(),
                    detail,
                    action,
                }
            } else {
                fallback_category("Memory", "MemoryStick")
            }
        }
        Err(_) => fallback_category("Memory", "MemoryStick"),
    }
}

/// Check pending Windows Updates
fn check_pending_updates() -> HealthCategory {
    let result = run_powershell(
        r#"try { $sess = New-Object -ComObject Microsoft.Update.Session; $search = $sess.CreateUpdateSearcher(); $result = $search.Search('IsInstalled=0 AND IsHidden=0'); $result.Updates.Count } catch { -1 }"#,
    );

    match result {
        Ok(output) => {
            let count: i32 = output.trim().parse().unwrap_or(-1);
            if count < 0 {
                HealthCategory {
                    name: "Windows Updates".to_string(),
                    score: 80,
                    icon: "RefreshCw".to_string(),
                    status: "good".to_string(),
                    detail: "Could not check update status".to_string(),
                    action: None,
                }
            } else if count == 0 {
                HealthCategory {
                    name: "Windows Updates".to_string(),
                    score: 100,
                    icon: "RefreshCw".to_string(),
                    status: "good".to_string(),
                    detail: "System is up to date".to_string(),
                    action: None,
                }
            } else {
                let score = if count <= 2 { 70 } else if count <= 5 { 50 } else { 30 };
                HealthCategory {
                    name: "Windows Updates".to_string(),
                    score,
                    icon: "RefreshCw".to_string(),
                    status: if count <= 2 { "warning" } else { "critical" }.to_string(),
                    detail: format!("{} update{} pending", count, if count == 1 { "" } else { "s" }),
                    action: Some("Install pending updates via Settings → Windows Update".to_string()),
                }
            }
        }
        Err(_) => fallback_category("Windows Updates", "RefreshCw"),
    }
}

/// Check number of startup programs
fn check_startup_load() -> HealthCategory {
    let result = run_powershell(
        r#"(Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue | Measure-Object).Count"#,
    );

    match result {
        Ok(output) => {
            let count: u32 = output.trim().parse().unwrap_or(0);
            let (score, status, detail, action) = if count <= 5 {
                (100, "good", format!("{count} startup items — lean boot"), None)
            } else if count <= 10 {
                (80, "good", format!("{count} startup items"), None)
            } else if count <= 20 {
                (55, "warning", format!("{count} startup items — may slow boot"),
                 Some("Review Startup Manager to disable unnecessary items".to_string()))
            } else {
                (30, "critical", format!("{count} startup items — likely slowing boot"),
                 Some("Use Startup Manager to disable unnecessary programs".to_string()))
            };

            HealthCategory {
                name: "Startup Load".to_string(),
                score,
                icon: "Rocket".to_string(),
                status: status.to_string(),
                detail,
                action,
            }
        }
        Err(_) => fallback_category("Startup Load", "Rocket"),
    }
}

/// Check system uptime (very long uptime = should reboot)
fn check_uptime() -> HealthCategory {
    let result = run_powershell(
        r#"[math]::Round(((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalHours, 1)"#,
    );

    match result {
        Ok(output) => {
            let hours: f64 = output.trim().parse().unwrap_or(0.0);
            let days = (hours / 24.0) as u32;

            let (score, status, detail, action) = if hours < 72.0 {
                (100, "good", format!("Last reboot: {:.0}h ago", hours), None)
            } else if hours < 168.0 {
                (80, "good", format!("Uptime: {days} days"), None)
            } else if hours < 336.0 {
                (50, "warning", format!("Uptime: {days} days — consider rebooting"),
                 Some("Restart your PC to apply updates and clear stale state".to_string()))
            } else {
                (25, "critical", format!("Uptime: {days} days — reboot recommended"),
                 Some("Long uptime can cause memory leaks and instability".to_string()))
            };

            HealthCategory {
                name: "System Uptime".to_string(),
                score,
                icon: "Clock".to_string(),
                status: status.to_string(),
                detail,
                action,
            }
        }
        Err(_) => fallback_category("System Uptime", "Clock"),
    }
}

/// Check for recent critical/error events in System log
fn check_recent_errors() -> HealthCategory {
    let result = run_powershell(
        r#"(Get-WinEvent -FilterHashtable @{LogName='System'; Level=@(1,2); StartTime=(Get-Date).AddDays(-7)} -MaxEvents 100 -ErrorAction SilentlyContinue | Measure-Object).Count"#,
    );

    match result {
        Ok(output) => {
            let count: u32 = output.trim().parse().unwrap_or(0);
            let (score, status, detail, action) = if count == 0 {
                (100, "good", "No critical errors in 7 days".to_string(), None)
            } else if count <= 5 {
                (80, "good", format!("{count} error{} in 7 days", if count == 1 { "" } else { "s" }), None)
            } else if count <= 20 {
                (55, "warning", format!("{count} errors in 7 days"),
                 Some("Check Event Viewer for recurring issues".to_string()))
            } else {
                (25, "critical", format!("{count} errors in 7 days — investigate"),
                 Some("Review Event Viewer → System log for recurring errors".to_string()))
            };

            HealthCategory {
                name: "Error Log".to_string(),
                score,
                icon: "AlertTriangle".to_string(),
                status: status.to_string(),
                detail,
                action,
            }
        }
        Err(_) => fallback_category("Error Log", "AlertTriangle"),
    }
}

/// Check physical disk health via S.M.A.R.T.
fn check_disk_health() -> HealthCategory {
    let result = run_powershell(
        r#"Get-PhysicalDisk -ErrorAction SilentlyContinue | Select-Object -ExpandProperty HealthStatus"#,
    );

    match result {
        Ok(output) => {
            let statuses: Vec<&str> = output.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
            let unhealthy = statuses.iter().filter(|s| s.to_lowercase() != "healthy").count();
            let total = statuses.len();

            if total == 0 {
                return fallback_category("Disk Health", "HardDrive");
            }

            let (score, status, detail, action) = if unhealthy == 0 {
                (100, "good", format!("All {total} disk{} healthy", if total == 1 { "" } else { "s" }), None)
            } else {
                (20, "critical",
                 format!("{unhealthy} of {total} disk{} reporting issues", if total == 1 { "" } else { "s" }),
                 Some("Check Hardware Health for S.M.A.R.T. details — backup data immediately".to_string()))
            };

            HealthCategory {
                name: "Disk Health".to_string(),
                score,
                icon: "HardDrive".to_string(),
                status: status.to_string(),
                detail,
                action,
            }
        }
        Err(_) => fallback_category("Disk Health", "HardDrive"),
    }
}

/// Check Windows Defender status
fn check_security() -> HealthCategory {
    let result = run_powershell(
        r#"try { $s = Get-MpComputerStatus -ErrorAction Stop; "$($s.AntivirusEnabled)|$($s.RealTimeProtectionEnabled)|$($s.AntivirusSignatureAge)" } catch { "err" }"#,
    );

    match result {
        Ok(output) => {
            let trimmed = output.trim();
            if trimmed == "err" {
                return fallback_category("Security", "Shield");
            }

            let parts: Vec<&str> = trimmed.split('|').collect();
            if parts.len() != 3 {
                return fallback_category("Security", "Shield");
            }

            let av_enabled = parts[0].to_lowercase() == "true";
            let rtp_enabled = parts[1].to_lowercase() == "true";
            let sig_age: u32 = parts[2].parse().unwrap_or(999);

            let mut score = 100u32;
            let mut issues: Vec<&str> = Vec::new();

            if !av_enabled {
                score -= 40;
                issues.push("antivirus disabled");
            }
            if !rtp_enabled {
                score -= 30;
                issues.push("real-time protection off");
            }
            if sig_age > 7 {
                score -= 20;
                issues.push("definitions outdated");
            } else if sig_age > 3 {
                score -= 10;
            }

            let (status, detail, action) = if score >= 90 {
                ("good", "Defender active and up to date".to_string(), None)
            } else if score >= 60 {
                ("warning",
                 format!("Issues: {}", issues.join(", ")),
                 Some("Update Defender definitions and ensure real-time protection is on".to_string()))
            } else {
                ("critical",
                 format!("Security risk: {}", issues.join(", ")),
                 Some("Enable Windows Defender immediately via Windows Security".to_string()))
            };

            HealthCategory {
                name: "Security".to_string(),
                score,
                icon: "Shield".to_string(),
                status: status.to_string(),
                detail,
                action,
            }
        }
        Err(_) => fallback_category("Security", "Shield"),
    }
}

/// Fallback when a check fails — don't penalize the score
fn fallback_category(name: &str, icon: &str) -> HealthCategory {
    HealthCategory {
        name: name.to_string(),
        score: 80,
        icon: icon.to_string(),
        status: "good".to_string(),
        detail: "Unable to check — skipped".to_string(),
        action: None,
    }
}
