import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Terminal } from 'lucide-react';
import BaseNode, { InputField, OutputField } from './Basenode';

import type { 
  CliNodeProps, 
  CliNodeData, 
  NodeConfig,
  ExecutionMode
} from '../types';

import { useWorkflow, useHandleConnection } from '../WorkflowContext';

function CliNode({ id, data, selected }: CliNodeProps) {
  const { updateNodeData, executeNextNodes } = useWorkflow();
  
  const [localCommand, setLocalCommand] = useState(data?.command || '');
  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [output, setOutput] = useState<string>('');

  // 핸들 연결 상태 확인
  const isCommandConnected = useHandleConnection(id, 'command');

  // 현재 사용할 명령어 결정 (연결된 경우 data에서, 아니면 로컬에서)
  const currentCommand = isCommandConnected ? (data?.command || '') : localCommand;

  // data prop 동기화
  useEffect(() => {
    setLocalCommand(data?.command || '');
  }, [data?.command]);

  // 아웃풋 텍스트를 3줄로 제한하는 함수
  const truncateOutput = (text: string) => {
    if (!text) return 'No output yet';
    const lines = text.split('\n');
    if (lines.length <= 3) return text;
    return lines.slice(0, 3).join('\n') + '...';
  };

  // 명령어 입력 처리
  const handleCommandChange = (newCommand: string) => {
    setLocalCommand(newCommand);
  };
  
  // 입력창 포커스 해제시 데이터 업데이트
  const handleBlur = () => {
    if (data?.command !== localCommand) {
      updateNodeData(id, {
        command: localCommand,
        outputData: {
          command: localCommand
        }
      });
    }
  };

  // executeNode 함수
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    try {
      setStatus('running');
      
      console.log(`🖥️ CLI Node executing command: ${currentCommand}`);
      
      if (!currentCommand.trim()) {
        // 빈 명령어는 조용히 넘어감 (에러 없음)
        setOutput('');
        setStatus('completed');
        
        updateNodeData(id, {
          command: currentCommand,
          output: '',
          triggerExecution: undefined,
          outputData: {
            command: currentCommand,
            output: '',
            cliResult: ''
          }
        });
        
        if (mode === 'triggered') {
          executeNextNodes(id);
        }
        
        setTimeout(() => {
          setStatus('waiting');
        }, 1000);
        
        return;
      }
      
      const result = await invoke('cli_node', { command: currentCommand.trim() });
      const resultMessage = typeof result === 'string' ? result : 'Command executed';
      
      setOutput(resultMessage);
      setStatus('completed');
      
      // 출력 데이터 업데이트
      updateNodeData(id, {
        command: currentCommand,
        output: resultMessage,
        triggerExecution: undefined, // ✅ 트리거 상태 초기화
        outputData: {
          command: currentCommand,
          output: resultMessage,
          cliResult: resultMessage
        }
      });
      
      // 🎯 실행 모드에 따른 연쇄 실행 결정
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 CliNode: Triggering next nodes (auto-execution)`);
      } else {
        console.log(`🔧 CliNode: Manual execution completed, no chain reaction`);
      }
      
      // Auto-reset to waiting after 2 seconds
      setTimeout(() => {
        setStatus('waiting');
      }, 2000);
      
    } catch (error: unknown) {
      console.error('❌ CLI node failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorOutput = `Error: ${errorMessage}`;
      setOutput(errorOutput);
      setStatus('failed');
      
      // 에러도 outputData에 전달
      updateNodeData(id, {
        command: currentCommand,
        output: errorOutput,
        triggerExecution: undefined,
        outputData: {
          command: currentCommand,
          output: errorOutput,
          cliResult: errorOutput
        }
      });
      
      // 에러 발생 시에도 다음 노드 실행 (AI가 에러를 인식하고 대응할 수 있도록)
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 CliNode: Error occurred, but triggering next nodes for error handling`);
      }
      
      setTimeout(() => {
        setStatus('waiting');
      }, 2000);
    }
  }, [id, currentCommand, updateNodeData, executeNextNodes]);

  // 외부 트리거 실행 감지
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number') {
      console.log(`🖥️ CLI node ${id} auto-execution triggered!`);
      executeNode('triggered');
    }
  }, [data.triggerExecution, executeNode]);

  return (
    <BaseNode<CliNodeData>
      id={id}
      title="CLI Command"
      icon={<Terminal size={16} stroke="white" />}
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
          handleId="command"
          label="Command"
          value={isCommandConnected ? currentCommand : localCommand}
          placeholder="Enter CLI command (e.g., dir, ls, echo hello)"
          type="text"
          onChange={handleCommandChange}
          disabled={isCommandConnected}
        />
      </div>

      <OutputField
        nodeId={id}
        handleId="cliResult"
        label="CLI Result"
        icon={<Terminal size={12} />}
        value={truncateOutput(output)}
      />
    </BaseNode>
  );
}

// Auto-discovery configuration
export const config: NodeConfig = {
  type: 'cliNode',
  label: 'CLI',
  color: '#2d3748',
  category: 'System',
  settings: []
};

export default CliNode;