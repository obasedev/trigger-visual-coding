import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plug, AlertTriangle } from 'lucide-react';
import BaseNode, { InputField, OutputField } from './Basenode';
import { PluginManager } from '../PluginManager';
import { useWorkflow } from '../WorkflowContext';
import { invoke } from '@tauri-apps/api/core';

import type {
  BaseNodeData,
  NodeConfig,
  ExecutionMode
} from '../types';

// 플러그인 노드 전용 데이터 타입
interface PluginNodeData extends BaseNodeData {
  pluginId: string;
  [key: string]: any; // 동적 입력 필드들
}

interface PluginNodeProps {
  id: string;
  data: PluginNodeData;
  selected: boolean;
}

function PluginNode({ id, data, selected }: PluginNodeProps) {
  const { executeNextNodes, updateNodeData } = useWorkflow();
  
  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [result, setResult] = useState<string>('');
  const [localInputs, setLocalInputs] = useState<{[key: string]: string}>({});

  // 플러그인 정보 가져오기
  const plugin = useMemo(() => {
    const pluginManager = PluginManager.getInstance();
    return pluginManager.getPlugin(data.pluginId);
  }, [data.pluginId]);

  // 로컬 입력값 초기화
  useEffect(() => {
    if (plugin) {
      const initialInputs: {[key: string]: string} = {};
      plugin.manifest.inputs.forEach(input => {
        initialInputs[input.id] = data[input.id] || '';
      });
      setLocalInputs(initialInputs);
    }
  }, [plugin, data]);

  // 입력값 변경 핸들러
  const handleInputChange = useCallback((inputId: string, value: string) => {
    setLocalInputs(prev => ({
      ...prev,
      [inputId]: value
    }));
  }, []);

  // 입력값 블러 핸들러 (데이터 동기화)
  const handleInputBlur = useCallback((inputId: string, value: string) => {
    if (data[inputId] !== value) {
      updateNodeData(id, { [inputId]: value });
    }
  }, [id, data, updateNodeData]);

  // 🚀 플러그인 실행 함수
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    if (!plugin) {
      console.error('❌ Plugin not found:', data.pluginId);
      setStatus('failed');
      setResult('Plugin not found');
      
      updateNodeData(id, { triggerExecution: undefined });
      setTimeout(() => { 
        setStatus('waiting'); 
        setResult(''); 
      }, 2000);
      return;
    }

    setStatus('running');
    
    try {
      console.log(`🔌 PluginNode ${id}: Executing plugin "${plugin.manifest.name}" (mode: ${mode})`);

      // 현재 입력값들 수집
      const inputs: {[key: string]: string} = {};
      plugin.manifest.inputs.forEach(input => {
        inputs[input.id] = data[input.id] || '';
      });

      // 🎯 JavaScript 코드 실행 (안전하지 않지만 사용자 요구사항)
      const executePluginCode = new Function('inputs', `
        ${plugin.componentCode}
        
        // plugin 함수가 정의되어 있는지 확인
        if (typeof plugin === 'function') {
          return plugin(inputs);
        } else {
          throw new Error('Plugin function not found. Please define a "plugin" function.');
        }
      `);

      // 플러그인 실행
      const outputs = await executePluginCode(inputs);

      // 플러그인에서 Tauri 명령 실행 요청 시 처리
      if (outputs && outputs.tauriCommand && outputs.params) {
        try {
          console.log(`🔌 Plugin requesting Tauri command: ${outputs.tauriCommand}`);
          console.log(`🔌 Plugin params:`, outputs.params);
          
          if (outputs.tauriCommand === 'run_command_node') {
            // run_command_node는 이제 개별 매개변수를 받음
            console.log(`🔌 Invoking run_command_node with:`, outputs.params);
            const result = await invoke('run_command_node', {
              command: outputs.params.command,
              args: outputs.params.args,
              cwd: outputs.params.cwd
            });
            console.log(`✅ Tauri command successful:`, result);
          } else {
            // 다른 명령들은 params 객체로 전달
            const result = await invoke(outputs.tauriCommand, outputs.params);
            console.log(`✅ Tauri command successful:`, result);
          }
        } catch (e) {
          console.error('❌ Tauri command failed:', e);
          throw new Error(`Tauri command failed: ${e}`);
        }
      }

      // 결과 검증
      if (!outputs || typeof outputs !== 'object') {
        throw new Error('Plugin must return an object with output values');
      }

      setStatus('completed');
      setResult('Plugin executed successfully');

      // 출력 데이터 업데이트
      const outputData: {[key: string]: any} = {};
      plugin.manifest.outputs.forEach(output => {
        // 플러그인 출력에서 직접 값 가져오기 (tauriCommand 무시)
        if (outputs[output.id] !== undefined && output.id !== 'tauriCommand' && output.id !== 'params') {
          outputData[output.id] = outputs[output.id];
        } else {
          outputData[output.id] = '';
        }
      });

      updateNodeData(id, {
        triggerExecution: undefined,
        outputData: outputData
      });

      // 실행 모드에 따른 연쇄 실행
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 PluginNode: Triggering next nodes (auto-execution)`);
      } else {
        console.log(`🔧 PluginNode: Manual execution completed, no chain reaction`);
      }

      setTimeout(() => { 
        setStatus('waiting'); 
        setResult(''); 
      }, 2000);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown plugin execution error';
      console.error('❌ Plugin execution failed:', errorMessage, error);
      setStatus('failed');
      setResult(errorMessage);

      // 실패시 출력 데이터 클리어
      const clearedOutputData: {[key: string]: any} = {};
      if (plugin) {
        plugin.manifest.outputs.forEach(output => {
          clearedOutputData[output.id] = '';
        });
      }

      updateNodeData(id, {
        triggerExecution: undefined,
        outputData: clearedOutputData
      });

      setTimeout(() => { 
        setStatus('waiting'); 
        setResult(''); 
      }, 2000);
    }
  }, [id, data, plugin, executeNextNodes, updateNodeData]);

  // 트리거 실행 감지
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number') {
      console.log(`🔌 Plugin node ${id} auto-execution triggered!`);
      executeNode('triggered');
    }
  }, [data.triggerExecution, executeNode]);

  // 플러그인을 찾을 수 없는 경우
  if (!plugin) {
    return (
      <BaseNode<PluginNodeData>
        id={id}
        title="Plugin Error"
        icon={<AlertTriangle size={16} stroke="white" />}
        status="failed"
        selected={selected}
        onExecute={() => {}}
        data={data}
        result={`Plugin "${data.pluginId}" not found`}
        description="Plugin could not be loaded"
      >
        <div style={{ 
          padding: '16px', 
          color: '#ef4444', 
          textAlign: 'center',
          fontSize: '14px'
        }}>
          <AlertTriangle size={24} style={{ marginBottom: '8px' }} />
          <div>Plugin "{data.pluginId}" not found</div>
          <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
            Check if the plugin folder exists and contains manifest.json
          </div>
        </div>
      </BaseNode>
    );
  }

  return (
    <BaseNode<PluginNodeData>
      id={id}
      title={plugin.manifest.name}
      icon={<Plug size={16} stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode}
      data={data}
      result={result}
      description={plugin.manifest.description || "Plugin node"}
    >
      {/* 🎯 동적 입력 필드 생성 */}
      {plugin.manifest.inputs.map((input) => (
        <div 
          key={input.id}
          onBlur={() => handleInputBlur(input.id, localInputs[input.id] || '')}
        >
          <InputField
            nodeId={id}
            label={input.label}
            icon={<Plug size={12} />}
            value={localInputs[input.id] || ''}
            placeholder={`Enter ${input.label.toLowerCase()}...`}
            onChange={(value) => handleInputChange(input.id, value)}
            handleId={input.id}
          />
        </div>
      ))}

      {/* 🎯 동적 출력 필드 생성 */}
      {plugin.manifest.outputs.map((output) => (
        <OutputField
          key={output.id}
          nodeId={id}
          label={output.label}
          icon={<Plug size={12} />}
          value={data.outputData?.[output.id] || ''}
          handleId={output.id}
        />
      ))}
    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보 (동적이므로 사용하지 않음)
export const config: NodeConfig = {
  type: 'pluginNode',
  label: 'Plugin',
  color: '#8B5CF6',
  category: 'Plugins',
  settings: []
};

export default PluginNode;