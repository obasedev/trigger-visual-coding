# 🚀 노드 개발 완전 가이드 (2025 최신판)

> **onBlur 의존성 문제 해결 및 완전 자동화 지원 버전**

## 🚨 **절대 원칙 (반드시 지켜야 함)**

### 1️⃣ **실행 모드 구분 - 핵심!**

**모든 노드는 두 가지 실행 버튼과 모드를 지원:**
- **개별실행 버튼** (`▶️`, `mode: 'manual'`): 현재 노드만 실행
- **트리거실행 버튼** (`⚡`, `mode: 'triggered'`): 현재 노드 + 다음 노드들 연쇄 실행

**핵심 로직:**
```typescript
if (mode === 'triggered') {
  executeNextNodes(id, outputData);  // ✅ outputData와 함께 전달 필수!
} else {
  // 아무것도 안함 (자기만 실행)
}
```

### 2️⃣ **데이터 전달과 트리거 분리 - 새로 발견된 핵심!**

**🐛 발견된 문제**: onBlur 의존성으로 인한 잘못된 데이터 전달
```
사용자 입력 "3" → 포커스 안뺌 → 트리거 → 이전값 "2"로 실행 💥
```

**✅ 해결책**: 데이터 먼저 전달, 그 다음 트리거
```typescript
// 올바른 실행 순서
executeNextNodes(id, outputData);
// → 1. outputData를 연결된 노드들에 먼저 전달
// → 2. 10ms 후 트리거 실행
// → 3. 다음 노드들이 최신 데이터로 실행 ✅
```

### 3️⃣ **데이터 타입 통일 - 필수!**

**모든 데이터는 문자열로 통일:**
```typescript
// ✅ 올바른 방식
outputData: {
  fileName: "123",        // 숫자도 문자열로
  fileSize: "1024",       // 숫자도 문자열로  
  isSuccess: "true"       // 불린도 문자열로
}
```

**백엔드에서 필요시 타입 변환:**
```rust
#[tauri::command]
pub fn process_data(size: String) -> Result<String, String> {
    let size_num: u64 = size.parse().unwrap_or(0);
    // 처리 후 다시 문자열로 반환
    Ok(result.to_string())
}
```

### 4️⃣ **실패시 전파 차단 - 안전장치!**

```typescript
catch (error) {
  setStatus('failed');
  updateNodeData(id, { triggerExecution: undefined });
  // ❌ executeNextNodes 호출 안함
  // ❌ outputData 업데이트 안함
  // → 다음 노드로 에러 전파 차단
}
```

## 🔧 **노드 구현 필수 패턴**

### **executeNode 함수 완전 템플릿**
```typescript
const executeNode = useCallback(async (mode = 'triggered') => {
  // 1. 데이터 검증
  const currentData = data?.field?.trim() || '';
  if (!currentData) {
    console.warn('⚠️ Missing required fields');
    setStatus('failed');
    updateNodeData(id, { triggerExecution: undefined });
    setTimeout(() => { setStatus('waiting'); }, 2000);
    return; // ❌ 실패시 다음 노드로 전파 차단
  }

  setStatus('running');
  try {
    // 2. 백엔드 호출 (완료까지 대기)
    const result = await invoke('node_function', { data: currentData });
    
    // 3. 성공 처리
    setStatus('completed');
    const outputData = { 
      result: result.toString() // ✅ 문자열로 변환
    };
    
    updateNodeData(id, {
      triggerExecution: undefined,
      outputData
    });
    
    // 4. 트리거 모드면 다음 노드 실행 (데이터와 함께)
    if (mode === 'triggered') {
      executeNextNodes(id, outputData); // ✅ outputData 전달 필수
      console.log('🔗 Triggering next nodes with data');
    } else {
      console.log('🔧 Manual execution completed');
    }
    
    setTimeout(() => { setStatus('waiting'); }, 2000);
    
  } catch (error) {
    // 5. 실패 처리 - 다음 노드로 전파 차단
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Execution failed:', errorMessage);
    setStatus('failed');
    
    updateNodeData(id, {
      triggerExecution: undefined,
      // ❌ outputData 업데이트 안함
    });
    
    // ❌ executeNextNodes 호출 안함
    setTimeout(() => { setStatus('waiting'); }, 2000);
  }
}, [id, data?.field, executeNextNodes, updateNodeData]);
```

