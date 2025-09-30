'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Shield,
  FileText,
  Download,
  Trash2,
  Clock,
  CheckCircle,
  AlertTriangle,
  Settings,
  Database,
  Eye,
  Lock,
  Globe,
  Users,
  Calendar,
  Search,
  Filter,
  Archive,
  Info
} from 'lucide-react';

interface DataRetentionPolicy {
  id: string;
  name: string;
  category: 'user_data' | 'audit_logs' | 'analytics' | 'backups' | 'temporary';
  description: string;
  retentionPeriod: number;
  retentionUnit: 'days' | 'months' | 'years';
  autoDelete: boolean;
  lastReview: string;
  status: 'active' | 'pending' | 'expired';
  dataTypes: string[];
  legalBasis: string;
}

interface ComplianceMetric {
  id: string;
  name: string;
  category: 'gdpr' | 'ccpa' | 'hipaa' | 'sox' | 'iso27001';
  status: 'compliant' | 'partial' | 'non_compliant' | 'pending';
  lastAudit: string;
  nextReview: string;
  requirements: {
    id: string;
    description: string;
    implemented: boolean;
    evidence?: string;
  }[];
}

interface DataExportRequest {
  id: string;
  userId: string;
  userEmail: string;
  requestType: 'export' | 'delete' | 'rectification';
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  requestDate: string;
  completionDate?: string;
  dataTypes: string[];
  reason?: string;
  legalBasis: string;
}

const mockRetentionPolicies: DataRetentionPolicy[] = [
  {
    id: 'policy-1',
    name: 'User Account Data',
    category: 'user_data',
    description: 'Personal information and account details',
    retentionPeriod: 2,
    retentionUnit: 'years',
    autoDelete: true,
    lastReview: '2024-01-15T00:00:00Z',
    status: 'active',
    dataTypes: ['Profile Information', 'Contact Details', 'Preferences'],
    legalBasis: 'Legitimate Interest'
  },
  {
    id: 'policy-2',
    name: 'Audit Logs',
    category: 'audit_logs',
    description: 'System access and security logs',
    retentionPeriod: 7,
    retentionUnit: 'years',
    autoDelete: false,
    lastReview: '2024-01-01T00:00:00Z',
    status: 'active',
    dataTypes: ['Login Records', 'API Access', 'Admin Actions'],
    legalBasis: 'Legal Obligation'
  },
  {
    id: 'policy-3',
    name: 'Analytics Data',
    category: 'analytics',
    description: 'Usage patterns and performance metrics',
    retentionPeriod: 36,
    retentionUnit: 'months',
    autoDelete: true,
    lastReview: '2023-12-01T00:00:00Z',
    status: 'pending',
    dataTypes: ['Usage Statistics', 'Performance Metrics', 'Error Logs'],
    legalBasis: 'Legitimate Interest'
  }
];

const mockComplianceMetrics: ComplianceMetric[] = [
  {
    id: 'gdpr-1',
    name: 'GDPR Compliance',
    category: 'gdpr',
    status: 'compliant',
    lastAudit: '2024-01-01T00:00:00Z',
    nextReview: '2024-07-01T00:00:00Z',
    requirements: [
      { id: 'gdpr-consent', description: 'Explicit consent mechanisms', implemented: true, evidence: 'Cookie consent system' },
      { id: 'gdpr-portability', description: 'Data portability tools', implemented: true, evidence: 'Export functionality' },
      { id: 'gdpr-deletion', description: 'Right to be forgotten', implemented: true, evidence: 'Account deletion process' },
      { id: 'gdpr-breach', description: 'Breach notification procedures', implemented: false }
    ]
  },
  {
    id: 'ccpa-1',
    name: 'CCPA Compliance',
    category: 'ccpa',
    status: 'partial',
    lastAudit: '2023-12-15T00:00:00Z',
    nextReview: '2024-06-15T00:00:00Z',
    requirements: [
      { id: 'ccpa-disclosure', description: 'Privacy policy disclosure', implemented: true },
      { id: 'ccpa-optout', description: 'Opt-out mechanisms', implemented: false },
      { id: 'ccpa-categories', description: 'Data category tracking', implemented: true }
    ]
  }
];

