// src-tauri/src/nodes/mod.rs

// 기존 노드들 (프론트엔드와 1:1 대응)
pub mod file_creator_node;
pub mod start_node;
pub mod text_file_editor_node;
pub mod workflow_storage;

// 함수들을 재export (자동 등록을 위해)
pub use file_creator_node::file_creator_node;
pub use start_node::start_node;
pub use text_file_editor_node::text_file_editor_node;
pub use workflow_storage::{load_workflow_from_desktop, save_workflow_to_desktop};

// 나중에 추가될 노드들을 위한 매크로 자동 생성 준비
// 새로운 노드 추가 시:
// 1. 새 파일 생성 (예: my_new_node.rs)
// 2. pub mod my_new_node; 추가
// 3. pub use my_new_node::my_new_function; 추가
