use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};
use warp::Filter;
use tauri::{AppHandle, Emitter};
use futures_util::{sink::SinkExt, stream::StreamExt}; // 🎯 StreamExt 추가
use tauri::Manager;

// 💬 채팅 웹서버 노드 구조체들

#[derive(Debug, Serialize)]
pub struct ChatWebServerResult {
    server_url: String,
    actual_port: u16,
    status: String,
    message: Option<String>,
    received_message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    message: String,
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

#[derive(Debug)]
struct ChatServerHandle {
    port: u16,
    server_url: String,
    status: String,
    node_id: String,
    app_handle: AppHandle,
    abort_handle: tokio::task::AbortHandle,
    websocket_sender: broadcast::Sender<String>, // WebSocket 브로드캐스트 채널
}

// 전역 채팅 서버 레지스트리
static CHAT_SERVER_REGISTRY: std::sync::OnceLock<ChatServerRegistry> = std::sync::OnceLock::new();

fn get_chat_server_registry() -> &'static ChatServerRegistry {
    CHAT_SERVER_REGISTRY.get_or_init(|| Arc::new(RwLock::new(HashMap::new())))
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
        Ok(listener) => {
            match listener.local_addr() {
                Ok(addr) => Ok(addr.port()),
                Err(e) => Err(format!("Failed to get local address: {}", e)),
            }
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
                if !ipv4.is_loopback() && 
                   !ipv4.is_link_local() && 
                   !is_apipa_address(ipv4) &&
                   interface_name != "lo" {
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

// 📱 모바일 친화적 채팅 HTML 생성 함수 (🎯 문구 수정 및 WebSocket 개선)
fn create_mobile_chat_html(chat_title: String, server_port: u16) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>{}</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }}
        
        .chat-header {{
            background: rgba(255, 255, 255, 0.95);
            padding: 15px 20px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            backdrop-filter: blur(10px);
        }}
        
        .chat-header h1 {{
            color: #333;
            font-size: 1.2em;
            font-weight: 600;
        }}
        
        .chat-container {{
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 20px;
            max-width: 600px;
            margin: 0 auto;
            width: 100%;
        }}
        
        .message-display {{
            background: rgba(255, 255, 255, 0.95);
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 20px;
            min-height: 150px;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
            gap: 15px;
        }}
        
        .message-section {{
            background: #f8f9fa;
            border-radius: 10px;
            padding: 15px;
            border-left: 4px solid #ddd;
        }}
        
        .message-section.sent {{
            border-left-color: #667eea;
        }}
        
        .message-section.received {{
            border-left-color: #4caf50;
        }}
        
        .message-label {{
            font-size: 0.9em;
            font-weight: 600;
            margin-bottom: 8px;
            opacity: 0.7;
        }}
        
        .message-content {{
            font-size: 1.1em;
            color: #333;
            min-height: 20px;
            word-wrap: break-word;
        }}
        
        .message-empty {{
            color: #999;
            font-style: italic;
        }}
        
        .input-container {{
            background: rgba(255, 255, 255, 0.95);
            border-radius: 25px;
            padding: 15px;
            display: flex;
            gap: 10px;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }}
        
        .message-input {{
            flex: 1;
            border: none;
            outline: none;
            padding: 12px 18px;
            border-radius: 20px;
            background: #f8f9fa;
            font-size: 16px;
            color: #333;
        }}
        
        .send-button {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 20px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            min-width: 80px;
        }}
        
        .send-button:hover {{
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }}
        
        .send-button:active {{
            transform: translateY(0);
        }}
        
        .send-button:disabled {{
            opacity: 0.6;
            cursor: not-allowed;
        }}
        
        .status {{
            text-align: center;
            color: rgba(255, 255, 255, 0.8);
            font-size: 0.9em;
            margin-top: 10px;
        }}
        
        .websocket-status {{
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 0.8em;
            margin-top: 5px;
        }}
        
        .websocket-connected {{
            background: rgba(76, 175, 80, 0.2);
            color: #4caf50;
        }}
        
        .websocket-disconnected {{
            background: rgba(244, 67, 54, 0.2);
            color: #f44336;
        }}
        
        @media (max-width: 480px) {{
            .chat-container {{
                padding: 15px;
            }}
            
            .message-input {{
                font-size: 16px; /* iOS 줌 방지 */
            }}
        }}
    </style>
