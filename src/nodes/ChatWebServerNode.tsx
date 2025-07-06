import React, { useState, useEffect, useCallback } from 'react';
import { Globe, Hash, MessageCircle, Play, Square } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import BaseNode, { InputField, OutputField } from './Basenode';

import type {
  NodeConfig,
  ExecutionMode,
  BaseNodeData
} from '../types';

import { useWorkflow, useHandleConnection } from '../WorkflowContext';

// 채팅 웹서버 노드 데이터 타입 (확장)
interface ChatWebServerNodeData extends BaseNodeData {
  port: string;
  chatTitle: string;
  text: string; // 다른 노드에서 받는 텍스트 입력
}

// 채팅 웹서버 노드 Props 타입
interface ChatWebServerNodeProps {
  id: string;
  data: ChatWebServerNodeData;
  selected: boolean;
}

// 백엔드 파라미터 타입 (단순화)
interface ChatWebServerParams {
  port: number;
  chatTitle: string;
}

// 백엔드 결과 타입 (단순화)
interface ChatWebServerResult {
  server_url: string;
  actual_port: number;
  status: string;
  message?: string;
  received_message?: string;
}

function ChatWebServerNode({ id, data, selected }: ChatWebServerNodeProps) {
  const { executeNextNodes, updateNodeData } = useWorkflow();

  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [result, setResult] = useState<string>('');
  const [isServerRunning, setIsServerRunning] = useState<boolean>(false);
  
  // 서버 URL을 별도 상태로 관리 (고정용)
  const [serverUrl, setServerUrl] = useState<string>('');

  const [localPort, setLocalPort] = useState('');
  const [localChatTitle, setLocalChatTitle] = useState('');
  const [localTextInput, setLocalTextInput] = useState('');

  const isPortConnected = useHandleConnection(id, 'port');
  const isChatTitleConnected = useHandleConnection(id, 'chatTitle');
  const isTextInputConnected = useHandleConnection(id, 'text');

  // 초기값 설정
  useEffect(() => {
    setLocalPort(data?.port || '8080');
    setLocalChatTitle(data?.chatTitle || 'Mobile Chat Room');
    setLocalTextInput(data?.text || '');
  }, [data?.port, data?.chatTitle, data?.text]);

  const handleBlur = (key: keyof ChatWebServerNodeData, value: string) => {
    if (key === 'port' && !isPortConnected && data.port !== value) {
      updateNodeData(id, { port: value });
    }
    if (key === 'chatTitle' && !isChatTitleConnected && data.chatTitle !== value) {
      updateNodeData(id, { chatTitle: value });
    }
    if (key === 'text' && !isTextInputConnected && data.text !== value) {
      updateNodeData(id, { text: value });
    }
  };

  // ✅ 서버 시작 함수
  const startServer = useCallback(async (): Promise<void> => {
    const currentPort = data?.port?.trim() || '8080';
    const currentChatTitle = data?.chatTitle?.trim() || 'Mobile Chat Room';

    setStatus('running');
    try {
      const portNumber = parseInt(currentPort) || 8080;
      
      console.log(`💬 ChatWebServerNode ${id}: Starting chat server...`);

      const resultData: ChatWebServerResult = await invoke('chat_web_server_node', {
        port: portNumber,
        chatTitle: currentChatTitle,
        nodeId: id
      });

      setStatus('completed');
      setResult(`Chat server running at ${resultData.server_url}`);
      setIsServerRunning(true);
      
      // 서버 URL을 별도 상태에 저장 (고정)
      setServerUrl(resultData.server_url);

      updateNodeData(id, {
        triggerExecution: undefined,
        outputData: {
          ...data.outputData,
          receivedMessage: resultData.received_message || ''
        }
      });

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('❌ Chat server startup failed:', errorMessage, error);
      setStatus('failed');
      setResult(errorMessage);
      setIsServerRunning(false);
      
      // 서버 시작 실패시 URL 클리어
      setServerUrl('');

      updateNodeData(id, {
        triggerExecution: undefined,
        outputData: {
          ...data.outputData,
          receivedMessage: ''
        }
      });

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
    }
  }, [id, data?.port, data?.chatTitle, updateNodeData]);

  // ✅ 서버 중지 함수
  const stopServer = useCallback(async (): Promise<void> => {
    setStatus('running');
    try {
      console.log(`🛑 ChatWebServerNode ${id}: Stopping chat server...`);

      const result = await invoke('stop_chat_server_node', { nodeId: id });
      
      console.log(`✅ Server stop result:`, result);

      setStatus('completed');
      setResult('Chat server stopped');
      setIsServerRunning(false);
      
      // 서버 중지시 URL 클리어
      setServerUrl('');

      updateNodeData(id, {
        outputData: {
          ...data.outputData,
          receivedMessage: ''
        }
      });

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('❌ Chat server stop failed:', errorMessage, error);
      setStatus('failed');
      setResult(errorMessage);

      setTimeout(async () => { 
        setStatus('waiting'); 
        setResult('');
        
        try {
          const isRunning = await invoke('get_chat_server_status', { nodeId: id });
          setIsServerRunning(isRunning as boolean);
          console.log(`🔍 Server status check: ${isRunning}`);
        } catch (e) {
          console.warn('⚠️ Failed to check server status:', e);
        }
      }, 2000);
    }
  }, [id, updateNodeData]);

  // ✅ 실행 모드에 따른 동작 (토글 vs 시작)
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    if (mode === 'triggered') {
      console.log(`🔗 ChatWebServerNode: Triggered execution - starting server`);
      await startServer();
      executeNextNodes(id);
    } else {
      if (isServerRunning) {
        console.log(`🔧 ChatWebServerNode: Manual execution - stopping server`);
        await stopServer();
      } else {
        console.log(`🔧 ChatWebServerNode: Manual execution - starting server`);
        await startServer();
      }
    }
  }, [isServerRunning, startServer, stopServer, executeNextNodes, id]);

  // ✅ 트리거 실행 감지
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number') {
      console.log(`💬 Chat server node ${id} auto-execution triggered!`);
      executeNode('triggered');
    }
  }, [data.triggerExecution, executeNode]);

  // 🚀 실시간 채팅 메시지 이벤트 리스너
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen('chat-message-received', (event: any) => {
          const payload = event.payload;
          
          if (payload.node_id === id) {
            console.log(`📨 Node ${id} received message: ${payload.message}`);
            
            updateNodeData(id, {
              outputData: {
                ...data.outputData,
                receivedMessage: payload.message
              }
            });

            setTimeout(() => {
              console.log(`🔗 Message received, triggering next nodes from ${id}`);
              executeNextNodes(id);
            }, 50);
          }
        });
        
        console.log(`👂 Chat message listener setup for node ${id}`);
      } catch (error) {
        console.error('❌ Failed to setup chat message listener:', error);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
        console.log(`🔇 Chat message listener removed for node ${id}`);
      }
    };
  }, [id, executeNextNodes]); // executeNextNodes 다시 추가 (트리거 작동용)

  // 텍스트 입력 처리
  useEffect(() => {
    if (data?.text && data.text.trim() !== '' && isServerRunning) {
      console.log(`📥 Node ${id} processing text input: "${data.text}"`);
      
      updateNodeData(id, {
        outputData: {
          ...data.outputData,
          resultMessage: data.text
        }
      });

      invoke('send_to_mobile', {
        nodeId: id,
        message: data.text
      }).then((result) => {
        console.log(`✅ send_to_mobile 성공:`, result);
      }).catch((error) => {
        console.error(`❌ send_to_mobile 실패:`, error);
      });

    } else if (data?.text && data.text.trim() !== '' && !isServerRunning) {
      updateNodeData(id, {
        outputData: {
          ...data.outputData,
          resultMessage: data.text
        }
      });
    }
  }, [data?.text, id, isServerRunning, updateNodeData]); // data.outputData 제거!

  // 컴포넌트 마운트시 서버 상태 초기화
  useEffect(() => {
    const checkInitialServerStatus = async () => {
      try {
        const isRunning = await invoke('get_chat_server_status', { nodeId: id });
        setIsServerRunning(isRunning as boolean);
        console.log(`🔍 Initial server status for node ${id}: ${isRunning}`);
      } catch (error) {
        console.warn('⚠️ Failed to check initial server status:', error);
        setIsServerRunning(false);
      }
    };
    
    checkInitialServerStatus();
  }, [id]);

  return (
    <BaseNode<ChatWebServerNodeData>
      id={id}
      title="Mobile Chat Server"
      icon={<MessageCircle size={16} stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode}
      data={data}
      result={result}
      description="Starts a mobile-friendly chat server to receive messages"
      customExecuteIcon={isServerRunning ? <Square size={12} /> : <Play size={12} />}
    >
      {/* Chat Room Title - 맨 위로 이동 */}
      <div onBlur={() => handleBlur('chatTitle', localChatTitle)}>
        <InputField
          nodeId={id}
          label="Chat Room Title"
          icon={<MessageCircle size={12} />}
          value={localChatTitle}
          placeholder="Mobile Chat Room"
          onChange={setLocalChatTitle}
          handleId="chatTitle"
          disabled={isChatTitleConnected}
        />
      </div>

      {/* Server Port - 두 번째 */}
      <div onBlur={() => handleBlur('port', localPort)}>
        <InputField
          nodeId={id}
          label="Server Port"
          icon={<Hash size={12} />}
          value={localPort}
          placeholder="8080"
          onChange={setLocalPort}
          handleId="port"
          disabled={isPortConnected}
        />
      </div>

      {/* Text Input - 세 번째 */}
      <div onBlur={() => handleBlur('text', localTextInput)}>
        <InputField
          nodeId={id}
          label="Text Input (from other nodes)"
          icon={<MessageCircle size={12} />}
          value={localTextInput}
          placeholder="Connected from other nodes..."
          onChange={setLocalTextInput}
          handleId="text"
          disabled={isTextInputConnected}
        />
      </div>

      <OutputField
        nodeId={id}
        label="Server URL"
        icon={<Globe size={12} />}
        value={serverUrl}
        handleId="serverUrl"
      />

      <OutputField
        nodeId={id}
        label="Received Message"
        icon={<MessageCircle size={12} />}
        value={data.outputData?.receivedMessage || ''}
        handleId="receivedMessage"
      />

      <OutputField
        nodeId={id}
        label="Result Message (to mobile)"
        icon={<MessageCircle size={12} />}
        value={data.outputData?.resultMessage || ''}
        handleId="resultMessage"
      />
    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보
export const config: NodeConfig = {
  type: 'chatWebServerNode',
  label: 'Mobile Chat Server',
  color: '#00BCD4',
  category: 'Network',
  settings: [
    { key: 'port', type: 'text', label: 'Server Port', default: '8080' },
    { key: 'chatTitle', type: 'text', label: 'Chat Room Title', default: 'Mobile Chat Room' },
    { key: 'text', type: 'text', label: 'Text Input', default: '' }
  ]
};

export default ChatWebServerNode;