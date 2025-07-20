use futures_util::{sink::SinkExt, stream::StreamExt};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};
use tokio::sync::{broadcast, RwLock};
use warp::Filter;

// 💬 채팅 웹서버 노드 구조체들

#[derive(Debug, Serialize)]
pub struct ChatWebServerResult {
    server_url: String,
    actual_port: u16,
    status: String,
    message: Option<String>,
    received_message: Option<String>,
    // 🆕 글로벌 터널 정보
    local_url: Option<String>,
    tunnel_status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    message: String,
    #[allow(dead_code)]
    sender: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
struct ChatEvent {
    node_id: String,
    message: String,
    timestamp: u64,
}

// 🗂️ 실행 중인 채팅 서버들을 추적하는 전역 상태
type ChatServerRegistry = Arc<RwLock<HashMap<String, ChatServerHandle>>>;

// 🆕 글로벌 터널 프로세스 관리 - Tauri v2 호환
type TunnelRegistry = Arc<RwLock<HashMap<String, tauri_plugin_shell::process::CommandChild>>>;

#[derive(Debug)]
struct ChatServerHandle {
    port: u16,
    server_url: String,
    local_url: Option<String>, // 🆕 로컬 URL 별도 저장
    status: String,
    node_id: String,
    app_handle: AppHandle,
    abort_handle: tokio::task::AbortHandle,
    websocket_sender: broadcast::Sender<String>,
    // 🆕 터널 관련 정보
    has_tunnel: bool,
    tunnel_url: Option<String>,
}

// 전역 레지스트리들
static CHAT_SERVER_REGISTRY: std::sync::OnceLock<ChatServerRegistry> = std::sync::OnceLock::new();
static TUNNEL_REGISTRY: std::sync::OnceLock<TunnelRegistry> = std::sync::OnceLock::new();

fn get_chat_server_registry() -> &'static ChatServerRegistry {
    CHAT_SERVER_REGISTRY.get_or_init(|| Arc::new(RwLock::new(HashMap::new())))
}

fn get_tunnel_registry() -> &'static TunnelRegistry {
    TUNNEL_REGISTRY.get_or_init(|| Arc::new(RwLock::new(HashMap::new())))
}

// 🔌 사용 가능한 포트 찾기 함수
fn find_available_port(preferred_port: u16) -> Result<u16, String> {
    use std::net::TcpListener;

    if preferred_port != 0 {
        let addr = format!("0.0.0.0:{}", preferred_port);
        if TcpListener::bind(&addr).is_ok() {
            return Ok(preferred_port);
        } else {
            return Err(format!("Port {} is already in use", preferred_port));
        }
    }

    // 자동 포트 선택
    match TcpListener::bind("0.0.0.0:0") {
        Ok(listener) => match listener.local_addr() {
            Ok(addr) => Ok(addr.port()),
            Err(e) => Err(format!("Failed to get local address: {}", e)),
        },
        Err(e) => Err(format!("Failed to bind to any port: {}", e)),
    }
}

// 🌐 로컬 네트워크 IP 주소들 가져오기 함수
fn get_local_ip_addresses() -> Vec<String> {
    use std::net::IpAddr;

    let mut addresses = Vec::new();

    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        for (interface_name, ip) in interfaces {
            if let IpAddr::V4(ipv4) = ip {
                if !ipv4.is_loopback()
                    && !ipv4.is_link_local()
                    && !is_apipa_address(ipv4)
                    && interface_name != "lo"
                {
                    addresses.push(ipv4.to_string());
                }
            }
        }
    }

    addresses
}

fn is_apipa_address(ip: std::net::Ipv4Addr) -> bool {
    let octets = ip.octets();
    octets[0] == 169 && octets[1] == 254
}

