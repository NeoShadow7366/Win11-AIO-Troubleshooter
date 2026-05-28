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

/// Compute the system health score by checking multiple factors in a SINGLE
/// PowerShell invocation. Each factor is scored independently and averaged.
#[tauri::command]
pub async fn get_health_score() -> Result<SystemHealthScore, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
$result = @{}

# 1. Disk Space
try {
    $d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction Stop | Select-Object FreeSpace, Size
    $result['disk_free'] = $d.FreeSpace
    $result['disk_total'] = $d.Size
} catch {
    $result['disk_free'] = -1
    $result['disk_total'] = -1
}

# 2. Memory
try {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    $result['mem_free_kb'] = $os.FreePhysicalMemory
    $result['mem_total_kb'] = $os.TotalVisibleMemorySize
} catch {
    $result['mem_free_kb'] = -1
    $result['mem_total_kb'] = -1
}

# 3. Pending Updates
try {
    $sess = New-Object -ComObject Microsoft.Update.Session
    $search = $sess.CreateUpdateSearcher()
    $ur = $search.Search('IsInstalled=0 AND IsHidden=0')
    $result['pending_updates'] = $ur.Updates.Count
} catch {
    $result['pending_updates'] = -1
}

# 4. Startup Load
try {
    $result['startup_count'] = (Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue | Measure-Object).Count
} catch {
    $result['startup_count'] = -1
}

# 5. Uptime
try {
    $result['uptime_hours'] = [math]::Round(((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalHours, 1)
} catch {
    $result['uptime_hours'] = -1
}

# 6. Recent Errors
try {
    $result['error_count'] = (Get-WinEvent -FilterHashtable @{LogName='System'; Level=@(1,2); StartTime=(Get-Date).AddDays(-7)} -MaxEvents 100 -ErrorAction SilentlyContinue | Measure-Object).Count
} catch {
    $result['error_count'] = 0
}

# 7. Disk Health
try {
    $statuses = @(Get-PhysicalDisk -ErrorAction SilentlyContinue | Select-Object -ExpandProperty HealthStatus)
    $result['disk_health_total'] = $statuses.Count
    $result['disk_health_unhealthy'] = ($statuses | Where-Object { $_.ToLower() -ne 'healthy' }).Count
} catch {
    $result['disk_health_total'] = -1
    $result['disk_health_unhealthy'] = 0
}

# 8. Security (Defender)
try {
    $s = Get-MpComputerStatus -ErrorAction Stop
    $result['av_enabled'] = [bool]$s.AntivirusEnabled
    $result['rtp_enabled'] = [bool]$s.RealTimeProtectionEnabled
    $result['sig_age'] = [int]$s.AntivirusSignatureAge
} catch {
    $result['av_enabled'] = $null
    $result['rtp_enabled'] = $null
    $result['sig_age'] = $null
}

$result | ConvertTo-Json -Depth 3 -Compress
"#;

        let output = run_powershell(script).unwrap_or_default();
        let data: serde_json::Value = serde_json::from_str(output.trim()).unwrap_or_default();

        let mut categories: Vec<HealthCategory> = Vec::with_capacity(8);

        // 1. Disk Space
        categories.push(parse_disk_space(&data));
        // 2. Memory
        categories.push(parse_memory(&data));
        // 3. Pending Updates
        categories.push(parse_pending_updates(&data));
        // 4. Startup Load
        categories.push(parse_startup_load(&data));
        // 5. Uptime
        categories.push(parse_uptime(&data));
        // 6. Recent Errors
        categories.push(parse_recent_errors(&data));
        // 7. Disk Health
        categories.push(parse_disk_health(&data));
        // 8. Security
        categories.push(parse_security(&data));

        // Compute overall score as average
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

// ─── Parsers for each category from the combined JSON result ───

fn parse_disk_space(data: &serde_json::Value) -> HealthCategory {
    let free = data["disk_free"].as_f64().unwrap_or(-1.0);
    let total = data["disk_total"].as_f64().unwrap_or(-1.0);

    if free < 0.0 || total <= 0.0 {
        return fallback_category("Disk Space", "HardDrive");
    }

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
}

fn parse_memory(data: &serde_json::Value) -> HealthCategory {
    let free_kb = data["mem_free_kb"].as_f64().unwrap_or(-1.0);
    let total_kb = data["mem_total_kb"].as_f64().unwrap_or(-1.0);

    if free_kb < 0.0 || total_kb <= 0.0 {
        return fallback_category("Memory", "MemoryStick");
    }

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
}

fn parse_pending_updates(data: &serde_json::Value) -> HealthCategory {
    let count = data["pending_updates"].as_i64().unwrap_or(-1) as i32;

    if count < 0 {
        return HealthCategory {
            name: "Windows Updates".to_string(),
            score: 80,
            icon: "RefreshCw".to_string(),
            status: "good".to_string(),
            detail: "Could not check update status".to_string(),
            action: None,
        };
    }

    if count == 0 {
        return HealthCategory {
            name: "Windows Updates".to_string(),
            score: 100,
            icon: "RefreshCw".to_string(),
            status: "good".to_string(),
            detail: "System is up to date".to_string(),
            action: None,
        };
    }

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

fn parse_startup_load(data: &serde_json::Value) -> HealthCategory {
    let count = data["startup_count"].as_i64().unwrap_or(-1);
    if count < 0 {
        return fallback_category("Startup Load", "Rocket");
    }
    let count = count as u32;

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

fn parse_uptime(data: &serde_json::Value) -> HealthCategory {
    let hours = data["uptime_hours"].as_f64().unwrap_or(-1.0);
    if hours < 0.0 {
        return fallback_category("System Uptime", "Clock");
    }

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

fn parse_recent_errors(data: &serde_json::Value) -> HealthCategory {
    let count = data["error_count"].as_i64().unwrap_or(0) as u32;

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

fn parse_disk_health(data: &serde_json::Value) -> HealthCategory {
    let total = data["disk_health_total"].as_i64().unwrap_or(-1);
    if total <= 0 {
        return fallback_category("Disk Health", "HardDrive");
    }
    let total = total as u32;
    let unhealthy = data["disk_health_unhealthy"].as_i64().unwrap_or(0) as u32;

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

fn parse_security(data: &serde_json::Value) -> HealthCategory {
    // If av_enabled is null, the check failed
    if data["av_enabled"].is_null() {
        return fallback_category("Security", "Shield");
    }

    let av_enabled = data["av_enabled"].as_bool().unwrap_or(false);
    let rtp_enabled = data["rtp_enabled"].as_bool().unwrap_or(false);
    let sig_age = data["sig_age"].as_u64().unwrap_or(999) as u32;

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
