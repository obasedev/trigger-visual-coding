// src-tauri/src/nodes/mod.rs
// 기존 노드들 (프론트엔드와 1:1 대응)
pub mod cli_ai_node; // 🆕 CLI AI 노드 추가
pub mod chat_web_server_node; // 🆕 웹서버 노드 추가
pub mod cli_node; // 🆕 CLI 노드 추가
pub mod file_creator_node;
pub mod file_path_node; // 🆕 추가
pub mod file_to_clipboard_node;
pub mod qr_code_node;
pub mod run_command_node;
pub mod text_file_editor_node;
pub mod text_merger_node;
pub mod video_download_node;
pub mod workflow_storage;
// 함수들을 재export (자동 등록을 위해)
pub use cli_ai_node::{cli_ai_node, update_cli_result, clear_conversation_history}; // 🆕 CLI AI 노드 + 업데이트 함수
pub use chat_web_server_node::{
    chat_web_server_node,
    get_chat_server_info,   // 🆕 추가
    get_chat_server_status, // 🎯 기존
    send_to_mobile,         // 🎯 기존
    send_to_mobile_with_type, // 🆕 추가
    send_web_response,      // 🆕 웹페이지 응답 함수 추가
    stop_chat_server_node,  // 🎯 기존
    stop_chat_tunnel,       // 🆕 추가
};
pub use cli_node::cli_node; // 🆕 CLI 노드 추가
pub use file_creator_node::file_creator_node;
pub use file_path_node::file_path_node; // 🆕 추가
pub use file_to_clipboard_node::file_to_clipboard_node;
pub use qr_code_node::qr_code_node;
pub use run_command_node::run_command_node;
pub use text_file_editor_node::text_file_editor_node;
pub use text_merger_node::text_merger_node;
pub use video_download_node::video_download_node;
pub use workflow_storage::{load_workflow_from_desktop, save_workflow_to_desktop, load_specific_workflow};

// 나중에 추가될 노드들을 위한 매크로 자동 생성 준비
// 새로운 노드 추가 시:
// 1. 새 파일 생성 (예: my_new_node.rs)
// 2. pub mod my_new_node; 추가
// 3. pub use my_new_node::my_new_function; 추가
