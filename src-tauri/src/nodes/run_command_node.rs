use serde::Serialize;
use tauri::command;
use std::process::{Command, Stdio};
use std::path::PathBuf;

#[derive(Debug, Serialize)]
pub struct RunCommandResult {
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
}

#[command]
pub async fn run_command_node(
    command: String,
    args: Option<Vec<String>>,
    cwd: Option<String>
) -> Result<RunCommandResult, String> {
    let mut cmd = Command::new(&command);
    if let Some(args) = &args {
        cmd.args(args);
    }
    if let Some(cwd) = &cwd {
        cmd.current_dir(PathBuf::from(cwd));
    }
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let status = output.status.code().unwrap_or(-1);
            Ok(RunCommandResult { status, stdout, stderr })
        },
        Err(e) => Err(format!("Failed to execute command: {}", e)),
    }
} 