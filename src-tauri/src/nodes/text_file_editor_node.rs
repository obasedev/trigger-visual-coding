use std::fs;
use std::path::Path;

#[tauri::command]
pub fn text_file_editor_node(
    file_path: String,
    new_file_name: String,
    new_file_content: String,
) -> Result<String, String> {
    // 입력값 검증 및 정리
    let trimmed_file_path = file_path.trim();
    let trimmed_new_file_name = new_file_name.trim();

    if trimmed_file_path.is_empty() {
        return Err("EMPTY_FILE_PATH".to_string());
    }

    if trimmed_new_file_name.is_empty() {
        return Err("EMPTY_NEW_FILE_NAME".to_string());
    }

    let source_path = Path::new(trimmed_file_path);

    // 원본 파일이 존재하는지 확인
    if !source_path.exists() {
        return Err("SOURCE_FILE_NOT_FOUND".to_string());
    }

    // 원본 파일이 실제 파일인지 확인 (디렉토리가 아닌)
    if !source_path.is_file() {
        return Err("SOURCE_PATH_NOT_FILE".to_string());
    }

    // 새 파일의 전체 경로 생성
    let parent_dir = match source_path.parent() {
        Some(dir) => dir,
        None => return Err("INVALID_SOURCE_PATH".to_string()),
    };

    let new_file_path = parent_dir.join(trimmed_new_file_name);

    // 새 내용으로 파일 쓰기
    match fs::write(&new_file_path, new_file_content) {
        Ok(_) => {
            // 원본 파일과 새 파일이 다른 경우, 원본 파일 삭제
            if source_path != new_file_path {
                if let Err(_) = fs::remove_file(source_path) {
                    // 원본 파일 삭제 실패는 경고만 하고 성공으로 처리
                    println!("Warning: Could not delete original file: {:?}", source_path);
                }
            }

            Ok("SUCCESS".to_string())
        }
        Err(_) => Err("FILE_WRITE_ERROR".to_string()),
    }
}
