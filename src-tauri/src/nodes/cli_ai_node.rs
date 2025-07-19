// src-tauri/src/nodes/cli_ai_node.rs

use serde_json::json;
use std::process::Command;
use std::path::{Path, PathBuf};
use std::fs;

// 언어 감지를 위한 enum (현재 미사용, 향후 사용 예정)
#[allow(dead_code)]
#[derive(Clone, Debug, PartialEq)]
enum Language {
    Korean,
    English,
    Chinese,
    Japanese,
}

// 대화 기록을 위한 구조체
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct ConversationEntry {
    user_input: String,
    ai_response: String,
    cli_command: Option<String>,
    cli_result: Option<String>,
}

// JSON 파일 기반 세션 관리 함수들
fn get_conversation_file_path(node_id: &str) -> PathBuf {
    let mut path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    // src-tauri 폴더에서 상위 디렉토리로 이동 (프로젝트 루트)
    if path.file_name() == Some(std::ffi::OsStr::new("src-tauri")) {
        path.pop();
    }
    path.push("store");
    path.push(format!("cliainode_{}.json", node_id));
    path
}

fn ensure_store_directory() -> Result<(), std::io::Error> {
    let mut store_path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    // src-tauri 폴더에서 상위 디렉토리로 이동 (프로젝트 루트)
    if store_path.file_name() == Some(std::ffi::OsStr::new("src-tauri")) {
        store_path.pop();
    }
    store_path.push("store");
    if !store_path.exists() {
        fs::create_dir_all(&store_path)?;
    }
    Ok(())
}

fn get_conversation_history(node_id: &str) -> Vec<ConversationEntry> {
    let file_path = get_conversation_file_path(node_id);
    
    if !file_path.exists() {
        return Vec::new();
    }
    
    match fs::read_to_string(&file_path) {
        Ok(content) => {
            match serde_json::from_str::<Vec<ConversationEntry>>(&content) {
                Ok(history) => history,
                Err(_) => Vec::new()
            }
        },
        Err(_) => Vec::new()
    }
}

fn save_conversation(node_id: &str, user_input: &str, ai_response: &str, cli_command: Option<&str>, cli_result: Option<&str>) {
    if let Err(e) = ensure_store_directory() {
        println!("❌ Failed to create store directory: {}", e);
        return;
    }
    
    let mut history = get_conversation_history(node_id);
    
    // 새 대화 추가
    history.push(ConversationEntry {
        user_input: user_input.to_string(),
        ai_response: ai_response.to_string(),
        cli_command: cli_command.map(|s| s.to_string()),
        cli_result: cli_result.map(|s| s.to_string()),
    });
    
    // 최근 7개만 유지
    if history.len() > 7 {
        history.remove(0);
    }
    
    let file_path = get_conversation_file_path(node_id);
    match serde_json::to_string_pretty(&history) {
        Ok(json_content) => {
            if let Err(e) = fs::write(&file_path, json_content) {
                println!("❌ Failed to save conversation: {}", e);
            } else {
                println!("💾 Saved conversation for node {} to file: {} entries", node_id, history.len());
            }
        },
        Err(e) => {
            println!("❌ Failed to serialize conversation: {}", e);
        }
    }
}

fn format_conversation_context(history: &[ConversationEntry]) -> String {
    if history.is_empty() {
        return String::new();
    }
    
    let mut context = String::from("=== RECENT CONVERSATION HISTORY ===\n");
    for (i, entry) in history.iter().enumerate() {
        context.push_str(&format!("#{}: User: {}\n", i + 1, entry.user_input));
        context.push_str(&format!("#{}: AI: {}\n", i + 1, entry.ai_response));
        if let Some(cli_command) = &entry.cli_command {
            context.push_str(&format!("#{}: Generated Command: {}\n", i + 1, cli_command));
        }
        if let Some(cli_result) = &entry.cli_result {
            context.push_str(&format!("#{}: CLI Result: {}\n", i + 1, cli_result));
        }
        context.push('\n');
    }
    context.push_str("=== END HISTORY ===\n\n");
    context
}

