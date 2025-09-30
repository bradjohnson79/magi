"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

interface UsageStats {
  adminStats: {
    topUsers: Array<{
      userId: string;
      user: { name: string; email: string; plan: string };
      prompts: number;
      e2eRuns: number;
      bytesOut: string;
    }>;
    totalStats: {
      totalPrompts: number;
      totalE2eRuns: number;
      totalBytesOut: string;
      totalUsers: number;
    };
    planBreakdown: Record<string, number>;
  };
  planBreakdown: Record<string, number>;
  recentActivity: Array<{
    id: string;
    timestamp: string;
    user: { name: string; email: string; plan: string };
    payload: any;
  }>;
  metadata: {
    currentPeriod: string;
    generatedAt: string;
    adminUser: string;
  };
}

interface PlanDistribution {
  distribution: Record<string, number>;
  revenueEstimates: Record<string, number>;
  total: number;
}

export default function AdminUsagePage() {
  const { isLoaded, userId } = useAuth();
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [planStats, setPlanStats] = useState<PlanDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [actionTarget, setActionTarget] = useState<string>('');

  useEffect(() => {
    if (isLoaded && userId) {
      fetchUsageData();
      fetchPlanData();
    }
  }, [isLoaded, userId]);

  const fetchUsageData = async () => {
    try {
      const response = await fetch('/api/v1/admin/usage');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setUsageStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch usage data');
    }
  };

  const fetchPlanData = async () => {
    try {
      const response = await fetch('/api/v1/admin/usage?endpoint=plans');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setPlanStats(data);
    } catch (err) {
      console.error('Failed to fetch plan data:', err);
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async () => {
    if (!selectedAction) return;

    try {
      setLoading(true);
      const payload: any = { action: selectedAction };

      if (selectedAction === 'upgrade_plan' && actionTarget) {
        const [userId, plan] = actionTarget.split(':');
        payload.userId = userId;
        payload.plan = plan;
      } else if (selectedAction === 'reset_user' && actionTarget) {
        payload.userId = actionTarget;
      } else if (selectedAction === 'cleanup') {
        payload.retentionMonths = 12;
      }

      const response = await fetch('/api/v1/admin/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Action failed: ${response.statusText}`);
      }

      const result = await response.json();
      alert(`Success: ${result.message}`);

      // Refresh data
      await fetchUsageData();
      await fetchPlanData();

      // Reset form
      setSelectedAction('');
      setActionTarget('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: string) => {
    const num = parseInt(bytes);
    if (num === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white p-6 rounded-lg shadow">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error loading dashboard</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Usage Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Monitor usage, manage plans, and track top offenders
          </p>
          {usageStats?.metadata && (
            <p className="text-sm text-gray-500">
              Period: {usageStats.metadata.currentPeriod} |
              Last updated: {new Date(usageStats.metadata.generatedAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Overview Cards */}
        {usageStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                      <span className="text-white font-semibold">P</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Total Prompts
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {formatNumber(usageStats.adminStats.totalStats.totalPrompts)}
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
                    <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                      <span className="text-white font-semibold">E</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        E2E Runs
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {formatNumber(usageStats.adminStats.totalStats.totalE2eRuns)}
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
                    <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                      <span className="text-white font-semibold">B</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Bytes Out
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {formatBytes(usageStats.adminStats.totalStats.totalBytesOut)}
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
                    <div className="w-8 h-8 bg-orange-500 rounded-md flex items-center justify-center">
                      <span className="text-white font-semibold">U</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Active Users
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {formatNumber(usageStats.adminStats.totalStats.totalUsers)}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Plan Distribution */}
          {planStats && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Plan Distribution</h3>
              <div className="space-y-4">
                {Object.entries(planStats.distribution).map(([plan, count]) => (
                  <div key={plan} className="flex justify-between items-center">
                    <div className="flex items-center">
                      <span className={`inline-block w-3 h-3 rounded-full mr-3 ${
                        plan === 'trial' ? 'bg-gray-400' :
                        plan === 'solo' ? 'bg-blue-500' : 'bg-green-500'
                      }`}></span>
                      <span className="text-sm font-medium text-gray-900 capitalize">{plan}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">{count} users</div>
                      <div className="text-xs text-gray-500">
                        ${planStats.revenueEstimates[plan].toLocaleString()}/mo
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-900">Total</span>
                  <span className="font-medium text-gray-900">{planStats.total} users</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Monthly Revenue</span>
                  <span className="text-gray-900">
                    ${Object.values(planStats.revenueEstimates).reduce((a, b) => a + b, 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Admin Actions */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Admin Actions</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Action
                </label>
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Select action...</option>
                  <option value="cleanup">Cleanup old usage data</option>
                  <option value="reset_user">Reset user usage</option>
                  <option value="upgrade_plan">Upgrade user plan</option>
                </select>
              </div>

              {(selectedAction === 'reset_user' || selectedAction === 'upgrade_plan') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {selectedAction === 'upgrade_plan' ? 'User ID:Plan' : 'User ID'}
                  </label>
                  <input
                    type="text"
                    value={actionTarget}
                    onChange={(e) => setActionTarget(e.target.value)}
                    placeholder={
                      selectedAction === 'upgrade_plan'
                        ? 'user-id:solo or user-id:teams'
                        : 'user-id'
                    }
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              )}

              <button
                onClick={executeAction}
                disabled={!selectedAction || loading}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Executing...' : 'Execute Action'}
              </button>
            </div>
          </div>
        </div>

        {/* Top Users Table */}
        {usageStats && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Top Users by Usage</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Plan
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prompts
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      E2E Runs
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bytes Out
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {usageStats.adminStats.topUsers.map((user) => (
                    <tr key={user.userId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {user.user.name || 'Anonymous'}
                          </div>
                          <div className="text-sm text-gray-500">{user.user.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.user.plan === 'trial' ? 'bg-gray-100 text-gray-800' :
                          user.user.plan === 'solo' ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {user.user.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatNumber(user.prompts)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatNumber(user.e2eRuns)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatBytes(user.bytesOut)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}