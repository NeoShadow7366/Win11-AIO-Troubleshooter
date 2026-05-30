use chrono::Local;

use crate::utils::powershell::run_powershell;

/// Generate a full HTML system report
#[tauri::command]
pub async fn generate_system_report() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        // Gather system info via PowerShell
        let sys_script = r#"
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select -First 1
$gpu = Get-CimInstance Win32_VideoController | Select -First 1
$cs = Get-CimInstance Win32_ComputerSystem
$uptime = (Get-Date) - $os.LastBootUpTime
$uptimeStr = "{0}d {1}h {2}m" -f $uptime.Days, $uptime.Hours, $uptime.Minutes
$cpuUsage = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$ramUsed = [math]::Round(($cs.TotalPhysicalMemory - $os.FreePhysicalMemory * 1KB) / 1GB, 2)
$ramTotal = [math]::Round($cs.TotalPhysicalMemory / 1GB, 2)

[PSCustomObject]@{
  Hostname = $cs.Name
  OS = $os.Caption + ' ' + $os.Version
  CPU = $cpu.Name
  GPU = if($gpu) { $gpu.Name } else { 'N/A' }
  Uptime = $uptimeStr
  CpuUsage = $cpuUsage
  RamUsed = $ramUsed
  RamTotal = $ramTotal
} | ConvertTo-Json
"#;
        let sys_info: serde_json::Value = run_powershell(sys_script)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        // Gather disk info
        let disk_script = r#"
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
  [PSCustomObject]@{
    Name = $_.VolumeName
    Mount = $_.DeviceID
    TotalGB = [math]::Round($_.Size / 1GB, 2)
    UsedGB = [math]::Round(($_.Size - $_.FreeSpace) / 1GB, 2)
    Percent = if($_.Size -gt 0) { [math]::Round(($_.Size - $_.FreeSpace) / $_.Size * 100, 1) } else { 0 }
  }
} | ConvertTo-Json
"#;
        let disk_info: Vec<serde_json::Value> = run_powershell(disk_script)
            .ok()
            .and_then(|s| {
                // PowerShell may return object or array
                if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&s) {
                    Some(arr)
                } else if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&s) {
                    Some(vec![obj])
                } else {
                    None
                }
            })
            .unwrap_or_default();

        // Gather BSOD history (last 10)
        let bsod_script = r#"
