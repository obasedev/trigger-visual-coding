# 🎯 워크플로우 노드 개발 핵심 원칙

> **이 문서는 원칙과 개념 설명입니다. 기존 노드들(FileCreatorNode, VideoDownloadNode 등)을 참고해서 해당 패턴을 따라 만드세요.**

## 🚨 **절대 원칙 (반드시 지켜야 함)**

### 1️⃣ **실행 모드 구분 - 가장 중요!**

**모든 노드는 두 가지 실행 방식을 지원:**
- **개별 실행** (`mode: 'manual'`): 사용자가 버튼 클릭 → 자기만 실행, 다음 노드 안 건드림
- **연쇄 실행** (`mode: 'triggered'`): 이전 노드가 트리거 → 실행 후 다음 노드들도 트리거

**핵심 로직:**
```
if (mode === 'triggered') {
  executeNextNodes(id);  // 다음 노드들 실행
} else {
  // 아무것도 안함 (자기만 실행)
}
```

**⚠️ 잘못된 구현:** 무조건 `executeNextNodes()` 호출하면 개별실행도 연쇄실행됨

### 2️⃣ **Handle ID 표준화**

**기본 규칙: 모든 노드는 "text" handleId 사용**
- 입력 핸들: `handleId="text"`
- 출력 핸들: `handleId="text"`
- 특수한 경우만 다른 ID 사용 (예: "folderName", "downloadPath")

**이유:** 노드 간 연결 호환성. 모든 노드가 "text"면 자유롭게 연결 가능.

### 3️⃣ **출력 데이터 순수성**

**노드 출력은 다음 노드가 바로 쓸 수 있는 깔끔한 데이터만:**

✅ **올바른 출력:** `"/Users/Downloads/video.mp4"`
❌ **잘못된 출력:** `"🎉 다운로드 완료!\n📁 위치: /Users/Downloads/video.mp4"`

**이유:** 다음 노드에서 경로를 그대로 사용해야 하는데 장식 문자가 있으면 망가짐.

### 4️⃣ **triggerExecution 상태 관리**

**실행 시작 시:**
```
data.triggerExecution && typeof data.triggerExecution === 'number'
```

**실행 완료 시 반드시:**
```
updateNodeData(id, { triggerExecution: undefined })
```

**⚠️ 안 하면:** 무한 실행 루프 발생

## 🔧 **기술적 필수사항**

### **useCallback 의존성**
- `executeNode` 함수는 반드시 `useCallback`으로 메모이제이션
- 의존성 배열에 `executeNextNodes`, `updateNodeData` 포함 필수

### **무한루프 방지**
- 연결된 데이터 업데이트할 때 "값이 다를 때만" 조건 추가
- `useEffect` 의존성 배열에 변경되는 값들 모두 포함

### **에러 처리 및 복귀**
- 실행 실패 시 2초 후 자동으로 "waiting" 상태로 복귀
- 성공 시에도 2초 후 상태 복귀

### **연결 상태 확인**
- `useHandleConnection`으로 입력이 연결되었는지 확인
- 연결된 필드는 사용자 입력 비활성화

## 📁 **파일 생성 순서**

### **단계별 접근 (한 번에 하나씩!)**
1. **프론트엔드만** 먼저 생성: `src/nodes/MyNewNode.tsx`
2. **백엔드만** 생성: `src-tauri/src/nodes/my_new_node.rs`  
3. **등록 1**: `src-tauri/src/nodes/mod.rs`에 추가
4. **등록 2**: `src-tauri/src/lib.rs`에 핸들러 추가

**⚠️ 주의:** 여러 파일을 동시에 만들지 말고 순서대로 하나씩!

## 🎯 **파일명 규칙 (엄격히 준수)**

| 구분 | 형식 | 예시 |
|------|------|------|
| 프론트엔드 파일 | `CamelCaseNode.tsx` | `VideoDownloadNode.tsx` |
| 백엔드 파일 | `snake_case_node.rs` | `video_download_node.rs` |
| 백엔드 함수 | `snake_case_node()` | `video_download_node()` |
| 노드 타입 | `camelCaseNode` | `videoDownloadNode` |
| 사이드바 표시명 | `Snake Case` | `Video Download` |

## ⚠️ **흔한 실수들**

### ❌ **실행 모드 무시**
```typescript
// 잘못된 예시
const executeNode = async () => {
  // 작업 수행
  executeNextNodes(id);  // 항상 다음 노드 실행 (틀림!)
}
```

### ❌ **출력에 장식 추가**
```rust
// 잘못된 예시  
Ok(format!("🎉 성공!\n결과: {}", result))  // 다음 노드에서 못 씀

// 올바른 예시
Ok(result)  // 깔끔한 결과만
```

### ❌ **무한루프 유발**
```typescript
// 잘못된 예시
useEffect(() => {
  setLocalValue(connectedData);  // 조건 없이 항상 업데이트
}, [connectedData]);

// 올바른 예시  
useEffect(() => {
  if (connectedData !== localValue) {  // 다를 때만 업데이트
    setLocalValue(connectedData);
  }
}, [connectedData, localValue]);
```

### ❌ **Handle ID 충돌**
- 여러 노드에서 같은 특수 handleId 사용
- 해결: 대부분 "text" 사용, 정말 특별한 경우만 다른 ID

## 📋 **체크리스트**

새 노드 만들 때 이것들 확인:

- [ ] `ExecutionMode` 매개변수 지원하는가?
- [ ] `mode === 'triggered'`일 때만 `executeNextNodes()` 호출하는가?
- [ ] `triggerExecution` 상태를 올바르게 초기화하는가?
- [ ] 출력 데이터가 깔끔한가? (장식 문자 없음)
- [ ] Handle ID가 표준 "text"인가?
- [ ] 무한루프 방지 조건이 있는가?
- [ ] 에러 시 자동 복귀 로직이 있는가?
- [ ] `useCallback` 의존성이 완전한가?

## 🎨 **기존 노드 참고하기**

**학습용 좋은 예시들:**
- `FileCreatorNode.tsx`: 기본적인 파일 작업 노드
- `VideoDownloadNode.tsx`: 복잡한 비동기 작업 노드
- `TextInputNode.tsx`: 단순한 데이터 제공 노드

**참고할 때 주목할 점:**
- `executeNode` 함수의 `mode` 매개변수 처리
- `useEffect`에서 `triggerExecution` 감지 방식
- 상태 복귀 타이머 사용법
- Handle 연결 상태 확인 패턴

## 💡 **AI에게 당부사항**

1. **기존 패턴 따르기**: 새로운 방식 발명하지 말고 기존 노드들의 패턴 따르기
2. **단순하게 유지**: 복잡한 구조보다는 단순하고 명확한 구조
3. **한 번에 하나씩**: 여러 파일 동시 생성하지 말고 순서대로
4. **필요한 것만**: 사용자가 요청한 기능만 구현, 추가 기능 제안 안함
5. **출력 순수성**: 노드 출력에 장식이나 요약 추가하지 말 것

**이 원칙들을 지키면 안정적이고 호환성 좋은 노드를 만들 수 있습니다!** 🎉