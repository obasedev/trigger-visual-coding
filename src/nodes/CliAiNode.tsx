import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Brain, Terminal } from 'lucide-react';
import BaseNode, { InputField, OutputField } from './Basenode';

import type { 
  CliAiNodeProps, 
  CliAiNodeData, 
  NodeConfig,
  ExecutionMode
} from '../types';

import { useWorkflow, useHandleConnection } from '../WorkflowContext';

// 백엔드 파라미터 타입 정의
interface CliAiParams {
  userInput: string;
  apiKey: string;
  model: string;
  cliResult?: string;
  nodeId: string;
}

// 백엔드 결과 타입 정의
interface BackendResult {
  command?: string;
  explanation?: string;
  full_response?: string;
  [key: string]: any;
}

function CliAiNode({ id, data, selected }: CliAiNodeProps) {
  const { updateNodeData, executeNextNodes } = useWorkflow();
  
  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [result, setResult] = useState<string>('');

  const [localUserInput, setLocalUserInput] = useState('');
  const [localApiKey, setLocalApiKey] = useState('');
  const [localModel, setLocalModel] = useState('claude-3-haiku-20240307');

  // 핸들 연결 상태 확인
  const isUserInputConnected = useHandleConnection(id, 'userInput');
  const isCliResultConnected = useHandleConnection(id, 'cliResult');

  useEffect(() => {
    setLocalUserInput(data?.userInput || '');
    setLocalApiKey(data?.apiKey || '');
    setLocalModel(data?.model || 'claude-3-haiku-20240307');
  }, [data?.userInput, data?.apiKey, data?.model]);

  const handleBlur = (key: keyof CliAiNodeData, value: string) => {
    if (key === 'userInput' && !isUserInputConnected && data.userInput !== value) {
      updateNodeData(id, { userInput: value });
    }
    if (key === 'apiKey' && data.apiKey !== value) {
      updateNodeData(id, { apiKey: value });
    }
    if (key === 'model' && data.model !== value) {
      updateNodeData(id, { model: value });
    }
  };

  // ✅ useCallback으로 executeNode 함수 메모이제이션 (실행 모드 지원)
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    // ✅ 실행 전 필수 필드 검증
    const currentUserInput = data?.userInput?.trim() || '';
    const currentApiKey = data?.apiKey?.trim() || '';
    const currentModel = data?.model?.trim() || 'claude-3-haiku-20240307';
    const currentCliResult = data?.cliResult?.trim() || '';

    // 필수 필드 검증
    if (!currentUserInput) {
      console.warn('⚠️ CliAiNode: Missing user input, skipping execution');
      setStatus('failed');
      setResult('User input is required');
      
      // ✅ 트리거 상태 초기화 및 에러 출력 설정
      updateNodeData(id, { 
        triggerExecution: undefined,
        outputData: {
          cliCommand: 'Error: No user input provided',
          aiResponse: 'Error: No user input provided'
        }
      });

      // 🎯 실패해도 트리거 모드에서는 다음 노드 실행 (에러 처리용)
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 CliAiNode: No user input, triggering next nodes for error handling`);
      }
      
      setTimeout(() => { 
        setStatus('waiting'); 
        setResult(''); 
      }, 2000);
      return;
    }

    if (!currentApiKey) {
      console.warn('⚠️ CliAiNode: Missing API key, skipping execution');
      setStatus('failed');
      setResult('API key is required');
      
      // ✅ 트리거 상태 초기화 및 에러 출력 설정
      updateNodeData(id, { 
        triggerExecution: undefined,
        outputData: {
          cliCommand: 'Error: API key required',
          aiResponse: 'Error: API key required'
        }
      });

      // 🎯 실패해도 트리거 모드에서는 다음 노드 실행 (에러 처리용)
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 CliAiNode: No API key, triggering next nodes for error handling`);
      }
      
      setTimeout(() => { 
        setStatus('waiting'); 
        setResult(''); 
      }, 2000);
      return;
    }

    setStatus('running');
    try {
      const params: CliAiParams = {
        userInput: currentUserInput,
        apiKey: currentApiKey,
        model: currentModel,
        cliResult: currentCliResult || undefined,
        nodeId: id
      };

      console.log(`🧠 CliAiNode ${id}: Processing AI request... (mode: ${mode})`);

      const resultData: BackendResult = await invoke('cli_ai_node', params);

      // JSON 파싱 시도
      let parsedResult: BackendResult = {};
      try {
        parsedResult = typeof resultData === 'string' ? JSON.parse(resultData) : resultData;
      } catch (parseError) {
        console.warn('⚠️ Failed to parse backend result as JSON, using as string');
        parsedResult = { 
          command: '',
          explanation: resultData as string || 'No response from AI'
        };
      }

      const aiCommand = parsedResult.command || '';
      const aiExplanation = parsedResult.explanation || parsedResult.full_response || 'No response from AI';

      setStatus('completed');
      setResult('AI processing completed');

      updateNodeData(id, {
        triggerExecution: undefined, // ✅ 트리거 상태 초기화
        outputData: {
          cliCommand: aiCommand || 'No CLI command needed',
          aiResponse: aiExplanation,
          cliResult: currentCliResult || 'No CLI result available'
        }
      });

      // 🎯 실행 모드에 따른 연쇄 실행 결정
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 CliAiNode: Triggering next nodes (auto-execution)`);
      } else {
        console.log(`🔧 CliAiNode: Manual execution completed, no chain reaction`);
      }

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('❌ CliAi processing failed:', errorMessage, error);
      setStatus('failed');
      setResult(errorMessage);

      // ✅ 실패시 트리거 상태 초기화 및 출력 데이터에 에러 표시
      updateNodeData(id, {
        triggerExecution: undefined,
        outputData: {
          cliCommand: `Error: ${errorMessage}`,
          aiResponse: `Error: ${errorMessage}`
        }
      });

      // 🎯 실패해도 트리거 모드에서는 다음 노드 실행 (에러 처리용)
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 CliAiNode: Error occurred, triggering next nodes for error handling`);
      }

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
    }
  }, [id, data?.userInput, data?.apiKey, data?.model, data?.cliResult, executeNextNodes, updateNodeData]);

  // ✅ 트리거 실행 감지 (executeNode가 useCallback으로 안정화됨)
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number') {
      console.log(`🧠 CliAi node ${id} auto-execution triggered!`);
      executeNode('triggered'); // 자동 트리거 모드로 실행
    }
  }, [data.triggerExecution, executeNode]);

  // 연결 상태 변경시 값 초기화
  useEffect(() => {
    if (isUserInputConnected) {
      setLocalUserInput('');
      updateNodeData(id, { userInput: '' });
    }
  }, [isUserInputConnected, id, updateNodeData]);

  return (
    <BaseNode<CliAiNodeData>
      id={id}
      title="CLI AI Assistant"
      icon={<Brain size={16} stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode} // 실행 모드 매개변수 지원
      data={data}
      result={result}
      description="AI-powered CLI command generator and assistant"
    >
      <div onBlur={() => handleBlur('cliResult', data?.cliResult || '')}>
        <InputField
          nodeId={id}
          label="CLI Result"
          icon={<Terminal size={12} />}
          value={data?.cliResult || ''}
          placeholder="Previous CLI execution result (automatically filled)"
          onChange={() => {}} // 읽기 전용
          handleId="cliResult"
          disabled={true}
          type="textarea"
          rows={2}
          maxLines={3}
        />
      </div>

      <div onBlur={() => handleBlur('userInput', localUserInput)}>
        <InputField
          nodeId={id}
          label="User Request"
          icon={<Brain size={12} />}
          value={localUserInput}
          placeholder="Tell me what you want to do (e.g., 'delete all txt files')"
          onChange={setLocalUserInput}
          handleId="userInput"
          disabled={isUserInputConnected}
          type="textarea"
          rows={2}
          maxLines={3}
        />
      </div>

      <div onBlur={() => handleBlur('apiKey', localApiKey)}>
        <InputField
          nodeId={id}
          label="Claude API Key"
          icon={<Brain size={12} />}
          value={localApiKey}
          placeholder="sk-ant-..."
          onChange={setLocalApiKey}
          handleId="apiKey"
          disabled={false}
        />
      </div>

      <div onBlur={() => handleBlur('model', localModel)}>
        <InputField
          nodeId={id}
          label="Model"
          icon={<Brain size={12} />}
          value={localModel}
          placeholder="claude-3-haiku-20240307"
          onChange={setLocalModel}
          handleId="model"
          disabled={false}
        />
      </div>

      <OutputField
        nodeId={id}
        label="CLI Command"
        icon={<Terminal size={12} />}
        value={data.outputData?.cliCommand || 'No CLI command generated yet'}
        handleId="cliCommand"
        maxLines={3}
      />

      <OutputField
        nodeId={id}
        label="AI Response"
        icon={<Brain size={12} />}
        value={data.outputData?.aiResponse || 'No AI response yet'}
        handleId="aiResponse"
        maxLines={3}
      />

      <OutputField
        nodeId={id}
        label="CLI Result"
        icon={<Terminal size={12} />}
        value={data.outputData?.cliResult || 'No CLI result yet'}
        handleId="cliResult"
        maxLines={3}
      />
    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보
export const config: NodeConfig = {
  type: 'cliAiNode',
  label: 'CLI AI Assistant',
  color: '#9f7aea',
  category: 'AI',
  settings: [
    { key: 'userInput', type: 'textarea', label: 'User Request', default: '' },
    { key: 'apiKey', type: 'text', label: 'Claude API Key', default: '' },
    { key: 'model', type: 'text', label: 'Model', default: 'claude-3-haiku-20240307' }
  ]
};

export default CliAiNode;