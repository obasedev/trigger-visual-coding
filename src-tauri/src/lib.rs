// lib.rs - Tauri 앱 설정 및 노드 자동 등록
mod nodes;

use nodes::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            start_node,
            file_creator_node,
            text_file_editor_node,
            chat_web_server_node,
            send_to_mobile,          // 🎯 추가
            stop_chat_server_node,
            get_chat_server_status,
            save_workflow_to_desktop,
            load_workflow_from_desktop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}