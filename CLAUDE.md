# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 🚨 TAURI v2 전용 프로젝트 - 중요!

**이 프로젝트는 Tauri v2를 사용합니다. Tauri v1 문법/API 절대 사용 금지!**

### Tauri v2 핵심 차이점 (필수 확인)
- `@tauri-apps/api/core`에서 `invoke` import (❌ v1: `@tauri-apps/api/tauri`)
- `#[tauri::command]` 데코레이터 (v1과 문법 같지만 내부 다름)
- 플러그인: `tauri-plugin-*` v2 버전만 사용
- `tauri.conf.json` 스키마 v2 형식 사용

# Claude Code CLI 개발 지원 통합 지침사항

## 필수 개발 절차

### 1단계: 기술적 검토 먼저
사용자 요청 시 반드시 기술적 검토부터 시작

응답 형식:
```
이 기능을 구현하기 전에 기술적 한계를 먼저 확인해드릴게요:

가능한 것들:
- [구체적 기능들 나열]

불가능하거나 문제가 있는 것들:
- [기술적 한계와 이유 설명]

복잡하거나 불안정한 것들:
- [위험 요소와 대안 설명]

어떤 방향으로 진행하시겠어요?
```

### 2단계: 사용자 확인 후 구현
- 사용자가 방향을 정한 후에만 파일 수정
- 무작정 구현 금지

### 3단계: 문제 발생시 대안 제시
오류 발생 시 원인과 2-3가지 대안 제시

## 절대 금지사항

### 구현 관련 금지사항
1. **무작정 구현하기** - 기술적 검토 없이 바로 파일 수정
2. **과도한 리팩토링** - 작동하는 기존 코드의 대폭 수정
3. **범위 확장** - 사용자가 요청하지 않은 "개선" 시도
4. **패턴 파괴** - 기존 노드 구조, UI/UX, 아키텍처 임의 변경
5. **파일 작성 후 다른 방법 추가 제시**

### Claude Code CLI 특화 금지사항
6. **여러 파일 동시 생성** - 반드시 하나씩 순차적으로
7. **노드 명명 규칙 위반** - CamelCase ↔ snake_case 엄격 준수
8. **Tauri v1 API 사용** - 반드시 v2 API만 사용

### 응답 방식 주의사항
- 사용자 의도 추측하지 말고 불명확하면 질문
- 코드 내 이모티콘 사용 금지
- 요청 범위를 벗어나는 내용 추가하지 않기

## Claude Code CLI 대화 연속성 원칙

### CLI 세션 특성 인식
1. **파일 상태 기반 판단**: Read 도구로 현재 파일 상태 먼저 확인
2. **이전 수정 내용 존중**: 기존 파일의 수정사항은 사용자가 승인한 것으로 간주
3. **git 상태 활용**: 변경된 파일 목록으로 진행 상황 파악
4. **단계별 확인**: 각 파일 수정 후 사용자 확인 대기

### 노드 개발 4단계 엄격 준수
```
1. Frontend (.tsx) → 2. Backend (.rs) → 3. mod.rs → 4. lib.rs
```

**각 단계별 주의사항:**
- **1단계**: 프론트엔드 노드만 생성, config export 필수
- **2단계**: 백엔드 함수만 생성, #[tauri::command] 필수
- **3단계**: mod.rs에 2줄만 추가
- **4단계**: lib.rs invoke_handler에 1줄만 추가

## 최소 침습 원칙 (CLI 특화)

### 파일 수정 시 엄격한 기준
1. **Read 먼저**: 수정 전 반드시 파일 내용 확인
2. **최소 변경**: 요청된 기능에 필요한 최소한의 수정만
3. **패턴 유지**: 기존 노드들과 100% 동일한 구조
4. **한 번에 하나**: 절대 여러 파일 동시 수정 금지

### CLI 도구 사용 우선순위
1. **Read**: 파일 내용 확인 시
2. **Edit**: 기존 파일 수정 시  
3. **Write**: 새 파일 생성 시 (최후 수단)
4. **Bash**: 테스트/빌드 명령어 실행 시 (사용자 요청 시만)

## 초보 개발자 배려사항

### 설명 방식
- 복잡한 개념은 한국어로 쉽게 설명
- 각 파일의 역할과 관계 명확히 설명
- 변경사항이 전체 시스템에 미치는 영향 설명
- 왜 이런 구조인지 이유 설명

