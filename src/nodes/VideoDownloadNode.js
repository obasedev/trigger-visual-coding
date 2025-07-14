import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { Video } from 'lucide-react';
import BaseNode, { InputField, OutputField } from './Basenode';
import { useWorkflow, useHandleConnection } from '../WorkflowContext';
function VideoDownloadNode({ id, data, selected }) {
    const { updateNodeData, executeNextNodes } = useWorkflow();
    // 로컬 상태 관리
    const [localUrls, setLocalUrls] = useState(data?.urls || '');
    const [localFolderName, setLocalFolderName] = useState(data?.folderName || '');
    const [localDownloadPath, setLocalDownloadPath] = useState(data?.downloadPath || 'C:\\Downloads');
    // 상태 관리
    const [status, setStatus] = useState('waiting');
    const [result, setResult] = useState('');
    // 핸들 연결 감지 (호환성을 위해 "text" 핸들 유지)
    const isUrlsConnected = useHandleConnection(id, 'text');
    const isFolderNameConnected = useHandleConnection(id, 'folderName');
    const isDownloadPathConnected = useHandleConnection(id, 'downloadPath');
    // data prop 변경 시 로컬 state 동기화
    useEffect(() => {
        setLocalUrls(data?.urls || '');
        setLocalFolderName(data?.folderName || '');
        setLocalDownloadPath(data?.downloadPath || 'C:\\Downloads');
    }, [data?.urls, data?.folderName, data?.downloadPath]);
    // 핸들 연결 시 실시간 데이터 동기화 (무한루프 방지)
    const { allNodes, allEdges } = useWorkflow();
    useEffect(() => {
        if (isUrlsConnected) {
            const connectedEdge = allEdges.find(edge => edge.target === id && edge.targetHandle === 'text');
            if (connectedEdge) {
                const sourceNode = allNodes.find(node => node.id === connectedEdge.source);
                if (sourceNode?.data?.outputData?.text) {
                    const newUrls = sourceNode.data.outputData.text;
                    // ✅ 현재 값과 다를 때만 업데이트 (무한루프 방지)
                    if (localUrls !== newUrls) {
                        console.log(`🔗 VideoDownloadNode: Receiving data from ${sourceNode.id}:`, newUrls);
                        setLocalUrls(newUrls);
                    }
                }
            }
        }
    }, [isUrlsConnected, allNodes, allEdges, id, localUrls]); // ✅ localUrls 의존성 추가
    useEffect(() => {
        if (isFolderNameConnected) {
            const connectedEdge = allEdges.find(edge => edge.target === id && edge.targetHandle === 'folderName');
            if (connectedEdge) {
                const sourceNode = allNodes.find(node => node.id === connectedEdge.source);
                if (sourceNode?.data?.outputData?.text) {
                    const newFolderName = sourceNode.data.outputData.text;
                    // ✅ 현재 값과 다를 때만 업데이트
                    if (localFolderName !== newFolderName) {
                        setLocalFolderName(newFolderName);
                    }
                }
            }
        }
    }, [isFolderNameConnected, allNodes, allEdges, id, localFolderName]);
    useEffect(() => {
        if (isDownloadPathConnected) {
            const connectedEdge = allEdges.find(edge => edge.target === id && edge.targetHandle === 'downloadPath');
            if (connectedEdge) {
                const sourceNode = allNodes.find(node => node.id === connectedEdge.source);
                if (sourceNode?.data?.outputData) {
                    const pathData = sourceNode.data.outputData.createdFilePath ||
                        sourceNode.data.outputData.editedFilePath ||
                        sourceNode.data.outputData.downloadLocation ||
                        sourceNode.data.outputData.text;
                    // ✅ 현재 값과 다를 때만 업데이트
                    if (pathData && localDownloadPath !== pathData) {
                        setLocalDownloadPath(pathData);
                    }
                }
            }
        }
    }, [isDownloadPathConnected, allNodes, allEdges, id, localDownloadPath]);
    const handleBlur = (key, value) => {
        if (key === 'urls' && !isUrlsConnected && data.urls !== value) {
            updateNodeData(id, { urls: value });
        }
        if (key === 'folderName' && !isFolderNameConnected && data.folderName !== value) {
            updateNodeData(id, { folderName: value });
        }
        if (key === 'downloadPath' && !isDownloadPathConnected && data.downloadPath !== value) {
            updateNodeData(id, { downloadPath: value });
        }
    };
    // ✅ useCallback으로 executeNode 함수 메모이제이션 (실행 모드 지원)
    const executeNode = useCallback(async (mode = 'triggered') => {
        // ✅ 실행 전 필수 필드 검증 - 연결된 데이터 우선 사용
        const currentUrls = isUrlsConnected ? localUrls.trim() : (data?.urls?.trim() || localUrls.trim());
        const currentFolderName = isFolderNameConnected ? localFolderName.trim() : (data?.folderName?.trim() || localFolderName.trim());
        const currentDownloadPath = isDownloadPathConnected ? localDownloadPath.trim() : (data?.downloadPath?.trim() || localDownloadPath.trim());
        if (!currentUrls || !currentDownloadPath) {
            console.warn('⚠️ VideoDownloadNode: Missing required fields, skipping execution');
            setStatus('failed');
            setResult('URLs and download path are required');
            // ✅ 트리거 상태 초기화
            updateNodeData(id, { triggerExecution: undefined });
            setTimeout(() => {
                setStatus('waiting');
                setResult('');
            }, 2000);
            return;
        }
        setStatus('running');
        try {
            console.log(`🎬 VideoDownloadNode ${id}: Download starting... (mode: ${mode})`);
            // 실제 백엔드 호출
            const { invoke } = await import('@tauri-apps/api/core');
            const downloadResult = await invoke('video_download_node', {
                urls: currentUrls,
                folderName: currentFolderName,
                downloadPath: currentDownloadPath
            });
            setStatus('completed');
            setResult('Download completed successfully');
            updateNodeData(id, {
                triggerExecution: undefined, // ✅ 트리거 상태 초기화
                outputData: {
                    downloadLocation: downloadResult,
                }
            });
            // 🎯 실행 모드에 따른 연쇄 실행 결정
            if (mode === 'triggered') {
                executeNextNodes(id);
                console.log(`🔗 VideoDownloadNode: Triggering next nodes (auto-execution)`);
            }
            else {
                console.log(`🔧 VideoDownloadNode: Manual execution completed, no chain reaction`);
            }
            setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            console.error('❌ Video download failed:', errorMessage, error);
            setStatus('failed');
            setResult(errorMessage);
            // ✅ 실패시 트리거 상태 초기화 및 출력 데이터 클리어
            updateNodeData(id, {
                triggerExecution: undefined,
                outputData: {
                    downloadLocation: `Error: ${errorMessage}`,
                }
            });
            setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
        }
    }, [id, data?.urls, data?.folderName, data?.downloadPath, localUrls, localFolderName, localDownloadPath, executeNextNodes, updateNodeData]);
    // ✅ 트리거 실행 감지 (executeNode가 useCallback으로 안정화됨)
    useEffect(() => {
        if (data.triggerExecution && typeof data.triggerExecution === 'number') {
            console.log(`🎬 Video download node ${id} auto-execution triggered!`);
            executeNode('triggered'); // 자동 트리거 모드로 실행
        }
    }, [data.triggerExecution, executeNode]);
    return (_jsxs(BaseNode, { id: id, title: "Video Download", icon: _jsx(Video, { size: 16, stroke: "white" }), status: status, selected: selected, onExecute: executeNode, data: data, result: result, description: "Download videos optimized for Premiere Pro", children: [_jsx("div", { onBlur: () => handleBlur('urls', localUrls), children: _jsx(InputField, { nodeId: id, label: "Video URLs", value: localUrls, placeholder: "https://youtube.com/watch?v=...\nhttps://tiktok.com/@.../video/...\n(One URL per line)", type: "textarea", rows: 4, onChange: setLocalUrls, handleId: "text", disabled: isUrlsConnected }) }), _jsx("div", { onBlur: () => handleBlur('folderName', localFolderName), children: _jsx(InputField, { nodeId: id, label: "Folder name (optional)", value: localFolderName, placeholder: "Leave empty to download directly", onChange: setLocalFolderName, handleId: "folderName", disabled: isFolderNameConnected }) }), _jsx("div", { onBlur: () => handleBlur('downloadPath', localDownloadPath), children: _jsx(InputField, { nodeId: id, label: "Download path", value: localDownloadPath, placeholder: "C:\\Downloads", onChange: setLocalDownloadPath, handleId: "downloadPath", disabled: isDownloadPathConnected }) }), _jsx(OutputField, { nodeId: id, label: "Download location", icon: _jsx(Video, { size: 12 }), value: data?.outputData?.downloadLocation || '', handleId: "downloadLocation" })] }));
}
// 사이드바 자동 발견을 위한 설정 정보
export const config = {
    type: 'videoDownloadNode',
    label: 'Video Download',
    color: '#FF6B6B',
    category: 'File',
    settings: [
        { key: 'urls', type: 'textarea', label: 'Video URLs', default: '' },
        { key: 'folderName', type: 'text', label: 'Folder Name', default: '' },
        { key: 'downloadPath', type: 'text', label: 'Download Path', default: 'C:\\Downloads' }
    ]
};
export default VideoDownloadNode;
