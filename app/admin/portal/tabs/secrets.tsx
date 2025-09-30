'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Key,
  Edit2,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  Brain,
  Database,
  Plug,
  Copy,
  Check,
  AlertTriangle
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface Secret {
  id: string;
  name: string;
  category: string;
  provider: string;
  description?: string;
  value: string;
  maskedValue: string;
  isActive: boolean;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
}

interface SecretCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  providers: string[];
}

const secretCategories: SecretCategory[] = [
  {
    id: 'llm-providers',
    name: 'LLM Providers',
    description: 'API keys for language model providers',
    icon: Brain,
    providers: ['Anthropic', 'OpenAI', 'Google', 'xAI', 'Mistral', 'Cohere', 'Hugging Face']
  },
  {
    id: 'storage-db',
    name: 'Storage / Database',
    description: 'Database and storage service credentials',
    icon: Database,
    providers: ['Neon', 'PlanetScale', 'Supabase', 'AWS S3', 'Google Cloud Storage', 'Azure Blob']
  },
  {
    id: 'integrations',
    name: 'Plugins / Integrations',
    description: 'Third-party service integrations',
    icon: Plug,
    providers: ['Stripe', 'GitHub', 'Twilio', 'SendGrid', 'Slack', 'Discord', 'Webhooks']
  }
];

