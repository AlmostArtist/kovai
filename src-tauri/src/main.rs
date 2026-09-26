#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod runtime;

use runtime::RuntimeProcess;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(RuntimeProcess::default())
        .invoke_handler(tauri::generate_handler![
            runtime::start_runtime,
            runtime::stop_runtime,
            runtime::runtime_status,
        ])
        .run(tauri::generate_context!())
        .expect("KOVAI failed to start");
}
