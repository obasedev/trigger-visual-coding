// lib.rs - Tauri 앱 설정 및 노드 자동 등록
mod nodes;

use nodes::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            start_node,
            file_creator_node,
            text_file_editor_node,
            chat_web_server_node,
            send_to_mobile,
            stop_chat_server_node,
            get_chat_server_status,
            stop_chat_tunnel,     // 🆕 추가
            get_chat_server_info, // 🆕 추가
            save_workflow_to_desktop,
            load_workflow_from_desktop,
            qr_code_node,
            video_download_node,
            file_path_node, // 🆕 이 한 줄만 추가
            file_to_clipboard_node,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
