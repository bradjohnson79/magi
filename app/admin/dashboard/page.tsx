/**
 * Admin Dashboard
 *
 * Comprehensive admin interface showing system health, AI metrics,
 * user plan usage, audit logs, and operational controls.
 */

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

interface HealthStatus {
  status: string;
  checks: {
    database: { status: string; latency: number };
    storage: { status: string; latency: number };
    mcp: { status: string; latency: number; services: any };
    system: { status: string; memory: any };
    api: { status: string };
  };
  uptime: number;
  environment: string;
}

interface UsageStats {
  total: number;
  byAction: Array<{ action: string; count: number }>;
  bySeverity: Array<{ severity: string; count: number }>;
  byOutcome: Array<{ outcome: string; count: number }>;
  byResource: Array<{ resource: string; count: number }>;
}

interface AuditLog {
  id: string;
  action: string;
  resource: string;
  severity: string;
  outcome: string;
  createdAt: string;
  user?: { email: string; name: string };
}

interface MetricData {
  timestamp: string;
  count: number;
  avgValue: number;
  minValue: number;
  maxValue: number;
}

const Dashboard = () => {
  const { isLoaded, userId, orgRole } = useAuth();
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [metrics, setMetrics] = useState<Record<string, MetricData[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Check if user is admin
  const isAdmin = orgRole === 'admin' || process.env.NODE_ENV === 'development';

  useEffect(() => {
    if (!isLoaded) return;

    if (!isAdmin) {
      setError('Admin access required');
      setLoading(false);
      return;
    }

    loadDashboardData();

    // Refresh data every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, [isLoaded, isAdmin]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadHealthStatus(),
        loadUsageStats(),
        loadAuditLogs(),
        loadMetrics(),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const loadHealthStatus = async () => {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('Failed to load health status');
    const data = await response.json();
    setHealthStatus(data);
  };

  const loadUsageStats = async () => {
    const response = await fetch('/api/v1/admin/usage?endpoint=stats&includeStats=true');
    if (!response.ok) throw new Error('Failed to load usage stats');
    const data = await response.json();
    setUsageStats(data.data.stats);
  };

  const loadAuditLogs = async () => {
    const response = await fetch('/api/v1/audit?limit=10');
    if (!response.ok) throw new Error('Failed to load audit logs');
    const data = await response.json();
    setAuditLogs(data.data.logs);
  };

  const loadMetrics = async () => {
    // Load different metric types
    const metricTypes = ['api_latency', 'db_query_time', 'error_rate'];
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

    const metricsData: Record<string, MetricData[]> = {};

    for (const metricType of metricTypes) {
      try {
        // This would typically call a metrics API endpoint
        // For now, we'll simulate some data
        metricsData[metricType] = generateMockMetrics();
      } catch (err) {
        console.error(`Failed to load ${metricType} metrics:`, err);
      }
    }

    setMetrics(metricsData);
  };

  const generateMockMetrics = (): MetricData[] => {
    const data: MetricData[] = [];
    const now = new Date();

    for (let i = 23; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      data.push({
        timestamp: timestamp.toISOString(),
        count: Math.floor(Math.random() * 100) + 50,
        avgValue: Math.random() * 1000 + 100,
        minValue: Math.random() * 100,
        maxValue: Math.random() * 2000 + 1000,
      });
    }

    return data;
  };

  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'healthy': case 'ok': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'error': case 'unhealthy': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity.toLowerCase()) {
      case 'info': return 'text-blue-600 bg-blue-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'error': return 'text-red-600 bg-red-100';
      case 'critical': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (!isLoaded) {
    return <div className="p-6">Loading...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Magi Admin Dashboard</h1>
          <p className="text-gray-600">System monitoring and administration</p>
        </div>
      </div>

      <div className="p-6">
        {/* Tab Navigation */}
        <div className="mb-6">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'health', label: 'System Health' },
              { id: 'metrics', label: 'Metrics' },
              { id: 'audit', label: 'Audit Logs' },
              { id: 'users', label: 'User Management' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {loading && (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="mt-2 text-gray-600">Loading dashboard data...</p>
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && healthStatus && (
          <div className="space-y-6">
            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className={`inline-flex p-2 rounded-md ${getStatusColor(healthStatus.status)}`}>
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">System Status</dt>
                        <dd className="text-lg font-medium text-gray-900 capitalize">{healthStatus.status}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="inline-flex p-2 rounded-md bg-blue-100 text-blue-600">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Uptime</dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {Math.floor(healthStatus.uptime / 3600)}h {Math.floor((healthStatus.uptime % 3600) / 60)}m
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="inline-flex p-2 rounded-md bg-green-100 text-green-600">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 1.79 4 4 4h8c2.21 0 4-1.79 4-4V7c0-2.21-1.79-4-4-4H8c-2.21 0-4 1.79-4 4z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Memory Usage</dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {healthStatus.checks.system.memory?.used || 0}MB
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className={`inline-flex p-2 rounded-md ${getStatusColor(healthStatus.checks.database.status)}`}>
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 1.79 4 4 4h8c2.21 0 4-1.79 4-4V7c0-2.21-1.79-4-4-4H8c-2.21 0-4 1.79-4 4z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Database</dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {healthStatus.checks.database.latency}ms
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Recent Audit Activity</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {auditLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSeverityColor(log.severity)}`}>
                          {log.severity}
                        </span>
                        <span className="ml-2 text-sm text-gray-900">{log.action}</span>
                        <span className="ml-2 text-sm text-gray-500">• {log.resource}</span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </div>
                    </div>
                    {log.user && (
                      <div className="mt-1 text-sm text-gray-600">
                        by {log.user.name || log.user.email}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Health Tab */}
        {activeTab === 'health' && healthStatus && (
          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">System Health Status</h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.entries(healthStatus.checks).map(([service, check]) => (
                    <div key={service} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900 capitalize">{service}</h4>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(check.status)}`}>
                          {check.status}
                        </span>
                      </div>
                      {check.latency && (
                        <p className="text-sm text-gray-600">Latency: {check.latency}ms</p>
                      )}
                      {check.memory && (
                        <div className="text-sm text-gray-600">
                          <p>Memory: {check.memory.used}MB / {check.memory.total}MB</p>
                          <p>RSS: {check.memory.rss}MB</p>
                        </div>
                      )}
                      {check.services && (
                        <div className="mt-2">
                          {Object.entries(check.services).map(([serviceName, serviceStatus]: [string, any]) => (
                            <div key={serviceName} className="flex justify-between text-sm">
                              <span>{serviceName}</span>
                              <span className={serviceStatus.healthy ? 'text-green-600' : 'text-red-600'}>
                                {serviceStatus.healthy ? 'OK' : 'DOWN'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Performance Metrics (Last 24 Hours)</h3>
              </div>
              <div className="p-6">
                {Object.entries(metrics).map(([metricType, data]) => (
                  <div key={metricType} className="mb-8">
                    <h4 className="font-medium text-gray-900 mb-4 capitalize">
                      {metricType.replace('_', ' ')}
                    </h4>
                    <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                      <p className="text-gray-500">Chart placeholder for {metricType}</p>
                      <p className="text-sm text-gray-400 ml-2">
                        ({data.length} data points)
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Audit Tab */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Audit Logs</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Resource
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Severity
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {log.action}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {log.resource}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSeverityColor(log.severity)}`}>
                            {log.severity}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {log.user?.name || log.user?.email || 'System'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && usageStats && (
          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Usage Statistics</h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">Total Events</h4>
                    <p className="text-2xl font-bold text-indigo-600">{usageStats.total}</p>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">Top Action</h4>
                    <p className="text-sm text-gray-600">
                      {usageStats.byAction[0]?.action || 'N/A'}
                    </p>
                    <p className="text-lg font-bold text-indigo-600">
                      {usageStats.byAction[0]?.count || 0}
                    </p>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">Success Rate</h4>
                    <p className="text-2xl font-bold text-green-600">
                      {usageStats.byOutcome.find(o => o.outcome === 'success')?.count || 0}
                    </p>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">Errors</h4>
                    <p className="text-2xl font-bold text-red-600">
                      {usageStats.bySeverity.find(s => s.severity === 'error')?.count || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;