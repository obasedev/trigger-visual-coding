// src-tauri/src/nodes/start_node.rs

#[tauri::command]
pub fn start_node() -> Result<String, String> {
    println!("🚀 Workflow started!");
    Ok("Workflow started successfully".to_string())
}
