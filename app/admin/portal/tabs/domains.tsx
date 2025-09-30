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
  Globe,
  Plus,
  Settings,
  Shield,
  CheckCircle,
  AlertTriangle,
  Clock,
  Copy,
  ExternalLink,
  Trash2,
  RefreshCw,
  Info,
  Eye,
  EyeOff,
  Server,
  Lock,
  Zap
} from 'lucide-react';

interface Domain {
  id: string;
  projectId: string;
  domain: string;
  domainType: 'subdomain' | 'custom';
  verified: boolean;
  sslStatus: 'pending' | 'issued' | 'expired' | 'failed';
  verificationToken?: string;
  verificationRecord?: string;
  sslCertificateId?: string;
  provider: 'vercel' | 'netlify' | 'cloudflare' | 'letsencrypt';
  redirectTo?: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
  sslIssuedAt?: string;
  url: string;
  status: string;
  verificationInstructions?: {
    recordType: string;
    name: string;
    value: string;
    instructions: string;
  };
}

interface NewDomainForm {
  domain: string;
  projectId: string;
  domainType: 'subdomain' | 'custom';
  provider: 'vercel' | 'netlify' | 'cloudflare' | 'letsencrypt';
  redirectTo: string;
}

const mockProjects = [
  { id: 'project-1', name: 'My App', slug: 'my-app' },
  { id: 'project-2', name: 'E-commerce Site', slug: 'ecommerce' },
  { id: 'project-3', name: 'Portfolio', slug: 'portfolio' },
];

const mockDomains: Domain[] = [
  {
    id: 'domain-1',
    projectId: 'project-1',
    domain: 'my-app.magi.dev',
    domainType: 'subdomain',
    verified: true,
    sslStatus: 'issued',
    provider: 'vercel',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
    sslIssuedAt: new Date().toISOString(),
    url: 'https://my-app.magi.dev',
    status: 'Active'
  },
  {
    id: 'domain-2',
    projectId: 'project-1',
    domain: 'myawesomeapp.com',
    domainType: 'custom',
    verified: true,
    sslStatus: 'issued',
    provider: 'vercel',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    verifiedAt: new Date(Date.now() - 3600000).toISOString(),
    sslIssuedAt: new Date(Date.now() - 1800000).toISOString(),
    url: 'https://myawesomeapp.com',
    status: 'Active'
  },
  {
    id: 'domain-3',
    projectId: 'project-2',
    domain: 'shop.example.com',
    domainType: 'custom',
    verified: false,
    sslStatus: 'pending',
    provider: 'cloudflare',
    verificationRecord: 'abc123.domains.magi.dev',
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    updatedAt: new Date().toISOString(),
    url: 'https://shop.example.com',
    status: 'Pending Verification',
    verificationInstructions: {
      recordType: 'CNAME',
      name: '_magi-verify.shop.example.com',
      value: 'abc123.domains.magi.dev',
      instructions: 'Add a CNAME record with name "_magi-verify" pointing to "abc123.domains.magi.dev" to verify ownership of shop.example.com.'
    }
  }
];

