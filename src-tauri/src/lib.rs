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
            commands::processes::get_process_details,
            commands::processes::get_process_icon,
            commands::processes::kill_process,
            commands::processes::set_process_priority,
            // Services
            commands::services::get_services,
            commands::services::start_service,
            commands::services::stop_service,
            commands::services::restart_service,
            commands::services::get_service_insights,
            // Event logs
            commands::event_logs::get_event_logs,
            // App insights
            commands::app_insights::get_app_insights,
            // CLI tools
            commands::cli_tools::run_cli_tool,
            // BSOD analyzer
            commands::bsod_analyzer::get_minidumps,
            commands::bsod_analyzer::get_bsod_history,
            commands::bsod_analyzer::analyze_dump,
            commands::bsod_analyzer::open_dump_file,
            commands::bsod_analyzer::open_dump_folder,
            // Favorites
            commands::favorites::get_favorites,
            commands::favorites::add_favorite,
            commands::favorites::remove_favorite,
            // Crash logs
            commands::crash_logs::get_crash_logs,
            // Admin / utilities
            commands::admin::is_admin,
            commands::admin::relaunch_as_admin,
            commands::admin::open_path_in_explorer,
            // ─── V2 Features ───
            // Hardware Health
            commands::hardware_health::get_hardware_health,
            // Health Score
            commands::health_score::get_health_score,
            // Startup Manager
            commands::startup_manager::get_startup_items,
            commands::startup_manager::toggle_startup_item,
            // Network Diagnostics
            commands::network_diagnostics::get_active_connections,
            commands::network_diagnostics::ping_host,
            commands::network_diagnostics::traceroute_host,
            commands::network_diagnostics::dns_lookup,
            commands::network_diagnostics::get_wifi_info,
            // Export
            commands::export::generate_system_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
