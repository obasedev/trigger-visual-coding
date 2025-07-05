import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import BaseNode, { InputField, OutputField } from './Basenode';

import type {
  TextInputNodeProps,
  TextInputNodeData,
  NodeConfig
} from '../types';

import { useWorkflow } from '../WorkflowContext';

function TextInputNode({ id, data, selected }: TextInputNodeProps) {
  const { updateNodeData } = useWorkflow();

  // 자체 메모장(로컬 state) 생성
  // 노드 전체 데이터(data.text)와 별개로, 입력창의 현재 값만 관리합니다.
  const [localValue, setLocalValue] = useState(data?.text || '');

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
    // 로컬 state의 최종 값을 전체 데이터(nodes)에 업데이트합니다.
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

  const executeNode = () => {
    console.log("Input Node: I don't do anything, I just provide data.");
  };

  return (
    <BaseNode<TextInputNodeData>
      id={id}
      title="Text Input"
      icon={<MessageSquare size={16} stroke="white" />}
      status="waiting"
      selected={selected}
      onExecute={executeNode}
      hasInput={false}
      hasOutput={false}
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
        value={data?.outputData?.text || localValue}
        handleId="text"
      />
    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보
export const config: NodeConfig = {
  type: 'textInputNode',
  label: 'Text Input',
  color: '#FFC107',
  category: 'Data',
  settings: [
    { key: 'text', type: 'textarea', label: 'Text', default: '' }
  ]
};

export default TextInputNode;