// 강화된 파일 시스템 탐색 함수들
fn get_comprehensive_directory_info() -> String {
    let current_dir = std::env::current_dir()
        .unwrap_or_else(|_| Path::new(".").to_path_buf());
    
    let mut info = format!("=== CURRENT DIRECTORY ===\nPath: {}\n\n", current_dir.display());
    
    // 파일과 폴더를 분리해서 정리
    let mut files = Vec::new();
    let mut folders = Vec::new();
    
    if let Ok(entries) = std::fs::read_dir(&current_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let name = entry.file_name().to_string_lossy().to_string();
                let path = entry.path();
                
                if path.is_dir() {
                    folders.push(name);
                } else {
                    // 파일 크기와 수정 시간 추가
                    let size = std::fs::metadata(&path)
                        .map(|m| m.len())
                        .unwrap_or(0);
                    
                    let modified = std::fs::metadata(&path)
                        .and_then(|m| m.modified())
                        .map(|t| format!("{:?}", t))
                        .unwrap_or_else(|_| "Unknown".to_string());
                    
                    files.push(format!("{} ({}bytes, modified: {})", name, size, modified));
                }
            }
        }
    }
    
    // 폴더 목록
    if !folders.is_empty() {
        info.push_str("=== FOLDERS ===\n");
        for folder in folders.iter().take(15) {
            info.push_str(&format!("📁 {}\n", folder));
        }
        info.push('\n');
    }
    
    // 파일 목록
    if !files.is_empty() {
        info.push_str("=== FILES ===\n");
        for file in files.iter().take(15) {
            info.push_str(&format!("📄 {}\n", file));
        }
        info.push('\n');
    }
    
    // 최근 생성/수정된 파일들 강조
    get_recent_changes(&current_dir, &mut info);
    
    info
}

fn get_recent_changes(current_dir: &Path, info: &mut String) {
    use std::time::{SystemTime, Duration};
    
    let five_minutes_ago = SystemTime::now() - Duration::from_secs(300); // 5분 전
    
    if let Ok(entries) = std::fs::read_dir(current_dir) {
        let mut recent_files = Vec::new();
        
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() {
                    if let Ok(metadata) = std::fs::metadata(&path) {
                        if let Ok(modified) = metadata.modified() {
                            if modified > five_minutes_ago {
                                let name = entry.file_name().to_string_lossy().to_string();
                                recent_files.push(name);
                            }
                        }
                    }
                }
            }
        }
        
        if !recent_files.is_empty() {
            info.push_str("=== RECENTLY MODIFIED (last 5 minutes) ===\n");
            for file in recent_files {
                info.push_str(&format!("🔥 {}\n", file));
            }
            info.push('\n');
        }
    }
}

fn intelligent_file_search(pattern: &str) -> String {
    let mut results = String::new();
    let current_dir = std::env::current_dir().unwrap_or_else(|_| Path::new(".").to_path_buf());
    
    results.push_str(&format!("=== SEARCHING FOR: '{}' ===\n", pattern));
    
    // 1. 현재 디렉토리에서 직접 검색
    let mut found_files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&current_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let name = entry.file_name().to_string_lossy().to_string();
                let name_lower = name.to_lowercase();
                let pattern_lower = pattern.to_lowercase();
                
                // 퍼지 매칭: 부분 문자열 포함 검색
                if name_lower.contains(&pattern_lower) {
                    let path = entry.path();
                    let is_dir = path.is_dir();
                    let size = if is_dir { 0 } else {
                        std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
                    };
                    
                    found_files.push(format!("{} {} ({}bytes)", 
                        if is_dir { "📁" } else { "📄" },
                        name,
                        size
                    ));
                }
            }
        }
    }
    
    if !found_files.is_empty() {
        results.push_str("🎯 EXACT MATCHES IN CURRENT DIRECTORY:\n");
        for file in found_files {
            results.push_str(&format!("  {}\n", file));
        }
        results.push('\n');
    }
    
    // 2. 시스템 명령어로 하위 디렉토리 검색
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", &format!("dir /s *{}* 2>nul | findstr /i \"Directory of\\|{}\\.\"", pattern, pattern)])
            .output()
    } else {
        Command::new("find")
            .args([".", "-iname", &format!("*{}*", pattern), "-type", "f"])
            .output()
    };

    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if !stdout.trim().is_empty() {
            results.push_str("🔍 RECURSIVE SEARCH RESULTS:\n");
            results.push_str(&stdout);
            results.push('\n');
        }
    }
    
    if results.len() <= format!("=== SEARCHING FOR: '{}' ===\n", pattern).len() {
        results.push_str("❌ No files found matching this pattern.\n");
    }
    
    results
}

