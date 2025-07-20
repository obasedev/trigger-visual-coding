import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Play, MessageSquare } from 'lucide-react';
import BaseNode, { InputField } from './Basenode';

// 🆕 중앙 타입 정의 import
import type { 
  StartNodeProps, 
  StartNodeData, 
  NodeConfig,
  BackendResult,
  ExecutionMode
} from '../types';

// 🆕 Context API 추가 (타입 안전)
import { useWorkflow, useHandleConnection } from '../WorkflowContext';

/**
 * StartNode.tsx (실행 모드 지원) - 항상 연쇄 실행
 * 변경사항:
 * 1. ExecutionMode 매개변수 지원
 * 2. StartNode는 수동/자동 관계없이 항상 다음 노드 트리거
 * 3. 워크플로우 시작점 역할 유지
 */

function StartNode({ id, data, selected }: StartNodeProps) {
  // 🆕 런타임 타입 체크
  if (!id || typeof id !== 'string') {
    console.error('❌ StartNode: Invalid id:', id);
    return null;
  }

  // 🆕 Context에서 필요한 함수들 가져오기 (타입 안전)
  const { executeNextNodes, updateNodeData } = useWorkflow();
  
  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [localInputText, setLocalInputText] = useState('');
  const [previousInputText, setPreviousInputText] = useState(''); // 이전 값 추적
  
  const isInputConnected = useHandleConnection(id, 'inputText');

  // 🔄 executeNode 함수 (실행 모드 지원)
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    try {
      setStatus('running');
      
      console.log(`🚀 Workflow started! (mode: ${mode})`);
      
      // 🆕 타입 안전한 Backend call
      const result: BackendResult = await invoke('start_node');
      
      // 🆕 결과 타입 체크
      const resultMessage = typeof result === 'string' ? result : result.message || 'Success';
      console.log('✅ Start node completed:', resultMessage);
      
      setStatus('completed');
      
      // 출력 데이터 업데이트
      updateNodeData(id, {
        triggerExecution: undefined,
        outputData: {
          ...data.outputData,
          inputText: data.inputText || ''
        }
      });
      
      // 🚀 StartNode는 항상 다음 노드들 트리거 (워크플로우 시작점 역할)
      if (typeof executeNextNodes === 'function') {
        executeNextNodes(id);
        console.log(`🔗 StartNode: Triggering next nodes (mode: ${mode})`);
      } else {
        console.error('❌ StartNode: executeNextNodes is not a function');
      }
      
      // Auto-reset to waiting after 2 seconds
      setTimeout(() => {
        setStatus('waiting');
      }, 2000);
      
    } catch (error: unknown) {
      console.error('❌ Start node failed:', error);
      setStatus('failed');
      
      // Auto-reset even on failure
      setTimeout(() => {
        setStatus('waiting');
      }, 2000);
    }
  }, [id, executeNextNodes, updateNodeData, data]);

  // 초기값 설정
  useEffect(() => {
    setLocalInputText(data?.inputText || '');
  }, [data?.inputText]);
  
  // 입력값 변경 시 블러 처리
  const handleBlur = useCallback((value: string) => {
    if (!isInputConnected && data.inputText !== value) {
      updateNodeData(id, { inputText: value });
      // 새로운 값이 들어오면 자동 실행
      if (value.trim()) {
        console.log(`🚀 StartNode: New input detected, auto-executing: "${value}"`);
        executeNode('triggered');
      }
    }
  }, [id, data.inputText, isInputConnected, updateNodeData, executeNode]);
  
  // 연결된 입력값 변경 감지 (외부에서 들어온 값) - 실제 값 변경 시만 실행
  useEffect(() => {
    const currentInputText = data.inputText || '';
    
    if (isInputConnected && 
        currentInputText.trim() && 
        currentInputText !== previousInputText && 
        status === 'waiting') {
      
      console.log(`🚀 StartNode: Connected input changed from "${previousInputText}" to "${currentInputText}"`);
      setPreviousInputText(currentInputText); // 이전 값 업데이트
      executeNode('triggered');
    }
  }, [data.inputText, isInputConnected, executeNode, status, previousInputText]);
  
  // Detect external trigger execution (타입 안전)
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number') {
      console.log(`🚀 Start node ${id} auto-execution triggered!`);
      executeNode('triggered'); // 자동 트리거 모드로 실행
    }
  }, [data.triggerExecution, executeNode]);

  return (
    <BaseNode<StartNodeData>
      id={id}
      title="Workflow Start"
      icon={<Play size={16} fill="white" stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode} // 실행 모드 매개변수 지원
      hasInput={false}  // Start node has no input trigger
      hasOutput={true}  // Start node has output trigger
      description="Starts the workflow when input text is provided. Executes automatically when new input is received."
      data={data}
    >
      {/* Input Text */}
      <div onBlur={() => handleBlur(localInputText)}>
        <InputField
          nodeId={id}
          label="Input Text"
          icon={<MessageSquare size={12} />}
          value={localInputText}
          placeholder="Enter text to start workflow..."
          onChange={setLocalInputText}
          handleId="inputText"
          disabled={isInputConnected}
        />
      </div>
    </BaseNode>
  );
}

// Auto-discovery configuration (타입 안전)
export const config: NodeConfig = {
  type: 'startNode',
  label: 'Start',
  color: '#64b5f6',
  category: 'Core',
  settings: []
};

export default StartNode;