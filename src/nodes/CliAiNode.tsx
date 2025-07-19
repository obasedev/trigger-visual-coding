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

function CliAiNode({ id, data, selected }: CliAiNodeProps) {
  const { updateNodeData, executeNextNodes } = useWorkflow();
  
  const [localUserInput, setLocalUserInput] = useState(data?.userInput || '');
  const [localApiKey, setLocalApiKey] = useState(data?.apiKey || '');
  const [localModel, setLocalModel] = useState(data?.model || 'claude-3-haiku-20240307');
  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [cliCommand, setCliCommand] = useState<string>('');
  const [aiResponse, setAiResponse] = useState<string>('');

  // 핸들 연결 상태 확인
  const isUserInputConnected = useHandleConnection(id, 'userInput');
  const isCliResultConnected = useHandleConnection(id, 'cliResult');

  // 현재 사용할 입력 결정
  const currentUserInput = isUserInputConnected ? (data?.userInput || '') : localUserInput;
  const currentCliResult = data?.cliResult || '';

  // CLI Result 텍스트를 3줄로 제한하는 함수
  const truncateCliResult = (text: string) => {
    if (!text) return '';
    const lines = text.split('\n');
    if (lines.length <= 3) return text;
    return lines.slice(0, 3).join('\n') + '...';
  };

  // data prop 동기화
  useEffect(() => {
    setLocalUserInput(data?.userInput || '');
    setLocalApiKey(data?.apiKey || '');
    setLocalModel(data?.model || 'claude-3-haiku-20240307');
  }, [data?.userInput, data?.apiKey, data?.model]);

  // 아웃풋 텍스트를 3줄로 제한하는 함수
  const truncateOutput = (text: string, defaultText: string = 'No output yet') => {
    if (!text) return defaultText;
    const lines = text.split('\n');
    if (lines.length <= 3) return text;
    return lines.slice(0, 3).join('\n') + '...';
  };

  // 사용자 입력 처리
  const handleUserInputChange = (newInput: string) => {
    setLocalUserInput(newInput);
  };

  const handleApiKeyChange = (newApiKey: string) => {
    setLocalApiKey(newApiKey);
  };

  const handleModelChange = (newModel: string) => {
    setLocalModel(newModel);
  };
  
  // 입력창 포커스 해제시 데이터 업데이트
  const handleBlur = () => {
    if (data?.userInput !== localUserInput || data?.apiKey !== localApiKey || data?.model !== localModel) {
      updateNodeData(id, {
        userInput: localUserInput,
        apiKey: localApiKey,
        model: localModel,
        outputData: {
          userInput: localUserInput
        }
      });
    }
  };

  // executeNode 함수
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    try {
      setStatus('running');
      
      console.log(`🧠 AI Node processing input: ${currentUserInput}`);
      
      if (!currentUserInput.trim()) {
        throw new Error('No user input provided');
      }

      if (!localApiKey.trim()) {
        throw new Error('API key is required');
      }
      
      const result = await invoke('cli_ai_node', { 
        userInput: currentUserInput.trim(),
        apiKey: localApiKey.trim(),
        model: localModel.trim(),
        cliResult: currentCliResult || null,
        nodeId: id
      });
      
      let cleanCommand = '';
      let fullResponse = '';
      
      if (typeof result === 'string') {
        try {
          // JSON 응답 파싱
          const parsed = JSON.parse(result);
          cleanCommand = parsed.command || '';
          fullResponse = parsed.explanation || parsed.full_response || result;
        } catch (e) {
          // JSON 파싱 실패시 기존 방식 사용
          cleanCommand = result.split('\n')[0].trim();
          fullResponse = result;
        }
      } else {
        cleanCommand = 'Command generated';
        fullResponse = 'Command generated';
      }
      
      setCliCommand(cleanCommand);
      setAiResponse(fullResponse);
      setStatus('completed');
      
      // 출력 데이터 업데이트
      updateNodeData(id, {
        userInput: currentUserInput,
        apiKey: localApiKey,
        model: localModel,
        cliCommand: cleanCommand,
        aiResponse: fullResponse,
        triggerExecution: undefined, // ✅ 트리거 상태 초기화
        outputData: {
          userInput: currentUserInput,
          cliCommand: cleanCommand,
          aiResponse: fullResponse
        }
      });
      
      // 🎯 실행 모드에 따른 연쇄 실행 결정
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 CliAiNode: Triggering next nodes (auto-execution)`);
      } else {
        console.log(`🔧 CliAiNode: Manual execution completed, no chain reaction`);
      }
      
      // Auto-reset to waiting after 2 seconds
      setTimeout(() => {
        setStatus('waiting');
      }, 2000);
      
    } catch (error: unknown) {
      console.error('❌ AI node failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setCliCommand('');
      setAiResponse(`Error: ${errorMessage}`);
      setStatus('failed');
      
      setTimeout(() => {
        setStatus('waiting');
      }, 2000);
    }
  }, [id, currentUserInput, updateNodeData, executeNextNodes]);

  // 외부 트리거 실행 감지
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number') {
      console.log(`🧠 AI node ${id} auto-execution triggered!`);
      executeNode('triggered');
    }
  }, [data.triggerExecution, executeNode]);

  return (
    <BaseNode<CliAiNodeData>
      id={id}
      title="CLI AI"
      icon={<Brain size={16} stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode}
      hasInput={true}
      hasOutput={true}
      data={data}
    >
      <div onBlur={handleBlur}>
        <InputField
          nodeId={id}
          handleId="cliResult"
          label="CLI Result"
          value={truncateCliResult(currentCliResult)}
          placeholder="Previous CLI execution result (automatically filled)"
          type="textarea"
          rows={2}
          disabled={true}
        />

        <InputField
          nodeId={id}
          handleId="userInput"
          label="User Request"
          value={isUserInputConnected ? currentUserInput : localUserInput}
          placeholder="Tell me what you want to do (e.g., 'delete all txt files')"
          type="textarea"
          rows={3}
          onChange={handleUserInputChange}
          disabled={isUserInputConnected}
        />
        
        <InputField
          nodeId={id}
          label="Claude API Key"
          value={localApiKey}
          placeholder="sk-ant-..."
          type="password"
          onChange={handleApiKeyChange}
        />

        <InputField
          nodeId={id}
          label="Model"
          value={localModel}
          placeholder="claude-3-haiku-20240307, claude-3-sonnet-20240229, etc."
          type="text"
          onChange={handleModelChange}
        />
      </div>

      <OutputField
        nodeId={id}
        handleId="cliCommand"
        label="CLI Command"
        icon={<Terminal size={12} />}
        value={cliCommand ? truncateOutput(cliCommand, 'No command generated yet') : 'No CLI command needed'}
      />

      <OutputField
        nodeId={id}
        handleId="aiResponse"
        label="AI Response"
        icon={<Brain size={12} />}
        value={truncateOutput(aiResponse, 'No AI response yet')}
      />
    </BaseNode>
  );
}

// Auto-discovery configuration
export const config: NodeConfig = {
  type: 'cliAiNode',
  label: 'CLI AI',
  color: '#9f7aea',
  category: 'AI',
  settings: []
};

export default CliAiNode;