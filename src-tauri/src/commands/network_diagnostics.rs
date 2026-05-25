use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use super::cli_tools::CliOutput;
use crate::utils::powershell::{run_powershell, run_powershell_json};

// ─── Public Structs ───

#[derive(Debug, Serialize, Clone, Deserialize)]
pub struct NetworkConnection {
    #[serde(alias = "LocalAddress", default)]
    pub local_address: String,
    #[serde(alias = "LocalPort", default)]
    pub local_port: u16,
    #[serde(alias = "RemoteAddress", default)]
    pub remote_address: String,
    #[serde(alias = "RemotePort", default)]
    pub remote_port: u16,
    #[serde(alias = "State", default)]
    pub state: String,
    #[serde(alias = "OwningProcess", default)]
    pub process_id: u32,
    #[serde(alias = "ProcessName", default)]
    pub process_name: Option<String>,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
pub struct DnsRecord {
    #[serde(alias = "Name", default)]
    pub name: String,
    #[serde(alias = "Type", default)]
    pub record_type: Option<u32>,
    #[serde(alias = "Data", default)]
    pub data: Option<String>,
    #[serde(alias = "TTL", default)]
    pub ttl: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DnsLookupResult {
    pub records: Vec<DnsRecord>,
    pub query: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct WifiInfo {
    pub connected: bool,
    pub ssid: Option<String>,
    pub signal_strength: Option<u32>,
    pub channel: Option<u32>,
    pub band: Option<String>,
    pub auth_type: Option<String>,
    pub bssid: Option<String>,
    pub radio_type: Option<String>,
    pub receive_rate_mbps: Option<f64>,
    pub transmit_rate_mbps: Option<f64>,
    pub raw_interface: String,
}

// ─── Commands ───

/// Get active TCP connections with process names.
#[tauri::command]
pub async fn get_active_connections() -> Result<Vec<NetworkConnection>, String> {
    tokio::task::spawn_blocking(|| {
        let connections: Vec<NetworkConnection> = run_powershell_json(
            r#"@(Get-NetTCPConnection -ErrorAction SilentlyContinue |
                Where-Object { $_.State -ne 'Bound' } |
                Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess,
                    @{N='ProcessName';E={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}} |
                Sort-Object State, ProcessName) | ConvertTo-Json -Depth 3"#,
        )
        .unwrap_or_default();

        Ok(connections)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Ping a host with streaming output.
#[tauri::command]
pub async fn ping_host(
    host: String,
    count: u32,
    on_output: tauri::ipc::Channel<CliOutput>,
) -> Result<(), String> {
    // Validate host to prevent command injection
    if host.contains('&') || host.contains('|') || host.contains(';') || host.contains('`') {
        return Err("Invalid host".to_string());
    }

    let count = count.min(100); // Cap at 100 pings

    let mut child = Command::new("ping")
        .args(["-n", &count.to_string(), &host])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("Failed to start ping: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let on_out = on_output.clone();
    let on_err = on_output.clone();

    let stdout_handle = tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = on_out.send(CliOutput::Stdout { line });
        }
    });

    let stderr_handle = tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = on_err.send(CliOutput::Stderr { line });
        }
    });

    let status = child.wait().await.map_err(|e| format!("Wait error: {}", e))?;
    let _ = stdout_handle.await;
    let _ = stderr_handle.await;

    on_output
        .send(CliOutput::Complete {
            exit_code: status.code().unwrap_or(-1),
        })
        .map_err(|e| format!("Channel error: {}", e))?;

    Ok(())
}

