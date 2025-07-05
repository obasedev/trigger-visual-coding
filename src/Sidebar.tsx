import React, { useState, useEffect, useMemo } from 'react';
import { 
  Puzzle, 
  Search, 
  X, 
  ChevronRight, 
  Play, 
  FileText, 
  Settings, 
  Database, 
  Globe, 
  Clock, 
  GitBranch, 
  Package,
  Github,
  BookOpen,
  Youtube
} from 'lucide-react';
import './sidebar.css';

interface SidebarProps {
  onAddNode: (nodeType: string) => void;
}

interface NodeConfig {
  type: string;
  label: string;
  color: string;
  category: string;
  settings?: any[];
}

function Sidebar({ onAddNode }: SidebarProps) {
  const [nodeConfigs, setNodeConfigs] = useState<NodeConfig[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Core', 'File']) // Default expanded categories
  );
  const [searchTerm, setSearchTerm] = useState('');

  // Load node configurations
  useEffect(() => {
    const loadNodeConfigs = async () => {
      try {
        const configs: NodeConfig[] = [];
        const nodeModules = import.meta.glob('./nodes/*Node.tsx', { eager: true });
        
        for (const path in nodeModules) {
          const module = nodeModules[path] as any;
          const config = module.config;
          
          if (config) {
            configs.push(config);
          }
        }
        
        setNodeConfigs(configs);
        console.log(`📋 Sidebar: ${configs.length} nodes loaded`);
      } catch (error) {
        console.error('❌ Sidebar: Node loading failed:', error);
      }
    };

    loadNodeConfigs();
  }, []);

  // Categorize nodes
  const categorizedNodes = useMemo(() => {
    const categories: { [key: string]: NodeConfig[] } = {};
    
    nodeConfigs.forEach(config => {
      const category = config.category || 'Other';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(config);
    });
    
    return categories;
  }, [nodeConfigs]);

  // Search filtering
  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return categorizedNodes;
    
    const filtered: { [key: string]: NodeConfig[] } = {};
    Object.entries(categorizedNodes).forEach(([category, nodes]) => {
      const filteredNodes = nodes.filter(node =>
        node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        node.type.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (filteredNodes.length > 0) {
        filtered[category] = filteredNodes;
      }
    });
    
    return filtered;
  }, [categorizedNodes, searchTerm]);

  // Toggle category
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  // Category icon mapping - 모든 아이콘을 흰색으로 변경
  const getCategoryIcon = (category: string) => {
    const iconMap: { [key: string]: React.ReactNode } = {
      'Core': <Play size={16} color="#ffffff" />,
      'File': <FileText size={16} color="#ffffff" />,
      'Text': <FileText size={16} color="#ffffff" />,
      'Utility': <Settings size={16} color="#ffffff" />,
      'Data': <Database size={16} color="#ffffff" />,
      'Network': <Globe size={16} color="#ffffff" />,
      'Time': <Clock size={16} color="#ffffff" />,
      'Condition': <GitBranch size={16} color="#ffffff" />,
      'Other': <Package size={16} color="#ffffff" />
    };
    return iconMap[category] || <Package size={16} color="#ffffff" />;
  };

  const openExternalLink = (url: string) => {
    if ((window as any).__TAURI__) {
      import('@tauri-apps/plugin-shell').then(({ open }) => {
        open(url);
      }).catch(console.error);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="sidebar-container">
      
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-title">
          <Puzzle size={18} color="#64b5f6" />
          <span className="sidebar-title-text">
            Node Library
          </span>
        </div>
        
        {/* Search bar */}
        <div className="sidebar-search-container">
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="sidebar-search-input"
          />
          <div className="sidebar-search-icon">
            <Search size={14} />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="sidebar-search-clear"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Category list */}
      <div className="sidebar-categories">
        {Object.entries(filteredCategories).map(([category, nodes]) => {
          const isExpanded = expandedCategories.has(category);
          
          return (
            <div key={category} className="sidebar-category">
              
              {/* Category header */}
              <div
                onClick={() => toggleCategory(category)}
                className={`sidebar-category-header ${isExpanded ? 'expanded' : ''}`}
              >
                <div className="sidebar-category-info">
                  <div className="sidebar-category-icon">
                    {getCategoryIcon(category)}
                  </div>
                  <span className="sidebar-category-name">
                    {category}
                  </span>
                  <span className="sidebar-category-count">
                    {nodes.length}
                  </span>
                </div>
                <div className={`sidebar-category-arrow ${isExpanded ? 'expanded' : ''}`}>
                  <ChevronRight size={12} />
                </div>
              </div>

              {/* Node list */}
              {isExpanded && (
                <div className="sidebar-nodes">
                  {nodes.map((node) => (
                    <div
                      key={node.type}
                      onClick={() => onAddNode(node.type)}
                      className="sidebar-node"
                      style={{ '--node-color': node.color } as React.CSSProperties}
                    >
                      <div className="sidebar-node-indicator" />
                      <span className="sidebar-node-label">
                        {node.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* No search results */}
        {Object.keys(filteredCategories).length === 0 && searchTerm && (
          <div className="sidebar-no-results">
            <div className="sidebar-no-results-icon">
              <Search size={24} />
            </div>
            <div className="sidebar-no-results-title">
              No search results
            </div>
            <div className="sidebar-no-results-subtitle">
              Try searching with different keywords
            </div>
          </div>
        )}
      </div>

      {/* Footer information */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-info">
          <span>Total {nodeConfigs.length} nodes</span>
          <div className="developer-links">
            <button className="developer-link" onClick={() => openExternalLink('https://github.com')} title="GitHub">
              <Github size={14} />
            </button>
            <button className="developer-link" onClick={() => openExternalLink('https://notion.so')} title="Notion">
              <BookOpen size={14} />
            </button>
            <button className="developer-link" onClick={() => openExternalLink('https://youtube.com')} title="YouTube">
              <Youtube size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;