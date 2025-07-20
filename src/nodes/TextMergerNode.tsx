import React, { useState, useEffect, useCallback } from 'react';
import { Type, Plus, CheckCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useUpdateNodeInternals } from '@xyflow/react';
import BaseNode, { InputField, OutputField } from './Basenode';

import type {
  TextMergerNodeProps,
  TextMergerNodeData,
  NodeConfig,
  ExecutionMode
} from '../types';

import { useWorkflow, useHandleConnection } from '../WorkflowContext';

// 백엔드 파라미터 타입 정의
interface TextMergerParams {
  text1: string;
  text2: string;
  separator: string;
}

// 백엔드 결과 타입 정의
interface BackendResult {
  message?: string;
  [key: string]: any;
}

function TextMergerNode({ id, data, selected }: TextMergerNodeProps) {
  const { executeNextNodes, updateNodeData } = useWorkflow();
  const updateNodeInternals = useUpdateNodeInternals();

  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [result, setResult] = useState<string>('');

  const [localText1, setLocalText1] = useState('');
  const [localText2, setLocalText2] = useState('');
  const [localSeparator, setLocalSeparator] = useState('\n');

  const isText1Connected = useHandleConnection(id, 'text1');
  const isText2Connected = useHandleConnection(id, 'text2');
  const isSeparatorConnected = useHandleConnection(id, 'separator');

  // 초기값 설정 및 외부 값 변경 감지 (무한루프 방지)
  useEffect(() => {
    const currentText1 = data?.text1 || '';
    const currentText2 = data?.text2 || '';
    const currentSeparator = data?.separator || '\n';
    
    // 값이 실제로 변경된 경우에만 업데이트
    if (currentText1 !== localText1) {
      setLocalText1(currentText1);
    }
    if (currentText2 !== localText2) {
      setLocalText2(currentText2);
    }
    if (currentSeparator !== localSeparator) {
      setLocalSeparator(currentSeparator);
    }
  }, [data?.text1, data?.text2, data?.separator, localText1, localText2, localSeparator]);

  const handleBlur = (key: keyof TextMergerNodeData, value: string) => {
    if (key === 'text1' && !isText1Connected && data.text1 !== value) {
      updateNodeData(id, { text1: value });
    }
    if (key === 'text2' && !isText2Connected && data.text2 !== value) {
      updateNodeData(id, { text2: value });
    }
    if (key === 'separator' && !isSeparatorConnected && data.separator !== value) {
      updateNodeData(id, { separator: value });
    }
  };

  // ✅ useCallback으로 executeNode 함수 메모이제이션 (실행 모드 지원)
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    // 🚨 중복 실행 방지: 이미 실행 중이면 무시
    if (status === 'running') {
      console.log(`⚠️ TextMergerNode ${id}: Already running, skipping execution`);
      return;
    }

    // ✅ 실행 전 필수 필드 검증
    const currentText1 = data?.text1?.trim() || '';
    const currentText2 = data?.text2?.trim() || '';
    const currentSeparator = data?.separator || '\n';

    setStatus('running');
    try {
      const params: TextMergerParams = {
        text1: currentText1,
        text2: currentText2,
        separator: currentSeparator
      };

      console.log(`📝 TextMergerNode ${id}: Merging texts... (mode: ${mode})`);

      const resultData: BackendResult = await invoke('text_merger_node', params);
      const resultMessage = typeof resultData === 'string' ? resultData : resultData.message || 'Text merged successfully';

      // JSON 파싱 시도
      let parsedResult: any = {};
      try {
        parsedResult = typeof resultData === 'string' ? JSON.parse(resultData) : resultData;
      } catch (parseError) {
        console.warn('⚠️ Failed to parse backend result as JSON, using as string');
        parsedResult = { merged_text: resultData };
      }

      const mergedText = parsedResult.merged_text || '';

      setStatus('completed');
      setResult('Text merged successfully');

      updateNodeData(id, {
        triggerExecution: undefined, // ✅ 트리거 상태 초기화
        outputData: {
          mergedText: mergedText
        }
      });

      // 🎯 실행 모드에 따른 연쇄 실행 결정
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 TextMergerNode: Triggering next nodes (auto-execution)`);
      } else {
        console.log(`🔧 TextMergerNode: Manual execution completed, no chain reaction`);
      }

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('❌ Text merge failed:', errorMessage, error);
      setStatus('failed');
      setResult(errorMessage);

      // ✅ 실패시 트리거 상태 초기화 및 출력 데이터 클리어
      updateNodeData(id, {
        triggerExecution: undefined,
        outputData: {
          mergedText: ''
        }
      });

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
    }
  }, [id, data?.text1, data?.text2, data?.separator, executeNextNodes, updateNodeData, status]);

  // ✅ 트리거 실행 감지 (executeNode가 useCallback으로 안정화됨)
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number' && status !== 'running') {
      console.log(`📝 Text merger node ${id} auto-execution triggered!`);
      executeNode('triggered'); // 자동 트리거 모드로 실행
    }
  }, [data.triggerExecution, executeNode, status]);

  // 연결 상태 변경시 값 초기화 (무한루프 방지)
  useEffect(() => {
    if (isText1Connected && data?.text1 !== '') {
      setLocalText1('');
      updateNodeData(id, { text1: '' });
    }
  }, [isText1Connected, id]);

  useEffect(() => {
    if (isText2Connected && data?.text2 !== '') {
      setLocalText2('');
      updateNodeData(id, { text2: '' });
    }
  }, [isText2Connected, id]);

  useEffect(() => {
    if (isSeparatorConnected && data?.separator !== '') {
      setLocalSeparator('');
      updateNodeData(id, { separator: '' });
    }
  }, [isSeparatorConnected, id]);

  // React Flow 핸들 안정성 확보
  useEffect(() => {
    // 컴포넌트 마운트 및 데이터 변경 시 React Flow 내부 상태 강제 업데이트
    const timer = setTimeout(() => {
      updateNodeInternals(id);
    }, 50); // 짧은 딜레이로 렌더링 완료 후 업데이트
    
    return () => clearTimeout(timer);
  }, [id, updateNodeInternals, data?.text1, data?.text2, data?.separator]);

  return (
    <BaseNode<TextMergerNodeData>
      id={id}
      title="Text Merger"
      icon={<Type size={16} stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode} // 실행 모드 매개변수 지원
      data={data}
      result={result}
      description="Merges two text strings with a custom separator"
      hasInput={true}  // 🟢 트리거 입력 핸들 활성화
      hasOutput={true} // 🟢 트리거 출력 핸들 활성화
    >
      <div onBlur={() => handleBlur('text1', localText1)}>
        <InputField
          nodeId={id}
          label="First Text"
          icon={<Type size={12} />}
          value={isText1Connected ? (data?.text1 || '') : localText1}
          placeholder="Enter first text..."
          onChange={setLocalText1}
          handleId="text1"
          disabled={isText1Connected}
          type="textarea"
          rows={2}
          maxLines={3}
        />
      </div>

      <div onBlur={() => handleBlur('text2', localText2)}>
        <InputField
          nodeId={id}
          label="Second Text"
          icon={<Type size={12} />}
          value={isText2Connected ? (data?.text2 || '') : localText2}
          placeholder="Enter second text..."
          onChange={setLocalText2}
          handleId="text2"
          disabled={isText2Connected}
          type="textarea"
          rows={2}
          maxLines={3}
        />
      </div>

      <div onBlur={() => handleBlur('separator', localSeparator)}>
        <InputField
          nodeId={id}
          label="Separator"
          icon={<Plus size={12} />}
          value={isSeparatorConnected ? (data?.separator || '') : localSeparator}
          placeholder="\n (line break)"
          onChange={setLocalSeparator}
          handleId="separator"
          disabled={isSeparatorConnected}
        />
      </div>

      <OutputField
        nodeId={id}
        label="Merged Text"
        icon={<CheckCircle size={12} />}
        value={(() => {
          const text = data.outputData?.mergedText || '';
          const lines = text.split('\n');
          if (lines.length > 3) {
            return lines.slice(0, 3).join('\n') + '\n...';
          }
          return text;
        })()}
        handleId="mergedText"
      />

    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보
export const config: NodeConfig = {
  type: 'textMergerNode',
  label: 'Text Merger',
  color: '#9C27B0',
  category: 'Text',
  settings: [
    { key: 'text1', type: 'text', label: 'First Text', default: '' },
    { key: 'text2', type: 'text', label: 'Second Text', default: '' },
    { key: 'separator', type: 'text', label: 'Separator', default: '\n' }
  ]
};

export default TextMergerNode;