fn extract_intelligent_keywords(user_input: &str) -> Vec<String> {
    let mut keywords = Vec::new();
    let input_lower = user_input.to_lowercase();
    
    // 1. 확장자 패턴 찾기
    let extensions = ["txt", "doc", "pdf", "json", "config", "md", "log", "csv", "xml"];
    for ext in extensions {
        if input_lower.contains(ext) {
            keywords.push(ext.to_string());
        }
    }
    
    // 2. 일반적인 파일명 패턴
    let file_patterns = ["readme", "todo", "config", "settings", "data", "backup", "temp", "log", "new_file"];
    for pattern in file_patterns {
        if input_lower.contains(pattern) {
            keywords.push(pattern.to_string());
        }
    }
    
    // 3. 한국어 파일 관련 단어들
    let korean_file_words = ["파일", "문서", "텍스트", "설정", "백업"];
    for word in korean_file_words {
        if input_lower.contains(word) {
            keywords.push("file".to_string()); // 일반적인 파일 검색으로 변환
        }
    }
    
    // 4. 사용자가 언급한 구체적인 이름들 (따옴표나 특별한 패턴)
    let words: Vec<&str> = user_input.split_whitespace().collect();
    for word in words {
        let clean = word.trim_matches(|c: char| !c.is_alphanumeric() && c != '_' && c != '-' && c != '.');
        if clean.len() > 1 && (clean.contains('.') || clean.len() >= 3) {
            keywords.push(clean.to_lowercase());
        }
    }
    
    // 중복 제거
    keywords.sort();
    keywords.dedup();
    keywords
}

