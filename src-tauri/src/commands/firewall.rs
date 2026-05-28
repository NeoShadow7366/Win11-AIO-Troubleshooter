use serde::Serialize;
use crate::utils::powershell::run_powershell;

#[derive(Debug, Serialize, Clone)]
pub struct FirewallRule {
    pub name: String,
    pub display_name: String,
    pub direction: String,
    pub action: String,
    pub enabled: bool,
    pub profile: String,
    pub protocol: String,
    pub local_port: String,
    pub remote_port: String,
    pub remote_address: String,
    pub program: String,
}

/// List Windows Firewall rules with port filter info.
/// Uses bulk queries + hashtable lookups instead of per-rule filter calls.
#[tauri::command]
pub async fn get_firewall_rules() -> Result<Vec<FirewallRule>, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
            try {
                $rules = Get-NetFirewallRule -PolicyStore ActiveStore -ErrorAction SilentlyContinue |
                    Where-Object { $_.DisplayName -and $_.DisplayName.Trim() -ne '' }

                # Bulk-fetch all filters
                $ports = @{}
                Get-NetFirewallPortFilter -All -ErrorAction SilentlyContinue | ForEach-Object {
                    $ports[$_.InstanceID] = $_
                }

                $addrs = @{}
                Get-NetFirewallAddressFilter -All -ErrorAction SilentlyContinue | ForEach-Object {
                    $addrs[$_.InstanceID] = $_
                }

                $apps = @{}
                Get-NetFirewallApplicationFilter -All -ErrorAction SilentlyContinue | ForEach-Object {
                    $apps[$_.InstanceID] = $_
                }

                # Join the data
                $output = $rules | ForEach-Object {
                    $id = $_.InstanceID
                    $port = $ports[$id]
                    $addr = $addrs[$id]
                    $app  = $apps[$id]

                    [PSCustomObject]@{
                        Name          = $_.Name
                        DisplayName   = $_.DisplayName
                        Direction     = [string]$_.Direction
                        Action        = [string]$_.Action
                        Enabled       = [string]$_.Enabled -eq 'True'
                        Profile       = [string]$_.Profile
                        Protocol      = if ($port.Protocol) { [string]$port.Protocol } else { "Any" }
                        LocalPort     = if ($port.LocalPort) { ($port.LocalPort -join ',') } else { "" }
                        RemotePort    = if ($port.RemotePort) { ($port.RemotePort -join ',') } else { "" }
                        RemoteAddress = if ($addr.RemoteAddress) { ($addr.RemoteAddress -join ',') } else { "" }
                        Program       = if ($app.Program -and $app.Program -ne 'Any') { $app.Program } else { "" }
                    }
                }
                $output | ConvertTo-Json -Depth 3 -Compress
            } catch {
                "[]"
            }
        "#;

        let output = run_powershell(script)
            .map_err(|e| format!("Failed to get firewall rules: {}", e))?;
        let trimmed = output.trim();

        if trimmed.is_empty() || trimmed == "[]" || trimmed == "null" {
            return Ok(Vec::new());
        }

        let arr: Vec<serde_json::Value> = if trimmed.starts_with('{') {
            vec![serde_json::from_str(trimmed).map_err(|e| format!("JSON parse error: {}", e))?]
        } else {
            serde_json::from_str(trimmed).map_err(|e| format!("JSON parse error: {}", e))?
        };

        let mut rules = Vec::new();
        for item in &arr {
            rules.push(FirewallRule {
                name: item["Name"].as_str().unwrap_or("").to_string(),
                display_name: item["DisplayName"].as_str().unwrap_or("").to_string(),
                direction: item["Direction"].as_str().unwrap_or("").to_string(),
                action: item["Action"].as_str().unwrap_or("").to_string(),
                enabled: item["Enabled"].as_bool().unwrap_or(false),
                profile: item["Profile"].as_str().unwrap_or("").to_string(),
                protocol: item["Protocol"].as_str().unwrap_or("Any").to_string(),
                local_port: item["LocalPort"].as_str().unwrap_or("").to_string(),
                remote_port: item["RemotePort"].as_str().unwrap_or("").to_string(),
                remote_address: item["RemoteAddress"].as_str().unwrap_or("").to_string(),
                program: item["Program"].as_str().unwrap_or("").to_string(),
            });
        }

        // Sort: enabled first, then by direction, then by name
        rules.sort_by(|a, b| {
            b.enabled.cmp(&a.enabled)
                .then_with(|| a.direction.cmp(&b.direction))
                .then_with(|| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()))
        });

        Ok(rules)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
