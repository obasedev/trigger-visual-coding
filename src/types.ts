/**
 * types.ts - 모든 타입 정의 중앙 관리
 * 역할: 프로젝트 전체에서 사용하는 타입들을 한 곳에서 관리
 * 목적: any 타입 제거, 타입 안전성 향상, 개발자 실수 방지
 */

import { ReactNode } from 'react';
import { Edge, Node } from '@xyflow/react';

// =====================================
// 기본 노드 상태 및 실행 관련 타입
// =====================================

export type NodeStatus = 'waiting' | 'running' | 'completed' | 'failed';

// 실행 모드 타입 정의 (2025-07-01 추가)
export type ExecutionMode = 'manual' | 'triggered';

export interface BaseNodeData {
  triggerExecution?: number;
  outputData?: {
    [key: string]: any;
  };
  [key: string]: any;
}

export interface NodeSetting {
  key: string;
  type: 'text' | 'number' | 'boolean' | 'textarea';
  label: string;
  default: string | number | boolean;
  placeholder?: string;
  description?: string;
}

export interface NodeConfig {
  type: string;
  label: string;
  color: string;
  category: string;
  settings: NodeSetting[];
}

// =====================================
// 🆕 커스텀 버튼 타입 정의
// =====================================

export interface CustomButton {
  icon: ReactNode;
  onClick: () => void;
  title?: string;
  variant?: 'default' | 'success' | 'destructive';
}

// =====================================
// 🆕 뷰어 관련 타입 정의 (customLabel 추가)
// =====================================

// 뷰어에 추가된 노드 정보
export interface ViewerNodeItem {
  nodeId: string;
  nodeType: string;
  nodeTitle: string;
  customLabel?: string; // 🆕 사용자 정의 라벨 (예: "AI전용", "이메일 자동화")
  addedAt: number; // 타임스탬프
}

// 뷰어 관련 함수들의 타입
export interface ViewerActions {
  addToViewer: (nodeId: string, nodeType: string, nodeTitle: string) => void;
  removeFromViewer: (nodeId: string) => void;
  isInViewer: (nodeId: string) => boolean;
  clearViewer: () => void;
  getViewerItems: () => ViewerNodeItem[];
  // 🆕 커스텀 라벨 업데이트 함수 추가
  updateViewerLabel: (nodeId: string, customLabel: string) => void;
}

// =====================================
// 백엔드 결과 타입 정의
// =====================================

export interface BackendResult {
  message?: string;
  [key: string]: any;
}

// =====================================
// 구체적인 노드별 데이터 타입
// =====================================

export interface StartNodeData extends BaseNodeData {}

export interface FileCreatorNodeData extends BaseNodeData {
  filePath: string;
  fileName: string;
  fileContent: string;
}

export interface TextFileEditorNodeData extends BaseNodeData {
  filePath: string;
  newFileName: string;
  newFileContent: string;
}

export interface TextInputNodeData extends BaseNodeData {
  text: string;
}

export interface DelayNodeData extends BaseNodeData {
  delaySeconds: number;
  message?: string;
}

export interface TextTransformNodeData extends BaseNodeData {
  inputText: string;
  transformType: 'uppercase' | 'lowercase' | 'reverse' | 'trim';
  outputText?: string;
}

export interface ConditionalNodeData extends BaseNodeData {
  condition: string;
  trueValue: string;
  falseValue: string;
  result?: boolean;
}

// 🆕 ChatWebServerNode 데이터 타입 (올바른 위치)
export interface ChatWebServerNodeData extends BaseNodeData {
  port: string;
  chatTitle: string;
  text: string; // 🎯 textInput → text로 변경
}

// 🆕 VideoDownloadNode 데이터 타입
export interface VideoDownloadNodeData extends BaseNodeData {
  urls: string;
  folderName: string;
  downloadPath: string;
}

// 🆕 FilePathNode 데이터 타입
export interface FilePathNodeData extends BaseNodeData {
  filePaths: string[];
  allowMultiple: boolean;
}

