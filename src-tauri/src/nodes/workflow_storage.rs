use std::fs;
use tauri_plugin_dialog::DialogExt;

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
                    let msg = format!("Workflow saved successfully: {:?}", path_buf);
                    println!("{}", msg);
                    Ok(msg)
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