/// Traceroute a host with streaming output.
#[tauri::command]
pub async fn traceroute_host(
    host: String,
    on_output: tauri::ipc::Channel<CliOutput>,
) -> Result<(), String> {
    // Validate host
    if host.contains('&') || host.contains('|') || host.contains(';') || host.contains('`') {
        return Err("Invalid host".to_string());
    }

    let mut child = Command::new("tracert")
        .args(["-d", "-w", "3000", &host])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("Failed to start tracert: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let on_out = on_output.clone();
    let on_err = on_output.clone();

    let stdout_handle = tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = on_out.send(CliOutput::Stdout { line });
        }
    });

    let stderr_handle = tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = on_err.send(CliOutput::Stderr { line });
        }
    });

    let status = child.wait().await.map_err(|e| format!("Wait error: {}", e))?;
    let _ = stdout_handle.await;
    let _ = stderr_handle.await;

    on_output
        .send(CliOutput::Complete {
            exit_code: status.code().unwrap_or(-1),
        })
        .map_err(|e| format!("Channel error: {}", e))?;

    Ok(())
}

/// DNS lookup for a domain.
#[tauri::command]
pub async fn dns_lookup(domain: String) -> Result<DnsLookupResult, String> {
    // Validate domain
    if domain.contains('&') || domain.contains('|') || domain.contains(';') || domain.contains('`')
    {
        return Err("Invalid domain".to_string());
    }

    let query = domain.clone();

    tokio::task::spawn_blocking(move || {
        let script = format!(
            r#"@(Resolve-DnsName -Name '{}' -ErrorAction Stop |
                Select-Object Name,
                    @{{N='Type';E={{$_.QueryType}}}},
                    @{{N='Data';E={{if($_.IPAddress){{$_.IPAddress}}elseif($_.NameHost){{$_.NameHost}}else{{$_.Strings -join ', '}}}}}},
                    TTL) | ConvertTo-Json -Depth 3"#,
            domain
        );

        let records: Vec<DnsRecord> = run_powershell_json(&script).unwrap_or_default();

        Ok(DnsLookupResult {
            records,
            query,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Get WiFi interface information.
#[tauri::command]
pub async fn get_wifi_info() -> Result<WifiInfo, String> {
    tokio::task::spawn_blocking(|| {
        let raw = run_powershell(
            r#"netsh wlan show interfaces 2>$null"#,
        )
        .unwrap_or_default();

        if raw.is_empty() || raw.contains("is not running") {
            return Ok(WifiInfo {
                connected: false,
                ssid: None,
                signal_strength: None,
                channel: None,
                band: None,
                auth_type: None,
                bssid: None,
                radio_type: None,
                receive_rate_mbps: None,
                transmit_rate_mbps: None,
                raw_interface: raw,
            });
        }

        let connected = raw.contains("State") && raw.contains("connected")
            && !raw.contains("disconnected");

        let ssid = extract_field(&raw, "SSID");
        let signal = extract_field(&raw, "Signal")
            .and_then(|s| s.trim_end_matches('%').parse::<u32>().ok());
        let channel = extract_field(&raw, "Channel")
            .and_then(|s| s.parse::<u32>().ok());
        let band = extract_field(&raw, "Band");
        let auth = extract_field(&raw, "Authentication");
        let bssid = extract_field(&raw, "BSSID");
        let radio = extract_field(&raw, "Radio type");
        let rx = extract_field(&raw, "Receive rate")
            .and_then(|s| s.parse::<f64>().ok());
        let tx = extract_field(&raw, "Transmit rate")
            .and_then(|s| s.parse::<f64>().ok());

        Ok(WifiInfo {
            connected,
            ssid,
            signal_strength: signal,
            channel,
            band,
            auth_type: auth,
            bssid,
            radio_type: radio,
            receive_rate_mbps: rx,
            transmit_rate_mbps: tx,
            raw_interface: raw,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

// ─── Helpers ───

/// Extract a key-value field from netsh output (format: "    Key : Value")
fn extract_field(output: &str, key: &str) -> Option<String> {
    for line in output.lines() {
        let trimmed = line.trim();
        // Match "Key : Value" or "Key                 : Value"
        if let Some(rest) = trimmed.strip_prefix(key) {
            let rest = rest.trim();
            if let Some(value) = rest.strip_prefix(':') {
                let val = value.trim().to_string();
                if !val.is_empty() {
                    return Some(val);
                }
            }
        }
    }
    None
}
