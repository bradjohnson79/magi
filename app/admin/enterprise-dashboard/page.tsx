"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  Users,
  Activity,
  DollarSign,
  Calendar,
  Download,
  Filter,
  ChevronDown,
  AlertTriangle,
  Shield,
  Database,
  Clock,
  BarChart3,
  PieChart,
  LineChart,
  Zap,
  Globe
} from "lucide-react";

interface UsageMetrics {
  period: string;
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  modelRuns: number;
  pluginExecutions: number;
  totalCost: number;
  averageSessionDuration: number;
  errorRate: number;
  uptimePercentage: number;
}

interface DepartmentUsage {
  department: string;
  users: number;
  projects: number;
  modelRuns: number;
  cost: number;
  lastActivity: string;
}

interface FeatureAdoption {
  feature: string;
  adoptionRate: number;
  activeUsers: number;
  trend: 'up' | 'down' | 'stable';
}

interface ComplianceMetric {
  type: string;
  status: 'compliant' | 'warning' | 'violation';
  score: number;
  issues: number;
  lastCheck: string;
}

export default function EnterpriseDashboardPage() {
  const [timeRange, setTimeRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<'overview' | 'usage' | 'compliance' | 'security'>('overview');

  const [metrics, setMetrics] = useState<UsageMetrics>({
    period: '30 days',
    totalUsers: 0,
    activeUsers: 0,
    totalProjects: 0,
    modelRuns: 0,
    pluginExecutions: 0,
    totalCost: 0,
    averageSessionDuration: 0,
    errorRate: 0,
    uptimePercentage: 0,
  });

  const [departmentUsage, setDepartmentUsage] = useState<DepartmentUsage[]>([]);
  const [featureAdoption, setFeatureAdoption] = useState<FeatureAdoption[]>([]);
  const [complianceMetrics, setComplianceMetrics] = useState<ComplianceMetric[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, [timeRange]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Mock data - in real implementation, fetch from API
      setMetrics({
        period: timeRange === '7d' ? '7 days' : timeRange === '30d' ? '30 days' : '90 days',
        totalUsers: 1247,
        activeUsers: 892,
        totalProjects: 3451,
        modelRuns: 127834,
        pluginExecutions: 45621,
        totalCost: 8942.50,
        averageSessionDuration: 45.2,
        errorRate: 0.02,
        uptimePercentage: 99.97,
      });

      setDepartmentUsage([
        {
          department: 'Engineering',
          users: 324,
          projects: 1247,
          modelRuns: 45623,
          cost: 3241.20,
          lastActivity: '2 minutes ago',
        },
        {
          department: 'Product',
          users: 156,
          projects: 567,
          modelRuns: 23451,
          cost: 1678.90,
          lastActivity: '5 minutes ago',
        },
        {
          department: 'Design',
          users: 89,
          projects: 234,
          modelRuns: 12456,
          cost: 892.40,
          lastActivity: '12 minutes ago',
        },
        {
          department: 'Marketing',
          users: 67,
          projects: 123,
          modelRuns: 5678,
          cost: 405.30,
          lastActivity: '1 hour ago',
        },
      ]);

      setFeatureAdoption([
        { feature: 'Code Generation', adoptionRate: 85, activeUsers: 758, trend: 'up' },
        { feature: 'Template System', adoptionRate: 67, activeUsers: 598, trend: 'up' },
        { feature: 'Plugin System', adoptionRate: 45, activeUsers: 401, trend: 'stable' },
        { feature: 'Collaboration', adoptionRate: 34, activeUsers: 303, trend: 'up' },
        { feature: 'Workspaces', adoptionRate: 28, activeUsers: 250, trend: 'down' },
      ]);

      setComplianceMetrics([
        { type: 'Data Retention', status: 'compliant', score: 98, issues: 0, lastCheck: '1 hour ago' },
        { type: 'Access Control', status: 'compliant', score: 95, issues: 2, lastCheck: '30 minutes ago' },
        { type: 'Audit Logging', status: 'warning', score: 87, issues: 5, lastCheck: '15 minutes ago' },
        { type: 'SSO Enforcement', status: 'compliant', score: 100, issues: 0, lastCheck: '2 hours ago' },
        { type: 'Encryption', status: 'compliant', score: 99, issues: 0, lastCheck: '1 hour ago' },
      ]);

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportData = async (format: 'csv' | 'json') => {
    // Export dashboard data
    console.log(`Exporting data as ${format}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'compliant': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'violation': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down': return <TrendingUp className="w-4 h-4 text-red-500 rotate-180" />;
      default: return <div className="w-4 h-4 bg-gray-300 rounded-full" />;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <BarChart3 className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Enterprise Dashboard</h1>
                <p className="text-sm text-gray-600">Organization usage and compliance overview</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => exportData('csv')}
                  className="flex items-center space-x-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={() => exportData('json')}
                  className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Download className="w-4 h-4" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>
          </div>

          {/* View Tabs */}
          <div className="mt-6 border-b border-gray-200">
            <nav className="flex space-x-8">
              {[
                { id: 'overview', label: 'Overview', icon: BarChart3 },
                { id: 'usage', label: 'Usage Analytics', icon: Activity },
                { id: 'compliance', label: 'Compliance', icon: Shield },
                { id: 'security', label: 'Security', icon: Globe },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSelectedView(id as any)}
                  className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                    selectedView === id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {selectedView === 'overview' && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Users</p>
                    <p className="text-2xl font-bold text-gray-900">{formatNumber(metrics.totalUsers)}</p>
                    <p className="text-sm text-green-600">
                      {formatNumber(metrics.activeUsers)} active ({Math.round((metrics.activeUsers / metrics.totalUsers) * 100)}%)
                    </p>
                  </div>
                  <Users className="w-8 h-8 text-blue-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Model Runs</p>
                    <p className="text-2xl font-bold text-gray-900">{formatNumber(metrics.modelRuns)}</p>
                    <p className="text-sm text-gray-500">This {metrics.period.toLowerCase()}</p>
                  </div>
                  <Zap className="w-8 h-8 text-purple-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Cost</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.totalCost)}</p>
                    <p className="text-sm text-gray-500">This {metrics.period.toLowerCase()}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Uptime</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.uptimePercentage}%</p>
                    <p className="text-sm text-green-600">
                      Error rate: {(metrics.errorRate * 100).toFixed(2)}%
                    </p>
                  </div>
                  <Activity className="w-8 h-8 text-orange-500" />
                </div>
              </div>
            </div>

            {/* Department Usage */}
            <div className="bg-white rounded-lg shadow mb-8">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Department Usage</h2>
              </div>
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Department</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Users</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Projects</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Model Runs</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Cost</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Last Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departmentUsage.map((dept, index) => (
                        <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium text-gray-900">{dept.department}</td>
                          <td className="py-3 px-4 text-gray-600">{formatNumber(dept.users)}</td>
                          <td className="py-3 px-4 text-gray-600">{formatNumber(dept.projects)}</td>
                          <td className="py-3 px-4 text-gray-600">{formatNumber(dept.modelRuns)}</td>
                          <td className="py-3 px-4 text-gray-600">{formatCurrency(dept.cost)}</td>
                          <td className="py-3 px-4 text-gray-500">{dept.lastActivity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Feature Adoption */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Feature Adoption</h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {featureAdoption.map((feature, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900">{feature.feature}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-600">{feature.adoptionRate}%</span>
                            {getTrendIcon(feature.trend)}
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${feature.adoptionRate}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatNumber(feature.activeUsers)} active users
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {selectedView === 'usage' && (
          <div className="space-y-6">
            {/* Usage Charts Placeholder */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage Trends</h2>
              <div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <LineChart className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500">Usage trend charts would be rendered here</p>
                </div>
              </div>
            </div>

            {/* Additional Usage Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Analytics</h3>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Average Session Duration</span>
                    <span className="font-medium">{metrics.averageSessionDuration} min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Plugin Executions</span>
                    <span className="font-medium">{formatNumber(metrics.pluginExecutions)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Projects</span>
                    <span className="font-medium">{formatNumber(metrics.totalProjects)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
                <div className="h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <PieChart className="w-8 h-8 text-gray-400 mx-auto mb-1" />
                    <p className="text-sm text-gray-500">Performance charts</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedView === 'compliance' && (
          <div className="space-y-6">
            {/* Compliance Overview */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Compliance Status</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {complianceMetrics.map((metric, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-gray-900">{metric.type}</h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(metric.status)}`}>
                          {metric.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl font-bold text-gray-900">{metric.score}%</span>
                        {metric.issues > 0 && (
                          <span className="flex items-center text-sm text-orange-600">
                            <AlertTriangle className="w-4 h-4 mr-1" />
                            {metric.issues} issues
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">Last checked: {metric.lastCheck}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Audit Log Summary */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Recent Audit Events</h2>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {[
                    { action: 'SSO Login', user: 'john.doe@company.com', time: '2 minutes ago', severity: 'info' },
                    { action: 'Data Export', user: 'admin@company.com', time: '1 hour ago', severity: 'warning' },
                    { action: 'User Created', user: 'system', time: '3 hours ago', severity: 'info' },
                    { action: 'Permission Changed', user: 'admin@company.com', time: '5 hours ago', severity: 'warning' },
                  ].map((event, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100">
                      <div className="flex items-center space-x-3">
                        <div className={`w-2 h-2 rounded-full ${
                          event.severity === 'warning' ? 'bg-yellow-400' : 'bg-blue-400'
                        }`} />
                        <span className="font-medium text-gray-900">{event.action}</span>
                        <span className="text-gray-600">by {event.user}</span>
                      </div>
                      <span className="text-sm text-gray-500">{event.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedView === 'security' && (
          <div className="space-y-6">
            {/* Security Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">SSO Adoption</p>
                    <p className="text-2xl font-bold text-gray-900">94%</p>
                    <p className="text-sm text-green-600">842 users via SSO</p>
                  </div>
                  <Shield className="w-8 h-8 text-green-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Data Encrypted</p>
                    <p className="text-2xl font-bold text-gray-900">100%</p>
                    <p className="text-sm text-green-600">At rest & in transit</p>
                  </div>
                  <Database className="w-8 h-8 text-blue-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Session Timeout</p>
                    <p className="text-2xl font-bold text-gray-900">8h</p>
                    <p className="text-sm text-gray-600">Auto-logout enabled</p>
                  </div>
                  <Clock className="w-8 h-8 text-orange-500" />
                </div>
              </div>
            </div>

            {/* Security Events */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Security Events</h2>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {[
                    { event: 'Failed SSO Login Attempt', details: 'Invalid SAML response', time: '5 minutes ago', severity: 'high' },
                    { event: 'New Device Login', details: 'Chrome on macOS', time: '1 hour ago', severity: 'medium' },
                    { event: 'Permission Escalation', details: 'User promoted to admin', time: '2 hours ago', severity: 'high' },
                    { event: 'API Rate Limit Exceeded', details: 'IP: 192.168.1.100', time: '3 hours ago', severity: 'low' },
                  ].map((event, index) => (
                    <div key={index} className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                          event.severity === 'high' ? 'bg-red-400' :
                          event.severity === 'medium' ? 'bg-yellow-400' : 'bg-green-400'
                        }`} />
                        <div>
                          <p className="font-medium text-gray-900">{event.event}</p>
                          <p className="text-sm text-gray-600">{event.details}</p>
                        </div>
                      </div>
                      <span className="text-sm text-gray-500">{event.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}