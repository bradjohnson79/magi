'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  FileText,
  Search,
  Filter,
  Download,
  Calendar,
  User,
  Shield,
  AlertTriangle,
  CheckCircle,
  Info,
  Clock,
  Eye,
  Settings,
  Database,
  Key,
  Trash2
} from 'lucide-react';

interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  action: string;
  category: 'security' | 'data' | 'configuration' | 'user' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  resource: string;
  details: {
    method?: string;
    endpoint?: string;
    ip?: string;
    userAgent?: string;
    changes?: Record<string, any>;
    metadata?: Record<string, any>;
  };
  status: 'success' | 'failure' | 'warning';
  source: string;
}

const mockAuditLogs: AuditLog[] = [
  {
    id: 'log-001',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    userId: 'user-123',
    userEmail: 'admin@magi.com',
    action: 'Updated API key',
    category: 'security',
    severity: 'medium',
    resource: 'secrets/anthropic-api-key',
    details: {
      method: 'PATCH',
      endpoint: '/api/admin/secrets/anthropic-api-key',
      ip: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      changes: { masked: true, rotated: true },
      metadata: { previousKeyAge: '30 days' }
    },
    status: 'success',
    source: 'admin-portal'
  },
  {
    id: 'log-002',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    userId: 'user-456',
    userEmail: 'user@company.com',
    action: 'Failed login attempt',
    category: 'security',
    severity: 'high',
    resource: 'auth/login',
    details: {
      method: 'POST',
      endpoint: '/api/auth/signin',
      ip: '203.0.113.45',
      userAgent: 'curl/7.68.0',
      metadata: { reason: 'invalid_credentials', attempts: 3 }
    },
    status: 'failure',
    source: 'authentication'
  },
  {
    id: 'log-003',
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    userId: 'user-123',
    userEmail: 'admin@magi.com',
    action: 'Created new feature flag',
    category: 'configuration',
    severity: 'low',
    resource: 'feature-flags/new-ui-toggle',
    details: {
      method: 'POST',
      endpoint: '/api/admin/feature-flags',
      ip: '192.168.1.100',
      changes: {
        flagName: 'new-ui-toggle',
        enabled: false,
        rolloutPercentage: 0
      }
    },
    status: 'success',
    source: 'admin-portal'
  },
  {
    id: 'log-004',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    userId: 'system',
    userEmail: 'system@magi.com',
    action: 'Database backup completed',
    category: 'system',
    severity: 'low',
    resource: 'database/daily-backup',
    details: {
      metadata: {
        backupSize: '2.3GB',
        duration: '00:12:34',
        location: 's3://magi-backups/2024/01/15'
      }
    },
    status: 'success',
    source: 'cron-job'
  },
  {
    id: 'log-005',
    timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    userId: 'user-789',
    userEmail: 'manager@company.com',
    action: 'Deleted user account',
    category: 'user',
    severity: 'high',
    resource: 'users/user-555',
    details: {
      method: 'DELETE',
      endpoint: '/api/admin/users/user-555',
      ip: '192.168.1.105',
      changes: {
        deletedUser: 'employee@company.com',
        dataRetention: '30 days',
        gdprCompliant: true
      }
    },
    status: 'success',
    source: 'admin-portal'
  }
];