// 🆕 CliNode 데이터 타입
export interface CliNodeData extends BaseNodeData {
  command: string;
  output?: string;
}

// 🆕 CliAiNode 데이터 타입
export interface CliAiNodeData extends BaseNodeData {
  userInput: string;
  apiKey: string;
  model: string;
  cliCommand?: string;
  aiResponse?: string;
  cliResult?: string;
}


// =====================================
// BaseNode Props 타입 정의
// =====================================

export interface NodeDataOutput {
  id: string;
  label: string;
  value?: any;
}

export interface BaseNodeProps<T extends BaseNodeData = BaseNodeData> {
  id: string;
  title: string;
  icon: ReactNode;
  status: NodeStatus;
  selected: boolean;
  onExecute: (mode?: ExecutionMode) => void; // 실행 모드 매개변수 추가
  children?: ReactNode;
  hasInput?: boolean;
  hasOutput?: boolean;
  description?: string;
  infoRows?: InfoRow[];
  result?: string;
  data: T;
  dataOutputs?: NodeDataOutput[];
  // 🆕 뷰어 관련 props
  onAddToViewer?: () => void;
  onRemoveFromViewer?: () => void;
  isInViewer?: boolean;
  // 🆕 커스텀 실행 버튼 아이콘
  customExecuteIcon?: ReactNode;
  // 🆕 커스텀 버튼들
  customButtons?: CustomButton[];
}

export interface InfoRow {
  label: string;
  value: string;
  icon?: ReactNode;
  monospace?: boolean;
}

// =====================================
// InputField 타입 정의
// =====================================

export interface InputFieldProps {
  nodeId: string;
  label: string;
  icon?: ReactNode;
  value: string;
  placeholder?: string;
  type?: 'input' | 'textarea';
  rows?: number;
  handleId?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

// =====================================
// Context API 타입 정의 (뷰어 기능 추가)
// =====================================

export interface WorkflowContextType {
  executeNextNodes: (completedNodeId: string) => void;
  allEdges: Edge[];
  allNodes: Node[];
  updateNodeData: (nodeId: string, newData: Partial<BaseNodeData>) => void;
  // 🆕 뷰어 관련 함수들
  viewerActions: ViewerActions;
}

export interface WorkflowProviderProps {
  children: ReactNode;
  nodes: Node[];
  edges: Edge[];
  updateNodeData: (nodeId: string, newData: Partial<BaseNodeData>) => void;
  onExecuteNextNodes: (completedNodeId: string) => void;
  // 🆕 뷰어 관련 props
  viewerItems: ViewerNodeItem[];
  onViewerItemsChange: (items: ViewerNodeItem[]) => void;
}

// =====================================
// 개별 노드 컴포넌트 Props
// =====================================

export interface StartNodeProps {
  id: string;
  data: StartNodeData;
  selected: boolean;
}

export interface FileCreatorNodeProps {
  id: string;
  data: FileCreatorNodeData;
  selected: boolean;
}

export interface TextFileEditorNodeProps {
  id: string;
  data: TextFileEditorNodeData;
  selected: boolean;
}

export interface TextInputNodeProps {
  id: string;
  data: TextInputNodeData;
  selected: boolean;
}

// 🆕 ChatWebServerNode Props 타입 (추가됨)
export interface ChatWebServerNodeProps {
  id: string;
  data: ChatWebServerNodeData;
  selected: boolean;
}

// 🆕 VideoDownloadNode Props 타입
export interface VideoDownloadNodeProps {
  id: string;
  data: VideoDownloadNodeData;
  selected: boolean;
}

// 🆕 FilePathNode Props 타입
export interface FilePathNodeProps {
  id: string;
  data: FilePathNodeData;
  selected: boolean;
}

export interface CliNodeProps {
  id: string;
  data: CliNodeData;
  selected: boolean;
}

export interface CliAiNodeProps {
  id: string;
  data: CliAiNodeData;
  selected: boolean;
}