try {
  Get-WinEvent -FilterHashtable @{LogName='System'; Id=1001; ProviderName='Microsoft-Windows-WER-SystemErrorReporting'} -MaxEvents 10 -ErrorAction Stop | ForEach-Object {
    [PSCustomObject]@{
      Date = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm')
      Code = if($_.Properties[0]) { $_.Properties[0].Value } else { 'Unknown' }
      Desc = $_.Message.Substring(0, [Math]::Min($_.Message.Length, 200))
    }
  } | ConvertTo-Json
} catch { '[]' }
"#;
        let bsod_entries: Vec<serde_json::Value> = run_powershell(bsod_script)
            .ok()
            .and_then(|s| {
                let trimmed = s.trim();
                if trimmed == "[]" || trimmed.is_empty() { return Some(vec![]); }
                if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(trimmed) {
                    Some(arr)
                } else if let Ok(obj) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    Some(vec![obj])
                } else {
                    None
                }
            })
            .unwrap_or_default();

        // Build HTML report
        let hostname = sys_info.get("Hostname").and_then(|v| v.as_str()).unwrap_or("Unknown");
        let os = sys_info.get("OS").and_then(|v| v.as_str()).unwrap_or("Unknown");
        let cpu = sys_info.get("CPU").and_then(|v| v.as_str()).unwrap_or("Unknown");
        let gpu = sys_info.get("GPU").and_then(|v| v.as_str()).unwrap_or("N/A");
        let uptime = sys_info.get("Uptime").and_then(|v| v.as_str()).unwrap_or("Unknown");
        let cpu_usage = sys_info.get("CpuUsage").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let ram_used = sys_info.get("RamUsed").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let ram_total = sys_info.get("RamTotal").and_then(|v| v.as_f64()).unwrap_or(0.0);

        let mut disk_rows = String::new();
        for d in &disk_info {
            let name = d.get("Name").and_then(|v| v.as_str()).unwrap_or("Local Disk");
            let mount = d.get("Mount").and_then(|v| v.as_str()).unwrap_or("?:");
            let total = d.get("TotalGB").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let used = d.get("UsedGB").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let pct = d.get("Percent").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let color = if pct > 90.0 { "#ff4757" } else if pct > 75.0 { "#ffa502" } else { "#2ed573" };
            disk_rows.push_str(&format!(
                r#"<tr><td>{} ({})</td><td>{:.1} GB</td><td>{:.1} GB</td><td><span style="color:{}">{:.1}%</span></td></tr>"#,
                name, mount, used, total, color, pct
            ));
        }

        let mut bsod_rows = String::new();
        for b in &bsod_entries {
            let date = b.get("Date").and_then(|v| v.as_str()).unwrap_or("Unknown");
            let code = b.get("Code").and_then(|v| v.as_str())
                .or_else(|| b.get("Code").and_then(|v| v.as_i64()).map(|_| "N/A"))
                .unwrap_or("N/A");
            let desc = b.get("Desc").and_then(|v| v.as_str()).unwrap_or("");
            bsod_rows.push_str(&format!(
                "<tr><td>{}</td><td><code>{}</code></td><td>{}</td></tr>",
                date, code, desc
            ));
        }

        let bsod_section = if bsod_entries.is_empty() {
            "<p style=\"color:#2ed573\">✅ No BSOD events found — system appears stable.</p>".to_string()
        } else {
            format!(
                r#"<p style="color:#ffa502">⚠️ {} BSOD event(s) found</p>
                <table><thead><tr><th>Date</th><th>Bug Check</th><th>Description</th></tr></thead><tbody>{}</tbody></table>"#,
                bsod_entries.len(), bsod_rows
            )
        };

        let ram_pct = if ram_total > 0.0 { ram_used / ram_total * 100.0 } else { 0.0 };
        let cpu_color = if cpu_usage > 80.0 { "#ff4757" } else if cpu_usage > 50.0 { "#ffa502" } else { "#2ed573" };
        let ram_color = if ram_pct > 85.0 { "#ff4757" } else if ram_pct > 65.0 { "#ffa502" } else { "#2ed573" };

        let html = format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>System Report — {hostname}</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ background: #0a0a14; color: #e0e0e0; font-family: 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif; padding: 40px; line-height: 1.6; }}
  .container {{ max-width: 900px; margin: 0 auto; }}
  h1 {{ color: #60CDFF; font-size: 28px; margin-bottom: 4px; }}
  h2 {{ color: #60CDFF; font-size: 18px; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); }}
  .subtitle {{ color: rgba(255,255,255,0.4); font-size: 13px; margin-bottom: 24px; }}
  .grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }}
  .card {{ background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; }}
  .card-label {{ font-size: 11px; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }}
  .card-value {{ font-size: 18px; font-weight: 600; color: #fff; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
  th {{ text-align: left; font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); }}
  td {{ padding: 8px 12px; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.04); }}
  code {{ background: rgba(96,205,255,0.1); color: #60CDFF; padding: 2px 6px; border-radius: 4px; font-size: 12px; }}
  .footer {{ margin-top: 40px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.2); font-size: 11px; text-align: center; }}
</style>
</head>
<body>
<div class="container">
  <h1>🛡️ System Report</h1>
  <p class="subtitle">Generated {now} · {hostname}</p>

  <h2>System Information</h2>
  <div class="grid">
    <div class="card"><div class="card-label">Operating System</div><div class="card-value">{os}</div></div>
    <div class="card"><div class="card-label">Hostname</div><div class="card-value">{hostname}</div></div>
    <div class="card"><div class="card-label">Processor</div><div class="card-value" style="font-size:14px">{cpu}</div></div>
    <div class="card"><div class="card-label">GPU</div><div class="card-value" style="font-size:14px">{gpu}</div></div>
    <div class="card"><div class="card-label">Uptime</div><div class="card-value">{uptime}</div></div>
    <div class="card"><div class="card-label">CPU Usage</div><div class="card-value" style="color:{cpu_color}">{cpu_usage:.1}%</div></div>
    <div class="card"><div class="card-label">RAM Usage</div><div class="card-value" style="color:{ram_color}">{ram_used:.1} / {ram_total:.1} GB ({ram_pct:.1}%)</div></div>
  </div>

  <h2>Storage</h2>
  <table>
    <thead><tr><th>Drive</th><th>Used</th><th>Total</th><th>Usage</th></tr></thead>
    <tbody>{disk_rows}</tbody>
  </table>

  <h2>Blue Screen (BSOD) History</h2>
  {bsod_section}

  <div class="footer">Generated by AIO Troubleshooter v2.2.0</div>
</div>
</body>
</html>"#,
            hostname = hostname,
            now = now,
            os = os,
            cpu = cpu,
            gpu = gpu,
            uptime = uptime,
            cpu_usage = cpu_usage,
            cpu_color = cpu_color,
            ram_used = ram_used,
            ram_total = ram_total,
            ram_pct = ram_pct,
            ram_color = ram_color,
            disk_rows = disk_rows,
            bsod_section = bsod_section,
        );

        Ok(html)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
