mod commands;
mod utils;

use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use sysinfo::System;
use tauri::{
    Manager,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};

// Global flag: whether the app should minimize to tray on close
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn get_close_to_tray() -> bool {
    CLOSE_TO_TRAY.load(Ordering::Relaxed)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(System::new())))
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // ─── System Tray ───
            let show_item = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("AIO Troubleshooter — Loading...")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left, ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Spawn background task to update tray tooltip with CPU/RAM stats
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut sys = System::new();
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    sys.refresh_cpu_usage();
                    sys.refresh_memory();

                    let cpu = sys.global_cpu_usage();
                    let ram_used = sys.used_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
                    let ram_total = sys.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
                    let ram_pct = if ram_total > 0.0 { (ram_used / ram_total) * 100.0 } else { 0.0 };

                    let tooltip = format!(
                        "AIO Troubleshooter\nCPU: {:.0}%  |  RAM: {:.1}/{:.0} GB ({:.0}%)",
                        cpu, ram_used, ram_total, ram_pct
                    );

                    if let Some(tray) = app_handle.tray_by_id("main") {
                        let _ = tray.set_tooltip(Some(&tooltip));
                    }
                }
            });

            // ─── Close-to-tray ───
            let window = app.get_webview_window("main").unwrap();
            let win_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Tray settings
            set_close_to_tray,
            get_close_to_tray,
            // System info
            commands::system_info::get_system_stats,
            commands::system_info::get_system_specs,
            commands::system_info::get_last_bios_time,
            // Processes
            commands::processes::get_processes,
            commands::processes::get_process_details,
            commands::processes::get_process_icon,
            commands::processes::kill_process,
            commands::processes::kill_process_tree,
            commands::processes::set_process_priority,
            commands::processes::suspend_process,
            commands::processes::resume_process,
            commands::processes::get_process_affinity,
            commands::processes::set_process_affinity,
            commands::processes::set_efficiency_mode,
            commands::processes::get_process_dlls,
            commands::processes::get_file_hash,
            commands::processes::get_process_connections,
            // Users
            commands::users::get_logged_in_users,
            commands::users::sign_out_user,
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
            commands::crash_logs::export_all_crash_logs,
            commands::crash_logs::get_event_full_message,
            commands::crash_logs::get_event_detail,
            commands::crash_logs::get_evtx_file_logs,
            commands::crash_logs::list_log_channels,
            commands::crash_logs::open_evtx_dialog,
            commands::crash_logs::query_xpath,
            commands::crash_logs::get_log_properties,
            commands::crash_logs::clear_event_log,
            commands::crash_logs::query_remote_events,
            commands::crash_logs::attach_task_to_event,
            // Admin / utilities
            commands::admin::is_admin,
            commands::admin::relaunch_as_admin,
            commands::admin::open_path_in_explorer,
            // App history
            commands::app_history::get_app_history,
            // ─── V2 Features ───
            commands::hardware_health::get_hardware_health,
            commands::health_score::get_health_score,
            commands::startup_manager::get_startup_items,
            commands::startup_manager::toggle_startup_item,
            commands::network_diagnostics::get_active_connections,
            commands::network_diagnostics::ping_host,
            commands::network_diagnostics::traceroute_host,
            commands::network_diagnostics::dns_lookup,
            commands::network_diagnostics::get_wifi_info,
            commands::export::generate_system_report,
            commands::restore_points::get_restore_points,
            commands::restore_points::restore_to_point,
            commands::driver_manager::get_drivers,
            commands::task_scheduler::get_all_scheduled_tasks,
            commands::task_scheduler::toggle_scheduled_task_state,
            commands::task_scheduler::run_scheduled_task,
            commands::installed_programs::get_installed_programs,
            commands::installed_programs::uninstall_program,
            commands::disk_analyzer::scan_directory_sizes,
            commands::disk_analyzer::get_disk_overview,
            commands::firewall::get_firewall_rules,
            commands::windows_update::get_update_history,
            commands::windows_update::check_pending_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
