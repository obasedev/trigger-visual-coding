// src-tauri/src/plugin_system.rs
use std::path::PathBuf;
use tauri::AppHandle;

/// 현재 실행 환경에 맞는 플러그인 폴더 경로 반환
fn get_plugins_folder_path(_app_handle: &AppHandle) -> Result<PathBuf, String> {
    // 개발 중인지 빌드된 앱인지 확인
    let is_dev = cfg!(debug_assertions);
    
    if is_dev {
        // 개발 중: 프로젝트 루트의 plugins 폴더
        let current_dir = std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?;
        Ok(current_dir.join("plugins"))
    } else {
        // 빌드 후: exe와 같은 폴더의 plugins 폴더
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to get executable path: {}", e))?;
        
        let exe_dir = exe_path.parent()
            .ok_or("Failed to get executable directory")?;
            
        Ok(exe_dir.join("plugins"))
    }
}

#[tauri::command]
pub async fn scan_plugins_folder(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let plugins_dir = get_plugins_folder_path(&app_handle)?;
    
    println!("🔍 Scanning plugins folder: {:?}", plugins_dir);
    
    // 폴더가 없으면 생성
    if !plugins_dir.exists() {
        std::fs::create_dir_all(&plugins_dir)
            .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
        println!("📁 Created plugins directory: {:?}", plugins_dir);
        return Ok(vec![]);
    }
    
    let mut plugin_folders = Vec::new();
    
    for entry in std::fs::read_dir(&plugins_dir)
        .map_err(|e| format!("Failed to read plugins directory: {}", e))? {
        
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        
        if path.is_dir() {
            // manifest.json이 있는 폴더만 플러그인으로 인정
            let manifest_path = path.join("manifest.json");
            if manifest_path.exists() {
                if let Some(folder_name) = path.file_name().and_then(|n| n.to_str()) {
                    plugin_folders.push(folder_name.to_string());
                    println!("✅ Found plugin: {}", folder_name);
                }
            } else {
                if let Some(folder_name) = path.file_name().and_then(|n| n.to_str()) {
                    println!("⚠️ Skipping folder without manifest.json: {}", folder_name);
                }
            }
        }
    }
    
    println!("📦 Total plugins found: {}", plugin_folders.len());
    Ok(plugin_folders)
}

#[tauri::command]
pub async fn read_plugin_file(
    app_handle: AppHandle, 
    plugin_id: String, 
    file_name: String
) -> Result<String, String> {
    let plugins_dir = get_plugins_folder_path(&app_handle)?;
    let file_path = plugins_dir.join(&plugin_id).join(&file_name);
    
    println!("📖 Reading plugin file: {:?}", file_path);
    
    std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file {:?}: {}", file_path, e))
}

#[tauri::command]
pub async fn get_plugins_folder_info(app_handle: AppHandle) -> Result<String, String> {
    let plugins_dir = get_plugins_folder_path(&app_handle)?;
    let is_dev = cfg!(debug_assertions);
    
    let info = format!(
        "Environment: {}\nPlugins folder: {:?}\nExists: {}",
        if is_dev { "Development" } else { "Production" },
        plugins_dir,
        plugins_dir.exists()
    );
    
    println!("📋 Plugin folder info:\n{}", info);
    Ok(info)
}