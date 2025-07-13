import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import BaseNode, { InputField, OutputField } from './Basenode';

import type {
  TextInputNodeProps,
  TextInputNodeData,
  NodeConfig,
  ExecutionMode
} from '../types';

import { useWorkflow } from '../WorkflowContext';

function TextInputNode({ id, data, selected }: TextInputNodeProps) {
  const { updateNodeData, executeNextNodes } = useWorkflow();

  // 기존 로컬 상태 + 실행 상태 추가
  const [localValue, setLocalValue] = useState(data?.text || '');
  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');

  // data prop이 외부에서 변경될 경우, 로컬 state도 동기화
  useEffect(() => {
    setLocalValue(data?.text || '');
  }, [data?.text]);

  // 타이핑 중에는 로컬 state만 업데이트
  const handleTextChange = (newText: string) => {
    setLocalValue(newText);
  };
  
  // 입력창 포커스가 사라질 때만 본사에 최종 보고
  const handleBlur = () => {
    if (data?.text !== localValue) {
      console.log(`Finalizing text for node ${id}: ${localValue}`);
      updateNodeData(id, {
        text: localValue,
        outputData: {
          text: localValue
        }
      });
    }
  };

  // ✅ StartNode처럼 항상 다음 노드 트리거하는 executeNode
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    try {
      setStatus('running');
      
      console.log(`📝 Text Input Node ${id} executing... (mode: ${mode})`);
      console.log(`📤 Providing text: "${localValue}"`);
      
      // 현재 텍스트 데이터 최종 업데이트
      updateNodeData(id, {
        text: localValue,
        outputData: {
          text: localValue
        }
      });
      
      setStatus('completed');
      
      // 🚀 StartNode처럼 항상 다음 노드들 트리거
      executeNextNodes(id);
      console.log(`🔗 TextInputNode: Triggering next nodes (mode: ${mode})`);
      
      // 2초 후 자동 상태 복귀
      setTimeout(() => {
        setStatus('waiting');
      }, 2000);
      
    } catch (error: unknown) {
      console.error('❌ Text Input Node failed:', error);
      setStatus('failed');
      
      setTimeout(() => {
        setStatus('waiting');
      }, 2000);
    }
  }, [id, localValue, updateNodeData, executeNextNodes]);

  // 외부 트리거 실행 감지
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number') {
      console.log(`📝 Text Input Node ${id} auto-execution triggered!`);
      executeNode('triggered');
    }
  }, [data.triggerExecution, executeNode]);

  return (
    <BaseNode<TextInputNodeData>
      id={id}
      title="Text Input"
      icon={<MessageSquare size={16} stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode}
      hasInput={false}
      hasOutput={true}  // 출력 트리거 활성화
      data={data}
    >
      {/* InputField에 로컬 state와 onBlur 이벤트를 연결합니다. */}
      <div onBlur={handleBlur}>
        <InputField
          nodeId={id}
          label="Text to provide"
          value={localValue}
          placeholder="Enter text here..."
          type="textarea"
          rows={3}
          onChange={handleTextChange}
        />
      </div>

      <OutputField
        nodeId={id}
        label="Text"
        icon={<MessageSquare size={12} />}
        value={
          (() => {
            const text = data?.outputData?.text || localValue;
            if (!text) return '';
            
            // 긴 텍스트를 2줄로 제한 (대략 80자)
            if (text.length > 80) {
              return text.substring(0, 80) + '...';
            }
            
            // 줄바꿈이 많으면 첫 2줄만 표시
            const lines = text.split('\n');
            if (lines.length > 2) {
              return lines.slice(0, 2).join('\n') + '...';
            }
            
            return text;
          })()
        }
        handleId="text"
      />
    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보 - Core 카테고리로 변경
export const config: NodeConfig = {
  type: 'textInputNode',
  label: 'Text Input',
  color: '#FFC107',
  category: 'Core', // Data → Core로 변경
  settings: [
    { key: 'text', type: 'textarea', label: 'Text', default: '' }
  ]
};

export default TextInputNode;