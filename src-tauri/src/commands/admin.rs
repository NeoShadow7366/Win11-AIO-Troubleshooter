use crate::utils::powershell::run_powershell;

/// Check if the current process is running with administrator privileges.
#[tauri::command]
pub async fn is_admin() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
            $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
            $principal = New-Object Security.Principal.WindowsPrincipal($identity)
            $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        "#;
        let result = run_powershell(script)?;
        Ok(result.trim().eq_ignore_ascii_case("true"))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Relaunch the application as administrator using runas verb.
/// Returns Ok if the elevated process was launched successfully.
/// The frontend is responsible for closing this window afterwards.
#[tauri::command]
pub async fn relaunch_as_admin() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to get exe path: {}", e))?;
        let exe_str = exe_path.to_string_lossy().replace('\'', "''");

        // Use Start-Process with -Verb RunAs to elevate.
        // Wrap in cmd /c start to fully detach the child process from this process tree,
        // so closing this window won't kill the elevated instance.
        let script = format!(
            r#"
            $p = Start-Process -FilePath '{}' -Verb RunAs -PassThru -ErrorAction Stop
            if ($p) {{
                Write-Host "Launched PID: $($p.Id)"
            }} else {{
                throw 'Failed to launch elevated process'
            }}
            "#,
            exe_str
        );
        run_powershell(&script)?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Open a folder or file path in Windows Explorer.
/// If the path is a directory, opens it. If it's a file, opens the containing folder and selects it.
#[tauri::command]
pub async fn open_path_in_explorer(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let sanitized = path.replace('\'', "''");
        let is_dir = std::path::Path::new(&path).is_dir();

        let script = if is_dir {
            format!(r#"explorer.exe '{}'"#, sanitized)
        } else {
            format!(r#"explorer.exe /select,'{}'"#, sanitized)
        };
        run_powershell(&script)?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
