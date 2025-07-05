import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Play, Clock } from 'lucide-react';
import BaseNode from './Basenode';

// 🆕 중앙 타입 정의 import
import type { 
  StartNodeProps, 
  StartNodeData, 
  NodeConfig,
  BackendResult,
  ExecutionMode
} from '../types';

// 🆕 Context API 추가 (타입 안전)
import { useWorkflow } from '../WorkflowContext';

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
  const { executeNextNodes } = useWorkflow();
  
  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [lastExecuted, setLastExecuted] = useState<string>('');

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
      
      const now = new Date().toLocaleTimeString();
      setLastExecuted(now);
      setStatus('completed');
      
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
  }, [id, executeNextNodes]);

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
      description="Manually starts the workflow. When the button is pressed, connected nodes will execute sequentially."
      data={data}
      infoRows={[
        { 
          label: "Node ID", 
          value: id, 
          monospace: true 
        },
        { 
          label: "Last Executed", 
          value: lastExecuted || 'Never',
          icon: <Clock size={12} />
        }
      ]}
    />
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