mod commands;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // System info
            commands::system_info::get_system_stats,
            commands::system_info::get_system_specs,
            // Processes
            commands::processes::get_processes,
            commands::processes::kill_process,
            // Services
            commands::services::get_services,
            commands::services::start_service,
            commands::services::stop_service,
            // Event logs
            commands::event_logs::get_event_logs,
            // App insights
            commands::app_insights::get_app_insights,
            // CLI tools
            commands::cli_tools::run_cli_tool,
            // BSOD analyzer
            commands::bsod_analyzer::get_minidumps,
            commands::bsod_analyzer::get_bsod_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