// 🆕 클라우드플레어 터널 시작 함수 - Tauri v2 호환
async fn start_cloudflare_tunnel(
    app: AppHandle,
    port: u16,
    node_id: String,
) -> Result<String, String> {
    println!(
        "🌐 Starting Cloudflare tunnel for port {} (node: {})",
        port, node_id
    );

    // 🔧 Tauri v2: cloudflared 실행
    let sidecar_command = app
        .shell()
        .sidecar("cloudflared")
        .map_err(|e| format!("Failed to create cloudflared command: {}", e))?;

    let (mut rx, child) = sidecar_command
        .args(["tunnel", "--url", &format!("http://localhost:{}", port)])
        .spawn()
        .map_err(|e| format!("Failed to spawn cloudflared: {}", e))?;

    // 🔧 Tauri v2: 프로세스 저장 (CommandChild 타입)
    {
        let tunnel_registry = get_tunnel_registry();
        let mut tunnels = tunnel_registry.write().await;
        tunnels.insert(node_id.clone(), child);
    }

    // URL 추출을 위한 타임아웃 설정 (30초)
    let timeout = tokio::time::Duration::from_secs(30);
    let mut global_url = String::new();

    println!("⏳ Waiting for tunnel URL (timeout: 30s)...");

    // URL 파싱을 위한 정규식
    let url_regex = Regex::new(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
        .map_err(|e| format!("Failed to create regex: {}", e))?;

    // 타임아웃과 함께 로그 읽기
    match tokio::time::timeout(timeout, async {
        while let Some(event) = rx.recv().await {
            match event {
                // 🔧 Tauri v2: CommandEvent::Stdout는 Vec<u8> 반환
                CommandEvent::Stdout(line_bytes) => {
                    // 🔧 바이트를 UTF-8 문자열로 변환
                    let line = String::from_utf8_lossy(&line_bytes);
                    println!("📋 cloudflared stdout: {}", line);

                    // URL 추출
                    if let Some(captures) = url_regex.find(&line) {
                        global_url = captures.as_str().to_string();
                        println!("🎯 Found tunnel URL in stdout: {}", global_url);
                        break;
                    }
                }
                // 🔧 Tauri v2: CommandEvent::Stderr도 Vec<u8> 반환
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    println!("⚠️ cloudflared stderr: {}", line);

                    // 🔧 핵심 수정: stderr에서도 URL 찾기!
                    if let Some(captures) = url_regex.find(&line) {
                        global_url = captures.as_str().to_string();
                        println!("🎯 Found tunnel URL in stderr: {}", global_url);
                        break;
                    }
                }
                _ => {} // 다른 이벤트들 무시
            }
        }

        if global_url.is_empty() {
            Err("No tunnel URL found in cloudflared output".to_string())
        } else {
            Ok(global_url)
        }
    })
    .await
    {
        Ok(result) => result,
        Err(_) => {
            // 타임아웃 발생 - 프로세스 정리
            let _ = stop_cloudflare_tunnel(node_id).await;
            Err("Timeout waiting for tunnel URL".to_string())
        }
    }
}

// 🆕 클라우드플레어 터널 중지 함수 - Tauri v2 호환
async fn stop_cloudflare_tunnel(node_id: String) -> Result<(), String> {
    let tunnel_registry = get_tunnel_registry();
    let mut tunnels = tunnel_registry.write().await;

    if let Some(child) = tunnels.remove(&node_id) {
        println!("🛑 Stopping Cloudflare tunnel for node {}", node_id);

        // 🔧 Tauri v2: CommandChild::kill() 사용
        match child.kill() {
            Ok(_) => {
                println!("✅ Tunnel process terminated");
                Ok(())
            }
            Err(e) => {
                println!("⚠️ Failed to kill tunnel process: {}", e);
                Err(format!("Failed to stop tunnel: {}", e))
            }
        }
    } else {
        println!("⚠️ No tunnel process found for node {}", node_id);
        Ok(()) // 이미 중지됨
    }
}

