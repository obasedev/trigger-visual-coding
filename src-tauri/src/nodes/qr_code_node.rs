use base64::{engine::general_purpose, Engine as _};
use image::{ImageBuffer, Rgb, RgbImage};
use qrcode::QrCode;
use serde::Serialize;

// QR코드 결과 (간단)
#[derive(Debug, Serialize)]
pub struct QrCodeResult {
    pub image_base64: String,
    pub url: String,
}

// QR코드 생성 (메모리에서만)
fn generate_qr_image(text: &str) -> Result<String, String> {
    // QR코드 생성
    let qr_code =
        QrCode::new(text.as_bytes()).map_err(|e| format!("QR generation failed: {}", e))?;

    // 문자열로 렌더링
    let qr_string = qr_code
        .render::<char>()
        .quiet_zone(false)
        .module_dimensions(1, 1)
        .build();

    // 이미지 변환
    let lines: Vec<&str> = qr_string.lines().collect();
    let height = lines.len();
    let width = if height > 0 {
        lines[0].chars().count()
    } else {
        0
    };

    if width == 0 || height == 0 {
        return Err("Invalid QR dimensions".to_string());
    }

    // 8배 확대
    let scale = 8;
    let img_width = (width * scale) as u32;
    let img_height = (height * scale) as u32;

    // 흰색 배경 이미지
    let mut img: RgbImage = ImageBuffer::new(img_width, img_height);
    for pixel in img.pixels_mut() {
        *pixel = Rgb([255, 255, 255]);
    }

    // 검은색 QR 패턴 그리기
    for (y, line) in lines.iter().enumerate() {
        for (x, ch) in line.chars().enumerate() {
            if ch == '█' {
                let start_x = (x * scale) as u32;
                let start_y = (y * scale) as u32;

                for dy in 0..scale {
                    for dx in 0..scale {
                        let px = start_x + dx as u32;
                        let py = start_y + dy as u32;
                        if px < img_width && py < img_height {
                            img.put_pixel(px, py, Rgb([0, 0, 0]));
                        }
                    }
                }
            }
        }
    }

    // PNG로 인코딩
    let mut png_data = Vec::new();
    {
        use image::ImageEncoder;
        let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
        encoder
            .write_image(&img, img_width, img_height, image::ColorType::Rgb8)
            .map_err(|e| format!("PNG encoding failed: {}", e))?;
    }

    // Base64 변환
    Ok(general_purpose::STANDARD.encode(&png_data))
}

// Tauri 명령 (단순)
#[tauri::command]
pub async fn qr_code_node(url: String) -> Result<QrCodeResult, String> {
    if url.trim().is_empty() {
        return Err("URL cannot be empty".to_string());
    }

    match generate_qr_image(&url) {
        Ok(base64_string) => Ok(QrCodeResult {
            image_base64: base64_string,
            url,
        }),
        Err(error) => Err(error),
    }
}