const mockExportRequests: DataExportRequest[] = [
  {
    id: 'req-1',
    userId: 'user-123',
    userEmail: 'john.doe@example.com',
    requestType: 'export',
    status: 'completed',
    requestDate: '2024-01-10T00:00:00Z',
    completionDate: '2024-01-12T00:00:00Z',
    dataTypes: ['Profile Data', 'Usage History', 'Preferences'],
    legalBasis: 'GDPR Article 20'
  },
  {
    id: 'req-2',
    userId: 'user-456',
    userEmail: 'jane.smith@example.com',
    requestType: 'delete',
    status: 'processing',
    requestDate: '2024-01-15T00:00:00Z',
    dataTypes: ['All Personal Data'],
    reason: 'Account closure',
    legalBasis: 'GDPR Article 17'
  },
  {
    id: 'req-3',
    userId: 'user-789',
    userEmail: 'user@company.com',
    requestType: 'rectification',
    status: 'pending',
    requestDate: '2024-01-20T00:00:00Z',
    dataTypes: ['Contact Information'],
    reason: 'Incorrect email address',
    legalBasis: 'GDPR Article 16'
  }
];

export default function ComplianceTab() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [retentionPolicies, setRetentionPolicies] = useState<DataRetentionPolicy[]>([]);
  const [complianceMetrics, setComplianceMetrics] = useState<ComplianceMetric[]>([]);
  const [exportRequests, setExportRequests] = useState<DataExportRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    const fetchComplianceData = async () => {
      try {
        // In production, these would be separate API calls
        setRetentionPolicies(mockRetentionPolicies);
        setComplianceMetrics(mockComplianceMetrics);
        setExportRequests(mockExportRequests);
      } catch (error) {
        console.error('Failed to fetch compliance data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchComplianceData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'compliant':
      case 'completed':
      case 'active':
        return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'partial':
      case 'processing':
      case 'pending':
        return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20';
      case 'non_compliant':
      case 'rejected':
      case 'expired':
        return 'text-red-600 bg-red-100 dark:bg-red-900/20';
      default:
        return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'compliant':
      case 'completed':
      case 'active':
        return <CheckCircle className="h-4 w-4" />;
      case 'partial':
      case 'processing':
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'non_compliant':
      case 'rejected':
      case 'expired':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'user_data': return <Users className="h-4 w-4" />;
      case 'audit_logs': return <FileText className="h-4 w-4" />;
      case 'analytics': return <Globe className="h-4 w-4" />;
      case 'backups': return <Archive className="h-4 w-4" />;
      case 'temporary': return <Clock className="h-4 w-4" />;
      default: return <Database className="h-4 w-4" />;
    }
  };

  const formatRetentionPeriod = (period: number, unit: string) => {
    return `${period} ${unit}${period !== 1 ? '' : unit.slice(0, -1)}`;
  };

  const calculateComplianceScore = () => {
    const totalRequirements = complianceMetrics.reduce((sum, metric) => sum + metric.requirements.length, 0);
    const implementedRequirements = complianceMetrics.reduce(
      (sum, metric) => sum + metric.requirements.filter(req => req.implemented).length,
      0
    );
    return totalRequirements > 0 ? Math.round((implementedRequirements / totalRequirements) * 100) : 0;
  };

  const handleExportRequest = async (requestId: string, action: 'approve' | 'reject') => {
    try {
      const response = await fetch(`/api/admin/compliance/export-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      if (response.ok) {
        setExportRequests(prev => prev.map(req =>
          req.id === requestId
            ? { ...req, status: action === 'approve' ? 'processing' : 'rejected' }
            : req
        ));
      }
    } catch (error) {
      console.error('Failed to update export request:', error);
    }
  };

  const filteredRequests = exportRequests.filter(request => {
    if (statusFilter !== 'all' && request.status !== statusFilter) return false;
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      return (
        request.userEmail.toLowerCase().includes(searchLower) ||
        request.requestType.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Compliance</h2>
        </div>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4"></div>
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const complianceScore = calculateComplianceScore();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Compliance</h2>
          <p className="text-gray-600 dark:text-gray-400">Data governance, retention, and regulatory compliance</p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge className={getStatusColor(complianceScore >= 80 ? 'compliant' : 'partial')}>
            {getStatusIcon(complianceScore >= 80 ? 'compliant' : 'partial')}
            <span className="ml-1">{complianceScore}% Compliant</span>
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="retention">Data Retention</TabsTrigger>
          <TabsTrigger value="requests">Data Requests</TabsTrigger>
          <TabsTrigger value="frameworks">Frameworks</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Compliance Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2 mb-2">
                  <Shield className="h-5 w-5 text-green-600" />
                  <h3 className="font-medium">Overall Compliance</h3>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-green-600">{complianceScore}%</div>
                  <Progress value={complianceScore} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {complianceMetrics.filter(m => m.status === 'compliant').length} of {complianceMetrics.length} frameworks compliant
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2 mb-2">
                  <Database className="h-5 w-5 text-blue-600" />
                  <h3 className="font-medium">Data Retention</h3>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-blue-600">{retentionPolicies.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Active policies • {retentionPolicies.filter(p => p.autoDelete).length} automated
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2 mb-2">
                  <FileText className="h-5 w-5 text-purple-600" />
                  <h3 className="font-medium">Pending Requests</h3>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-purple-600">
                    {exportRequests.filter(r => r.status === 'pending').length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Data export/deletion requests
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Compliance Activity</CardTitle>
              <CardDescription>Latest updates and actions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                      GDPR compliance audit completed
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      All requirements satisfied • 2 hours ago
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <Info className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Data export request completed for john.doe@example.com
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Export package delivered • 1 day ago
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <Clock className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      Analytics data retention policy review due
                    </p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      Policy expires in 30 days
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retention" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Data Retention Policies</h3>
            <Button>
              <Settings className="h-4 w-4 mr-2" />
              Add Policy
            </Button>
          </div>

          <div className="space-y-4">
            {retentionPolicies.map((policy) => (
              <Card key={policy.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <Badge variant="outline" className="flex items-center space-x-1">
                        {getCategoryIcon(policy.category)}
                        <span className="capitalize">{policy.category.replace('_', ' ')}</span>
                      </Badge>
                      <div>
                        <h4 className="font-medium">{policy.name}</h4>
                        <p className="text-sm text-muted-foreground">{policy.description}</p>
                      </div>
                    </div>
                    <Badge className={getStatusColor(policy.status)}>
                      {getStatusIcon(policy.status)}
                      <span className="ml-1 capitalize">{policy.status}</span>
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Retention Period</Label>
                      <p className="text-sm">{formatRetentionPeriod(policy.retentionPeriod, policy.retentionUnit)}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Auto-Delete</Label>
                      <p className="text-sm">{policy.autoDelete ? 'Enabled' : 'Manual'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Last Review</Label>
                      <p className="text-sm">{new Date(policy.lastReview).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Label className="text-sm font-medium">Data Types</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {policy.dataTypes.map((type, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {type}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <Label className="text-sm font-medium">Legal Basis</Label>
                    <p className="text-sm text-muted-foreground">{policy.legalBasis}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="requests" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search requests..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Data Requests */}
          <div className="space-y-4">
            {filteredRequests.map((request) => (
              <Card key={request.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <Badge variant="outline" className="capitalize">
                        {request.requestType}
                      </Badge>
                      <div>
                        <h4 className="font-medium">{request.userEmail}</h4>
                        <p className="text-sm text-muted-foreground">
                          Requested {new Date(request.requestDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getStatusColor(request.status)}>
                        {getStatusIcon(request.status)}
                        <span className="ml-1 capitalize">{request.status}</span>
                      </Badge>
                      {request.status === 'pending' && (
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleExportRequest(request.id, 'approve')}
                            className="text-green-600 border-green-200"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleExportRequest(request.id, 'reject')}
                            className="text-red-600 border-red-200"
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Data Types</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {request.dataTypes.map((type, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Legal Basis</Label>
                      <p className="text-sm text-muted-foreground">{request.legalBasis}</p>
                    </div>
                  </div>

                  {request.reason && (
                    <div className="mt-4">
                      <Label className="text-sm font-medium">Reason</Label>
                      <p className="text-sm text-muted-foreground">{request.reason}</p>
                    </div>
                  )}

                  {request.completionDate && (
                    <div className="mt-4">
                      <Label className="text-sm font-medium">Completed</Label>
                      <p className="text-sm text-muted-foreground">
                        {new Date(request.completionDate).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="frameworks" className="space-y-6">
          <div className="space-y-6">
            {complianceMetrics.map((metric) => (
              <Card key={metric.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center space-x-2">
                        <Shield className="h-5 w-5" />
                        <span>{metric.name}</span>
                      </CardTitle>
                      <CardDescription className="uppercase font-mono text-xs">
                        {metric.category}
                      </CardDescription>
                    </div>
                    <Badge className={getStatusColor(metric.status)}>
                      {getStatusIcon(metric.status)}
                      <span className="ml-1 capitalize">{metric.status.replace('_', ' ')}</span>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <Label className="text-sm font-medium">Last Audit</Label>
                      <p className="text-sm text-muted-foreground">
                        {new Date(metric.lastAudit).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Next Review</Label>
                      <p className="text-sm text-muted-foreground">
                        {new Date(metric.nextReview).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">Requirements</h4>
                    {metric.requirements.map((requirement) => (
                      <div key={requirement.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${requirement.implemented ? 'bg-green-500' : 'bg-red-500'}`} />
                          <div>
                            <p className="text-sm font-medium">{requirement.description}</p>
                            {requirement.evidence && (
                              <p className="text-xs text-muted-foreground">{requirement.evidence}</p>
                            )}
                          </div>
                        </div>
                        <Badge variant={requirement.implemented ? "default" : "destructive"}>
                          {requirement.implemented ? 'Implemented' : 'Missing'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}