export default function SecretsTab() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSecret, setSelectedSecret] = useState<Secret | null>(null);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [copiedSecrets, setCopiedSecrets] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    provider: '',
    description: '',
    value: ''
  });

  const { toast } = useToast();

  useEffect(() => {
    fetchSecrets();
  }, []);

  const fetchSecrets = async () => {
    try {
      const response = await fetch('/api/admin/secrets');
      if (response.ok) {
        const data = await response.json();
        setSecrets(data.secrets || []);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch secrets",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to fetch secrets:', error);
      toast({
        title: "Error",
        description: "Failed to fetch secrets",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSecret = () => {
    setSelectedSecret(null);
    setFormData({
      name: '',
      category: '',
      provider: '',
      description: '',
      value: ''
    });
    setEditDialogOpen(true);
  };

  const handleEditSecret = (secret: Secret) => {
    setSelectedSecret(secret);
    setFormData({
      name: secret.name,
      category: secret.category,
      provider: secret.provider,
      description: secret.description || '',
      value: '' // Don't populate the value for security
    });
    setEditDialogOpen(true);
  };

  const handleDeleteSecret = (secret: Secret) => {
    setSelectedSecret(secret);
    setDeleteDialogOpen(true);
  };

  const handleSaveSecret = async () => {
    try {
      const url = selectedSecret
        ? `/api/admin/secrets/${selectedSecret.id}`
        : '/api/admin/secrets';

      const method = selectedSecret ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Secret ${selectedSecret ? 'updated' : 'created'} successfully`,
        });
        setEditDialogOpen(false);
        fetchSecrets();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || `Failed to ${selectedSecret ? 'update' : 'create'} secret`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to save secret:', error);
      toast({
        title: "Error",
        description: `Failed to ${selectedSecret ? 'update' : 'create'} secret`,
        variant: "destructive"
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedSecret) return;

    try {
      const response = await fetch(`/api/admin/secrets/${selectedSecret.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Secret deleted successfully",
        });
        setDeleteDialogOpen(false);
        fetchSecrets();
      } else {
        toast({
          title: "Error",
          description: "Failed to delete secret",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to delete secret:', error);
      toast({
        title: "Error",
        description: "Failed to delete secret",
        variant: "destructive"
      });
    }
  };

  const toggleSecretVisibility = (secretId: string) => {
    const newVisible = new Set(visibleSecrets);
    if (newVisible.has(secretId)) {
      newVisible.delete(secretId);
    } else {
      newVisible.add(secretId);
    }
    setVisibleSecrets(newVisible);
  };

  const copySecretValue = async (secret: Secret) => {
    try {
      // Fetch the real value
      const response = await fetch(`/api/admin/secrets/${secret.id}/value`);
      if (response.ok) {
        const data = await response.json();
        await navigator.clipboard.writeText(data.value);

        setCopiedSecrets(prev => new Set(prev.add(secret.id)));
        setTimeout(() => {
          setCopiedSecrets(prev => {
            const newSet = new Set(prev);
            newSet.delete(secret.id);
            return newSet;
          });
        }, 2000);

        toast({
          title: "Copied",
          description: "Secret value copied to clipboard",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy secret value",
        variant: "destructive"
      });
    }
  };

  const getSecretsForCategory = (categoryId: string) => {
    return secrets.filter(secret => secret.category === categoryId);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Secrets / APIs</h2>
        </div>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Secrets / APIs</h2>
          <p className="text-gray-600 dark:text-gray-400">Manage API keys, credentials, and integrations</p>
        </div>
        <Button onClick={handleCreateSecret}>
          <Plus className="h-4 w-4 mr-2" />
          Add Secret
        </Button>
      </div>

      {/* Categories */}
      <Accordion type="multiple" defaultValue={secretCategories.map(c => c.id)} className="space-y-4">
        {secretCategories.map((category) => {
          const Icon = category.icon;
          const categorySecrets = getSecretsForCategory(category.id);

          return (
            <AccordionItem key={category.id} value={category.id}>
              <Card>
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <div className="flex items-center space-x-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div className="text-left">
                      <div className="font-medium">{category.name}</div>
                      <div className="text-sm text-muted-foreground">{category.description}</div>
                    </div>
                    <Badge variant="secondary">{categorySecrets.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <CardContent className="pt-0">
                    {categorySecrets.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No secrets configured for this category</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, category: category.id }));
                            handleCreateSecret();
                          }}
                        >
                          Add First Secret
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {categorySecrets.map((secret) => (
                          <Card key={secret.id} className="border-l-4 border-l-blue-500">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2">
                                    <h4 className="font-medium">{secret.name}</h4>
                                    <Badge variant="outline">{secret.provider}</Badge>
                                    {!secret.isActive && (
                                      <Badge variant="destructive">Inactive</Badge>
                                    )}
                                  </div>
                                  {secret.description && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {secret.description}
                                    </p>
                                  )}
                                  <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                                    <span>Created: {new Date(secret.createdAt).toLocaleDateString()}</span>
                                    {secret.lastUsed && (
                                      <span>Last used: {new Date(secret.lastUsed).toLocaleDateString()}</span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center space-x-2">
                                  <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">
                                    <code className="text-xs font-mono">
                                      {visibleSecrets.has(secret.id) ? secret.value : secret.maskedValue}
                                    </code>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => toggleSecretVisibility(secret.id)}
                                    >
                                      {visibleSecrets.has(secret.id) ? (
                                        <EyeOff className="h-3 w-3" />
                                      ) : (
                                        <Eye className="h-3 w-3" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copySecretValue(secret)}
                                    >
                                      {copiedSecrets.has(secret.id) ? (
                                        <Check className="h-3 w-3 text-green-600" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>

                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditSecret(secret)}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteSecret(secret)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </AccordionContent>
              </Card>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedSecret ? 'Edit Secret' : 'Add New Secret'}
            </DialogTitle>
            <DialogDescription>
              {selectedSecret
                ? 'Update the secret information. Leave value empty to keep current value.'
                : 'Add a new API key or credential to the system.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., OpenAI Production Key"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">Select category</option>
                  {secretCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="provider">Provider</Label>
                <Input
                  id="provider"
                  value={formData.provider}
                  onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                  placeholder="e.g., OpenAI"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this secret's purpose"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="value">Secret Value</Label>
              <div className="relative">
                <Input
                  id="value"
                  type="password"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  placeholder={selectedSecret ? "Leave empty to keep current value" : "Enter secret value"}
                />
                <AlertTriangle className="absolute right-3 top-2.5 h-4 w-4 text-yellow-500" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This value will be encrypted and stored securely
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSecret}>
              {selectedSecret ? 'Update' : 'Create'} Secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Secret</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedSecret?.name}"? This action cannot be undone
              and may break integrations that depend on this secret.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete Secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}