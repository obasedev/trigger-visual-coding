import React, { useState, useEffect, useCallback } from 'react';
import { Globe, Hash, MessageCircle, Play, Square, Server } from 'lucide-react';
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
  text: string; // 모바일과 동기화되는 텍스트
  textOutput: string; // 별개의 텍스트 출력 기능
}

// 채팅 웹서버 노드 Props 타입
interface ChatWebServerNodeProps {
  id: string;
  data: ChatWebServerNodeData;
  selected: boolean;
}

// 백엔드 파라미터 타입 (enableGlobal 추가)
interface ChatWebServerParams {
  port: number;
  nodeId: string;
  enableGlobal: boolean; // 🔧 글로벌 터널 옵션 추가
}

// 백엔드 결과 타입 (단순화)
interface ChatWebServerResult {
  server_url: string;
  actual_port: number;
  status: string;
  message?: string;
  received_message?: string;
  local_url?: string;
  tunnel_status?: string;
}

function ChatWebServerNode({ id, data, selected }: ChatWebServerNodeProps) {
  const { executeNextNodes, updateNodeData } = useWorkflow();

  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [result, setResult] = useState<string>('');
  const [isServerRunning, setIsServerRunning] = useState<boolean>(false);
  
  // 서버 URL을 별도 상태로 관리 (고정용)
  const [serverUrl, setServerUrl] = useState<string>('');
  
  // 🚨 중복 트리거 방지를 위한 마지막 메시지 추적
  const [lastProcessedMessage, setLastProcessedMessage] = useState<string>('');

  const [localPort, setLocalPort] = useState('');
  const [localTextInput, setLocalTextInput] = useState('');
  const [localTextOutput, setLocalTextOutput] = useState('');

  const isPortConnected = useHandleConnection(id, 'port');
  const isTextInputConnected = useHandleConnection(id, 'text');
  const isTextOutputConnected = useHandleConnection(id, 'textOutput');

  // 초기값 설정
  useEffect(() => {
    setLocalPort(data?.port || '8080');
    setLocalTextInput(data?.text || '');
    setLocalTextOutput(data?.textOutput || '');
  }, [data?.port, data?.text, data?.textOutput]);

  const handleBlur = (key: keyof ChatWebServerNodeData, value: string) => {
    if (key === 'port' && !isPortConnected && data.port !== value) {
      updateNodeData(id, { port: value });
    }
    if (key === 'text' && !isTextInputConnected && data.text !== value) {
      updateNodeData(id, { 
        text: value,
        outputData: {
          ...data.outputData,
          textInput: value // 출력 섹션의 Text Input과만 연동
        }
      });
    }
    if (key === 'textOutput' && !isTextOutputConnected && data.textOutput !== value) {
      updateNodeData(id, { 
        textOutput: value,
        outputData: {
          ...data.outputData,
          textOutput: value // 출력 섹션의 Text Output과 연동
        }
      });
      
      // ✅ 값이 변경되면 모바일로 전송
      if (value && value.trim() && isServerRunning) {
        sendToMobileFromTextOutput(value.trim());
      }
    }
  };

  // ✅ 서버 시작 함수 (🔧 글로벌 터널 기본 활성화)
  const startServer = useCallback(async (): Promise<void> => {
    const currentPort = data?.port?.trim() || '8080';

    setStatus('running');
    try {
      const portNumber = parseInt(currentPort) || 8080;
      
      console.log(`💬 ChatWebServerNode ${id}: Starting global chat server...`);

      // 🔧 핵심 수정: enableGlobal: true 추가하여 글로벌 터널 기본 활성화
      const resultData: ChatWebServerResult = await invoke('chat_web_server_node', {
        port: portNumber,
        nodeId: id,
        enableGlobal: true // 🌐 글로벌 터널 기본 활성화!
      });

      setStatus('completed');
      setResult(`Global chat server running at ${resultData.server_url}`);
      setIsServerRunning(true);
      
      // 서버 URL을 별도 상태에 저장 (고정)
      setServerUrl(resultData.server_url);

      // 🔧 수정: outputData에 serverUrl도 함께 저장
      updateNodeData(id, {
        triggerExecution: undefined,
        outputData: {
          ...data.outputData,
          serverUrl: resultData.server_url, // ✅ 핵심 수정: outputData에 serverUrl 추가
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
          serverUrl: '', // 실패시 URL 클리어
          receivedMessage: ''
        }
      });

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
    }
  }, [id, data?.port, data?.outputData, updateNodeData]);

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
          serverUrl: '', // 서버 중지시 URL 클리어
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
  }, [id, data?.outputData, updateNodeData]);

  // 🆕 모바일로 메시지 전송 함수
  const sendToMobile = useCallback(async (): Promise<void> => {
    const message = data?.text?.trim() || localTextInput.trim();
    
    if (!message) {
      console.warn(`⚠️ Node ${id}: No message to send to mobile`);
      return;
    }

    if (!isServerRunning) {
      console.warn(`⚠️ Node ${id}: Server is not running`);
      return;
    }

    console.log(`📤 Node ${id} sending message to mobile: "${message}"`);
    
    try {
      await invoke('send_to_mobile', {
        nodeId: id,
        message: message
      });

      // 서버 URL 업데이트 (textOutput은 별도 관리)
      updateNodeData(id, {
        outputData: {
          ...data.outputData,
          serverUrl: data.outputData?.serverUrl || serverUrl
        }
      });

      console.log(`✅ Message sent to mobile successfully`);
      
    } catch (error) {
      console.error(`❌ Failed to send message to mobile:`, error);
    }
  }, [id, data, localTextInput, isServerRunning, serverUrl, updateNodeData]);

  // 🆕 textOutput에서 모바일로 메시지 전송 함수
  const sendToMobileFromTextOutput = useCallback(async (message: string): Promise<void> => {
    if (!message || !message.trim()) {
      console.warn(`⚠️ Node ${id}: No textOutput message to send to mobile`);
      return;
    }

    if (!isServerRunning) {
      console.warn(`⚠️ Node ${id}: Server is not running for textOutput`);
      return;
    }

    console.log(`📤 Node ${id} sending textOutput to mobile as assistant: "${message}"`);
    
    try {
      await invoke('send_to_mobile_with_type', {
        nodeId: id,
        message: message,
        messageType: 'assistant'
      });

      console.log(`✅ TextOutput message sent to mobile as assistant successfully`);
      
    } catch (error) {
      console.error(`❌ Failed to send textOutput message to mobile:`, error);
    }
  }, [id, isServerRunning]);

  // ✅ 실행 모드에 따른 동작 (플레이 버튼은 모바일 메시지 전송)
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    if (mode === 'triggered') {
      console.log(`🔗 ChatWebServerNode: Triggered execution - sending to mobile and executing next`);
      await sendToMobile();
      executeNextNodes(id);
    } else {
      console.log(`📤 ChatWebServerNode: Manual execution - sending to mobile only`);
      await sendToMobile();
    }
  }, [sendToMobile, executeNextNodes, id]);

  // ✅ 트리거 실행 감지
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number') {
      console.log(`💬 Chat server node ${id} auto-execution triggered!`);
      executeNode('triggered');
    }
  }, [data.triggerExecution, executeNode]);

  // ✅ 외부에서 들어온 textOutput 값 변경 감지 및 처리
  useEffect(() => {
    const currentTextOutput = data?.textOutput?.trim() || '';
    const currentOutputData = data.outputData?.textOutput || '';
    
    // 🎯 핵심 수정: 핸들 연결 시 값이 다르면 업데이트 (무한루프 방지)
    if (isTextOutputConnected && currentTextOutput && currentTextOutput !== currentOutputData) {
      console.log(`🔄 External textOutput detected, updating outputData: "${currentTextOutput}"`);
      
      // 먼저 outputData 업데이트
      updateNodeData(id, {
        outputData: {
          ...data.outputData,
          textOutput: currentTextOutput
        }
      });
      
      // 그 다음 모바일로 전송
      if (isServerRunning) {
        sendToMobileFromTextOutput(currentTextOutput);
      }
    }
  }, [data?.textOutput, isServerRunning, isTextOutputConnected, sendToMobileFromTextOutput, id, updateNodeData]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen('chat-message-received', (event: any) => {
          const payload = event.payload;
          
          if (payload.node_id === id) {
            console.log(`🌐 Node ${id} received message from mobile: ${payload.message}`);
            
            // 🚨 중복 메시지 방지: 같은 메시지면 무시
            if (payload.message === lastProcessedMessage) {
              console.log(`⚠️ Node ${id}: Ignoring duplicate message: "${payload.message}"`);
              return;
            }
            
            // 마지막 처리된 메시지 업데이트
            setLastProcessedMessage(payload.message);
            
            // 🔄 올바른 순서: 1) 먼저 Text Input 업데이트 2) 그 다음 트리거 실행
            console.log(`📝 First: Updating Text Input values for mobile message: "${payload.message}"`);
            updateNodeData(id, {
              text: payload.message, // 모바일에서 받은 메시지를 Text Input에 설정
              outputData: {
                ...data.outputData,
                serverUrl: data.outputData?.serverUrl || serverUrl,
                textInput: payload.message, // 출력 섹션의 Text Input과 연동
                textOutput: data?.textOutput || '', // 기존 textOutput 값 유지
                receivedMessage: payload.message
              }
            });

            // 🚀 업데이트 완료 후 연쇄반응 트리거 실행
            setTimeout(() => {
              console.log(`🚀 Second: Mobile message triggering next nodes from ${id}`);
              executeNextNodes(id);
            }, 100); // 업데이트 완료를 위한 짧은 딜레이
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
  }, [id, updateNodeData, data.outputData, serverUrl]);

  // 💥 중복 트리거 제거 - 모바일 리스너에서 이미 처리하므로 불필요

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
      title="Global Mobile Chat Server" // 🔧 제목도 Global로 변경
      icon={<Globe size={16} stroke="white" />} // 🔧 아이콘도 Globe로 변경
      status={status}
      selected={selected}
      onExecute={executeNode}
      data={data}
      result={result}
      description="Starts a global mobile-friendly chat server accessible worldwide" // 🔧 설명도 글로벌로 변경
      customExecuteIcon={<Play size={12} />}
      customButtons={[
        {
          icon: <Server size={12} />,
          onClick: () => isServerRunning ? stopServer() : startServer(),
          title: isServerRunning ? "Stop Server" : "Start Server",
          variant: isServerRunning ? "destructive" : "success"
        }
      ]}
    >
      {/* Server Port */}
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

      {/* Text Input */}
      <div onBlur={() => handleBlur('text', localTextInput)}>
        <InputField
          nodeId={id}
          label="Text Input"
          icon={<MessageCircle size={12} />}
          value={localTextInput}
          placeholder="Enter message..."
          onChange={setLocalTextInput}
          handleId="text"
          disabled={isTextInputConnected}
        />
      </div>

      {/* Text Output Input */}
      <div onBlur={() => handleBlur('textOutput', localTextOutput)}>
        <InputField
          nodeId={id}
          label="Text Output"
          icon={<MessageCircle size={12} />}
          value={isTextOutputConnected ? (data?.textOutput || '') : localTextOutput}
          placeholder="Enter text output..."
          onChange={setLocalTextOutput}
          handleId="textOutput"
          disabled={isTextOutputConnected}
          type="textarea"
          rows={2}
          maxLines={3}
        />
      </div>


      <OutputField
        nodeId={id}
        label="Global Server URL"
        icon={<Globe size={12} />}
        value={data.outputData?.serverUrl || serverUrl}
        handleId="serverUrl"
      />

      <OutputField
        nodeId={id}
        label="Text Input"
        icon={<MessageCircle size={12} />}
        value={data.outputData?.textInput || ''}
        handleId="textInput"
      />

      <OutputField
        nodeId={id}
        label="Text Output"
        icon={<MessageCircle size={12} />}
        value={data.outputData?.textOutput || data?.textOutput || ''}
        handleId="textOutput"
        maxLines={3}
      />
    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보 (🔧 글로벌로 변경)
export const config: NodeConfig = {
  type: 'chatWebServerNode',
  label: 'Global Mobile Chat Server', // 🔧 라벨도 Global로 변경
  color: '#00BCD4',
  category: 'Network',
  settings: [
    { key: 'port', type: 'text', label: 'Server Port', default: '8080' },
    { key: 'text', type: 'text', label: 'Text Input', default: '' },
    { key: 'textOutput', type: 'text', label: 'Text Output', default: '' }
  ]
};

export default ChatWebServerNode;