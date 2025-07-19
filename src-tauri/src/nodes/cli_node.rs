// src-tauri/src/nodes/cli_node.rs

use std::process::Command;

#[tauri::command]
pub fn cli_node(command: String) -> Result<String, String> {
    println!("🖥️ Executing CLI command: {}", command);

    // 보안을 위해 위험한 명령어들 필터링
    let dangerous_commands = ["rm -rf", "del /f", "format", "shutdown", "reboot"];
    for dangerous in &dangerous_commands {
        if command.to_lowercase().contains(dangerous) {
            return Err(format!("Dangerous command blocked: {}", dangerous));
        }
    }

    // Windows와 Unix 계열 운영체제에 따라 다른 명령어 실행
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", &command])
            .output()
    } else {
        Command::new("sh")
            .args(["-c", &command])
            .output()
    };

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            // 디버깅 정보 출력
            println!("📋 Command: {}", command);
            println!("📤 Exit code: {}", output.status.code().unwrap_or(-1));
            println!("📜 Stdout: '{}'", stdout);
            println!("⚠️ Stderr: '{}'", stderr);
            
            if !stderr.is_empty() {
                // stderr가 있지만 stdout도 있으면 경고로 처리
                if !stdout.is_empty() {
                    Ok(format!("{}\n(Warning: {})", stdout, stderr))
                } else {
                    // stderr만 있으면 에러로 처리
                    Err(format!("Command failed: {}", stderr))
                }
            } else if stdout.is_empty() {
                // stdout이 비어있으면 성공 메시지
                Ok("Command executed successfully (no output)".to_string())
            } else {
                // 정상적인 출력
                Ok(stdout.to_string())
            }
        }
        Err(e) => {
            println!("❌ CLI command failed: {}", e);
            Err(format!("Failed to execute command: {}", e))
        }
    }
}