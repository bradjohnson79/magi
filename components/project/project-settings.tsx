'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertTriangle,
  Archive,
  Copy,
  Trash2,
  RefreshCw,
  Clock,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Project, ProjectStatus } from '@/lib/types/projects';

interface ProjectSettingsProps {
  project: Project;
  onProjectUpdate: (project: Project) => void;
}

interface ArchiveDialogData {
  reason: string;
  createSnapshot: boolean;
}

interface CloneDialogData {
  name: string;
  slug: string;
  description: string;
  includeFiles: boolean;
  includeSnapshots: boolean;
  includeDomains: boolean;
}

interface DeleteDialogData {
  reason: string;
  createSnapshot: boolean;
  confirmationText: string;
}

export default function ProjectSettings({ project, onProjectUpdate }: ProjectSettingsProps) {
  const [isArchiving, setIsArchiving] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [archiveData, setArchiveData] = useState<ArchiveDialogData>({
    reason: '',
    createSnapshot: true
  });

  const [cloneData, setCloneData] = useState<CloneDialogData>({
    name: `${project.name} (Copy)`,
    slug: '',
    description: project.description || '',
    includeFiles: true,
    includeSnapshots: false,
    includeDomains: false
  });

  const [deleteData, setDeleteData] = useState<DeleteDialogData>({
    reason: '',
    createSnapshot: true,
    confirmationText: ''
  });

  const getStatusBadge = (status: ProjectStatus) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>;
      case 'archived':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Archived</Badge>;
      case 'deleted':
        return <Badge variant="destructive" className="bg-red-100 text-red-800">Deleted</Badge>;
    }
  };

  const handleArchive = async () => {
    if (project.projectStatus !== 'active') {
      toast.error('Only active projects can be archived');
      return;
    }

    setIsArchiving(true);
    try {
      const response = await fetch(`/api/v1/projects/${project.id}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: archiveData.reason,
          createSnapshot: archiveData.createSnapshot
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to archive project');
      }

      toast.success('Project archived successfully');
      onProjectUpdate(result.data.project);
      setShowArchiveDialog(false);
      setArchiveData({ reason: '', createSnapshot: true });

    } catch (error) {
      console.error('Archive error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to archive project');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleClone = async () => {
    if (!cloneData.name.trim()) {
      toast.error('Project name is required');
      return;
    }

    setIsCloning(true);
    try {
      const response = await fetch(`/api/v1/projects/${project.id}/clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: cloneData.name.trim(),
          slug: cloneData.slug.trim() || undefined,
          description: cloneData.description.trim() || undefined,
          includeFiles: cloneData.includeFiles,
          includeSnapshots: cloneData.includeSnapshots,
          includeDomains: cloneData.includeDomains
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to clone project');
      }

      toast.success(`Project cloned successfully as "${result.data.project.name}"`);
      setShowCloneDialog(false);
      setCloneData({
        name: `${project.name} (Copy)`,
        slug: '',
        description: project.description || '',
        includeFiles: true,
        includeSnapshots: false,
        includeDomains: false
      });

    } catch (error) {
      console.error('Clone error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to clone project');
    } finally {
      setIsCloning(false);
    }
  };

  const handleDelete = async () => {
    if (deleteData.confirmationText !== project.name) {
      toast.error('Project name confirmation does not match');
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/v1/projects/${project.id}/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: deleteData.reason,
          createSnapshot: deleteData.createSnapshot
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to delete project');
      }

      toast.success('Project deleted successfully');
      onProjectUpdate(result.data.project);
      setShowDeleteDialog(false);
      setDeleteData({ reason: '', createSnapshot: true, confirmationText: '' });

    } catch (error) {
      console.error('Delete error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete project');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestore = async () => {
    if (project.projectStatus === 'active') {
      toast.error('Project is already active');
      return;
    }

    setIsRestoring(true);
    try {
      const response = await fetch(`/api/v1/projects/${project.id}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to restore project');
      }

      toast.success('Project restored successfully');
      onProjectUpdate(result.data.project);

    } catch (error) {
      console.error('Restore error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to restore project');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Project Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Project Status</CardTitle>
              <CardDescription>Current status and lifecycle information</CardDescription>
            </div>
            {getStatusBadge(project.projectStatus)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.projectStatus === 'archived' && project.archivedAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Archived on {new Date(project.archivedAt).toLocaleDateString()}
            </div>
          )}
          {project.projectStatus === 'deleted' && project.deletedAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              Deleted on {new Date(project.deletedAt).toLocaleDateString()}
            </div>
          )}

          {(project.projectStatus === 'archived' || project.projectStatus === 'deleted') && (
            <Button
              onClick={handleRestore}
              disabled={isRestoring}
              variant="outline"
              className="w-full"
            >
              {isRestoring ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Restore Project
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Lifecycle Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Lifecycle Actions</CardTitle>
          <CardDescription>
            Manage your project's lifecycle with archive, clone, or delete operations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Archive */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Archive className="h-5 w-5 text-orange-500" />
              <div>
                <h3 className="font-medium">Archive Project</h3>
                <p className="text-sm text-muted-foreground">
                  Hide project from active lists while preserving all data
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowArchiveDialog(true)}
              disabled={project.projectStatus !== 'active'}
              variant="outline"
              size="sm"
            >
              Archive
            </Button>
          </div>

          {/* Clone */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Copy className="h-5 w-5 text-blue-500" />
              <div>
                <h3 className="font-medium">Clone Project</h3>
                <p className="text-sm text-muted-foreground">
                  Create a duplicate of this project with optional data inclusion
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowCloneDialog(true)}
              disabled={project.projectStatus === 'deleted'}
              variant="outline"
              size="sm"
            >
              Clone
            </Button>
          </div>

          {/* Delete */}
          <div className="flex items-center justify-between p-4 border rounded-lg border-red-200">
            <div className="flex items-center gap-3">
              <Trash2 className="h-5 w-5 text-red-500" />
              <div>
                <h3 className="font-medium text-red-700">Delete Project</h3>
                <p className="text-sm text-muted-foreground">
                  Soft delete project while maintaining audit trail
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowDeleteDialog(true)}
              disabled={project.projectStatus === 'deleted'}
              variant="destructive"
              size="sm"
            >
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Archive Dialog */}
      <Dialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Project</DialogTitle>
            <DialogDescription>
              This will archive "{project.name}" and hide it from your active projects list.
              You can restore it at any time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="archive-reason">Reason (optional)</Label>
              <Textarea
                id="archive-reason"
                placeholder="Why are you archiving this project?"
                value={archiveData.reason}
                onChange={(e) => setArchiveData(prev => ({ ...prev, reason: e.target.value }))}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="archive-snapshot"
                checked={archiveData.createSnapshot}
                onCheckedChange={(checked) =>
                  setArchiveData(prev => ({ ...prev, createSnapshot: !!checked }))
                }
              />
              <Label htmlFor="archive-snapshot">Create snapshot before archiving</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowArchiveDialog(false)}
              disabled={isArchiving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleArchive}
              disabled={isArchiving}
            >
              {isArchiving ? 'Archiving...' : 'Archive Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone Dialog */}
      <Dialog open={showCloneDialog} onOpenChange={setShowCloneDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clone Project</DialogTitle>
            <DialogDescription>
              Create a copy of "{project.name}" with your specified settings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="clone-name">Project Name *</Label>
              <Input
                id="clone-name"
                value={cloneData.name}
                onChange={(e) => setCloneData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter project name"
              />
            </div>

            <div>
              <Label htmlFor="clone-slug">Slug (optional)</Label>
              <Input
                id="clone-slug"
                value={cloneData.slug}
                onChange={(e) => setCloneData(prev => ({ ...prev, slug: e.target.value }))}
                placeholder="auto-generated if empty"
              />
            </div>

            <div>
              <Label htmlFor="clone-description">Description (optional)</Label>
              <Textarea
                id="clone-description"
                value={cloneData.description}
                onChange={(e) => setCloneData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter project description"
              />
            </div>

            <div className="space-y-3">
              <Label>Include in clone:</Label>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="clone-files"
                  checked={cloneData.includeFiles}
                  onCheckedChange={(checked) =>
                    setCloneData(prev => ({ ...prev, includeFiles: !!checked }))
                  }
                />
                <Label htmlFor="clone-files">Project files and code</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="clone-snapshots"
                  checked={cloneData.includeSnapshots}
                  onCheckedChange={(checked) =>
                    setCloneData(prev => ({ ...prev, includeSnapshots: !!checked }))
                  }
                />
                <Label htmlFor="clone-snapshots">Recent snapshots (last 10)</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="clone-domains"
                  checked={cloneData.includeDomains}
                  onCheckedChange={(checked) =>
                    setCloneData(prev => ({ ...prev, includeDomains: !!checked }))
                  }
                />
                <Label htmlFor="clone-domains">Custom domains (with prefix)</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCloneDialog(false)}
              disabled={isCloning}
            >
              Cancel
            </Button>
            <Button
              onClick={handleClone}
              disabled={isCloning || !cloneData.name.trim()}
            >
              {isCloning ? 'Cloning...' : 'Clone Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Project
            </DialogTitle>
            <DialogDescription>
              This will soft delete "{project.name}". The project and its data will be preserved
              for audit purposes but hidden from your active projects.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="delete-reason">Reason (optional)</Label>
              <Textarea
                id="delete-reason"
                placeholder="Why are you deleting this project?"
                value={deleteData.reason}
                onChange={(e) => setDeleteData(prev => ({ ...prev, reason: e.target.value }))}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="delete-snapshot"
                checked={deleteData.createSnapshot}
                onCheckedChange={(checked) =>
                  setDeleteData(prev => ({ ...prev, createSnapshot: !!checked }))
                }
              />
              <Label htmlFor="delete-snapshot">Create snapshot before deletion</Label>
            </div>

            <div>
              <Label htmlFor="delete-confirmation">
                Type <span className="font-mono font-semibold">{project.name}</span> to confirm
              </Label>
              <Input
                id="delete-confirmation"
                value={deleteData.confirmationText}
                onChange={(e) => setDeleteData(prev => ({ ...prev, confirmationText: e.target.value }))}
                placeholder={project.name}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || deleteData.confirmationText !== project.name}
            >
              {isDeleting ? 'Deleting...' : 'Delete Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}