#[tauri::command]
pub async fn cli_ai_node(user_input: String, api_key: String, model: String, cli_result: Option<String>, node_id: Option<String>) -> Result<String, String> {
    let node_id = node_id.unwrap_or_else(|| "default".to_string());
    println!("🧠 AI Node processing with Claude API: {} (node: {})", user_input, node_id);

    // 강화된 파일 시스템 정보 수집
    let _current_dir_info = get_comprehensive_directory_info();
    let file_keywords = extract_intelligent_keywords(&user_input);
    
    // 대화 기록 불러오기
    let conversation_history = get_conversation_history(&node_id);
    let conversation_context = format_conversation_context(&conversation_history);
    
    let mut file_search_info = String::new();
    if !file_keywords.is_empty() {
        file_search_info.push_str("=== TARGETED FILE SEARCH ===\n");
        for keyword in file_keywords {
            let search_result = intelligent_file_search(&keyword);
            file_search_info.push_str(&search_result);
            file_search_info.push_str("---\n");
        }
    } else {
        file_search_info.push_str("No specific file patterns detected in user input.\n");
    }

    // Claude API 호출
    let client = reqwest::Client::new();
    
    let cli_result_context = cli_result.as_ref()
        .map(|result| format!("Previous CLI Execution Result:\n{}\n\n", result))
        .unwrap_or_default();

    let system_prompt = format!(r#"
You are an intelligent and proactive Windows CLI assistant. You understand casual conversation and can anticipate user needs.

CRITICAL LANGUAGE RULE:
- AUTOMATICALLY detect the language of user input
- ALWAYS respond in the SAME language as the user
- If user writes in Korean, respond in Korean
- If user writes in English, respond in English  
- If user writes in Chinese, respond in Chinese
- Match the user's language naturally and consistently

RESPONSE FORMAT:
If file operation needed: 
COMMAND: [Windows command]
EXPLANATION: [Response in user's language]

If NO file operation needed:
EXPLANATION: [Just chat response in user's language, no COMMAND line at all]

CORE INTELLIGENCE:
- Understand natural conversation and context clues
- Be genuinely helpful and anticipate user needs
- Support any language naturally and respond in the same language
- Use conversational tone that matches the user's communication style
- Think contextually about what users actually mean, not just literal words

COMMAND GENERATION:
- Use basic Windows commands: dir, del, mkdir, copy, move, echo, type, ren, etc.
- Be contextually smart: use current directory info and previous results
- Use SIMPLE syntax that works on ALL Windows systems
- NEVER EVER use findstr, powershell, pipes (|), or complex commands - FORBIDDEN
- For file filtering: ONLY use simple dir with wildcards: dir *.mp4, dir *.txt, etc.
- NEVER mix multiple wildcards in one command
- Safe approach: avoid destructive commands without specific targets

INTELLIGENT COMMAND GENERATION:
- Connect conversation context - if you just found files in a specific location, operations on those files need the same location
- Think about file locations and working directories - don't assume files are in current directory
- Use the conversation history to understand where files actually are
- When manipulating files mentioned in previous commands, maintain location context
- Generate commands that work with the actual file locations discussed

PROACTIVE INTELLIGENCE:
- Be genuinely helpful and understand context
- Anticipate what users actually need, not just respond to keywords
- Think holistically about the user's goals
- Provide solutions that address the core problem

CURRENT DIRECTORY: {}

{}{}{}

Be smart, helpful, and conversational. Don't just say "no command needed" - engage and help!
"#, 
std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")).display(),
conversation_context,
cli_result_context, 
file_search_info);

    let enhanced_user_input = format!("{}\n\nProvide the CLI command in the specified format.", user_input);

    let request_body = json!({
        "model": model,
        "max_tokens": 150,
        "system": system_prompt,
        "messages": [
            {
                "role": "user",
                "content": enhanced_user_input
            }
        ]
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("Content-Type", "application/json")
        .header("anthropic-version", "2023-06-01")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Claude API error: {}", error_text));
    }

    let response_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    let full_response = response_json["content"][0]["text"]
        .as_str()
        .ok_or("No content in API response")?
        .trim();

    // COMMAND: 와 EXPLANATION: 부분 분리
    let mut cli_command = String::new();
    let mut explanation = String::new();
    
    for line in full_response.lines() {
        if line.starts_with("COMMAND:") {
            let cmd = line.replace("COMMAND:", "").trim().to_string();
            cli_command = cmd;
        } else if line.starts_with("EXPLANATION:") {
            explanation = line.replace("EXPLANATION:", "").trim().to_string();
        }
    }
    
    // COMMAND가 없으면 전체 응답에서 첫 번째 유효한 줄을 CLI 명령어로 사용
    if cli_command.is_empty() {
        // 간단한 명령어 패턴 찾기
        for line in full_response.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() && 
               (trimmed.starts_with("dir") || trimmed.starts_with("del") || 
                trimmed.starts_with("mkdir") || trimmed.starts_with("copy") ||
                trimmed.starts_with("move") || trimmed.starts_with("cd") ||
                trimmed.starts_with("echo") || trimmed.starts_with("type")) {
                cli_command = trimmed.to_string();
                break;
            }
        }
    }
    
    // 여전히 명령어가 없으면 그냥 빈값 유지
    if cli_command.is_empty() {
        cli_command = String::new();
    }

    println!("🧠 Generated CLI command: {}", cli_command);
    println!("🧠 Full AI response: {}", full_response);
    
    // 대화 기록 저장 (CLI 명령어와 결과 포함)
    let ai_response_str = if explanation.is_empty() { full_response.to_string() } else { explanation.clone() };
    let cli_command_opt = if cli_command.is_empty() { None } else { Some(cli_command.as_str()) };
    save_conversation(&node_id, &user_input, &ai_response_str, cli_command_opt, cli_result.as_deref());
    
    // JSON 형태로 반환 (프론트엔드에서 파싱할 수 있도록)
    let result = json!({
        "command": cli_command,
        "explanation": if explanation.is_empty() { full_response } else { &explanation },
        "full_response": full_response
    });
    
    Ok(result.to_string())
}

#[tauri::command]
pub async fn update_cli_result(node_id: String, cli_result: String) -> Result<String, String> {
    let file_path = get_conversation_file_path(&node_id);
    
    if !file_path.exists() {
        return Err("No conversation history found".to_string());
    }
    
    // 기존 대화 기록 로드
    let mut history = get_conversation_history(&node_id);
    
    if history.is_empty() {
        return Err("No conversation entries found".to_string());
    }
    
    // 가장 최근 대화에 CLI 결과 추가
    if let Some(last_entry) = history.last_mut() {
        last_entry.cli_result = Some(cli_result.clone());
        
        // 파일에 다시 저장
        match serde_json::to_string_pretty(&history) {
            Ok(json_content) => {
                if let Err(e) = fs::write(&file_path, json_content) {
                    return Err(format!("Failed to update conversation: {}", e));
                } else {
                    println!("🔄 Updated CLI result for node {}: {}", node_id, cli_result);
                    return Ok("CLI result updated successfully".to_string());
                }
            },
            Err(e) => {
                return Err(format!("Failed to serialize conversation: {}", e));
            }
        }
    }
    
    Err("Failed to update CLI result".to_string())
}