### 안전 장치
- 변경 전후 비교 설명
- 롤백 방법 제시
- 테스트 방법 안내
- 문제 발생 시 해결 방법 미리 설명

## Development Commands

**Frontend Development:**
- `npm run dev` - Start Vite development server
- `npm run build` - TypeScript compilation + Vite build
- `npm run build-force` - Force Vite build (used by Tauri)
- `npm run preview` - Preview built application

**Tauri Development:**
- `npm run tauri-dev` - Start Tauri development mode with hot reload
- `npm run tauri-build` - Build production Tauri application
- `npm run tauri` - Direct Tauri CLI access

**Testing:**
No explicit test commands found in package.json. Check for manual testing procedures.

**Linting/Type Checking:**
No explicit lint or typecheck commands found. TypeScript compilation happens during build process.

## Architecture Overview

This is a **Tauri v2 visual programming tool** with a trigger-based workflow system, similar to but distinctly different from Langflow. The application allows users to create automated workflows using a drag-and-drop node interface.

### Core Architecture

**Frontend (React + TypeScript):**
- **@xyflow/react** for visual workflow editor
- **Context API** for state management
- **Zustand** for additional state needs
- **Lucide React** for icons
- **Component-based node system** with hot-loading

**Backend (Rust + Tauri):**
- **Auto-registering node system** - nodes are automatically discovered and registered
- **Plugin system** - external plugins can be loaded from filesystem
- **Cross-platform desktop app** with native performance
- **Rich Tauri plugins** for system integration (clipboard, dialog, shell, store)

### Key Design Principles

1. **Trigger-Based Execution**: Unlike Langflow's auto-execution, this uses manual trigger-based control where users initiate workflow execution
2. **Auto-State Recovery**: Nodes automatically return to "waiting" state after completion
3. **Zero Configuration**: New nodes require no configuration files - just follow naming conventions
4. **1:1 Frontend/Backend Mapping**: Each frontend node has corresponding Rust function

### Node System Architecture

**Node Structure (4-layer Langflow-style):**
1. **Header**: Icon + name + individual execute button + dynamic description
2. **Trigger**: Status display + trigger input/output handles  
3. **Inputs**: Data input fields (disabled when handles connected)
4. **Outputs**: Execution results display

**Handle System:**
- 🟢 **Green handles**: Trigger flow (execution control)
- 🟡 **Yellow handles**: Data flow (connected), gray (disconnected)

**Node States**: "대기중" → "실행중..." → "실행완료"/"실행실패" → (2s delay) → "대기중"

### File Structure

```
src/                           # Frontend
├── App.tsx                    # ReactFlowProvider + layout + dual page system
├── Workspace.tsx              # Main canvas + trigger chain engine  
├── Sidebar.tsx                # Node library + drag-and-drop + plugin integration
├── ViewerPage.tsx             # Separate viewer mode for workflows
├── WorkflowContext.tsx        # Context API for state sharing
├── WorkflowEngine.tsx         # Central workflow execution engine
├── NodeManager.ts             # ID management + timer management
├── PluginManager.ts           # Plugin loading and management system
├── types.ts                   # Centralized type definitions
└── nodes/                     # Node components
    ├── Basenode.tsx           # Common node base class
    ├── StartNode.tsx          # Workflow start node
    ├── FileCreatorNode.tsx    # File creation node
    ├── PluginNode.tsx         # Dynamic plugin node renderer
    └── [Other]Node.tsx        # Additional workflow nodes

src-tauri/src/                 # Backend
├── main.rs                    # Tauri entry point
├── lib.rs                     # Auto-registration system + invoke handlers
├── plugin_system.rs           # Plugin folder scanning and loading
└── nodes/                     # Structured node functions
    ├── mod.rs                 # Auto-registration management
    ├── start_node.rs          # Start node function
    ├── file_creator_node.rs   # File creation node function
    ├── workflow_storage.rs    # Workflow save/load functionality
    └── [other]_node.rs        # Additional node implementations

src-tauri/plugins/             # External plugin directory
└── [plugin-name]/
    ├── manifest.json          # Plugin metadata and interface definition
    ├── component.js           # React component code (evaluated at runtime)
    └── logic.js               # Optional backend logic
```

