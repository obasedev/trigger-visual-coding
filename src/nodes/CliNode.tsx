import React, { useState, useEffect, useCallback } from 'react';
import { Terminal, CheckCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import BaseNode, { InputField, OutputField } from './Basenode';

import type {
  CliNodeProps,
  CliNodeData,
  NodeConfig,
  ExecutionMode
} from '../types';

import { useWorkflow, useHandleConnection } from '../WorkflowContext';

// 백엔드 파라미터 타입 정의
interface CliParams {
  command: string;
}

// 백엔드 결과 타입 정의
interface BackendResult {
  message?: string;
  [key: string]: any;
}

function CliNode({ id, data, selected }: CliNodeProps) {
  const { executeNextNodes, updateNodeData } = useWorkflow();

  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [result, setResult] = useState<string>('');

  const [localCommand, setLocalCommand] = useState('');

  const isCommandConnected = useHandleConnection(id, 'command');

  useEffect(() => {
    setLocalCommand(data?.command || '');
  }, [data?.command]);

  const handleBlur = (key: keyof CliNodeData, value: string) => {
    if (key === 'command' && !isCommandConnected && data.command !== value) {
      updateNodeData(id, { command: value });
    }
  };

  // ✅ useCallback으로 executeNode 함수 메모이제이션 (실행 모드 지원)
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    // ✅ 실행 전 필수 필드 검증
    const currentCommand = data?.command?.trim() || '';

    if (!currentCommand) {
      console.warn('⚠️ CliNode: Missing command, skipping execution');
      setStatus('failed');
      setResult('Command is required');
      
      // ✅ 먼저 에러 출력 설정
      updateNodeData(id, { 
        outputData: {
          output: 'Error: Command is required',
          command: '',
          exitCode: -1
        }
      });

      // 🎯 실패해도 트리거 모드에서는 다음 노드 실행 (에러 처리용)
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 CliNode: No command provided, triggering next nodes for error handling`);
      }

      // ✅ 마지막에 트리거 상태 초기화 (다음 노드 실행 후)
      updateNodeData(id, { 
        triggerExecution: undefined
      });
      
      setTimeout(() => { 
        setStatus('waiting'); 
        setResult(''); 
      }, 2000);
      return;
    }

    setStatus('running');
    try {
      const params: CliParams = {
        command: currentCommand
      };

      console.log(`🖥️ CliNode ${id}: Executing command... (mode: ${mode})`);

      const resultData: BackendResult = await invoke('cli_node', params);
      const resultMessage = typeof resultData === 'string' ? resultData : resultData.message || 'Command executed successfully';

      // JSON 파싱 시도
      let parsedResult: any = {};
      try {
        parsedResult = typeof resultData === 'string' ? JSON.parse(resultData) : resultData;
      } catch (parseError) {
        // 단순 문자열 결과인 경우
        parsedResult = { 
          output: resultData,
          command: currentCommand 
        };
      }

      const commandOutput = parsedResult.output || resultData || '';

      setStatus('completed');
      setResult('Command executed successfully');

      // ✅ 먼저 출력 데이터 설정
      updateNodeData(id, {
        outputData: {
          output: commandOutput,
          command: currentCommand,
          exitCode: parsedResult.exitCode || 0
        }
      });

      // 🎯 실행 모드에 따른 연쇄 실행 결정
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 CliNode: Triggering next nodes (auto-execution)`);
      } else {
        console.log(`🔧 CliNode: Manual execution completed, no chain reaction`);
      }

      // ✅ 마지막에 트리거 상태 초기화 (다음 노드 실행 후)
      updateNodeData(id, {
        triggerExecution: undefined
      });

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('❌ CLI command failed:', errorMessage, error);
      setStatus('failed');
      setResult(errorMessage);

      // ✅ 먼저 출력 데이터에 에러 설정
      updateNodeData(id, {
        outputData: {
          output: `Error: ${errorMessage}`,
          command: currentCommand,
          exitCode: -1
        }
      });

      // 🎯 실패해도 트리거 모드에서는 다음 노드 실행 (에러 처리용)
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 CliNode: Error occurred, triggering next nodes for error handling`);
      }

      // ✅ 마지막에 트리거 상태 초기화 (다음 노드 실행 후)
      updateNodeData(id, {
        triggerExecution: undefined
      });

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
    }
  }, [id, data?.command, executeNextNodes, updateNodeData]);

  // ✅ 트리거 실행 감지 (executeNode가 useCallback으로 안정화됨)
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number') {
      console.log(`🖥️ CLI node ${id} auto-execution triggered!`);
      executeNode('triggered'); // 자동 트리거 모드로 실행
    }
  }, [data.triggerExecution, executeNode]);

  // 연결 상태 변경시 값 초기화
  useEffect(() => {
    if (isCommandConnected) {
      setLocalCommand('');
      updateNodeData(id, { command: '' });
    }
  }, [isCommandConnected, id, updateNodeData]);

  return (
    <BaseNode<CliNodeData>
      id={id}
      title="CLI Command"
      icon={<Terminal size={16} stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode} // 실행 모드 매개변수 지원
      data={data}
      result={result}
      description="Executes command line interface commands"
    >
      <div onBlur={() => handleBlur('command', localCommand)}>
        <InputField
          nodeId={id}
          label="Command"
          icon={<Terminal size={12} />}
          value={localCommand}
          placeholder="Enter CLI command (e.g., dir, ls, echo hello)"
          onChange={setLocalCommand}
          handleId="command"
          disabled={isCommandConnected}
        />
      </div>

      <OutputField
        nodeId={id}
        label="Command Output"
        icon={<CheckCircle size={12} />}
        value={(() => {
          const text = data.outputData?.output || '';
          const lines = text.split('\n');
          if (lines.length > 3) {
            return lines.slice(0, 3).join('\n') + '\n...';
          }
          return text;
        })()}
        handleId="output"
      />

    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보
export const config: NodeConfig = {
  type: 'cliNode',
  label: 'CLI Command',
  color: '#2d3748',
  category: 'System',
  settings: [
    { key: 'command', type: 'text', label: 'Command', default: '' }
  ]
};

export default CliNode;