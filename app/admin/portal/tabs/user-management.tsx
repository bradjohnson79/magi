'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Edit,
  Trash2,
  Ban,
  CheckCircle,
  AlertTriangle,
  Crown,
  Shield,
  User,
  Calendar,
  Mail,
  Phone,
  MapPin,
  Clock,
  Activity,
  Settings,
  Key,
  Eye,
  EyeOff
} from 'lucide-react';

interface UserAccount {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: 'admin' | 'moderator' | 'user' | 'viewer';
  status: 'active' | 'suspended' | 'pending' | 'banned';
  plan: 'free' | 'pro' | 'enterprise' | 'custom';
  createdAt: string;
  lastLogin: string;
  loginCount: number;
  usage: {
    aiRequests: number;
    storageUsed: number;
    apiCalls: number;
  };
  metadata: {
    ipAddress?: string;
    location?: string;
    device?: string;
    twoFactorEnabled?: boolean;
  };
}

interface RolePermission {
  id: string;
  name: string;
  description: string;
  category: 'system' | 'content' | 'users' | 'billing' | 'security';
}

const mockUsers: UserAccount[] = [
  {
    id: 'user-1',
    email: 'admin@magi.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    status: 'active',
    plan: 'enterprise',
    createdAt: '2024-01-01T00:00:00Z',
    lastLogin: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    loginCount: 245,
    usage: { aiRequests: 15680, storageUsed: 2300, apiCalls: 45230 },
    metadata: { ipAddress: '192.168.1.100', location: 'San Francisco, CA', device: 'Chrome/Mac', twoFactorEnabled: true }
  },
  {
    id: 'user-2',
    email: 'john.doe@company.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'user',
    status: 'active',
    plan: 'pro',
    createdAt: '2024-01-15T00:00:00Z',
    lastLogin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    loginCount: 89,
    usage: { aiRequests: 3420, storageUsed: 890, apiCalls: 12340 },
    metadata: { ipAddress: '203.0.113.45', location: 'New York, NY', device: 'Safari/iPhone', twoFactorEnabled: false }
  },
  {
    id: 'user-3',
    email: 'jane.smith@startup.io',
    firstName: 'Jane',
    lastName: 'Smith',
    role: 'moderator',
    status: 'active',
    plan: 'pro',
    createdAt: '2024-02-01T00:00:00Z',
    lastLogin: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    loginCount: 156,
    usage: { aiRequests: 8920, storageUsed: 1450, apiCalls: 28900 },
    metadata: { ipAddress: '198.51.100.23', location: 'Austin, TX', device: 'Chrome/Windows', twoFactorEnabled: true }
  },
  {
    id: 'user-4',
    email: 'suspended@example.com',
    firstName: 'Suspended',
    lastName: 'User',
    role: 'user',
    status: 'suspended',
    plan: 'free',
    createdAt: '2024-01-20T00:00:00Z',
    lastLogin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    loginCount: 23,
    usage: { aiRequests: 1250, storageUsed: 340, apiCalls: 4560 },
    metadata: { ipAddress: '192.0.2.45', location: 'Unknown', device: 'Firefox/Linux', twoFactorEnabled: false }
  }
];

const rolePermissions: RolePermission[] = [
  { id: 'admin_full', name: 'Full Admin Access', description: 'Complete system administration', category: 'system' },
  { id: 'user_management', name: 'User Management', description: 'Create, edit, and manage user accounts', category: 'users' },
  { id: 'content_moderation', name: 'Content Moderation', description: 'Review and moderate user content', category: 'content' },
  { id: 'billing_access', name: 'Billing Access', description: 'View and manage billing information', category: 'billing' },
  { id: 'security_settings', name: 'Security Settings', description: 'Manage security policies and settings', category: 'security' },
  { id: 'api_keys', name: 'API Key Management', description: 'Create and manage API keys', category: 'system' },
  { id: 'analytics_view', name: 'Analytics Access', description: 'View system analytics and reports', category: 'system' }
];

