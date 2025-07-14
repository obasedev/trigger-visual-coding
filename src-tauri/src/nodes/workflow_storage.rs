use std::fs;
use tauri_plugin_dialog::DialogExt;

// 🆕 특정 파일 경로로 워크플로우 로드하는 새 함수
#[tauri::command]
pub fn load_specific_workflow(file_path: String) -> Result<String, String> {
    println!("🔄 특정 파일에서 워크플로우 로드 시도: {}", file_path);
    
    // 파일 존재 여부 확인
    if !std::path::Path::new(&file_path).exists() {
        return Err(format!("파일을 찾을 수 없습니다: {}", file_path));
    }
    
    // 파일 읽기 시도
    match fs::read_to_string(&file_path) {
        Ok(content) => {
            if content.trim().is_empty() {
                return Err("파일이 비어있습니다".to_string());
            }
            
            // JSON 형식 검증
            match serde_json::from_str::<serde_json::Value>(&content) {
                Ok(_) => {
                    println!("✅ 워크플로우 파일 로드 성공: {}", file_path);
                    Ok(content)
                },
                Err(_) => {
                    Err("잘못된 워크플로우 파일 형식입니다".to_string())
                }
            }
        },
        Err(e) => {
            println!("❌ 파일 읽기 실패: {}", e);
            Err(format!("파일 읽기 실패: {}", e))
        }
    }
}

// 🔧 기존 save 함수 수정 - 파일 경로를 반환하도록
#[tauri::command]
pub fn save_workflow_to_desktop(
    app_handle: tauri::AppHandle,
    workflow_data: String,
) -> Result<String, String> {
    // 파일 저장 다이얼로그 표시 (체이닝 방식)
    let selected_path = app_handle
        .dialog()
        .file()
        .add_filter("Workflow Files", &["flow.json"])
        .add_filter("All Files", &["*"])
        .set_file_name("my_workflow.flow.json")
        .blocking_save_file();

    match selected_path {
        Some(path) => {
            // FilePath를 PathBuf로 변환
            let path_buf = path.as_path().unwrap();

            // 사용자가 경로를 선택했을 때 파일 저장
            match fs::write(&path_buf, workflow_data) {
                Ok(_) => {
                    // 🎯 수정: 파일 경로를 문자열로 반환 (Store에 저장용)
                    let path_string = path_buf.to_string_lossy().to_string();
                    println!("✅ Workflow saved successfully: {}", path_string);
                    Ok(path_string) // 성공 메시지 대신 파일 경로 반환
                }
                Err(e) => Err(format!("Save failed: {}", e)),
            }
        }
        None => {
            // 사용자가 취소했을 때
            Err("User cancelled the save operation".to_string())
        }
    }
}

// 기존 load 함수 그대로 유지
#[tauri::command]
pub fn load_workflow_from_desktop(app_handle: tauri::AppHandle) -> Result<String, String> {
    // 파일 열기 다이얼로그 표시 (체이닝 방식)
    let selected_path = app_handle
        .dialog()
        .file()
        .add_filter("Workflow Files", &["flow.json"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();

    match selected_path {
        Some(path) => {
            // FilePath를 PathBuf로 변환
            let path_buf = path.as_path().unwrap();

            // 사용자가 파일을 선택했을 때 파일 읽기
            match fs::read_to_string(&path_buf) {
                Ok(content) => {
                    println!("Workflow loaded successfully: {:?}", path_buf);
                    Ok(content)
                }
                Err(e) => Err(format!("Load failed: {}", e)),
            }
        }
        None => {
            // 사용자가 취소했을 때
            Err("User cancelled the load operation".to_string())
        }
    }
}