// 📱 모던한 채팅 HTML 생성 함수 (example.rs 스타일 적용)
fn create_mobile_chat_html() -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Chat Server</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
            background: #0f0f0f;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            color: #ffffff;
        }}
        
        .header {{
            background: #1a1a1a;
            border-bottom: 1px solid #2a2a2a;
            padding: 16px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            backdrop-filter: blur(10px);
        }}
        
        .header h1 {{
            color: #ffffff;
            font-size: 18px;
            font-weight: 600;
        }}
        
        .status {{
            color: #10b981;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(16, 185, 129, 0.1);
            padding: 4px 8px;
            border-radius: 12px;
        }}
        
        .status::before {{
            content: '●';
            color: #10b981;
            font-size: 8px;
        }}
        
        .chat-container {{
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            padding-bottom: 120px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            transition: padding-bottom 0.3s ease;
            scroll-behavior: smooth;
        }}
        
        .message {{
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 16px;
            font-size: 14px;
            line-height: 1.4;
            word-wrap: break-word;
            animation: messageSlide 0.2s ease-out;
        }}
        
        @keyframes messageSlide {{
            from {{
                opacity: 0;
                transform: translateY(10px);
            }}
            to {{
                opacity: 1;
                transform: translateY(0);
            }}
        }}
        
        .message.user {{
            background: #2563eb;
            color: white;
            align-self: flex-end;
            border-bottom-right-radius: 6px;
            box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
        }}
        
        .message.computer {{
            background: #1a1a1a;
            color: #e8e8e8;
            align-self: flex-start;
            border-bottom-left-radius: 6px;
            border: 1px solid #333;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }}
        
        .message.assistant {{
            background: #f8f9fa;
            color: #1a1a1a;
            align-self: flex-start;
            border-bottom-left-radius: 6px;
            border: 1px solid #e9ecef;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
            padding: 12px 16px;
            border-radius: 16px;
            max-width: 80%;
            font-size: 14px;
            line-height: 1.4;
            word-wrap: break-word;
        }}
        
        .message.system {{
            background: rgba(99, 102, 241, 0.1);
            color: #6366f1;
            align-self: center;
            font-size: 13px;
            border: 1px solid rgba(99, 102, 241, 0.2);
            border-radius: 12px;
        }}
        
        .bottom-container {{
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: #1a1a1a;
            border-top: 1px solid #2a2a2a;
            backdrop-filter: blur(10px);
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
            z-index: 1000;
        }}
        
        .input-container {{
            padding: 12px 16px;
            display: flex;
            align-items: flex-end;
            gap: 12px;
        }}
        
        .input-wrapper {{
            flex: 1;
            position: relative;
        }}
        
        .message-input {{
            width: 100%;
            padding: 14px 20px;
            border: 1px solid #404040;
            border-radius: 24px;
            font-size: 16px;
            outline: none;
            transition: all 0.2s ease;
            background: #262626;
            color: #ffffff;
            font-family: inherit;
            resize: none;
            min-height: 48px;
        }}
        
        .message-input:focus {{
            border-color: #6366f1;
            background: #2a2a2a;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }}
        
        .message-input::placeholder {{
            color: #7a7a7a;
        }}
        
        .send-button {{
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
            border: none;
            border-radius: 50%;
            width: 48px;
            height: 48px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            font-size: 18px;
            box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        }}
        
        .send-button:hover {{
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }}
        
        .send-button:disabled {{
            background: #404040;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }}
        
        .send-button:active {{
            transform: scale(0.98);
        }}
        
        .websocket-status {{
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 6px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            z-index: 1001;
        }}
        
        .websocket-connected {{
            background: rgba(16, 185, 129, 0.15);
            color: #10b981;
            border: 1px solid rgba(16, 185, 129, 0.3);
        }}
        
        .websocket-disconnected {{
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }}
        
        @media (max-width: 480px) {{
            .header {{
                padding: 12px 16px;
            }}
            
            .chat-container {{
                padding: 16px;
            }}
            
            .input-container {{
                padding: 8px 12px;
            }}
            
            .message-input {{
                font-size: 16px;
            }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>Chat Server</h1>
    </div>
    
    <div class="chat-container" id="chatContainer">
        <div class="message system">
            💬 채팅이 시작되었습니다. 메시지를 입력해보세요!
        </div>
    </div>
    
    <div class="bottom-container">
        <div class="input-container">
            <div class="input-wrapper">
                <input 
                    type="text" 
                    class="message-input" 
                    id="messageInput" 
                    placeholder="메시지를 입력하세요..."
                    maxlength="500"
                >
            </div>
            <button class="send-button" id="sendButton">➤</button>
        </div>
    </div>
    
    <div class="websocket-status websocket-disconnected" id="wsStatus">
        연결 중...
    </div>

    <script>
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const chatContainer = document.getElementById('chatContainer');
        const wsStatus = document.getElementById('wsStatus');
        
        let websocket = null;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        
        function addMessage(content, type = 'user') {{
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${{type}}`;
            messageDiv.textContent = content;
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }}
        
        function connectWebSocket() {{
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${{wsProtocol}}//${{window.location.host}}/ws`;
            
            console.log('🔗 WebSocket 연결 시도:', wsUrl);
            
            try {{
                websocket = new WebSocket(wsUrl);
                
                websocket.onopen = function(event) {{
                    console.log('✅ WebSocket 연결됨');
                    wsStatus.textContent = '연결됨';
                    wsStatus.className = 'websocket-status websocket-connected';
                    reconnectAttempts = 0;
                }};
                
                websocket.onmessage = function(event) {{
                    console.log('💻 컴퓨터에서 메시지 받음:', event.data);
                    
                    try {{
                        // JSON 파싱 시도
                        const messageData = JSON.parse(event.data);
                        if (messageData.message && messageData.type) {{
                            addMessage(messageData.message, messageData.type);
                        }} else {{
                            // JSON이지만 올바른 형태가 아닌 경우 기본값으로 처리
                            addMessage(event.data, 'user');
                        }}
                    }} catch (e) {{
                        // JSON이 아닌 일반 텍스트인 경우 기본값으로 처리
                        addMessage(event.data, 'user');
                    }}
                }};
                
                websocket.onclose = function(event) {{
                    console.log('❌ WebSocket 연결 해제됨 (코드:', event.code, ')');
                    wsStatus.textContent = '연결 해제됨';
                    wsStatus.className = 'websocket-status websocket-disconnected';
                    
                    if (reconnectAttempts < maxReconnectAttempts) {{
                        reconnectAttempts++;
                        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
                        console.log(`🔄 ${{delay/1000}}초 후 재연결 시도 (${{reconnectAttempts}}/${{maxReconnectAttempts}})`);
                        wsStatus.textContent = `재연결 중... (${{reconnectAttempts}}/${{maxReconnectAttempts}})`;
                        setTimeout(connectWebSocket, delay);
                    }} else {{
                        console.log('❌ 최대 재연결 시도 횟수 초과');
                        wsStatus.textContent = '연결 실패 (새로고침 필요)';
                    }}
                }};
                
                websocket.onerror = function(error) {{
                    console.error('❌ WebSocket 에러:', error);
                    wsStatus.textContent = '연결 오류';
                    wsStatus.className = 'websocket-status websocket-disconnected';
                }};
                
            }} catch (error) {{
                console.error('❌ WebSocket 생성 실패:', error);
                wsStatus.textContent = '연결 실패';
                wsStatus.className = 'websocket-status websocket-disconnected';
            }}
        }}
        
        async function sendMessage() {{
            const message = messageInput.value.trim();
            if (!message) return;
            
            sendButton.disabled = true;
            const originalText = sendButton.innerHTML;
            sendButton.innerHTML = '...';
            
            // 즉시 사용자 메시지 추가
            addMessage(message, 'user');
            messageInput.value = '';
            
            try {{
                const response = await fetch('/send-message', {{
                    method: 'POST',
                    headers: {{
                        'Content-Type': 'application/json',
                    }},
                    body: JSON.stringify({{
                        message: message,
                        sender: 'user'
                    }})
                }});
                
                if (!response.ok) {{
                    throw new Error('서버 응답 오류: ' + response.status);
                }}
                
                console.log('✅ 메시지 전송 성공:', message);
            }} catch (error) {{
                console.error('❌ 메시지 전송 실패:', error);
                addMessage('메시지 전송에 실패했습니다: ' + error.message, 'system');
            }}
            
            sendButton.disabled = false;
            sendButton.innerHTML = originalText;
        }}
        
        sendButton.addEventListener('click', sendMessage);
        
        messageInput.addEventListener('keypress', function(e) {{
            if (e.key === 'Enter' && !e.shiftKey) {{
                e.preventDefault();
                sendMessage();
            }}
        }});
        
        // 모바일 키보드 대응
        let initialViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        
        function handleViewportChange() {{
            if (window.visualViewport) {{
                const currentHeight = window.visualViewport.height;
                const heightDifference = initialViewportHeight - currentHeight;
                
                if (heightDifference > 150) {{
                    chatContainer.classList.add('keyboard-active');
                }} else {{
                    chatContainer.classList.remove('keyboard-active');
                }}
            }}
        }}
        
        if (window.visualViewport) {{
            window.visualViewport.addEventListener('resize', handleViewportChange);
        }}
        
        connectWebSocket();
        messageInput.focus();
        
        console.log('📱 모던 채팅 클라이언트 초기화 완료');
    </script>
</body>
</html>"#
    )
}

// 💬 채팅 서버 시작 함수 (🔧 터널 기능 통합)
async fn start_chat_server(
    port: u16,
    node_id: String,
    app_handle: AppHandle,
    enable_global: bool, // 🆕 글로벌 터널 옵션
) -> Result<ChatWebServerResult, String> {
    let actual_port = find_available_port(port)?;
    let local_ips = get_local_ip_addresses();

    let local_url = if let Some(first_ip) = local_ips.first() {
        format!("http://{}:{}", first_ip, actual_port)
    } else {
        format!("http://127.0.0.1:{}", actual_port)
    };

    // 🎯 WebSocket 브로드캐스트 채널 생성
    let (websocket_tx, _) = broadcast::channel::<String>(1000);
    let websocket_tx_clone = websocket_tx.clone();

    // 채팅 HTML 생성
    let chat_html = create_mobile_chat_html();

    // 메인 페이지 라우트
    let chat_html_clone = chat_html.clone();
    let main_route = warp::path::end().map(move || warp::reply::html(chat_html_clone.clone()));

    // 메시지 전송 라우트
    let node_id_clone = node_id.clone();
    let app_handle_clone = app_handle.clone();

    let message_route = warp::path("send-message")
        .and(warp::post())
        .and(warp::body::json())
        .map(move |chat_msg: ChatMessage| {
            let node_id = node_id_clone.clone();
            let app_handle = app_handle_clone.clone();
            let message = chat_msg.message.clone();

            tokio::spawn(async move {
                let chat_event = ChatEvent {
                    node_id: node_id.clone(),
                    message: message.clone(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64,
                };

                if let Err(e) = app_handle.emit("chat-message-received", &chat_event) {
                    eprintln!("❌ Failed to emit chat event: {}", e);
                } else {
                    println!("📨 Chat message sent to frontend: {}", message);
                }
            });

            println!("💬 Received message: {}", chat_msg.message);
            warp::reply::json(&serde_json::json!({
                "status": "success",
                "message": "Message received"
            }))
        });

    // WebSocket 라우트
    let websocket_tx_for_route = websocket_tx_clone.clone();
    let websocket_route = warp::path("ws")
        .and(warp::ws())
        .map(move |ws: warp::ws::Ws| {
            let tx = websocket_tx_for_route.clone();
            ws.on_upgrade(move |websocket| {
                println!("📱 WebSocket 클라이언트 연결됨");

                let (mut ws_sender, _ws_receiver) = websocket.split();
                let mut rx = tx.subscribe();

                async move {
                    while let Ok(message) = rx.recv().await {
                        println!("📱 WebSocket으로 메시지 전송: {}", message);

                        if let Err(e) = ws_sender.send(warp::ws::Message::text(message)).await {
                            println!("❌ WebSocket 클라이언트 연결 해제됨: {}", e);
                            break;
                        } else {
                            println!("✅ WebSocket 메시지 전송 성공");
                        }
                    }
                    println!("📱 WebSocket 연결 종료됨");
                }
            })
        });

    // 라우트 결합
    let routes = main_route.or(message_route).or(websocket_route).with(
        warp::cors()
            .allow_any_origin()
            .allow_headers(vec!["content-type"])
            .allow_methods(vec!["GET", "POST"]),
    );

    let addr: SocketAddr = format!("0.0.0.0:{}", actual_port)
        .parse()
        .map_err(|e| format!("Invalid address: {}", e))?;

    // 🚀 서버 시작
    let server_key = format!("chat_server_{}", actual_port);

    let server_task = tokio::spawn(async move {
        println!(
            "💬 WebSocket 채팅 서버 시작: {} (모든 네트워크에서 접근 가능)",
            addr
        );
        warp::serve(routes).run(addr).await;
        println!("🛑 채팅 서버 중지됨: {}", addr);
    });

    let abort_handle = server_task.abort_handle();

    // 🆕 글로벌 터널 시작 (선택적)
    let final_server_url;
    let tunnel_url;
    let tunnel_status;

    if enable_global {
        println!("🌐 Starting global tunnel...");

        // 로컬 서버가 시작될 시간을 줌
        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;

        match start_cloudflare_tunnel(app_handle.clone(), actual_port, node_id.clone()).await {
            Ok(global_url) => {
                println!("✅ Global tunnel ready: {}", global_url);
                final_server_url = global_url.clone();
                tunnel_url = Some(global_url);
                tunnel_status = Some("active".to_string());
            }
            Err(e) => {
                println!("❌ Failed to start global tunnel: {}", e);
                final_server_url = local_url.clone();
                tunnel_url = None;
                tunnel_status = Some(format!("failed: {}", e));
            }
        }
    } else {
        final_server_url = local_url.clone();
        tunnel_url = None;
        tunnel_status = Some("disabled".to_string());
    }

    // 서버 정보 등록
    let handle = ChatServerHandle {
        port: actual_port,
        server_url: final_server_url.clone(),
        local_url: Some(local_url.clone()),
        status: "running".to_string(),
        node_id: node_id.clone(),
        app_handle,
        abort_handle,
        websocket_sender: websocket_tx,
        has_tunnel: enable_global && tunnel_url.is_some(),
        tunnel_url: tunnel_url.clone(),
    };

    {
        let registry = get_chat_server_registry();
        let mut servers = registry.write().await;
        servers.insert(server_key, handle);
    }

    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    println!("✅ WebSocket 채팅 서버 시작 완료: {}", final_server_url);
    if local_ips.len() > 1 {
        println!("   다른 사용 가능한 IP들: {:?}", &local_ips[1..]);
    }

    let message = if enable_global {
        if tunnel_url.is_some() {
            format!(
                "글로벌 채팅 서버가 {}로 시작되었으며 전세계에서 접근 가능합니다",
                final_server_url
            )
        } else {
            format!(
                "로컬 채팅 서버가 {}로 시작되었습니다 (글로벌 터널 실패)",
                final_server_url
            )
        }
    } else {
        format!(
            "로컬 채팅 서버가 {}로 시작되었으며 같은 네트워크에서 접근 가능합니다",
            final_server_url
        )
    };

    Ok(ChatWebServerResult {
        server_url: final_server_url,
        actual_port,
        status: "running".to_string(),
        message: Some(message),
        received_message: None,
        local_url: Some(local_url),
        tunnel_status,
    })
}

// 🎯 Tauri 명령 함수 (🔧 글로벌 옵션 추가)
#[tauri::command]
pub async fn chat_web_server_node(
    app_handle: AppHandle,
    port: u16,
    node_id: Option<String>,
    enable_global: Option<bool>, // 🆕 글로벌 터널 옵션
) -> Result<ChatWebServerResult, String> {
    let node_id = node_id.unwrap_or_else(|| "unknown".to_string());
    let enable_global = enable_global.unwrap_or(false);

    println!(
        "💬 ChatWebServerNode: 포트 {}에서 채팅 서버 시작 중 (글로벌: {})",
        port, enable_global
    );

    match start_chat_server(port, node_id, app_handle, enable_global).await {
        Ok(result) => {
            println!(
                "✅ ChatWebServerNode: 채팅 서버 시작 완료 - {}",
                result.server_url
            );
            Ok(result)
        }
        Err(error) => {
            println!("❌ ChatWebServerNode: 채팅 서버 시작 실패 - {}", error);
            Err(format!("Failed to start chat server: {}", error))
        }
    }
}

// 🚀 모바일로 메시지 전송 함수 (기존과 동일)
// 🆕 웹페이지로 응답 메시지 전송
#[tauri::command]
pub async fn send_web_response(node_id: String, response_message: String) -> Result<String, String> {
    println!("🌐 Sending web response for node {}: {}", node_id, response_message);
    
    let registry = get_chat_server_registry();
    let servers = registry.read().await;
    
    let server_handle = servers.values().find(|handle| handle.node_id == node_id);
    
    if let Some(handle) = server_handle {
        // WebSocket으로 응답 전송 (assistant 타입으로)
        let response_json = serde_json::json!({
            "message": response_message,
            "type": "assistant",
            "timestamp": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        });
        
        if let Err(e) = handle.websocket_sender.send(response_json.to_string()) {
            println!("❌ Failed to send web response: {}", e);
            return Err(format!("Failed to send web response: {}", e));
        }
        
        println!("✅ Web response sent successfully to webpage");
        Ok("Web response sent successfully".to_string())
    } else {
        Err(format!("Chat server not found for node: {}", node_id))
    }
}

#[tauri::command]
pub async fn send_to_mobile(node_id: String, message: String) -> Result<String, String> {
    send_to_mobile_with_type(node_id, message, "user".to_string()).await
}

#[tauri::command]
pub async fn send_to_mobile_with_type(node_id: String, message: String, message_type: String) -> Result<String, String> {
    println!(
        "📱 SendToMobile: 노드 {}로 메시지 전송 중 (타입: {}) - '{}'",
        node_id, message_type, message
    );

    let registry = get_chat_server_registry();
    let servers = registry.read().await;

    let server_handle = servers.values().find(|handle| handle.node_id == node_id);

    if let Some(handle) = server_handle {
        // JSON 형태로 메시지와 타입을 함께 전송
        let message_json = serde_json::json!({
            "message": message,
            "type": message_type
        }).to_string();
        
        match handle.websocket_sender.send(message_json) {
            Ok(receiver_count) => {
                println!(
                    "✅ {}개의 WebSocket 클라이언트에게 메시지 전송됨",
                    receiver_count
                );
                if receiver_count == 0 {
                    println!("⚠️ 현재 연결된 WebSocket 클라이언트가 없습니다");
                    Ok("Message queued (no active clients)".to_string())
                } else {
                    Ok(format!("Message sent to {} clients", receiver_count))
                }
            }
            Err(e) => {
                println!("❌ WebSocket 메시지 전송 실패: {}", e);
                Err(format!("Failed to send message: {}", e))
            }
        }
    } else {
        println!("⚠️ 노드 {}에 대한 실행 중인 서버를 찾을 수 없음", node_id);
        Err(format!("No server running for node {}", node_id))
    }
}

// 🛑 개별 채팅 서버 중지 함수 (🔧 터널도 함께 중지)
#[tauri::command]
pub async fn stop_chat_server_node(node_id: String) -> Result<String, String> {
    println!("🛑 StopChatServerNode: 노드 {} 서버 중지 중", node_id);

    let registry = get_chat_server_registry();
    let mut servers = registry.write().await;

    let server_key_to_remove = servers
        .iter()
        .find(|(_, handle)| handle.node_id == node_id)
        .map(|(key, _)| key.clone());

    if let Some(server_key) = server_key_to_remove {
        if let Some(handle) = servers.remove(&server_key) {
            // 🚀 서버 태스크 중단
            handle.abort_handle.abort();

            // 🆕 터널도 중지
            if handle.has_tunnel {
                if let Err(e) = stop_cloudflare_tunnel(node_id.clone()).await {
                    println!("⚠️ Failed to stop tunnel: {}", e);
                }
            }

            println!(
                "✅ 노드 {}의 채팅 서버 중지됨 (포트: {})",
                node_id, handle.port
            );

            // 서버 중지 이벤트 전송
            if let Err(e) = handle.app_handle.emit(
                "chat-server-stopped",
                &serde_json::json!({
                    "node_id": node_id,
                    "port": handle.port,
                    "server_url": handle.server_url
                }),
            ) {
                eprintln!("⚠️ 서버 중지 이벤트 전송 실패: {}", e);
            }

            let message = if handle.has_tunnel {
                format!("채팅 서버와 글로벌 터널이 성공적으로 중지되었습니다 (포트 {}에서 실행 중이었음)", handle.port)
            } else {
                format!(
                    "채팅 서버가 성공적으로 중지되었습니다 (포트 {}에서 실행 중이었음)",
                    handle.port
                )
            };

            Ok(message)
        } else {
            Err(format!("노드 {}의 서버 제거 실패", node_id))
        }
    } else {
        println!("⚠️ 노드 {}에 대한 실행 중인 서버를 찾을 수 없음", node_id);
        Ok("이 노드에 대해 실행 중인 서버가 없었습니다".to_string())
    }
}

// 🆕 터널만 중지하는 함수
#[tauri::command]
pub async fn stop_chat_tunnel(node_id: String) -> Result<String, String> {
    println!("🛑 StopChatTunnel: 노드 {} 터널 중지 중", node_id);

    match stop_cloudflare_tunnel(node_id.clone()).await {
        Ok(_) => {
            // 서버 핸들에서 터널 상태 업데이트
            let registry = get_chat_server_registry();
            let mut servers = registry.write().await;

            for (_, handle) in servers.iter_mut() {
                if handle.node_id == node_id {
                    handle.has_tunnel = false;
                    handle.tunnel_url = None;
                    handle.server_url = handle
                        .local_url
                        .clone()
                        .unwrap_or_else(|| format!("http://localhost:{}", handle.port));
                    break;
                }
            }

            Ok("Tunnel stopped successfully".to_string())
        }
        Err(e) => Err(e),
    }
}

// 🔍 특정 노드의 서버 상태 확인 함수 (기존과 동일)
#[tauri::command]
pub async fn get_chat_server_status(node_id: String) -> Result<bool, String> {
    let registry = get_chat_server_registry();
    let servers = registry.read().await;

    let is_running = servers
        .values()
        .any(|handle| handle.node_id == node_id && handle.status == "running");

    Ok(is_running)
}

// 🆕 서버 정보 가져오기 함수
#[tauri::command]
pub async fn get_chat_server_info(node_id: String) -> Result<serde_json::Value, String> {
    let registry = get_chat_server_registry();
    let servers = registry.read().await;

    if let Some(handle) = servers.values().find(|h| h.node_id == node_id) {
        Ok(serde_json::json!({
            "running": true,
            "port": handle.port,
            "server_url": handle.server_url,
            "local_url": handle.local_url,
            "has_tunnel": handle.has_tunnel,
            "tunnel_url": handle.tunnel_url,
            "status": handle.status
        }))
    } else {
        Ok(serde_json::json!({
            "running": false
        }))
    }
}

// 🧹 정리 함수들
#[allow(dead_code)]
pub async fn list_running_chat_servers() -> Vec<String> {
    let registry = get_chat_server_registry();
    let servers = registry.read().await;
    servers.keys().cloned().collect()
}

#[allow(dead_code)]
pub async fn stop_all_chat_servers() {
    let registry = get_chat_server_registry();
    let mut servers = registry.write().await;

    // 모든 서버 태스크 중단
    for (_, handle) in servers.iter() {
        handle.abort_handle.abort();

        // 터널도 중지
        if handle.has_tunnel {
            let _ = stop_cloudflare_tunnel(handle.node_id.clone()).await;
        }

        println!("🛑 서버 중지됨: 포트 {}", handle.port);
    }

    // 🔧 Tauri v2: 모든 터널 프로세스 정리
    let tunnel_registry = get_tunnel_registry();
    let mut tunnels = tunnel_registry.write().await;

    for (node_id, child) in tunnels.drain() {
        let _ = child.kill();
        println!("🛑 터널 중지됨: 노드 {}", node_id);
    }

    servers.clear();
    println!("🧹 모든 채팅 서버와 터널이 정리되었습니다");
}
