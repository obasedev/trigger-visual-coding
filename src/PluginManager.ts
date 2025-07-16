// src/PluginManager.ts
import { invoke } from '@tauri-apps/api/core';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  color: string;
  inputs: Array<{
    id: string;
    type: string;
    label: string;
  }>;
  outputs: Array<{
    id: string;
    type: string;
    label: string;
  }>;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  componentCode: string;
  logicCode?: string;
}

export class PluginManager {
  private static instance: PluginManager;
  private plugins = new Map<string, LoadedPlugin>();
  
  public static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }
  
  async scanAndLoadPlugins(): Promise<void> {
    try {
      console.log('🔍 Starting plugin scan...');
      
      // 1. 플러그인 폴더 정보 확인 (디버깅용)
      const folderInfo: string = await invoke('get_plugins_folder_info');
      console.log('📋 Plugin folder info:', folderInfo);
      
      // 2. 플러그인 폴더 스캔
      const pluginFolders: string[] = await invoke('scan_plugins_folder');
      console.log(`📦 Found ${pluginFolders.length} plugin folders:`, pluginFolders);
      
      // 3. 각 플러그인 로드
      for (const pluginId of pluginFolders) {
        await this.loadPlugin(pluginId);
      }
      
      console.log(`✅ Successfully loaded ${this.plugins.size} plugins`);
      
    } catch (error) {
      console.error('❌ Failed to scan plugins:', error);
    }
  }
  
  private async loadPlugin(pluginId: string): Promise<void> {
    try {
      console.log(`📥 Loading plugin: ${pluginId}`);
      
      // 1. manifest.json 로드
      const manifestText: string = await invoke('read_plugin_file', {
        pluginId,
        fileName: 'manifest.json'
      });
      const manifest: PluginManifest = JSON.parse(manifestText);
      
      // 2. component.js 로드
      const componentCode: string = await invoke('read_plugin_file', {
        pluginId,
        fileName: 'component.js'
      });
      
      // 3. logic.js 로드 (선택적)
      let logicCode: string | undefined;
      try {
        logicCode = await invoke('read_plugin_file', {
          pluginId,
          fileName: 'logic.js'
        });
      } catch (e) {
        console.warn(`⚠️ No logic.js found for plugin ${pluginId} (optional)`);
      }
      
      // 4. 플러그인 등록
      this.plugins.set(pluginId, {
        manifest,
        componentCode,
        logicCode
      });
      
      console.log(`✅ Plugin loaded: ${manifest.name} v${manifest.version}`);
      
    } catch (error) {
      console.error(`❌ Failed to load plugin ${pluginId}:`, error);
    }
  }
  
  getAllPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }
  
  getPlugin(pluginId: string): LoadedPlugin | undefined {
    return this.plugins.get(pluginId);
  }
  
  getPluginConfigs() {
    return this.getAllPlugins().map(plugin => ({
      type: `plugin:${plugin.manifest.id}`,
      label: plugin.manifest.name,
      color: plugin.manifest.color,
      category: plugin.manifest.category || 'Plugins'
    }));
  }
  
  // 🆕 디버깅용 함수들
  getPluginCount(): number {
    return this.plugins.size;
  }
  
  getPluginIds(): string[] {
    return Array.from(this.plugins.keys());
  }
  
  async refreshPlugins(): Promise<void> {
    console.log('🔄 Refreshing plugins...');
    this.plugins.clear();
    await this.scanAndLoadPlugins();
  }
  
  // 🆕 플러그인 상태 확인
  isPluginLoaded(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }
}