</head>
<body>
    <div class="chat-header">
        <h1>{}</h1>
    </div>
    
    <div class="chat-container">
        <div class="message-display">
            <!-- 📱 모바일에서 보낸 마지막 메시지 -->
            <div class="message-section sent">
                <div class="message-label">📱 내가 보낸 메시지:</div>
                <div class="message-content" id="sentMessage">
                    <span class="message-empty">아직 메시지를 보내지 않았습니다.</span>
                </div>
            </div>
            
            <!-- 💻 컴퓨터에서 보낸 메시지 (🎯 문구 수정) -->
            <div class="message-section received">
                <div class="message-label">💻 컴퓨터에서 보낸 메시지:</div>
                <div class="message-content" id="receivedMessage">
                    <span class="message-empty">컴퓨터에서 메시지를 기다리는 중...</span>
                </div>
            </div>
        </div>
        
        <div class="input-container">
            <input 
                type="text" 
                class="message-input" 
                id="messageInput" 
                placeholder="메시지를 입력하세요..."
                maxlength="500"
            >
            <button class="send-button" id="sendButton">전송</button>
        </div>
        
        <div class="status" id="status">
            연결됨 • 포트 {}
            <div class="websocket-status websocket-disconnected" id="wsStatus">
                WebSocket 연결 중...
            </div>
        </div>
    </div>

    <script>
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const sentMessageDiv = document.getElementById('sentMessage');
        const receivedMessageDiv = document.getElementById('receivedMessage');
        const status = document.getElementById('status');
        const wsStatus = document.getElementById('wsStatus');
        
        let websocket = null;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        
        // 🚀 WebSocket 연결 설정 (🎯 개선된 재연결 로직)
        function connectWebSocket() {{
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${{wsProtocol}}//${{window.location.host}}/ws`;
            
            console.log('🔗 WebSocket 연결 시도:', wsUrl);
            
            try {{
                websocket = new WebSocket(wsUrl);
                
                websocket.onopen = function(event) {{
                    console.log('✅ WebSocket 연결됨');
                    wsStatus.textContent = 'WebSocket 연결됨 ✅';
                    wsStatus.className = 'websocket-status websocket-connected';
                    reconnectAttempts = 0; // 성공시 재연결 카운터 리셋
                }};
                
                websocket.onmessage = function(event) {{
                    console.log('💻 컴퓨터에서 메시지 받음:', event.data);
                    // 🎯 실시간으로 화면에 표시
                    receivedMessageDiv.innerHTML = event.data;
                    receivedMessageDiv.scrollIntoView({{ behavior: 'smooth' }});
                }};
                
                websocket.onclose = function(event) {{
                    console.log('❌ WebSocket 연결 해제됨 (코드:', event.code, ')');
                    wsStatus.textContent = 'WebSocket 연결 해제됨 ❌';
                    wsStatus.className = 'websocket-status websocket-disconnected';
                    
                    // 🎯 개선된 재연결 로직
                    if (reconnectAttempts < maxReconnectAttempts) {{
                        reconnectAttempts++;
                        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000); // 지수 백오프
                        console.log(`🔄 ${{delay/1000}}초 후 재연결 시도 (${{reconnectAttempts}}/${{maxReconnectAttempts}})`);
                        wsStatus.textContent = `${{delay/1000}}초 후 재연결... (${{reconnectAttempts}}/${{maxReconnectAttempts}})`;
                        setTimeout(connectWebSocket, delay);
                    }} else {{
                        console.log('❌ 최대 재연결 시도 횟수 초과');
                        wsStatus.textContent = '연결 실패 ❌ (새로고침 해주세요)';
                    }}
                }};
                
                websocket.onerror = function(error) {{
                    console.error('❌ WebSocket 에러:', error);
                    wsStatus.textContent = 'WebSocket 에러 ⚠️';
                    wsStatus.className = 'websocket-status websocket-disconnected';
                }};
                
            }} catch (error) {{
                console.error('❌ WebSocket 생성 실패:', error);
                wsStatus.textContent = 'WebSocket 생성 실패 ❌';
                wsStatus.className = 'websocket-status websocket-disconnected';
            }}
        }}
        
        // 메시지 전송 함수
        async function sendMessage() {{
            const message = messageInput.value.trim();
            if (!message) return;
            
            sendButton.disabled = true;
            sendButton.textContent = '전송중...';
            
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
                
                if (response.ok) {{
                    sentMessageDiv.innerHTML = message;
                    messageInput.value = '';
                    console.log('✅ 메시지 전송 성공:', message);
                }} else {{
                    throw new Error('서버 응답 오류: ' + response.status);
                }}
            }} catch (error) {{
                console.error('❌ 메시지 전송 실패:', error);
                alert('메시지 전송에 실패했습니다: ' + error.message);
            }}
            
            sendButton.disabled = false;
            sendButton.textContent = '전송';
        }}
        
        // 이벤트 리스너
        sendButton.addEventListener('click', sendMessage);
        
        messageInput.addEventListener('keypress', function(e) {{
            if (e.key === 'Enter') {{
                sendMessage();
            }}
        }});
        
        // 🎯 즉시 WebSocket 연결 시작
        connectWebSocket();
        
        // 포커스 설정
        messageInput.focus();
        
        console.log('📱 모바일 채팅 클라이언트 초기화 완료');
    </script>
