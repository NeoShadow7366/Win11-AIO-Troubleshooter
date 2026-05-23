use serde::Serialize;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Typed streaming output sent to the frontend via Tauri Channel.
#[derive(Clone, Serialize)]
#[serde(tag = "type")]
#[allow(dead_code)]
pub enum CliOutput {
    Stdout { line: String },
    Stderr { line: String },
    Complete { exit_code: i32 },
    Error { message: String },
}

/// Maps a tool_id to the actual system command to execute.
fn get_tool_command(tool_id: &str) -> Option<(&str, Vec<&str>)> {
    match tool_id {
        "sfc" => Some(("cmd", vec!["/C", "sfc", "/scannow"])),
        "dism" => Some((
            "cmd",
            vec!["/C", "DISM", "/Online", "/Cleanup-Image", "/RestoreHealth"],
        )),
        "flush_dns" => Some(("cmd", vec!["/C", "ipconfig", "/flushdns"])),
        "reset_network" => Some(("cmd", vec!["/C", "netsh", "winsock", "reset"])),
        "chkdsk" => Some(("cmd", vec!["/C", "chkdsk", "C:", "/f"])),
        "gpupdate" => Some(("cmd", vec!["/C", "gpupdate", "/force"])),
        "disk_cleanup" => Some(("cmd", vec!["/C", "cleanmgr", "/sagerun:1"])),
        "reset_ip" => Some(("cmd", vec!["/C", "netsh", "int", "ip", "reset"])),
        _ => None,
    }
}

/// Runs a CLI diagnostic tool and streams its output line-by-line to the frontend
/// via a Tauri Channel. This allows the UI to display real-time progress.
#[tauri::command]
pub async fn run_cli_tool(
    tool_id: String,
    on_output: tauri::ipc::Channel<CliOutput>,
) -> Result<(), String> {
    let (program, args) = get_tool_command(&tool_id)
        .ok_or_else(|| format!("Unknown tool_id: '{}'. Valid IDs: sfc, dism, flush_dns, reset_network, chkdsk, gpupdate, disk_cleanup, reset_ip", tool_id))?;

    let mut child = Command::new(program)
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .creation_flags(0x08000000) // CREATE_NO_WINDOW - prevent cmd window flashing
        .spawn()
        .map_err(|e| format!("Failed to spawn '{}': {}", tool_id, e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;

    let on_output_stdout = on_output.clone();
    let on_output_stderr = on_output.clone();

    // Spawn a task to read stdout line-by-line
    let stdout_handle = tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = on_output_stdout.send(CliOutput::Stdout { line });
        }
    });

    // Spawn a task to read stderr line-by-line
    let stderr_handle = tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = on_output_stderr.send(CliOutput::Stderr { line });
        }
    });

    // Wait for the child process to exit
    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for process: {}", e))?;

    // Ensure we've finished reading all output
    let _ = stdout_handle.await;
    let _ = stderr_handle.await;

    // Send completion event
    let exit_code = status.code().unwrap_or(-1);
    on_output
        .send(CliOutput::Complete { exit_code })
        .map_err(|e| format!("Failed to send completion event: {}", e))?;

    Ok(())
}
