// src-tauri/src/nodes/video_download_node.rs
use regex::Regex;
use std::path::PathBuf;
use tauri::command;

#[command]
pub async fn video_download_node(
    urls: String,
    folder_name: String,
    download_path: String,
) -> Result<String, String> {
    println!("🎬 VideoDownloadNode 업그레이드 버전 실행 시작");
    println!("📝 URLs: {}", urls);
    println!("📁 Folder Name: '{}'", folder_name);
    println!("📂 Download Path: {}", download_path);

    // 1️⃣ URL 검증 및 파싱
    let valid_urls = validate_and_parse_urls(urls)?;
    println!("✅ 검증된 URL 개수: {}", valid_urls.len());

    // 2️⃣ 똑똑한 폴더 생성
    let final_download_path = create_smart_download_folder(download_path, folder_name).await?;
    println!("🎯 최종 다운로드 경로: {}", final_download_path);

    // 3️⃣ 병렬 다운로드 엔진 실행
    let _download_result =
        download_videos_parallel(valid_urls, final_download_path.clone()).await?;
    println!("✅ 다운로드 완료");

    // 최종 결과 반환 - 경로만!
    Ok(final_download_path)
}

// ===================================================================
// 1️⃣ URL 검증 및 파싱 모듈
// ===================================================================

fn validate_and_parse_urls(urls_input: String) -> Result<Vec<String>, String> {
    // URL 파싱 (줄바꿈으로 분리)
    let parsed_urls: Vec<String> = urls_input
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();

    if parsed_urls.is_empty() {
        return Err("유효한 URL이 없습니다".to_string());
    }

    // URL 유효성 검증
    let mut valid_urls = Vec::new();
    let mut errors = Vec::new();

    for url in parsed_urls {
        if is_valid_platform_url(&url) {
            valid_urls.push(url);
        } else {
            errors.push(format!("지원하지 않는 URL: {}", url));
        }
    }

    if !errors.is_empty() {
        return Err(format!("URL 검증 실패:\n{}", errors.join("\n")));
    }

    if valid_urls.is_empty() {
        return Err("지원되는 플랫폼의 URL이 없습니다".to_string());
    }

    Ok(valid_urls)
}

fn is_valid_platform_url(url: &str) -> bool {
    // HTTP/HTTPS 체크
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return false;
    }

    // 지원 플랫폼 체크
    url.contains("youtube.com")
        || url.contains("youtu.be")
        || url.contains("tiktok.com")
        || url.contains("douyin.com")
        || url.contains("instagram.com")
}

fn get_platform_from_url(url: &str) -> String {
    if url.contains("tiktok.com") || url.contains("douyin.com") {
        "틱톡".to_string()
    } else if url.contains("instagram.com") {
        "인스타그램".to_string()
    } else if url.contains("youtube.com/shorts") || url.contains("youtu.be") {
        "유튜브 쇼츠".to_string()
    } else {
        "유튜브".to_string()
    }
}

// ===================================================================
// 2️⃣ 똑똑한 폴더 생성 모듈
// ===================================================================

async fn create_smart_download_folder(
    base_path: String,
    folder_name: String,
) -> Result<String, String> {
    let base_dir = PathBuf::from(&base_path);

    // 기본 경로 검증
    if !base_dir.exists() {
        return Err(format!("다운로드 경로가 존재하지 않습니다: {}", base_path));
    }

    // 폴더 생성 여부 결정
    let create_folder = !folder_name.trim().is_empty();

    if create_folder {
        // 똑똑한 폴더 생성
        let final_folder_path = create_unique_folder(base_path, folder_name).await?;
        Ok(final_folder_path)
    } else {
        // 기본 경로 그대로 사용
        Ok(base_path)
    }
}

async fn create_unique_folder(base_path: String, folder_name: String) -> Result<String, String> {
    let base_dir = PathBuf::from(&base_path);

    // 1. 폴더명 정리 (금지문자 처리)
    let sanitized_name = sanitize_folder_name(&folder_name);

    // 2. 중복 방지 (폴더1, 폴더2, 폴더3...)
    let mut final_name = sanitized_name.clone();
    let mut counter = 1;

    while base_dir.join(&final_name).exists() {
        counter += 1;
        final_name = format!("{}{}", sanitized_name, counter);
    }

    // 3. 폴더 생성
    let new_folder_path = base_dir.join(&final_name);
    std::fs::create_dir_all(&new_folder_path).map_err(|e| format!("폴더 생성 실패: {}", e))?;

    println!("📁 똑똑한 폴더 생성 완료: {}", new_folder_path.display());
    Ok(new_folder_path.to_string_lossy().to_string())
}

