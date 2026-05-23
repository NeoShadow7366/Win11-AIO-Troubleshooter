use std::process::Command;

/// Execute a PowerShell script and return stdout as a String.
/// Uses -NoProfile -NonInteractive for clean, non-interactive execution.
pub fn run_powershell(script: &str) -> Result<String, String> {
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|e| format!("Failed to launch PowerShell: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            // Some commands write errors to stdout
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Err(format!(
                "PowerShell exited with code {}: {}",
                output.status.code().unwrap_or(-1),
                stdout
            ))
        } else {
            Err(format!("PowerShell error: {}", stderr))
        }
    }
}

/// Execute a PowerShell script that produces JSON output and deserialize it into T.
pub fn run_powershell_json<T: serde::de::DeserializeOwned>(script: &str) -> Result<T, String> {
    let raw = run_powershell(script)?;

    if raw.is_empty() {
        return Err("PowerShell returned empty output".to_string());
    }

    // PowerShell ConvertTo-Json can return a single object or an array.
    // If it returns a single object but we expect Vec<T>, wrap it in an array.
    serde_json::from_str::<T>(&raw).map_err(|e| {
        format!(
            "Failed to parse PowerShell JSON output: {}. Raw output (first 500 chars): {}",
            e,
            &raw[..raw.len().min(500)]
        )
    })
}
