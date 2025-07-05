// src-tauri/src/lib.rs

// 노드 모듈 자동 import
mod nodes;

// 모든 노드 함수들을 자동으로 가져오기
use nodes::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init()) // 다이얼로그 플러그인
        .plugin(tauri_plugin_shell::init()) // 🆕 shell 플러그인 추가
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // 기본 노드들
            start_node,
            file_creator_node,
            text_file_editor_node,
            
            // 공통 기능들
            save_workflow_to_desktop,
            load_workflow_from_desktop,
            
            // 새로운 노드들이 여기에 자동으로 추가될 예정
            // 향후 추가 시 이 리스트에 함수명만 추가하면 됨
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}