</body>
</html>"#,
        chat_title, chat_title, server_port
    )
}

// 💬 채팅 서버 시작 함수 (🎯 WebSocket 개선)
async fn start_chat_server(
    port: u16,
    chat_title: String,
    node_id: String,
    app_handle: AppHandle,
) -> Result<ChatWebServerResult, String> {
    let actual_port = find_available_port(port)?;
    let local_ips = get_local_ip_addresses();
    
    let server_url = if let Some(first_ip) = local_ips.first() {
        format!("http://{}:{}", first_ip, actual_port)
    } else {
        format!("http://127.0.0.1:{}", actual_port)
    };
    
    // 🎯 WebSocket 브로드캐스트 채널 생성 (더 큰 버퍼)
    let (websocket_tx, _) = broadcast::channel::<String>(1000);
    let websocket_tx_clone = websocket_tx.clone();
    
    // 채팅 HTML 생성
    let chat_html = create_mobile_chat_html(chat_title.clone(), actual_port);
    
    // 메인 페이지 라우트
    let chat_html_clone = chat_html.clone();
    let main_route = warp::path::end()
        .map(move || warp::reply::html(chat_html_clone.clone()));
    
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
            
            // 🚀 실시간 이벤트 전송
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
    
    // 🎯 개선된 WebSocket 라우트
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
                    // 🎯 메시지 브로드캐스트 수신 및 클라이언트로 전송
                    while let Ok(message) = rx.recv().await {
                        println!("📱 WebSocket으로 메시지 전송: {}", message);
                        
                        // 🚀 실제 WebSocket 메시지 전송
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
    let routes = main_route
        .or(message_route)
        .or(websocket_route)
        .with(warp::cors().allow_any_origin().allow_headers(vec!["content-type"]).allow_methods(vec!["GET", "POST"]));
    
    let addr: SocketAddr = format!("0.0.0.0:{}", actual_port)
        .parse()
        .map_err(|e| format!("Invalid address: {}", e))?;
    
    // 🚀 서버 시작 (중단 가능한 태스크로)
    let server_key = format!("chat_server_{}", actual_port);
    
    let server_task = tokio::spawn(async move {
        println!("💬 WebSocket 채팅 서버 시작: {} (모든 네트워크에서 접근 가능)", addr);
        warp::serve(routes).run(addr).await;
        println!("🛑 채팅 서버 중지됨: {}", addr);
    });
    
    // AbortHandle 저장
    let abort_handle = server_task.abort_handle();
    
    // 서버 정보 등록
    let handle = ChatServerHandle {
        port: actual_port,
        server_url: server_url.clone(),
        status: "running".to_string(),
        node_id: node_id.clone(),
        app_handle,
        abort_handle,
        websocket_sender: websocket_tx, // WebSocket 브로드캐스트 채널 저장
    };
    
    {
        let registry = get_chat_server_registry();
        let mut servers = registry.write().await;
        servers.insert(server_key, handle);
    }
    
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    println!("✅ WebSocket 채팅 서버 시작 완료: {}", server_url);
    if local_ips.len() > 1 {
        println!("   다른 사용 가능한 IP들: {:?}", &local_ips[1..]);
    }
    
    let message = format!("실시간 WebSocket 채팅 서버가 시작되었으며 모든 기기에서 {}로 접근 가능합니다", server_url);
    
    Ok(ChatWebServerResult {
        server_url,
        actual_port,
        status: "running".to_string(),
        message: Some(message),
        received_message: None,
    })
}

// 🎯 Tauri 명령 함수
#[tauri::command]
pub async fn chat_web_server_node(
    app_handle: AppHandle,
    port: u16,
    chat_title: String,
    node_id: Option<String>,
) -> Result<ChatWebServerResult, String> {
    let node_id = node_id.unwrap_or_else(|| "unknown".to_string());
    
    println!("💬 ChatWebServerNode: 포트 {}에서 '{}' 채팅 서버 시작 중", port, chat_title);
    
    if chat_title.trim().is_empty() {
        return Err("Chat title cannot be empty".to_string());
    }
    
    match start_chat_server(port, chat_title, node_id, app_handle).await {
        Ok(result) => {
            println!("✅ ChatWebServerNode: 채팅 서버 시작 완료 - {}", result.server_url);
            Ok(result)
        },
        Err(error) => {
            println!("❌ ChatWebServerNode: 채팅 서버 시작 실패 - {}", error);
            Err(format!("Failed to start chat server: {}", error))
        }
    }
}

// 🚀 모바일로 메시지 전송 함수 (🎯 개선된 에러 처리)
#[tauri::command]
pub async fn send_to_mobile(node_id: String, message: String) -> Result<String, String> {
    println!("📱 SendToMobile: 노드 {}로 메시지 전송 중 - '{}'", node_id, message);
    
    let registry = get_chat_server_registry();
    let servers = registry.read().await;
    
    // 해당 노드의 서버 찾기
    let server_handle = servers
        .values()
        .find(|handle| handle.node_id == node_id);
    
    if let Some(handle) = server_handle {
        // 🎯 WebSocket으로 메시지 브로드캐스트
        match handle.websocket_sender.send(message.clone()) {
            Ok(receiver_count) => {
                println!("✅ {}개의 WebSocket 클라이언트에게 메시지 전송됨", receiver_count);
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

// 🛑 개별 채팅 서버 중지 함수
#[tauri::command]
pub async fn stop_chat_server_node(node_id: String) -> Result<String, String> {
    println!("🛑 StopChatServerNode: 노드 {} 서버 중지 중", node_id);
    
    let registry = get_chat_server_registry();
    let mut servers = registry.write().await;
    
    // 해당 노드의 서버 찾기
    let server_key_to_remove = servers
        .iter()
        .find(|(_, handle)| handle.node_id == node_id)
        .map(|(key, _)| key.clone());
    
    if let Some(server_key) = server_key_to_remove {
        // 서버 레지스트리에서 제거
        if let Some(handle) = servers.remove(&server_key) {
            // 🚀 실제 서버 태스크 중단
            handle.abort_handle.abort();
            
            println!("✅ 노드 {}의 채팅 서버 중지됨 (포트: {})", node_id, handle.port);
            
            // 서버 중지 이벤트 전송 (선택적)
            if let Err(e) = handle.app_handle.emit("chat-server-stopped", &serde_json::json!({
                "node_id": node_id,
                "port": handle.port,
                "server_url": handle.server_url
            })) {
                eprintln!("⚠️ 서버 중지 이벤트 전송 실패: {}", e);
            }
            
            Ok(format!("채팅 서버가 성공적으로 중지되었습니다 (포트 {}에서 실행 중이었음)", handle.port))
        } else {
            Err(format!("노드 {}의 서버 제거 실패", node_id))
        }
    } else {
        println!("⚠️ 노드 {}에 대한 실행 중인 서버를 찾을 수 없음", node_id);
        Ok("이 노드에 대해 실행 중인 서버가 없었습니다".to_string())
    }
}

// 🔍 특정 노드의 서버 상태 확인 함수
#[tauri::command]
pub async fn get_chat_server_status(node_id: String) -> Result<bool, String> {
    let registry = get_chat_server_registry();
    let servers = registry.read().await;
    
    let is_running = servers
        .values()
        .any(|handle| handle.node_id == node_id && handle.status == "running");
    
    Ok(is_running)
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
        println!("🛑 서버 중지됨: 포트 {}", handle.port);
    }
    
    servers.clear();
    println!("🧹 모든 채팅 서버가 정리되었습니다");
}