export default function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('24h');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch('/api/admin/audit-logs');
        if (response.ok) {
          const data = await response.json();
          setLogs(data);
        } else {
          // Use mock data for development
          setLogs(mockAuditLogs);
        }
      } catch (error) {
        console.error('Failed to fetch audit logs:', error);
        setLogs(mockAuditLogs);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, []);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'security': return <Shield className="h-4 w-4" />;
      case 'data': return <Database className="h-4 w-4" />;
      case 'configuration': return <Settings className="h-4 w-4" />;
      case 'user': return <User className="h-4 w-4" />;
      case 'system': return <Info className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'security': return 'text-red-600 bg-red-100 dark:bg-red-900/20';
      case 'data': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      case 'configuration': return 'text-purple-600 bg-purple-100 dark:bg-purple-900/20';
      case 'user': return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'system': return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-700 bg-red-100 border-red-200 dark:bg-red-900/20';
      case 'high': return 'text-orange-700 bg-orange-100 border-orange-200 dark:bg-orange-900/20';
      case 'medium': return 'text-yellow-700 bg-yellow-100 border-yellow-200 dark:bg-yellow-900/20';
      case 'low': return 'text-green-700 bg-green-100 border-green-200 dark:bg-green-900/20';
      default: return 'text-gray-700 bg-gray-100 border-gray-200 dark:bg-gray-900/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failure': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default: return <Info className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60 * 1000) return 'Just now';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;

    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const filteredLogs = logs.filter(log => {
    if (categoryFilter !== 'all' && log.category !== categoryFilter) return false;
    if (severityFilter !== 'all' && log.severity !== severityFilter) return false;
    if (statusFilter !== 'all' && log.status !== statusFilter) return false;

    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      return (
        log.action.toLowerCase().includes(searchLower) ||
        log.userEmail.toLowerCase().includes(searchLower) ||
        log.resource.toLowerCase().includes(searchLower) ||
        log.source.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });

  const exportLogs = async () => {
    try {
      const response = await fetch('/api/admin/audit-logs/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: { category: categoryFilter, severity: severityFilter, status: statusFilter },
          searchQuery,
          timeRange: timeFilter
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to export logs:', error);
    }
  };

  const viewLogDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setShowDetailsDialog(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Logs</h2>
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="flex items-center space-x-4">
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Logs</h2>
          <p className="text-gray-600 dark:text-gray-400">System activity and security audit trail</p>
        </div>
        <Button onClick={exportLogs}>
          <Download className="h-4 w-4 mr-2" />
          Export Logs
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filters</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="data">Data</SelectItem>
                  <SelectItem value="configuration">Configuration</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="severity">Severity</Label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failure">Failure</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Time Range</Label>
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last Hour</SelectItem>
                  <SelectItem value="24h">Last 24 Hours</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="90d">Last 90 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs List */}
      <div className="space-y-3">
        {filteredLogs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">No audit logs found matching your criteria</p>
            </CardContent>
          </Card>
        ) : (
          filteredLogs.map((log) => (
            <Card key={log.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => viewLogDetails(log)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(log.status)}
                      <Badge className={`${getCategoryColor(log.category)} flex items-center space-x-1`}>
                        {getCategoryIcon(log.category)}
                        <span className="capitalize">{log.category}</span>
                      </Badge>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {log.action}
                        </p>
                        <Badge variant="outline" className={getSeverityColor(log.severity)}>
                          {log.severity}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600 dark:text-gray-400">
                        <span className="flex items-center space-x-1">
                          <User className="h-3 w-3" />
                          <span>{log.userEmail}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatTimestamp(log.timestamp)}</span>
                        </span>
                        <span className="truncate">{log.resource}</span>
                      </div>
                    </div>

                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); viewLogDetails(log); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Log Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5" />
              <span>Audit Log Details</span>
            </DialogTitle>
            <DialogDescription>
              Detailed information about this audit log entry
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Action</Label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedLog.action}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div className="flex items-center space-x-1 mt-1">
                    {getStatusIcon(selectedLog.status)}
                    <span className="text-sm capitalize">{selectedLog.status}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">User</Label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedLog.userEmail}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Timestamp</Label>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {new Date(selectedLog.timestamp).toLocaleString()}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Category</Label>
                  <Badge className={`${getCategoryColor(selectedLog.category)} mt-1`}>
                    {getCategoryIcon(selectedLog.category)}
                    <span className="ml-1 capitalize">{selectedLog.category}</span>
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium">Severity</Label>
                  <Badge variant="outline" className={`${getSeverityColor(selectedLog.severity)} mt-1`}>
                    {selectedLog.severity}
                  </Badge>
                </div>
              </div>

              {/* Technical Details */}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="technical">
                  <AccordionTrigger className="text-sm font-medium">
                    Technical Details
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium">Resource</Label>
                        <p className="text-sm text-gray-900 dark:text-white font-mono bg-gray-50 dark:bg-gray-800 p-2 rounded">
                          {selectedLog.resource}
                        </p>
                      </div>

                      {selectedLog.details.method && (
                        <div>
                          <Label className="text-sm font-medium">HTTP Method</Label>
                          <p className="text-sm text-gray-900 dark:text-white">{selectedLog.details.method}</p>
                        </div>
                      )}

                      {selectedLog.details.endpoint && (
                        <div>
                          <Label className="text-sm font-medium">Endpoint</Label>
                          <p className="text-sm text-gray-900 dark:text-white font-mono bg-gray-50 dark:bg-gray-800 p-2 rounded">
                            {selectedLog.details.endpoint}
                          </p>
                        </div>
                      )}

                      {selectedLog.details.ip && (
                        <div>
                          <Label className="text-sm font-medium">IP Address</Label>
                          <p className="text-sm text-gray-900 dark:text-white">{selectedLog.details.ip}</p>
                        </div>
                      )}

                      {selectedLog.details.userAgent && (
                        <div>
                          <Label className="text-sm font-medium">User Agent</Label>
                          <p className="text-sm text-gray-900 dark:text-white break-all bg-gray-50 dark:bg-gray-800 p-2 rounded">
                            {selectedLog.details.userAgent}
                          </p>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {selectedLog.details.changes && (
                  <AccordionItem value="changes">
                    <AccordionTrigger className="text-sm font-medium">
                      Changes Made
                    </AccordionTrigger>
                    <AccordionContent>
                      <pre className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-x-auto">
                        {JSON.stringify(selectedLog.details.changes, null, 2)}
                      </pre>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {selectedLog.details.metadata && (
                  <AccordionItem value="metadata">
                    <AccordionTrigger className="text-sm font-medium">
                      Additional Metadata
                    </AccordionTrigger>
                    <AccordionContent>
                      <pre className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-x-auto">
                        {JSON.stringify(selectedLog.details.metadata, null, 2)}
                      </pre>
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}