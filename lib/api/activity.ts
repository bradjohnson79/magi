import { NextApiRequest, NextApiResponse } from 'next';
import { ActivityService } from '@/lib/services/activity';
import { ActivityFilter } from '@/lib/types/collaboration';

const activityService = ActivityService.getInstance();

export async function getProjectActivities(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  userId: string
) {
  try {
    const {
      userId: filterUserId,
      action,
      collaboratorId,
      dateFrom,
      dateTo,
      includePresence = 'true',
      limit = '50',
      offset = '0'
    } = req.query;

    const filter: ActivityFilter = {};

    if (filterUserId && typeof filterUserId === 'string') {
      filter.userId = filterUserId;
    }

    if (action && typeof action === 'string') {
      filter.action = action;
    }

    if (collaboratorId && typeof collaboratorId === 'string') {
      filter.collaboratorId = collaboratorId;
    }

    if (dateFrom && typeof dateFrom === 'string') {
      filter.dateFrom = new Date(dateFrom);
    }

    if (dateTo && typeof dateTo === 'string') {
      filter.dateTo = new Date(dateTo);
    }

    filter.includePresence = includePresence === 'true';

    const result = await activityService.getProjectActivities(
      projectId,
      filter,
      parseInt(limit as string, 10),
      parseInt(offset as string, 10)
    );

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching project activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
}

export async function getUserActivities(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const { limit = '20', offset = '0' } = req.query;

    const activities = await activityService.getUserActivities(
      userId,
      parseInt(limit as string, 10),
      parseInt(offset as string, 10)
    );

    res.status(200).json({ activities });
  } catch (error) {
    console.error('Error fetching user activities:', error);
    res.status(500).json({ error: 'Failed to fetch user activities' });
  }
}

export async function getActivityStats(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string
) {
  try {
    const { timeframe = 'week' } = req.query;

    const stats = await activityService.getActivityStats(
      projectId,
      timeframe as 'day' | 'week' | 'month'
    );

    res.status(200).json(stats);
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({ error: 'Failed to fetch activity stats' });
  }
}

export async function getActivitySummary(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string
) {
  try {
    const { period = 'today' } = req.query;

    const summary = await activityService.getActivitySummary(
      projectId,
      period as 'today' | 'week' | 'month'
    );

    res.status(200).json(summary);
  } catch (error) {
    console.error('Error fetching activity summary:', error);
    res.status(500).json({ error: 'Failed to fetch activity summary' });
  }
}

export async function logProjectActivity(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  userId: string
) {
  try {
    const { action, metadata = {} } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }

    const activity = await activityService.logProjectActivity(
      projectId,
      userId,
      action,
      metadata
    );

    res.status(201).json(activity);
  } catch (error) {
    console.error('Error logging project activity:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
}

export async function logCollaborationActivity(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  userId: string
) {
  try {
    const { action, collaboratorId, metadata = {} } = req.body;

    if (!action || !collaboratorId) {
      return res.status(400).json({ error: 'Action and collaboratorId are required' });
    }

    const activity = await activityService.logCollaborationActivity(
      projectId,
      userId,
      action,
      collaboratorId,
      metadata
    );

    res.status(201).json(activity);
  } catch (error) {
    console.error('Error logging collaboration activity:', error);
    res.status(500).json({ error: 'Failed to log collaboration activity' });
  }
}