### **입력 필드 처리 패턴**
```typescript
// ✅ 핸들 연결 상태 확인
const isFieldConnected = useHandleConnection(id, 'fieldName');

// ✅ onBlur로 데이터 저장 (연결 안된 경우만)
const handleBlur = (key, value) => {
  if (key === 'fieldName' && !isFieldConnected && data.fieldName !== value) {
    updateNodeData(id, { fieldName: value });
  }
};

// ✅ 입력 필드 렌더링
<div onBlur={() => handleBlur('fieldName', localValue)}>
  <InputField
    value={localValue}
    onChange={setLocalValue}
    handleId="fieldName"           // ✅ 핸들 ID 필수
    disabled={isFieldConnected}   // ✅ 연결시 비활성화
  />
</div>
```

### **출력 필드 처리 패턴**
```typescript
<OutputField
  value={data.outputData?.result || ''}
  handleId="result"              // ✅ 핸들 ID 필수
/>
```

### **긴 텍스트 자동 처리 (3줄 제한)**
**InputField와 OutputField에서 자동으로 처리됨:**
- 비활성화된 필드에서 3줄 초과 시 자동으로 "..." 표시
- 핸들 연결로 비활성화된 입력 필드
- 모든 출력 필드 (항상 비활성화)

```typescript
// ✅ 자동 처리되므로 추가 코드 불필요
// 3줄 초과 시:
// 첫 번째 줄
// 두 번째 줄  
// 세 번째 줄
// ...
```

## 📁 **파일명 규칙 (엄격히 준수)**

| 구분 | 형식 | 예시 |
|------|------|------|
| 프론트엔드 파일 | `CamelCaseNode.tsx` | `VideoDownloadNode.tsx` |
| 백엔드 파일 | `snake_case_node.rs` | `video_download_node.rs` |
| 백엔드 함수 | `snake_case_node()` | `video_download_node()` |
| 노드 타입 | `camelCaseNode` | `videoDownloadNode` |
| 사이드바 표시명 | `Snake Case` | `Video Download` |

## 🛠️ **4단계 개발 순서 (절대 준수)**

```
1. Frontend (.tsx) → 2. Backend (.rs) → 3. mod.rs 등록 → 4. lib.rs 등록
```

**⚠️ 절대 여러 파일 동시 생성 금지! 하나씩 순차적으로!**

### **단계별 체크리스트:**
- [ ] **1단계**: 프론트엔드 노드만 생성, config export 포함
- [ ] **2단계**: 백엔드 함수만 생성, #[tauri::command] 포함
- [ ] **3단계**: mod.rs에 pub mod, pub use 2줄만 추가
- [ ] **4단계**: lib.rs invoke_handler에 1줄만 추가

## 🎯 **config 설정 필수 항목**

```typescript
export const config: NodeConfig = {
  type: 'nodeType',
  label: 'Node Name', 
  color: '#COLOR',
  category: 'Category',    // ✅ 반드시 설정 (사이드바 그룹화)
  settings: [
    { key: 'field', type: 'text', label: 'Field Label', default: '' }
  ]
};
```

## ⚠️ **절대 금지사항**

1. **executeNextNodes 호출 시 outputData 누락**
2. **실패 시에도 executeNextNodes 호출**
3. **handleId 없는 InputField/OutputField**
4. **문자열이 아닌 데이터 타입 사용**
5. **백엔드에서 비동기 작업 미완료 상태로 리턴**
6. **대용량 데이터 직접 전달** (파일 경로만 전달)

### **기존 노드 참고하기**
- `FileCreatorNode.tsx`: 완전한 구현 예시 (최신 패턴 적용)
- 새로운 방식 발명하지 말고 기존 패턴 따르기

### **디버깅 도구**
```typescript
console.log(`📄 NodeName ${id}: 상태 정보`, {
  mode,
  inputData,
  outputData
});
```

### **메모리 효율성**
```typescript
// ✅ 대용량 파일은 경로만 전달
outputData: {
  filePath: "/path/to/large/file.txt",
  fileSize: "10485760"
}

// ❌ 대용량 내용 직접 전달 금지
outputData: {
  content: "10MB 텍스트 전체..." // 💥 메모리 문제
}
```

## 🎉 **결론**

**이 가이드의 핵심 해결책:**
1. **onBlur 의존성 문제** → 데이터 먼저 전달, 그 다음 트리거
2. **타입 불일치 문제** → 모든 데이터 문자열 통일
3. **에러 전파 문제** → 실패시 다음 노드 차단
4. **자동화 안전성** → 포커스와 무관한 정확한 실행

**이 원칙들을 따르면 완전히 자동화 친화적이고 안정적인 노드를 만들 수 있습니다!** 🚀