export default function UserManagementTab() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('users');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch('/api/admin/users');
        if (response.ok) {
          const data = await response.json();
          setUsers(data);
        } else {
          // Use mock data for development
          setUsers(mockUsers);
        }
      } catch (error) {
        console.error('Failed to fetch users:', error);
        setUsers(mockUsers);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Crown className="h-4 w-4" />;
      case 'moderator': return <Shield className="h-4 w-4" />;
      case 'user': return <User className="h-4 w-4" />;
      case 'viewer': return <Eye className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'text-purple-600 bg-purple-100 dark:bg-purple-900/20';
      case 'moderator': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      case 'user': return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'viewer': return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'suspended': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20';
      case 'pending': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      case 'banned': return 'text-red-600 bg-red-100 dark:bg-red-900/20';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4" />;
      case 'suspended': return <Ban className="h-4 w-4" />;
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'banned': return <AlertTriangle className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      return hours === 0 ? 'Just now' : `${hours}h ago`;
    }

    return date.toLocaleDateString();
  };

  const filteredUsers = users.filter(user => {
    if (roleFilter !== 'all' && user.role !== roleFilter) return false;
    if (statusFilter !== 'all' && user.status !== statusFilter) return false;
    if (planFilter !== 'all' && user.plan !== planFilter) return false;

    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      return (
        user.email.toLowerCase().includes(searchLower) ||
        user.firstName.toLowerCase().includes(searchLower) ||
        user.lastName.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });

  const handleUserAction = async (userId: string, action: string, data?: any) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {})
      });

      if (response.ok) {
        // Refresh users list
        const updatedUsers = users.map(user => {
          if (user.id === userId) {
            switch (action) {
              case 'suspend':
                return { ...user, status: 'suspended' as const };
              case 'activate':
                return { ...user, status: 'active' as const };
              case 'ban':
                return { ...user, status: 'banned' as const };
              default:
                return user;
            }
          }
          return user;
        });
        setUsers(updatedUsers);
      }
    } catch (error) {
      console.error(`Failed to ${action} user:`, error);
    }
  };

  const UserDetailsDialog = () => (
    <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <User className="h-5 w-5" />
            <span>User Details</span>
          </DialogTitle>
          <DialogDescription>
            Detailed information and management options for this user
          </DialogDescription>
        </DialogHeader>

        {selectedUser && (
          <div className="space-y-6">
            <div className="flex items-center space-x-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={selectedUser.avatar} />
                <AvatarFallback className="text-lg">
                  {selectedUser.firstName[0]}{selectedUser.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">
                  {selectedUser.firstName} {selectedUser.lastName}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">{selectedUser.email}</p>
                <div className="flex items-center space-x-2 mt-2">
                  <Badge className={getRoleColor(selectedUser.role)}>
                    {getRoleIcon(selectedUser.role)}
                    <span className="ml-1 capitalize">{selectedUser.role}</span>
                  </Badge>
                  <Badge className={getStatusColor(selectedUser.status)}>
                    {getStatusIcon(selectedUser.status)}
                    <span className="ml-1 capitalize">{selectedUser.status}</span>
                  </Badge>
                </div>
              </div>
            </div>

            <Tabs defaultValue="overview" className="w-full">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="usage">Usage</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
                <TabsTrigger value="actions">Actions</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Plan</Label>
                    <p className="text-sm capitalize">{selectedUser.plan}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Member Since</Label>
                    <p className="text-sm">{new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Last Login</Label>
                    <p className="text-sm">{formatDate(selectedUser.lastLogin)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Total Logins</Label>
                    <p className="text-sm">{selectedUser.loginCount.toLocaleString()}</p>
                  </div>
                </div>

                {selectedUser.metadata.location && (
                  <div>
                    <Label className="text-sm font-medium">Location</Label>
                    <p className="text-sm flex items-center space-x-1">
                      <MapPin className="h-3 w-3" />
                      <span>{selectedUser.metadata.location}</span>
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="usage" className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-blue-600">
                        {selectedUser.usage.aiRequests.toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">AI Requests</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {(selectedUser.usage.storageUsed / 1000).toFixed(1)}GB
                      </p>
                      <p className="text-sm text-muted-foreground">Storage Used</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-purple-600">
                        {selectedUser.usage.apiCalls.toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">API Calls</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="security" className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Key className="h-4 w-4" />
                      <span className="text-sm font-medium">Two-Factor Authentication</span>
                    </div>
                    <Badge variant={selectedUser.metadata.twoFactorEnabled ? "default" : "secondary"}>
                      {selectedUser.metadata.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Last Known IP</Label>
                    <p className="text-sm font-mono bg-gray-50 dark:bg-gray-800 p-2 rounded">
                      {selectedUser.metadata.ipAddress}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Device</Label>
                    <p className="text-sm">{selectedUser.metadata.device}</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="actions" className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {selectedUser.status === 'active' && (
                    <Button
                      variant="outline"
                      onClick={() => handleUserAction(selectedUser.id, 'suspend')}
                      className="text-yellow-600 border-yellow-200"
                    >
                      <Ban className="h-4 w-4 mr-2" />
                      Suspend User
                    </Button>
                  )}

                  {selectedUser.status === 'suspended' && (
                    <Button
                      variant="outline"
                      onClick={() => handleUserAction(selectedUser.id, 'activate')}
                      className="text-green-600 border-green-200"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Activate User
                    </Button>
                  )}

                  {selectedUser.status !== 'banned' && (
                    <Button
                      variant="outline"
                      onClick={() => handleUserAction(selectedUser.id, 'ban')}
                      className="text-red-600 border-red-200"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Ban User
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    onClick={() => handleUserAction(selectedUser.id, 'reset-password')}
                  >
                    <Key className="h-4 w-4 mr-2" />
                    Reset Password
                  </Button>
                </div>

                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    User management actions are logged and may affect user access immediately.
                  </AlertDescription>
                </Alert>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h2>
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h2>
          <p className="text-gray-600 dark:text-gray-400">Manage user accounts, roles, and permissions</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Filter className="h-5 w-5" />
                <span>Filters</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="search">Search Users</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Search by name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All roles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="moderator">Moderator</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
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
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="banned">Banned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plan">Plan</Label>
                  <Select value={planFilter} onValueChange={setPlanFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All plans" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Plans</SelectItem>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Users List */}
          <div className="space-y-3">
            {filteredUsers.map((user) => (
              <Card key={user.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>
                          {user.firstName[0]}{user.lastName[0]}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium text-gray-900 dark:text-white">
                            {user.firstName} {user.lastName}
                          </h3>
                          <Badge className={getRoleColor(user.role)}>
                            {getRoleIcon(user.role)}
                            <span className="ml-1 capitalize">{user.role}</span>
                          </Badge>
                          <Badge className={getStatusColor(user.status)}>
                            {getStatusIcon(user.status)}
                            <span className="ml-1 capitalize">{user.status}</span>
                          </Badge>
                        </div>
                        <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600 dark:text-gray-400">
                          <span className="flex items-center space-x-1">
                            <Mail className="h-3 w-3" />
                            <span>{user.email}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>Last login: {formatDate(user.lastLogin)}</span>
                          </span>
                          <span className="capitalize">{user.plan} plan</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-medium">{user.usage.aiRequests.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">AI Requests</p>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(user);
                          setShowUserDialog(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="roles" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Role Permissions</CardTitle>
              <CardDescription>
                Configure permissions for different user roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {['admin', 'moderator', 'user', 'viewer'].map((role) => (
                  <div key={role} className="border rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <Badge className={getRoleColor(role)}>
                        {getRoleIcon(role)}
                        <span className="ml-1 capitalize">{role}</span>
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {users.filter(u => u.role === role).length} users
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {rolePermissions.map((permission) => (
                        <div key={permission.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`${role}-${permission.id}`}
                            className="rounded border-gray-300"
                            defaultChecked={role === 'admin' || (role === 'moderator' && permission.category !== 'system')}
                          />
                          <label
                            htmlFor={`${role}-${permission.id}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {permission.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <UserDetailsDialog />
    </div>
  );
}