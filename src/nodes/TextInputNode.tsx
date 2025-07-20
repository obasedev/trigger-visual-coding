import React, { useState, useEffect, useCallback } from 'react';
import { Type, CheckCircle } from 'lucide-react';
import BaseNode, { InputField, OutputField } from './Basenode';

import type {
  TextInputNodeProps,
  TextInputNodeData,
  NodeConfig,
  ExecutionMode
} from '../types';

import { useWorkflow, useHandleConnection } from '../WorkflowContext';

function TextInputNode({ id, data, selected }: TextInputNodeProps) {
  const { executeNextNodes, updateNodeData } = useWorkflow();

  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [result, setResult] = useState<string>('');

  const [localText, setLocalText] = useState('');

  const isTextConnected = useHandleConnection(id, 'text');

  useEffect(() => {
    setLocalText(data?.text || '');
  }, [data?.text]);

  const handleBlur = (key: keyof TextInputNodeData, value: string) => {
    if (key === 'text' && !isTextConnected && data.text !== value) {
      updateNodeData(id, { text: value });
    }
  };

  // ✅ useCallback으로 executeNode 함수 메모이제이션 (실행 모드 지원)
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    // 🚨 중복 실행 방지: 이미 실행 중이면 무시
    if (status === 'running') {
      console.log(`⚠️ TextInputNode ${id}: Already running, skipping execution`);
      return;
    }

    // ✅ 실행 전 필수 필드 검증
    const currentText = data?.text?.trim() || '';

    setStatus('running');
    try {
      console.log(`📝 TextInputNode ${id}: Outputting text... (mode: ${mode})`);

      setStatus('completed');
      setResult('Text output ready');

      updateNodeData(id, {
        triggerExecution: undefined, // ✅ 트리거 상태 초기화
        outputData: {
          textOutput: currentText
        }
      });

      // 🎯 실행 모드에 따른 연쇄 실행 결정
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 TextInputNode: Triggering next nodes (auto-execution)`);
      } else {
        console.log(`🔧 TextInputNode: Manual execution completed, no chain reaction`);
      }

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('❌ Text input failed:', errorMessage, error);
      setStatus('failed');
      setResult(errorMessage);

      // ✅ 실패시 트리거 상태 초기화 및 출력 데이터 클리어
      updateNodeData(id, {
        triggerExecution: undefined,
        outputData: {
          textOutput: ''
        }
      });

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
    }
  }, [id, data?.text, executeNextNodes, updateNodeData, status]);

  // ✅ 트리거 실행 감지 (executeNode가 useCallback으로 안정화됨)
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number' && status !== 'running') {
      console.log(`📝 Text input node ${id} auto-execution triggered!`);
      executeNode('triggered'); // 자동 트리거 모드로 실행
    }
  }, [data.triggerExecution, executeNode, status]);

  // 연결 상태 변경시 값 초기화
  useEffect(() => {
    if (isTextConnected) {
      setLocalText('');
      updateNodeData(id, { text: '' });
    }
  }, [isTextConnected, id, updateNodeData]);

  return (
    <BaseNode<TextInputNodeData>
      id={id}
      title="Text Input"
      icon={<Type size={16} stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode} // 실행 모드 매개변수 지원
      data={data}
      result={result}
      description="Provides text input for workflow chains"
      hasInput={true}  // 🟢 명시적으로 트리거 입력 핸들 활성화
      hasOutput={true} // 🟢 명시적으로 트리거 출력 핸들 활성화
    >
      <div onBlur={() => handleBlur('text', localText)}>
        <InputField
          nodeId={id}
          label="Text Input"
          icon={<Type size={12} />}
          value={localText}
          placeholder="Enter your text here..."
          onChange={setLocalText}
          handleId="text"
          disabled={isTextConnected}
          type="textarea"
          rows={3}
          maxLines={3}
        />
      </div>

      <OutputField
        nodeId={id}
        label="Text Output"
        icon={<CheckCircle size={12} />}
        value={(() => {
          const text = data.outputData?.textOutput || '';
          const lines = text.split('\n');
          if (lines.length > 3) {
            return lines.slice(0, 3).join('\n') + '\n...';
          }
          return text;
        })()}
        handleId="textOutput"
      />

    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보
export const config: NodeConfig = {
  type: 'textInputNode',
  label: 'Text Input',
  color: '#FFC107',
  category: 'Text',
  settings: [
    { key: 'text', type: 'textarea', label: 'Text', default: '' }
  ]
};

export default TextInputNode;