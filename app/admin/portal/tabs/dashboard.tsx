'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  Users,
  Brain,
  Database,
  Server,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface SystemMetrics {
  health: {
    status: 'healthy' | 'warning' | 'critical';
    uptime: string;
    lastCheck: string;
  };
  performance: {
    responseTime: number;
    throughput: number;
    errorRate: number;
    cpuUsage: number;
    memoryUsage: number;
  };
  ai: {
    modelsActive: number;
    totalRequests: number;
    averageLatency: number;
    successRate: number;
  };
  users: {
    total: number;
    active: number;
    newToday: number;
  };
  storage: {
    used: number;
    total: number;
    percentage: number;
  };
}

export default function DashboardTab() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('/api/admin/metrics/dashboard');
        if (response.ok) {
          const data = await response.json();
          setMetrics(data);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Failed to load dashboard metrics</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'warning': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20';
      case 'critical': return 'text-red-600 bg-red-100 dark:bg-red-900/20';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-4 w-4" />;
      case 'warning': return <AlertTriangle className="h-4 w-4" />;
      case 'critical': return <AlertTriangle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const formatBytes = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
          <p className="text-gray-600 dark:text-gray-400">System overview and real-time metrics</p>
        </div>
        <Badge className={`${getStatusColor(metrics.health.status)} flex items-center space-x-1`}>
          {getStatusIcon(metrics.health.status)}
          <span className="capitalize">{metrics.health.status}</span>
        </Badge>
      </div>

      {/* System Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {metrics.health.uptime}
            </div>
            <p className="text-xs text-muted-foreground">
              Uptime
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Last check: {new Date(metrics.health.lastCheck).toLocaleTimeString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.users.active.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              of {metrics.users.total.toLocaleString()} total
            </p>
            <div className="flex items-center text-xs text-green-600 mt-1">
              <TrendingUp className="h-3 w-3 mr-1" />
              +{metrics.users.newToday} new today
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Performance</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.ai.successRate}%</div>
            <p className="text-xs text-muted-foreground">
              Success rate
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.ai.averageLatency}ms avg latency
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Usage</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.storage.percentage}%</div>
            <p className="text-xs text-muted-foreground">
              {formatBytes(metrics.storage.used)} of {formatBytes(metrics.storage.total)}
            </p>
            <Progress value={metrics.storage.percentage} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
            <CardDescription>Real-time system performance indicators</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Response Time</span>
              <span className="text-sm text-muted-foreground">{metrics.performance.responseTime}ms</span>
            </div>
            <Progress value={Math.min((metrics.performance.responseTime / 1000) * 100, 100)} />

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">CPU Usage</span>
              <span className="text-sm text-muted-foreground">{metrics.performance.cpuUsage}%</span>
            </div>
            <Progress value={metrics.performance.cpuUsage} />

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Memory Usage</span>
              <span className="text-sm text-muted-foreground">{metrics.performance.memoryUsage}%</span>
            </div>
            <Progress value={metrics.performance.memoryUsage} />

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Error Rate</span>
              <span className={`text-sm ${metrics.performance.errorRate > 5 ? 'text-red-600' : 'text-green-600'}`}>
                {metrics.performance.errorRate}%
              </span>
            </div>
            <Progress
              value={metrics.performance.errorRate}
              className={metrics.performance.errorRate > 5 ? 'bg-red-100' : 'bg-green-100'}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Model Statistics</CardTitle>
            <CardDescription>Current AI model performance and usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{metrics.ai.modelsActive}</div>
                <div className="text-sm text-muted-foreground">Active Models</div>
              </div>
              <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {(metrics.ai.totalRequests / 1000).toFixed(1)}k
                </div>
                <div className="text-sm text-muted-foreground">Total Requests</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Average Latency</span>
                <span className="font-medium">{metrics.ai.averageLatency}ms</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Throughput</span>
                <span className="font-medium">{metrics.performance.throughput} req/s</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Success Rate</span>
                <span className="font-medium text-green-600">{metrics.ai.successRate}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>Recent system events and alerts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  All systems operational
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  Last updated: {new Date().toLocaleTimeString()}
                </p>
              </div>
            </div>

            {metrics.performance.errorRate > 5 && (
              <div className="flex items-center space-x-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    Elevated error rate detected
                  </p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    Current error rate: {metrics.performance.errorRate}%
                  </p>
                </div>
              </div>
            )}

            {metrics.storage.percentage > 80 && (
              <div className="flex items-center space-x-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    High storage usage
                  </p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    {metrics.storage.percentage}% of storage capacity used
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}