fn sanitize_folder_name(name: &str) -> String {
    // Windows/Mac/Linux 금지 문자들 처리
    let forbidden_chars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

    let sanitized = name
        .chars()
        .map(|c| {
            if forbidden_chars.contains(&c) || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect::<String>()
        .trim()
        .to_string();

    // 빈 문자열 방지
    if sanitized.is_empty() {
        "New_Folder".to_string()
    } else {
        // 길이 제한 (50자)
        sanitized.chars().take(50).collect()
    }
}

// ===================================================================
// 3️⃣ 병렬 다운로드 엔진 모듈
// ===================================================================

async fn download_videos_parallel(
    urls: Vec<String>,
    download_path: String,
) -> Result<String, String> {
    let urls_count = urls.len();

    if urls_count == 0 {
        return Ok("다운로드할 URL이 없습니다.".to_string());
    }

    println!("🚀 병렬 다운로드 엔진 시작: {}개 영상", urls_count);

    // 청크 단위로 병렬 처리 (2개씩 동시 다운로드)
    let chunk_size = 2;
    let chunks: Vec<_> = urls.chunks(chunk_size).collect();

    let mut all_results = Vec::new();

    for (chunk_idx, chunk) in chunks.iter().enumerate() {
        println!(
            "📦 배치 {}/{} 처리 중... ({}개 동시 다운로드)",
            chunk_idx + 1,
            chunks.len(),
            chunk.len()
        );

        let mut handles = Vec::new();

        // 현재 청크의 모든 URL을 병렬로 처리
        for url in chunk.iter() {
            let url = url.clone();
            let path = download_path.clone();
            let handle =
                tokio::spawn(async move { download_single_video_optimized(url, &path).await });
            handles.push(handle);
        }

        // 현재 청크의 모든 다운로드 완료 대기
        let mut chunk_results = Vec::new();
        for handle in handles {
            match handle.await {
                Ok(result) => chunk_results.push(result),
                Err(e) => chunk_results.push(Err(format!("병렬 처리 실패: {}", e))),
            }
        }

        all_results.extend(chunk_results);

        // 배치 간 대기 (서버 부하 방지)
        if chunk_idx < chunks.len() - 1 {
            println!("⏱️ 서버 부하 방지를 위해 2초 대기...");
            tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;
        }
    }

    // 결과 요약 생성
    create_download_summary(&all_results)
}

async fn download_single_video_optimized(
    url: String,
    download_path: &str,
) -> Result<String, String> {
    // 플랫폼 구분
    let platform = get_platform_from_url(&url);
    let is_tiktok = platform == "틱톡";
    let is_instagram = platform == "인스타그램";

    // 고유 파일명 생성 (타임스탬프)
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let output_path = create_output_path(download_path, &platform, timestamp);
    let output_path_str = output_path.to_string_lossy();

    // 도구 경로 찾기
    let (yt_dlp_cmd, ffmpeg_cmd) = get_binary_tool_paths().await?;

    // 플랫폼별 최적화된 다운로드 옵션
    let args = get_platform_optimized_args(&platform, &output_path_str, &url);
    let args_str: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    println!("🎯 {} 플랫폼별 최적화 다운로드 시작...", platform);

    // CMD 창 완전히 숨기고 실행
    let mut cmd = tokio::process::Command::new(&yt_dlp_cmd);
    cmd.args(&args_str);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("yt-dlp 실행 실패: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("❌ {} 다운로드 실패: {}", platform, stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let downloaded_file = find_downloaded_file(&stdout, &platform);

    // 틱톡/인스타그램 후처리 (MOV 변환)
    if is_tiktok || is_instagram {
        if let Some(ref input_file) = downloaded_file {
            println!(
                "🔄 {} MP4 → MOV 변환 중 (프리미어 프로 최적화)...",
                platform
            );

            let mov_file_path = input_file.with_extension("mov");
            let mov_file = mov_file_path.to_string_lossy().to_string();

            let conversion_result =
                convert_to_mov_optimized(input_file, &mov_file, &ffmpeg_cmd).await;

            match conversion_result {
                Ok(_) => {
                    // 원본 MP4 삭제
                    if let Err(e) = std::fs::remove_file(input_file) {
                        println!("⚠️ 원본 파일 삭제 실패: {}", e);
                    }
                    Ok(format!(
                        "🔥 {} MOV 변환 완료! (VFR→CFR + 모노오디오)",
                        platform
                    ))
                }
                Err(e) => {
                    println!("❌ MOV 변환 실패: {}", e);
                    Ok(format!("🔥 {} 다운로드 완료! (변환 실패: {})", platform, e))
                }
            }
        } else {
            Ok(format!("🔥 {} 다운로드 완료!", platform))
        }
    } else {
        // 유튜브는 그대로
        Ok(format!("🔥 {} H.264 고화질 다운로드 완료! (MP4)", platform))
    }
}

// ===================================================================
// 4️⃣ 플랫폼별 최적화 옵션
// ===================================================================

fn get_platform_optimized_args(platform: &str, output_path: &str, url: &str) -> Vec<String> {
    let is_tiktok_instagram = platform == "틱톡" || platform == "인스타그램";

    if is_tiktok_instagram {
        // 틱톡/인스타그램: 빠른 다운로드 + 기본 품질
        vec![
            "--no-playlist".to_string(),
            "--format".to_string(),
            "best[height>=720]/best".to_string(),
            "--restrict-filenames".to_string(),
            "--concurrent-fragments".to_string(),
            "4".to_string(),
            "--no-part".to_string(),
            "--buffer-size".to_string(),
            "16K".to_string(),
            "--http-chunk-size".to_string(),
            "10M".to_string(),
            "--no-overwrites".to_string(),
            "--output".to_string(),
            output_path.to_string(),
            url.to_string(),
        ]
    } else {
        // 유튜브: 최고 화질 + H.264 코덱 우선
        vec![
            "--no-playlist".to_string(),
            "--format".to_string(), 
            "bestvideo[vcodec^=avc1][height>=1080]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc1]+bestaudio[ext=m4a]/best[height>=1080]/best".to_string(),
            "--merge-output-format".to_string(), 
            "mp4".to_string(),
            "--concurrent-fragments".to_string(), 
            "8".to_string(),
            "--no-part".to_string(),
            "--buffer-size".to_string(), 
            "16K".to_string(), 
            "--http-chunk-size".to_string(), 
            "10M".to_string(),
            "--no-overwrites".to_string(),
            "--restrict-filenames".to_string(),
            "--output".to_string(), 
            output_path.to_string(),
            url.to_string()
        ]
    }
}

// ===================================================================
// 5️⃣ 도구 및 파일 관리
// ===================================================================

async fn get_binary_tool_paths() -> Result<(String, String), String> {
    // 실행 파일과 같은 폴더의 binaries 서브폴더에서 찾기
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("실행 파일 경로 찾기 실패: {}", e))?
        .parent()
        .ok_or("상위 폴더 없음")?
        .to_path_buf();

    let binaries_dir = exe_dir.join("binaries");
    let yt_dlp_path = binaries_dir.join("yt-dlp.exe");
    let ffmpeg_path = binaries_dir.join("ffmpeg.exe");

    // 파일 존재 확인
    if !yt_dlp_path.exists() {
        return Err(
            "yt-dlp.exe를 찾을 수 없습니다. binaries 폴더에 yt-dlp.exe가 있는지 확인하세요."
                .to_string(),
        );
    }

    if !ffmpeg_path.exists() {
        return Err(
            "ffmpeg.exe를 찾을 수 없습니다. binaries 폴더에 ffmpeg.exe가 있는지 확인하세요."
                .to_string(),
        );
    }

    Ok((
        yt_dlp_path.to_string_lossy().to_string(),
        ffmpeg_path.to_string_lossy().to_string(),
    ))
}

fn create_output_path(folder_path: &str, platform: &str, timestamp: u64) -> PathBuf {
    let mut output_path = PathBuf::from(folder_path);

    if platform == "틱톡" || platform == "인스타그램" {
        let platform_code = if platform == "틱톡" { "tik" } else { "ins" };
        output_path.push(&format!(
            "{}_{}_%(title,id)s.%(ext)s",
            platform_code, timestamp
        ));
    } else {
        // 유튜브: 타임스탬프 + 제목 + ID
        output_path.push(&format!("ytb_{}_%(title,id)s.%(ext)s", timestamp));
    }

    output_path
}

fn find_downloaded_file(stdout: &str, _platform: &str) -> Option<PathBuf> {
    let file_ext = "mp4"; // 일단 MP4로 찾기

    let patterns = vec![
        format!(r#"\[Merger\] Merging formats into "(.+\.{})"#, file_ext),
        format!(
            r#"\[download\] (.+\.{}) has already been downloaded"#,
            file_ext
        ),
        format!(r#"Destination: (.+\.{})"#, file_ext),
        format!(
            r#"\[download\] 100% of [^"]+ in [^"]+ to (.+\.{})"#,
            file_ext
        ),
    ];

    for pattern in patterns {
        if let Ok(re) = Regex::new(&pattern) {
            if let Some(cap) = re.captures(stdout) {
                let file_path = PathBuf::from(&cap[1]);
                if file_path.exists() {
                    println!("🔍 다운로드 파일 발견: {}", file_path.display());
                    return Some(file_path);
                }
            }
        }
    }

    println!("⚠️ 다운로드 파일을 찾을 수 없음 (정상적일 수 있음)");
    None
}

// ===================================================================
// 6️⃣ FFmpeg MOV 변환 (틱톡/인스타그램용)
// ===================================================================

async fn convert_to_mov_optimized(
    input_file: &PathBuf,
    output_file: &str,
    ffmpeg_cmd: &str,
) -> Result<(), String> {
    if !input_file.exists() {
        return Err(format!(
            "입력 파일이 존재하지 않습니다: {}",
            input_file.display()
        ));
    }

    let input_path_str = input_file.to_string_lossy();

    // 프리미어 프로 최적화 FFmpeg 옵션
    let ffmpeg_args = vec![
        "-i",
        input_path_str.as_ref(),
        "-r",
        "30", // 30fps 고정
        "-fps_mode",
        "cfr", // VFR → CFR 변환
        "-c:v",
        "libx264", // H.264 코덱
        "-preset",
        "ultrafast", // 빠른 인코딩
        "-crf",
        "20", // 고품질 유지
        "-c:a",
        "aac", // AAC 오디오
        "-ac",
        "1", // 모노 오디오 (동기화 문제 해결)
        "-movflags",
        "+faststart", // 웹 최적화
        "-y",         // 덮어쓰기 허용
        output_file,
    ];

    let mut cmd = tokio::process::Command::new(ffmpeg_cmd);
    cmd.args(&ffmpeg_args);

    // FFmpeg도 CMD 창 숨기기
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    println!("🎬 FFmpeg 프리미어 프로 최적화 변환 시작...");

    let ffmpeg_output = cmd
        .output()
        .await
        .map_err(|e| format!("FFmpeg 실행 실패: {}", e))?;

    if ffmpeg_output.status.success() {
        let output_path = std::path::Path::new(output_file);
        if output_path.exists() {
            println!("✅ MOV 변환 완료: {}", output_file);
            Ok(())
        } else {
            Err("FFmpeg 성공했지만 출력 파일이 생성되지 않음".to_string())
        }
    } else {
        let stderr = String::from_utf8_lossy(&ffmpeg_output.stderr);
        Err(format!("FFmpeg 변환 실패: {}", stderr))
    }
}

// ===================================================================
// 7️⃣ 결과 요약
// ===================================================================

fn create_download_summary(results: &[Result<String, String>]) -> Result<String, String> {
    let successful = results.iter().filter(|r| r.is_ok()).count();
    let failed = results.len() - successful;

    let summary = format!(
        "🎉 병렬 다운로드 완료!\n✅ 성공: {}개\n❌ 실패: {}개",
        successful, failed
    );

    if failed > 0 {
        let error_details: Vec<String> = results
            .iter()
            .filter_map(|r| r.as_ref().err())
            .take(3) // 최대 3개 에러만 표시
            .map(|e| format!("• {}", e.lines().next().unwrap_or("알 수 없는 오류")))
            .collect();

        Ok(format!(
            "{}\n\n❌ 주요 실패 원인:\n{}",
            summary,
            error_details.join("\n")
        ))
    } else {
        Ok(summary)
    }
}
