'use client';

import { useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Shield,
  Key,
  Flag,
  Brain,
  Users,
  FileText,
  Activity,
  Settings,
  Sun,
  Moon,
  Home,
  AlertTriangle,
  Globe
} from 'lucide-react';
import { useTheme } from 'next-themes';

import DashboardTab from './tabs/dashboard';
import SecretsTab from './tabs/secrets';
import FeatureFlagsTab from './tabs/feature-flags';
import ModelWeightsTab from './tabs/model-weights';
import PlanQuotasTab from './tabs/plan-quotas';
import AuditLogsTab from './tabs/audit-logs';
import UserManagementTab from './tabs/user-management';
import ComplianceTab from './tabs/compliance';
import DomainsTab from './tabs/domains';

export default function AdminPortalPage() {
  const { isLoaded, userId } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [systemHealth, setSystemHealth] = useState<{
    status: 'healthy' | 'warning' | 'critical';
    issues: number;
  }>({ status: 'healthy', issues: 0 });

  useEffect(() => {
    if (isLoaded && !userId) {
      router.push('/sign-in');
    }
  }, [isLoaded, userId, router]);

  useEffect(() => {
    // Fetch system health status
    const fetchSystemHealth = async () => {
      try {
        const response = await fetch('/api/admin/system/health');
        if (response.ok) {
          const health = await response.json();
          setSystemHealth(health);
        }
      } catch (error) {
        console.error('Failed to fetch system health:', error);
        setSystemHealth({ status: 'warning', issues: 1 });
      }
    };

    fetchSystemHealth();
    const interval = setInterval(fetchSystemHealth, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  if (!isLoaded || !userId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const tabs = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: Home,
      description: 'System overview and metrics',
    },
    {
      id: 'secrets',
      label: 'Secrets / APIs',
      icon: Key,
      description: 'API keys and credentials',
    },
    {
      id: 'feature-flags',
      label: 'Feature Flags',
      icon: Flag,
      description: 'System feature toggles',
    },
    {
      id: 'model-weights',
      label: 'Model Weights',
      icon: Brain,
      description: 'AI model configurations',
    },
    {
      id: 'plan-quotas',
      label: 'Plan Quotas',
      icon: Shield,
      description: 'Usage limits and tiers',
    },
    {
      id: 'domains',
      label: 'Domains',
      icon: Globe,
      description: 'Domain management and SSL',
    },
    {
      id: 'audit-logs',
      label: 'Audit Logs',
      icon: FileText,
      description: 'System audit trail',
    },
    {
      id: 'user-management',
      label: 'User Management',
      icon: Users,
      description: 'User accounts and roles',
    },
    {
      id: 'compliance',
      label: 'Compliance',
      icon: Activity,
      description: 'Data governance and retention',
    },
  ];

  const getSystemHealthColor = () => {
    switch (systemHealth.status) {
      case 'healthy': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSystemHealthIcon = () => {
    switch (systemHealth.status) {
      case 'critical': return <AlertTriangle className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Settings className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Magi Admin Portal
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    System administration and configuration
                  </p>
                </div>
              </div>

              <Badge
                variant="outline"
                className={`${getSystemHealthColor()} flex items-center space-x-1`}
              >
                {getSystemHealthIcon()}
                <span className="capitalize">{systemHealth.status}</span>
                {systemHealth.issues > 0 && (
                  <span className="ml-1">({systemHealth.issues})</span>
                )}
              </Badge>
            </div>

            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>

              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    {user?.firstName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0] || 'A'}
                  </span>
                </div>
                <div className="text-sm">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {user?.firstName} {user?.lastName}
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">Admin</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex">
        {/* Sidebar Navigation */}
        <nav className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-screen">
          <div className="p-6">
            <div className="space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{tab.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {tab.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Tab Content */}
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && <DashboardTab />}
            {activeTab === 'secrets' && <SecretsTab />}
            {activeTab === 'feature-flags' && <FeatureFlagsTab />}
            {activeTab === 'model-weights' && <ModelWeightsTab />}
            {activeTab === 'plan-quotas' && <PlanQuotasTab />}
            {activeTab === 'domains' && <DomainsTab />}
            {activeTab === 'audit-logs' && <AuditLogsTab />}
            {activeTab === 'user-management' && <UserManagementTab />}
            {activeTab === 'compliance' && <ComplianceTab />}
          </div>
        </main>
      </div>
    </div>
  );
}