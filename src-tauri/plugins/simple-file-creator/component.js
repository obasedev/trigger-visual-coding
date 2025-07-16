// simple-file-creator 플러그인: 순수 JS 실행 함수
// manifest.json의 inputs: filePath, fileName, content
// outputs: fileName, content, filePath

function plugin(inputs) {
  const filePath = inputs.filePath || '';
  const fileName = inputs.fileName || '';
  const content = inputs.content || '';
  
  return {
    // Tauri 명령 실행
    tauriCommand: 'run_command_node',
    params: {
      command: 'cmd',
      args: ['/c', `echo ${content} > ${filePath}\\${fileName}`],
      cwd: null
    },
    // 출력 데이터도 함께 반환
    fileName: fileName,
    content: content,
    filePath: `${filePath}\\${fileName}`
  };
}

// 플러그인 시스템에서 이 파일을 eval하여 plugin 함수를 실행합니다.