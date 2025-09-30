"use client";

import { useState, useEffect } from "react";
import {
  Puzzle,
  Plus,
  Search,
  Filter,
  Power,
  PowerOff,
  Settings,
  Trash2,
  Activity,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Download,
  Upload
} from "lucide-react";

interface Plugin {
  id: string;
  manifest: {
    name: string;
    displayName: string;
    version: string;
    description: string;
    author: string;
    category: string;
    capabilities: string[];
    tags: string[];
  };
  status: 'enabled' | 'disabled' | 'error';
  installation: {
    installedAt: string;
    installedBy: string;
    source: string;
  };
  usage: {
    executions: number;
    lastUsed?: string;
    averageExecutionTime: number;
    errorRate: number;
  };
  health: {
    status: 'healthy' | 'warning' | 'error' | 'unknown';
    issues: string[];
  };
}

interface PluginStats {
  total: number;
  enabled: number;
  disabled: number;
  errors: number;
  totalExecutions: number;
  avgExecutionTime: number;
  totalCost: number;
}

export default function PluginManagerPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [stats, setStats] = useState<PluginStats>({
    total: 0,
    enabled: 0,
    disabled: 0,
    errors: 0,
    totalExecutions: 0,
    avgExecutionTime: 0,
    totalCost: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [operationLoading, setOperationLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchPlugins();
  }, [selectedCategory, selectedStatus, searchTerm]);

  const fetchPlugins = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      if (selectedStatus !== 'all') params.append('enabled', selectedStatus);
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(`/api/v1/plugins?${params}`);
      if (!response.ok) throw new Error('Failed to fetch plugins');

      const data = await response.json();
      setPlugins(data.data || []);

      // Calculate stats
      const newStats = calculateStats(data.data || []);
      setStats(newStats);
    } catch (error) {
      console.error('Failed to fetch plugins:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (plugins: Plugin[]): PluginStats => {
    return {
      total: plugins.length,
      enabled: plugins.filter(p => p.status === 'enabled').length,
      disabled: plugins.filter(p => p.status === 'disabled').length,
      errors: plugins.filter(p => p.health.status === 'error').length,
      totalExecutions: plugins.reduce((sum, p) => sum + p.usage.executions, 0),
      avgExecutionTime: plugins.length > 0
        ? plugins.reduce((sum, p) => sum + p.usage.averageExecutionTime, 0) / plugins.length
        : 0,
      totalCost: plugins.reduce((sum, p) => sum + (p.usage.executions * 0.001), 0), // Simplified cost calculation
    };
  };

  const togglePlugin = async (pluginId: string, currentStatus: string) => {
    setOperationLoading(pluginId);
    try {
      const action = currentStatus === 'enabled' ? 'disable' : 'enable';
      const method = action === 'enable' ? 'POST' : 'DELETE';

      const response = await fetch(`/api/v1/plugins/${pluginId}/enable`, {
        method,
      });

      if (!response.ok) throw new Error(`Failed to ${action} plugin`);

      await fetchPlugins();
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
    } finally {
      setOperationLoading(null);
    }
  };

  const uninstallPlugin = async (pluginId: string) => {
    if (!confirm('Are you sure you want to uninstall this plugin? This action cannot be undone.')) {
      return;
    }

    setOperationLoading(pluginId);
    try {
      const response = await fetch(`/api/v1/plugins/${pluginId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to uninstall plugin');

      await fetchPlugins();
    } catch (error) {
      console.error('Failed to uninstall plugin:', error);
    } finally {
      setOperationLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'enabled': return 'text-green-600 bg-green-100';
      case 'disabled': return 'text-gray-600 bg-gray-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-yellow-600 bg-yellow-100';
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const categories = ['all', ...new Set(plugins.map(p => p.manifest.category))];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Puzzle className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Plugin Manager</h1>
                <p className="text-sm text-gray-600">Manage and monitor your plugins</p>
              </div>
            </div>
            <div className="flex space-x-3">
              <button className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                <Download className="w-4 h-4" />
                <span>Import</span>
              </button>
              <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Plus className="w-4 h-4" />
                <span>Install Plugin</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Plugins</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <Puzzle className="w-8 h-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Enabled</p>
                <p className="text-2xl font-bold text-green-600">{stats.enabled}</p>
              </div>
              <Power className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Executions</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalExecutions.toLocaleString()}</p>
              </div>
              <Activity className="w-8 h-8 text-purple-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Time</p>
                <p className="text-2xl font-bold text-gray-900">{Math.round(stats.avgExecutionTime)}ms</p>
              </div>
              <Clock className="w-8 h-8 text-orange-500" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search plugins..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {categories.map(category => (
                    <option key={category} value={category}>
                      {category === 'all' ? 'All Categories' : category}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Plugins List */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Installed Plugins</h2>
          </div>

          <div className="divide-y divide-gray-200">
            {loading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600">Loading plugins...</p>
              </div>
            ) : plugins.length === 0 ? (
              <div className="p-8 text-center">
                <Puzzle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-600 mb-2">No plugins found</p>
                <p className="text-sm text-gray-500">Install your first plugin to get started</p>
              </div>
            ) : (
              plugins.map((plugin) => (
                <div key={plugin.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {plugin.manifest.displayName}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(plugin.status)}`}>
                          {plugin.status}
                        </span>
                        {getHealthIcon(plugin.health.status)}
                      </div>

                      <p className="text-gray-600 mb-3">{plugin.manifest.description}</p>

                      <div className="flex flex-wrap gap-2 mb-3">
                        {plugin.manifest.tags.map(tag => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Version</p>
                          <p className="font-medium">{plugin.manifest.version}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Executions</p>
                          <p className="font-medium">{plugin.usage.executions.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Avg Time</p>
                          <p className="font-medium">{Math.round(plugin.usage.averageExecutionTime)}ms</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Error Rate</p>
                          <p className="font-medium">{(plugin.usage.errorRate * 100).toFixed(1)}%</p>
                        </div>
                      </div>

                      {plugin.health.issues.length > 0 && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                          <p className="text-sm font-medium text-yellow-800 mb-1">Health Issues:</p>
                          <ul className="text-sm text-yellow-700 space-y-1">
                            {plugin.health.issues.slice(0, 3).map((issue, index) => (
                              <li key={index}>• {issue}</li>
                            ))}
                            {plugin.health.issues.length > 3 && (
                              <li>• +{plugin.health.issues.length - 3} more issues</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col space-y-2 ml-6">
                      <button
                        onClick={() => togglePlugin(plugin.id, plugin.status)}
                        disabled={operationLoading === plugin.id}
                        className={`flex items-center space-x-2 px-3 py-2 rounded text-sm font-medium ${
                          plugin.status === 'enabled'
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        } disabled:opacity-50`}
                      >
                        {operationLoading === plugin.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : plugin.status === 'enabled' ? (
                          <PowerOff className="w-4 h-4" />
                        ) : (
                          <Power className="w-4 h-4" />
                        )}
                        <span>{plugin.status === 'enabled' ? 'Disable' : 'Enable'}</span>
                      </button>

                      <button className="flex items-center space-x-2 px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm font-medium hover:bg-gray-200">
                        <Settings className="w-4 h-4" />
                        <span>Configure</span>
                      </button>

                      <button
                        onClick={() => uninstallPlugin(plugin.id)}
                        disabled={operationLoading === plugin.id}
                        className="flex items-center space-x-2 px-3 py-2 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Uninstall</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}