## Adding New Nodes

# 🚨 노드 개발 필수 체크리스트

## 📋 4단계 개발 순서 (절대 변경 금지)
1. **Frontend (.tsx)** → 2. **Backend (.rs)** → 3. **mod.rs** → 4. **lib.rs**
- 각 단계별로 하나씩 순차 진행
- 여러 파일 동시 생성 절대 금지

## 🎯 핵심 기능 요구사항

### 1. **연결 상태 처리**
```typescript
const isInputConnected = useHandleConnection(id, 'inputName');

// 연결 시 기존 값 삭제
useEffect(() => {
  if (isInputConnected) {
    setLocalValue('');
    updateNodeData(id, { inputName: '' });
  }
}, [isInputConnected, id, updateNodeData]);
```

### 2. **실행 모드 구분** 
```typescript
// 성공 시
setStatus('completed');
if (mode === 'triggered') {
  executeNextNodes(id, { outputData });
}
setTimeout(() => setStatus('waiting'), 2000);

// 실패 시  
setStatus('failed');
updateNodeData(id, { triggerExecution: undefined });
setTimeout(() => setStatus('waiting'), 2000);
```

### 3. **입력 필드 비활성화**
```jsx
<InputField
  disabled={isConnected}
  handleId="fieldName"
  // ...기타 props
/>
```

### 4. **핸들 ID 설정**
- 모든 InputField와 OutputField에 `handleId` 필수
- 핸들 이름은 필드명과 동일하게

### 5. **데이터 업데이트**
```typescript
const handleBlur = (key: keyof NodeData, value: string) => {
  if (key === 'fieldName' && !isConnected && data.fieldName !== value) {
    updateNodeData(id, { fieldName: value });
  }
};
```

### 6. **출력 텍스트 3줄 제한**
```typescript
// 긴 텍스트는 3줄로 제한하고 ... 표시
<OutputField
  value={(() => {
    const text = data.outputData?.field || '';
    const lines = text.split('\n');
    if (lines.length > 3) {
      return lines.slice(0, 3).join('\n') + '\n...';
    }
    return text;
  })()}
  // ...기타 props
/>
```

## 🏗️ 파일 구조 요구사항

### Frontend (NodeName.tsx)
```typescript
// 필수 imports
import { useWorkflow, useHandleConnection } from '../WorkflowContext';
import BaseNode, { InputField, OutputField } from './Basenode';

// 필수 config export
export const config: NodeConfig = {
  type: 'nodeType',
  label: 'Node Name',
  color: '#COLOR',
  category: 'Category', // 반드시 설정
  settings: [...]
};
```

### Backend (node_name.rs)
```rust
#[tauri::command]
pub fn node_name(params...) -> Result<String, String> {
  // JSON 결과 반환
  let result = json!({
    "output_field": value
  });
  Ok(result.to_string())
}
```

### 등록 (mod.rs)
```rust
pub mod node_name;
pub use node_name::node_name;
```

### 등록 (lib.rs)
```rust
invoke_handler![
  node_name, // 추가
]
```

## ⚠️ 절대 금지사항

1. **딜레이 임의 추가** - executeNextNodes에 딜레이 넣지 말 것
2. **Hook 규칙 위반** - 조건부 Hook 사용 금지
3. **타입 정의 누락** - types.ts에 인터페이스 추가 필수
4. **카테고리 누락** - config에 category 반드시 설정
5. **핸들 ID 누락** - 모든 입력/출력에 handleId 필수
6. **연결 상태 무시** - 연결 시 비활성화 및 값 초기화 필수
7. **실행 모드 무시** - manual/triggered 구분 필수
8. **상태 표시 생략** - 성공/실패 상태를 2초간 표시 필수
9. **출력 텍스트 무제한** - 3줄 이상 텍스트는 반드시 "..." 처리

## 🔄 상태 관리 패턴
```typescript
// 실행 중
setStatus('running');

// 성공 완료
setStatus('completed');
updateNodeData(id, { 
  triggerExecution: undefined,
  outputData: { result }
});

// 다음 노드 실행 (triggered 모드에서만)
if (mode === 'triggered') {
  executeNextNodes(id, { result });
}

// 2초 후 대기 상태
setTimeout(() => setStatus('waiting'), 2000);
```

