use std::fs;
use std::path::Path;

#[tauri::command]
pub fn file_creator_node(
    file_path: String,
    file_name: String,
    file_content: String,
) -> Result<String, String> {
    // 입력값 검증
    if file_name.trim().is_empty() {
        return Err("EMPTY_FILENAME".to_string());
    }

    // 전체 경로 생성
    let full_path = if file_path.trim().is_empty() {
        format!("./{}", file_name.trim())
    } else {
        let separator = if file_path.ends_with('/') || file_path.ends_with('\\') {
            ""
        } else {
            "/"
        };
        format!("{}{}{}", file_path.trim(), separator, file_name.trim())
    };

    // 디렉토리 생성
    if let Some(parent_dir) = Path::new(&full_path).parent() {
        if !parent_dir.exists() {
            if let Err(_) = fs::create_dir_all(parent_dir) {
                return Err("DIRECTORY_CREATE_ERROR".to_string());
            }
        }
    }

    // 파일 생성
    match fs::write(&full_path, file_content) {
        Ok(_) => Ok("SUCCESS".to_string()),
        Err(_) => Err("FILE_CREATE_ERROR".to_string()),
    }
}
