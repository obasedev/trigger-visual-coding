// src-tauri/src/nodes/mod.rs
// 기존 노드들 (프론트엔드와 1:1 대응)
pub mod start_node;
pub mod file_creator_node;
pub mod text_file_editor_node;
pub mod chat_web_server_node;  // 🆕 웹서버 노드 추가
pub mod workflow_storage;

// 함수들을 재export (자동 등록을 위해)
pub use start_node::start_node;
pub use file_creator_node::file_creator_node;
pub use text_file_editor_node::text_file_editor_node;
pub use chat_web_server_node::{
    chat_web_server_node, 
    send_to_mobile,           // 🎯 추가
    stop_chat_server_node, 
    get_chat_server_status
};
pub use workflow_storage::{save_workflow_to_desktop, load_workflow_from_desktop};

// 나중에 추가될 노드들을 위한 매크로 자동 생성 준비
// 새로운 노드 추가 시:
// 1. 새 파일 생성 (예: my_new_node.rs)
// 2. pub mod my_new_node; 추가
// 3. pub use my_new_node::my_new_function; 추가
// nodes/mod.rs - 노드 모듈 자동 등록 관리