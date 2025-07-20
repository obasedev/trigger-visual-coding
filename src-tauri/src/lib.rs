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
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            file_creator_node,
            text_file_editor_node,
            text_merger_node,
            chat_web_server_node,
            send_to_mobile,
            send_to_mobile_with_type,
            send_web_response,
            stop_chat_server_node,
            get_chat_server_status,
            stop_chat_tunnel,
            get_chat_server_info,
            save_workflow_to_desktop,
            load_workflow_from_desktop,
            load_specific_workflow,
            qr_code_node,
            video_download_node,
            file_path_node,
            file_to_clipboard_node,
            run_command_node,
            cli_ai_node,
            cli_node,
            update_cli_result,
            clear_conversation_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