export default function DomainsTab() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [projects, setProjects] = useState(mockProjects);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [newDomain, setNewDomain] = useState<NewDomainForm>({
    domain: '',
    projectId: '',
    domainType: 'custom',
    provider: 'vercel',
    redirectTo: ''
  });

  useEffect(() => {
    const fetchDomains = async () => {
      try {
        // In production, this would fetch from API
        await new Promise(resolve => setTimeout(resolve, 1000));
        setDomains(mockDomains);
      } catch (error) {
        console.error('Failed to fetch domains:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDomains();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'Pending Verification': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20';
      case 'SSL Failed': return 'text-red-600 bg-red-100 dark:bg-red-900/20';
      case 'Issuing SSL': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Active': return <CheckCircle className="h-4 w-4" />;
      case 'Pending Verification': return <Clock className="h-4 w-4" />;
      case 'SSL Failed': return <AlertTriangle className="h-4 w-4" />;
      case 'Issuing SSL': return <RefreshCw className="h-4 w-4 animate-spin" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'vercel': return <Zap className="h-4 w-4" />;
      case 'netlify': return <Globe className="h-4 w-4" />;
      case 'cloudflare': return <Shield className="h-4 w-4" />;
      case 'letsencrypt': return <Lock className="h-4 w-4" />;
      default: return <Server className="h-4 w-4" />;
    }
  };

  const handleAddDomain = async () => {
    try {
      // Validate form
      if (!newDomain.domain || !newDomain.projectId) {
        return;
      }

      // In production, this would call the API
      const response = await fetch('/api/v1/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDomain)
      });

      if (response.ok) {
        const createdDomain = await response.json();
        setDomains(prev => [...prev, createdDomain]);
        setShowAddDialog(false);
        setNewDomain({
          domain: '',
          projectId: '',
          domainType: 'custom',
          provider: 'vercel',
          redirectTo: ''
        });
      }
    } catch (error) {
      console.error('Failed to add domain:', error);
    }
  };

  const handleVerifyDomain = async (domainId: string) => {
    try {
      const response = await fetch('/api/v1/domains/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.verified) {
          setDomains(prev => prev.map(d =>
            d.id === domainId
              ? { ...d, verified: true, status: 'Active', verifiedAt: new Date().toISOString() }
              : d
          ));
        }
      }
    } catch (error) {
      console.error('Failed to verify domain:', error);
    }
  };

  const handleDeleteDomain = async (domainId: string) => {
    try {
      const response = await fetch(`/api/v1/domains/${domainId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setDomains(prev => prev.filter(d => d.id !== domainId));
      }
    } catch (error) {
      console.error('Failed to delete domain:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const filteredDomains = selectedProject === 'all'
    ? domains
    : domains.filter(d => d.projectId === selectedProject);

  const stats = {
    total: domains.length,
    active: domains.filter(d => d.status === 'Active').length,
    custom: domains.filter(d => d.domainType === 'custom').length,
    subdomains: domains.filter(d => d.domainType === 'subdomain').length,
    sslIssued: domains.filter(d => d.sslStatus === 'issued').length
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Domains</h2>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Domains</h2>
          <p className="text-gray-600 dark:text-gray-400">Manage project domains and SSL certificates</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Domain
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Domain</DialogTitle>
              <DialogDescription>
                Add a custom domain or create a subdomain for your project.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project">Project</Label>
                <Select value={newDomain.projectId} onValueChange={(value) => setNewDomain(prev => ({ ...prev, projectId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="domainType">Domain Type</Label>
                <Select value={newDomain.domainType} onValueChange={(value: any) => setNewDomain(prev => ({ ...prev, domainType: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom Domain</SelectItem>
                    <SelectItem value="subdomain">Magi Subdomain</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  value={newDomain.domain}
                  onChange={(e) => setNewDomain(prev => ({ ...prev, domain: e.target.value }))}
                  placeholder={newDomain.domainType === 'custom' ? 'example.com' : 'my-project.magi.dev'}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider">SSL Provider</Label>
                <Select value={newDomain.provider} onValueChange={(value: any) => setNewDomain(prev => ({ ...prev, provider: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vercel">Vercel</SelectItem>
                    <SelectItem value="netlify">Netlify</SelectItem>
                    <SelectItem value="cloudflare">Cloudflare</SelectItem>
                    <SelectItem value="letsencrypt">Let's Encrypt</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="redirectTo">Redirect To (Optional)</Label>
                <Input
                  id="redirectTo"
                  value={newDomain.redirectTo}
                  onChange={(e) => setNewDomain(prev => ({ ...prev, redirectTo: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddDomain} disabled={!newDomain.domain || !newDomain.projectId}>
                Add Domain
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="ssl">SSL Certificates</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Globe className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Domains</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active</p>
                    <p className="text-2xl font-bold">{stats.active}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <ExternalLink className="h-5 w-5 text-purple-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Custom</p>
                    <p className="text-2xl font-bold">{stats.custom}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Server className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Subdomains</p>
                    <p className="text-2xl font-bold">{stats.subdomains}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Lock className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">SSL Issued</p>
                    <p className="text-2xl font-bold">{stats.sslIssued}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Domains */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Domains</CardTitle>
              <CardDescription>Latest domain additions and updates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {domains.slice(0, 3).map((domain) => (
                  <div key={domain.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Badge variant="outline" className="flex items-center space-x-1">
                        {getProviderIcon(domain.provider)}
                        <span className="capitalize">{domain.provider}</span>
                      </Badge>
                      <div>
                        <p className="font-medium">{domain.domain}</p>
                        <p className="text-sm text-muted-foreground">
                          {domain.domainType === 'subdomain' ? 'Subdomain' : 'Custom domain'}
                        </p>
                      </div>
                    </div>
                    <Badge className={getStatusColor(domain.status)}>
                      {getStatusIcon(domain.status)}
                      <span className="ml-1">{domain.status}</span>
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="domains" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-4">
                <Label htmlFor="projectFilter">Filter by Project</Label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Domains List */}
          <div className="space-y-4">
            {filteredDomains.map((domain) => (
              <Card key={domain.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <Badge variant="outline" className="flex items-center space-x-1">
                        {getProviderIcon(domain.provider)}
                        <span className="capitalize">{domain.provider}</span>
                      </Badge>
                      <div>
                        <h3 className="font-medium text-lg">{domain.domain}</h3>
                        <p className="text-sm text-muted-foreground">
                          {domain.domainType === 'subdomain' ? 'Magi Subdomain' : 'Custom Domain'} •
                          Added {new Date(domain.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getStatusColor(domain.status)}>
                        {getStatusIcon(domain.status)}
                        <span className="ml-1">{domain.status}</span>
                      </Badge>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={domain.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <Label className="text-sm font-medium">Domain Status</Label>
                      <p className="text-sm">{domain.verified ? 'Verified' : 'Pending Verification'}</p>
                      {domain.verifiedAt && (
                        <p className="text-xs text-muted-foreground">
                          Verified {new Date(domain.verifiedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-sm font-medium">SSL Status</Label>
                      <p className="text-sm capitalize">{domain.sslStatus}</p>
                      {domain.sslIssuedAt && (
                        <p className="text-xs text-muted-foreground">
                          Issued {new Date(domain.sslIssuedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-sm font-medium">URL</Label>
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-mono text-blue-600">{domain.url}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(domain.url)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Verification Instructions */}
                  {domain.verificationInstructions && !domain.verified && (
                    <Alert className="mb-4">
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-2">
                          <p className="font-medium">DNS Verification Required</p>
                          <p className="text-sm">{domain.verificationInstructions.instructions}</p>
                          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded font-mono text-sm">
                            <div className="flex items-center justify-between">
                              <span>Record Type: {domain.verificationInstructions.recordType}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(domain.verificationInstructions!.recordType)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Name: {domain.verificationInstructions.name}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(domain.verificationInstructions!.name)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Value: {domain.verificationInstructions.value}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(domain.verificationInstructions!.value)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    {!domain.verified && domain.domainType === 'custom' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleVerifyDomain(domain.id)}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Verify Domain
                      </Button>
                    )}

                    {domain.domainType === 'custom' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteDomain(domain.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ssl" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>SSL Certificates</CardTitle>
              <CardDescription>Manage SSL certificates for your domains</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {domains.map((domain) => (
                  <div key={domain.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Lock className={`h-5 w-5 ${domain.sslStatus === 'issued' ? 'text-green-600' : 'text-gray-400'}`} />
                      <div>
                        <p className="font-medium">{domain.domain}</p>
                        <p className="text-sm text-muted-foreground">
                          {domain.sslCertificateId || 'No certificate'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Badge className={getStatusColor(domain.sslStatus)}>
                        {domain.sslStatus}
                      </Badge>
                      {domain.sslIssuedAt && (
                        <span className="text-sm text-muted-foreground">
                          Expires: {new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Domain Settings</CardTitle>
              <CardDescription>Configure global domain management settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-medium mb-2">Wildcard SSL Certificate</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Automatically covers all *.magi.dev subdomains with a single certificate.
                </p>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">Active</span>
                  <Badge variant="outline">*.magi.dev</Badge>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Auto-Verification</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Automatically verify domains when DNS records are detected.
                </p>
                <label className="flex items-center space-x-2">
                  <input type="checkbox" className="rounded" defaultChecked />
                  <span className="text-sm">Enable automatic verification</span>
                </label>
              </div>

              <div>
                <h4 className="font-medium mb-2">SSL Auto-Renewal</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Automatically renew SSL certificates before expiration.
                </p>
                <label className="flex items-center space-x-2">
                  <input type="checkbox" className="rounded" defaultChecked />
                  <span className="text-sm">Enable auto-renewal</span>
                </label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}