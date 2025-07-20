use serde_json::json;

#[tauri::command]
pub fn text_merger_node(
    text1: String,
    text2: String,
    separator: String,
) -> Result<String, String> {
    println!("📝 Text Merger Node executing:");
    println!("  Text1: '{}'", text1);
    println!("  Text2: '{}'", text2);
    println!("  Separator: '{}'", separator);

    // 입력값 검증 (빈 문자열도 허용하지만 로그로 표시)
    if text1.is_empty() && text2.is_empty() {
        println!("⚠️ Both texts are empty, will return empty result");
    }

    // 텍스트 병합
    let merged_text = if text1.is_empty() && text2.is_empty() {
        String::new()
    } else if text1.is_empty() {
        text2.clone()
    } else if text2.is_empty() {
        text1.clone()
    } else {
        format!("{}{}{}", text1, separator, text2)
    };
    
    println!("✅ Text merged successfully: '{}'", merged_text);

    // JSON 형태로 결과 반환 (FileCreator 패턴과 동일)
    let result = json!({
        "merged_text": merged_text,
        "text1": text1,
        "text2": text2,
        "separator": separator,
        "length": merged_text.len()
    });

    Ok(result.to_string())
}