'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  GitBranch,
  ExternalLink,
  Loader2,
  Clock,
  Database,
  Copy,
  CheckCircle
} from 'lucide-react';

interface PreviewBranch {
  id: string;
  branchName: string;
  previewUrl?: string;
  status: 'creating' | 'ready' | 'failed' | 'deleted';
  createdAt: string;
  expiresAt?: string;
}

interface PreviewBranchButtonProps {
  projectId: string;
  projectName?: string;
  disabled?: boolean;
  className?: string;
}

export function PreviewBranchButton({
  projectId,
  projectName = 'Project',
  disabled = false,
  className = ''
}: PreviewBranchButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [branches, setBranches] = useState<PreviewBranch[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    branchName: '',
    description: '',
    sourceBranch: 'main'
  });

  const { toast } = useToast();

  const fetchBranches = async () => {
    try {
      const response = await fetch(`/api/v1/preview/branches?projectId=${projectId}`);
      if (response.ok) {
        const data = await response.json();
        setBranches(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    fetchBranches();
  };

  const handleCreateBranch = async () => {
    if (!formData.branchName.trim()) {
      toast({
        title: "Error",
        description: "Branch name is required",
        variant: "destructive"
      });
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/v1/preview/branches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          branchName: formData.branchName,
          description: formData.description,
          sourceBranch: formData.sourceBranch,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Success",
          description: "Preview branch created successfully",
        });
        setFormData({ branchName: '', description: '', sourceBranch: 'main' });
        setShowCreateForm(false);
        fetchBranches(); // Refresh the list
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to create preview branch",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create preview branch",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: "URL copied to clipboard",
      });
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'bg-green-100 text-green-800 border-green-200';
      case 'creating': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={handleOpen}
        disabled={disabled}
        className={`flex items-center space-x-2 ${className}`}
      >
        <GitBranch className="h-4 w-4" />
        <span>Preview Changes</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Database className="h-5 w-5" />
              <span>Preview Branches for {projectName}</span>
            </DialogTitle>
            <DialogDescription>
              Create isolated database branches to test changes before merging to production.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Create Branch Section */}
            {!showCreateForm ? (
              <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Create New Preview Branch</h3>
                    <p className="text-sm text-muted-foreground">
                      Fork the database to test changes in isolation
                    </p>
                  </div>
                  <Button
                    onClick={() => setShowCreateForm(true)}
                    className="flex items-center space-x-2"
                  >
                    <GitBranch className="h-4 w-4" />
                    <span>New Branch</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Create Preview Branch</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreateForm(false)}
                  >
                    Cancel
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="branchName">Branch Name</Label>
                    <Input
                      id="branchName"
                      value={formData.branchName}
                      onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                      placeholder="feature-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sourceBranch">Source Branch</Label>
                    <Input
                      id="sourceBranch"
                      value={formData.sourceBranch}
                      onChange={(e) => setFormData({ ...formData, sourceBranch: e.target.value })}
                      placeholder="main"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="What changes are you testing?"
                    rows={2}
                  />
                </div>

                <Button
                  onClick={handleCreateBranch}
                  disabled={isCreating}
                  className="w-full"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating Branch...
                    </>
                  ) : (
                    <>
                      <GitBranch className="h-4 w-4 mr-2" />
                      Create Preview Branch
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Existing Branches List */}
            <div className="space-y-3">
              <h3 className="font-medium">Active Preview Branches</h3>

              {branches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No preview branches yet</p>
                  <p className="text-sm">Create one to test changes in isolation</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {branches.map((branch) => (
                    <div key={branch.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h4 className="font-medium">{branch.branchName}</h4>
                            <Badge className={getStatusColor(branch.status)}>
                              {branch.status}
                            </Badge>
                            {branch.status === 'creating' && (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            )}
                          </div>

                          <div className="flex items-center space-x-4 mt-1 text-sm text-muted-foreground">
                            <div className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>Created {new Date(branch.createdAt).toLocaleDateString()}</span>
                            </div>
                            {branch.expiresAt && (
                              <div className="flex items-center space-x-1">
                                <span>Expires {new Date(branch.expiresAt).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {branch.status === 'ready' && branch.previewUrl && (
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(branch.previewUrl!)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => window.open(branch.previewUrl, '_blank')}
                              className="flex items-center space-x-1"
                            >
                              <ExternalLink className="h-4 w-4" />
                              <span>View</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}