## 🎨 UI 컴포넌트 패턴
```jsx
<BaseNode<NodeDataType>
  id={id}
  title="Node Title"
  icon={<Icon size={16} stroke="white" />}
  status={status}
  selected={selected}
  onExecute={executeNode}
  data={data}
  result={result}
  description="Node description"
>
  <div onBlur={() => handleBlur('field', localValue)}>
    <InputField
      nodeId={id}
      label="Field Label"
      icon={<Icon size={12} />}
      value={localValue}
      placeholder="Placeholder..."
      onChange={setLocalValue}
      handleId="field"
      disabled={isFieldConnected}
    />
  </div>

  <OutputField
    nodeId={id}
    label="Output Label"
    icon={<Icon size={12} />}
    value={data.outputData?.field || ''}
    handleId="field"
  />
</BaseNode>
```

**NAMING CONVENTIONS (STRICT):**
- Frontend: `CamelCaseNode.tsx`
- Backend: `snake_case_node.rs` 
- Function: `snake_case_node()`
- Node type: `camelCaseNode` (first letter lowercase)
- Display name: `Snake Case`

**FORBIDDEN:**
- Creating multiple files simultaneously
- File name mismatches between frontend/backend
- Missing config exports
- Modifying existing files while creating new ones

## Plugin System

**External Plugin Structure:**
- Plugins live in `src-tauri/plugins/[plugin-name]/`
- Require `manifest.json` with plugin metadata
- `component.js` contains React component as string
- Optional `logic.js` for backend functionality
- Automatically discovered and loaded at runtime

**Plugin Development:**
- Plugins are dynamically evaluated JavaScript/React code
- Must follow same interface as compiled nodes
- Supported in both development and production builds
- Plugin folder automatically created if missing

## Data Flow Architecture

**Trigger Chain System:**
```
[StartNode] --trigger--> [FileNode] --trigger--> [NextNodes...]
```

**Execution Flow:**
1. User clicks execute on any node
2. Node executes via Tauri backend call
3. On completion, `executeNextNodes()` finds connected nodes
4. Connected nodes auto-trigger via `triggerExecution: Date.now()`
5. Nodes auto-return to "waiting" state after 2 seconds

**Data Pipeline:**
- Real-time synchronization between connected nodes
- `outputData` system for inter-node communication
- Visual feedback: input fields disabled when handles connected
- Type-safe data transfer between nodes

## State Management

**Central State (App.tsx):**
- Nodes, edges, and viewer items managed centrally
- Shared between Workspace and ViewerPage
- Context API for component communication

**Workflow Persistence:**
- Save: Desktop `workflow.flow.json`
- Load: Preserves positions, connections, settings
- React Flow standard format for compatibility

## Technical Stack

- **Framework**: Tauri v2 (Rust + Web)
- **Frontend**: React 18 + TypeScript + Vite
- **Workflow Engine**: @xyflow/react (React Flow)
- **State**: React Flow built-in + Context API + Zustand
- **Styling**: CSS Modules + inline styles
- **Icons**: Lucide React
- **Build**: Vite + Rust Cargo

## Development Workflow

1. **Node Development**: Always develop one file at a time, test before moving to next step
2. **Testing**: Use individual node execute buttons for testing, then test trigger chains
3. **Plugin Testing**: Use plugin folder scanning to test external plugin loading
4. **State Debugging**: Use React DevTools and browser console for state inspection

## Performance Considerations

- **Memoization**: Handle connection states and functions optimized
- **Context Optimization**: WorkflowContext prevents unnecessary re-renders  
- **Batch Updates**: Node state changes minimized
- **Memory Efficiency**: Cleanup timers and prevent memory leaks
- **Type Safety**: Full TypeScript coverage prevents runtime errors

## Dual-Mode Architecture

**Workspace Mode**: Full editing capabilities with sidebar and controls
**Viewer Mode**: Clean presentation view for workflow execution
- Independent ReactFlowProvider instances prevent handle ID conflicts
- Shared state through App.tsx central management
- Page switching preserves all workflow state

This is a mature, well-architected system balancing simplicity with extensibility. The trigger-based execution model and auto-registration system make it highly maintainable while the plugin architecture provides unlimited extensibility.