// src-tauri/src/nodes/file_path_node.rs
use std::fs;
use std::path::{Path, PathBuf};
use tauri::command;

#[command]
pub async fn file_path_node(file_paths: Vec<String>) -> Result<String, String> {
    println!("📁 FilePathNode 실행 시작");
    println!("📝 입력된 경로 개수: {}", file_paths.len());

    if file_paths.is_empty() {
        return Err("선택된 파일이 없습니다".to_string());
    }

    let mut verified_paths = Vec::new();
    let mut errors = Vec::new();

    for path_str in file_paths {
        println!("🔍 경로 검증 중: {}", path_str);

        match verify_and_normalize_path(&path_str) {
            Ok(normalized_path) => {
                verified_paths.push(normalized_path);
                println!("✅ 유효한 경로: {}", path_str);
            }
            Err(error) => {
                errors.push(format!("❌ {}: {}", path_str, error));
                println!("❌ 유효하지 않은 경로: {} - {}", path_str, error);
            }
        }
    }

    // 결과 처리
    if verified_paths.is_empty() {
        let error_summary = if errors.len() > 3 {
            format!(
                "모든 파일이 유효하지 않습니다.\n주요 오류:\n{}",
                errors.into_iter().take(3).collect::<Vec<_>>().join("\n")
            )
        } else {
            format!("모든 파일이 유효하지 않습니다.\n{}", errors.join("\n"))
        };
        return Err(error_summary);
    }

    // 성공한 경로들을 줄바꿈으로 연결
    let result = verified_paths.join("\n");

    println!(
        "✅ FilePathNode 완료: {}개 파일 검증됨",
        verified_paths.len()
    );
    if !errors.is_empty() {
        println!("⚠️ {}개 파일에서 오류 발생", errors.len());
    }

    Ok(result)
}

fn verify_and_normalize_path(path_str: &str) -> Result<String, String> {
    // 빈 경로 체크
    if path_str.trim().is_empty() {
        return Err("빈 경로입니다".to_string());
    }

    let mut path = PathBuf::from(path_str.trim());

    // 파일명만 있는 경우 (확장자 포함) 일반적인 위치에서 찾기
    if !path.is_absolute() && !path_str.contains('/') && !path_str.contains('\\') {
        // 파일명만 있는 경우, 일반적인 위치들에서 찾기
        let search_paths = vec![
            dirs::desktop_dir(),
            dirs::download_dir(),
            dirs::document_dir(),
            dirs::home_dir(),
            std::env::current_dir().ok(),
        ];

        for search_dir in search_paths.into_iter().flatten() {
            let potential_path = search_dir.join(&path);
            if potential_path.exists() && potential_path.is_file() {
                println!("🔍 파일 발견: {} → {}", path_str, potential_path.display());
                path = potential_path;
                break;
            }
        }

        // 여전히 찾을 수 없으면 에러
        if !path.exists() {
            return Err(format!(
                "파일을 찾을 수 없습니다: '{}' (검색 위치: 바탕화면, 다운로드, 문서, 홈 폴더)",
                path_str
            ));
        }
    }

    // 절대 경로로 변환
    let absolute_path = if path.is_absolute() {
        path
    } else {
        // 상대 경로인 경우 현재 디렉토리 기준으로 절대 경로 생성
        match std::env::current_dir() {
            Ok(current_dir) => current_dir.join(&path),
            Err(_) => return Err("현재 디렉토리를 찾을 수 없습니다".to_string()),
        }
    };

    // 경로 정규화 (. 및 .. 제거)
    let normalized_path = match absolute_path.canonicalize() {
        Ok(canonical) => canonical,
        Err(_) => {
            // canonicalize 실패 시 직접 정규화 시도
            normalize_path_manually(&absolute_path)?
        }
    };

    // 파일 존재 여부 확인
    if !normalized_path.exists() {
        return Err("파일이 존재하지 않습니다".to_string());
    }

    // 파일인지 확인 (디렉토리 제외)
    if !normalized_path.is_file() {
        return Err("디렉토리는 지원하지 않습니다".to_string());
    }

    // 읽기 권한 확인
    match fs::metadata(&normalized_path) {
        Ok(metadata) => {
            if metadata.permissions().readonly() {
                println!("⚠️ 읽기 전용 파일: {}", normalized_path.display());
            }
        }
        Err(_) => {
            return Err("파일 정보를 읽을 수 없습니다".to_string());
        }
    }

    // 경로를 문자열로 변환 (크로스 플랫폼 호환성)
    let path_string = normalized_path.to_string_lossy().to_string();

    // Windows 경로를 Unix 스타일로 변환 (선택적)
    let unified_path = if cfg!(windows) {
        // Windows에서는 백슬래시를 슬래시로 변환 (선택사항)
        path_string.replace('\\', "/")
    } else {
        path_string
    };

    Ok(unified_path)
}

fn normalize_path_manually(path: &Path) -> Result<PathBuf, String> {
    let mut components = Vec::new();

    for component in path.components() {
        match component {
            std::path::Component::Prefix(_prefix) => {
                components.push(component.as_os_str().to_string_lossy().to_string());
            }
            std::path::Component::RootDir => {
                components.push("/".to_string());
            }
            std::path::Component::CurDir => {
                // "." 는 무시
                continue;
            }
            std::path::Component::ParentDir => {
                // ".." 는 이전 컴포넌트 제거
                if !components.is_empty() {
                    components.pop();
                }
            }
            std::path::Component::Normal(name) => {
                components.push(name.to_string_lossy().to_string());
            }
        }
    }

    if components.is_empty() {
        return Err("유효하지 않은 경로입니다".to_string());
    }

    let result = if cfg!(windows) {
        components.join("\\")
    } else {
        if components[0] == "/" {
            format!("/{}", components[1..].join("/"))
        } else {
            components.join("/")
        }
    };

    Ok(PathBuf::from(result))
}

// 파일 정보 추가 확인 함수 (나중에 확장용)
#[allow(dead_code)]
fn get_file_info(path: &Path) -> Result<FileInfo, String> {
    let metadata = fs::metadata(path).map_err(|e| format!("파일 정보 읽기 실패: {}", e))?;

    Ok(FileInfo {
        size: metadata.len(),
        is_readonly: metadata.permissions().readonly(),
        modified: metadata.modified().ok(),
    })
}

#[allow(dead_code)]
struct FileInfo {
    size: u64,
    is_readonly: bool,
    modified: Option<std::time::SystemTime>,
}
