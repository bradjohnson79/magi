import { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from '@clerk/nextjs/server';
import { ProjectLifecycleService } from '@/lib/services/project-lifecycle';
import { ProjectStatus, CreateProjectRequest } from '@/lib/types/projects';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }

    const lifecycleService = ProjectLifecycleService.getInstance();

    if (req.method === 'GET') {
      // Get projects with status filtering
      const {
        status,
        include_archived,
        include_deleted,
        limit,
        offset
      } = req.query;

      // Parse status filter
      let statuses: ProjectStatus[] = ['active'];
      if (typeof status === 'string') {
        const statusList = status.split(',') as ProjectStatus[];
        statuses = statusList.filter(s => ['active', 'archived', 'deleted'].includes(s));
      }

      // Parse boolean flags
      const includeArchived = include_archived === 'true';
      const includeDeleted = include_deleted === 'true';

      // Parse pagination
      const limitNum = limit ? parseInt(limit as string, 10) : undefined;
      const offsetNum = offset ? parseInt(offset as string, 10) : undefined;

      const projects = await lifecycleService.getProjects(userId, statuses, {
        includeArchived,
        includeDeleted,
        limit: limitNum,
        offset: offsetNum
      });

      return res.status(200).json({
        success: true,
        data: {
          projects,
          total: projects.length,
          filters: {
            status: statuses,
            includeArchived,
            includeDeleted
          }
        }
      });

    } else if (req.method === 'POST') {
      // Create new project
      const { name, slug, description } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Project name is required'
        });
      }

      if (name.length > 100) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Project name must be 100 characters or less'
        });
      }

      // Validate slug if provided
      if (slug && typeof slug === 'string') {
        const slugRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
        if (!slugRegex.test(slug) || slug.length > 50) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Slug must contain only lowercase letters, numbers, and hyphens, and be 1-50 characters long'
          });
        }

        // Check if slug already exists
        const existingProject = await lifecycleService.getProjectBySlug(slug);
        if (existingProject) {
          return res.status(409).json({
            error: 'Conflict',
            message: 'A project with this slug already exists'
          });
        }
      }

      const createRequest: CreateProjectRequest = {
        name: name.trim(),
        slug: slug?.trim(),
        description: description?.trim(),
        ownerId: userId
      };

      // For this endpoint, we'll need to implement the basic create functionality
      // Since we're focusing on lifecycle management, I'll create a placeholder response
      return res.status(501).json({
        error: 'Not Implemented',
        message: 'Project creation endpoint not yet implemented. Use lifecycle service.'
      });

    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({
        error: 'Method Not Allowed',
        message: 'Only GET and POST methods are allowed'
      });
    }

  } catch (error) {
    console.error('Projects API error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process request'
    });
  }
}