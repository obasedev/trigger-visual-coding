// src-tauri/src/nodes/file_to_clipboard_node.rs
use tauri::command;
use std::path::Path;
use std::process::Command;

#[command]
pub async fn file_to_clipboard_node(file_paths: Vec<String>) -> Result<String, String> {
    println!("📋 FileToClipboardNode 실행 시작");
    println!("📝 입력된 파일 개수: {}", file_paths.len());

    if file_paths.is_empty() {
        return Err("파일 경로가 제공되지 않았습니다".to_string());
    }

    // 파일들이 존재하는지 확인
    let mut valid_paths = Vec::new();
    for file_path in &file_paths {
        let path = Path::new(file_path.trim());
        if path.exists() {
            valid_paths.push(file_path.trim().to_string());
            println!("✅ 파일 확인: {}", file_path);
        } else {
            println!("❌ 파일이 존재하지 않음: {}", file_path);
        }
    }

    if valid_paths.is_empty() {
        return Err("유효한 파일이 없습니다".to_string());
    }

    // 파일들을 클립보드에 복사 (Ctrl+C처럼)
    match copy_files_to_clipboard(&valid_paths) {
        Ok(_) => {
            println!("✅ {}개 파일이 클립보드에 복사되었습니다", valid_paths.len());
            Ok(format!("{}개 파일이 클립보드에 복사되었습니다!", valid_paths.len()))
        },
        Err(error) => {
            println!("❌ 파일 복사 실패: {}", error);
            Err(format!("파일 복사 실패: {}", error))
        }
    }
}

fn copy_files_to_clipboard(file_paths: &[String]) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Windows: PowerShell을 사용하여 파일을 클립보드에 복사
        let paths_string = file_paths
            .iter()
            .map(|p| format!("'{}'", p.replace("'", "''")))
            .collect::<Vec<_>>()
            .join(",");
        
        let command = format!(
            "Set-Clipboard -Path {}",
            paths_string
        );
        
        println!("🔧 PowerShell 명령어: {}", command);
        
        // 여러 PowerShell 경로 시도
        let powershell_commands = vec![
            "powershell.exe",
            "powershell", 
            "pwsh.exe",
            "pwsh",
            "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
        ];
        
        let mut last_error = String::new();
        
        for ps_cmd in powershell_commands {
            println!("🔧 시도 중: {}", ps_cmd);
            
            match Command::new(ps_cmd)
                .args(&["-Command", &command])
                .output()
            {
                Ok(output) => {
                    if output.status.success() {
                        println!("✅ {}로 파일 클립보드 복사 성공", ps_cmd);
                        return Ok(());
                    } else {
                        let error_msg = String::from_utf8_lossy(&output.stderr);
                        last_error = format!("{} 실패: {}", ps_cmd, error_msg);
                        println!("❌ {}", last_error);
                    }
                },
                Err(e) => {
                    last_error = format!("{} 실행 실패: {}", ps_cmd, e);
                    println!("❌ {}", last_error);
                    continue;
                }
            }
        }
        
        Err(format!("모든 PowerShell 명령 실패. 마지막 오류: {}", last_error))
    }
    
    #[cfg(target_os = "macos")]
    {
        // macOS: osascript를 사용하여 파일을 클립보드에 복사
        let paths_string = file_paths
            .iter()
            .map(|p| format!("POSIX file \"{}\"", p))
            .collect::<Vec<_>>()
            .join(", ");
        
        let script = format!(
            "set the clipboard to {{{}}}",
            paths_string
        );
        
        match Command::new("osascript")
            .args(&["-e", &script])
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    println!("✅ osascript로 파일 클립보드 복사 성공");
                    Ok(())
                } else {
                    let error_msg = String::from_utf8_lossy(&output.stderr);
                    Err(format!("osascript 실패: {}", error_msg))
                }
            },
            Err(e) => {
                Err(format!("osascript 실행 실패: {}", e))
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        // Linux: xclip를 사용하여 파일을 클립보드에 복사
        let paths_string = file_paths.join("\n");
        
        match Command::new("xclip")
            .args(&["-selection", "clipboard", "-t", "text/uri-list"])
            .arg("-i")
            .env("CLIPBOARD_CONTENT", &paths_string)
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    println!("✅ xclip으로 파일 클립보드 복사 성공");
                    Ok(())
                } else {
                    let error_msg = String::from_utf8_lossy(&output.stderr);
                    Err(format!("xclip 실패: {}", error_msg))
                }
            },
            Err(e) => {
                Err(format!("xclip 실행 실패: {}", e))
            }
        }
    }
    
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("지원하지 않는 운영체제입니다".to_string())
    }
}