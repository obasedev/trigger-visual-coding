use std::process::Command;
use serde_json::json;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
pub fn cli_node(command: String) -> Result<String, String> {
    println!("🖥️ CLI Node executing command: '{}'", command);

    // 입력값 검증
    if command.trim().is_empty() {
        return Err("EMPTY_COMMAND".to_string());
    }

    // 보안을 위해 위험한 명령어들 필터링
    let dangerous_commands = [
        "rm -rf", "del /f", "format", "shutdown", "reboot", 
        "sudo rm", "rmdir /s", "deltree", "fdisk"
    ];
    
    let command_lower = command.to_lowercase();
    for dangerous in &dangerous_commands {
        if command_lower.contains(dangerous) {
            println!("🚫 Dangerous command blocked: {}", dangerous);
            return Err(format!("DANGEROUS_COMMAND_BLOCKED: {}", dangerous));
        }
    }

    // Windows와 Unix 계열 운영체제에 따라 다른 명령어 실행
    let output = if cfg!(target_os = "windows") {
        #[cfg(target_os = "windows")]
        {
            Command::new("cmd")
                .raw_arg("/C")
                .raw_arg(&command)
                .output()
        }
        #[cfg(not(target_os = "windows"))]
        {
            unreachable!()
        }
    } else {
        Command::new("sh")
            .args(["-c", &command])
            .output()
    };

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let exit_code = output.status.code().unwrap_or(-1);
            
            // 디버깅 정보 출력
            println!("📋 Command executed: {}", command);
            println!("📤 Exit code: {}", exit_code);
            println!("📜 Stdout length: {} chars", stdout.len());
            println!("⚠️ Stderr length: {} chars", stderr.len());
            
            // 결과 결정
            let final_output = if !stderr.is_empty() && exit_code != 0 {
                // 실제 에러인 경우
                return Err(format!("COMMAND_FAILED: {}", stderr.trim()));
            } else if !stderr.is_empty() && !stdout.is_empty() {
                // 경고가 있지만 성공한 경우
                format!("{}\n[Warning: {}]", stdout.trim(), stderr.trim())
            } else if stdout.is_empty() && stderr.is_empty() {
                // 출력이 없는 성공적인 명령어
                "Command executed successfully (no output)".to_string()
            } else {
                // 정상적인 출력
                stdout.trim().to_string()
            };

            println!("✅ Command completed successfully");

            // JSON 형태로 결과 반환 (FileCreator 패턴과 동일)
            let result = json!({
                "output": final_output,
                "command": command,
                "exitCode": exit_code,
                "hasStderr": !stderr.is_empty(),
                "outputLength": final_output.len()
            });

            Ok(result.to_string())
        }
        Err(e) => {
            println!("❌ CLI command execution failed: {}", e);
            Err(format!("EXECUTION_ERROR: {}", e))
        }
    }
}