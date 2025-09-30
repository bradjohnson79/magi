import { useState, useEffect, useCallback } from 'react';
import { ActivityEvent, ActivityFilter } from '@/lib/types/collaboration';

interface ActivityFeedState {
  activities: ActivityEvent[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  totalCount: number;
}

interface UseActivityFeedOptions {
  projectId: string;
  filter?: ActivityFilter;
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useActivityFeed({
  projectId,
  filter = {},
  limit = 50,
  autoRefresh = true,
  refreshInterval = 30000
}: UseActivityFeedOptions) {
  const [state, setState] = useState<ActivityFeedState>({
    activities: [],
    loading: true,
    error: null,
    hasMore: false,
    totalCount: 0
  });

  const [offset, setOffset] = useState(0);

  const fetchActivities = useCallback(async (reset = false) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const currentOffset = reset ? 0 : offset;
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: currentOffset.toString(),
        includePresence: filter.includePresence?.toString() || 'true'
      });

      if (filter.userId) params.append('userId', filter.userId);
      if (filter.action) params.append('action', filter.action);
      if (filter.collaboratorId) params.append('collaboratorId', filter.collaboratorId);
      if (filter.dateFrom) params.append('dateFrom', filter.dateFrom.toISOString());
      if (filter.dateTo) params.append('dateTo', filter.dateTo.toISOString());

      const response = await fetch(`/api/projects/${projectId}/activities?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch activities');
      }

      const data = await response.json();

      setState(prev => ({
        ...prev,
        activities: reset ? data.activities : [...prev.activities, ...data.activities],
        hasMore: data.hasMore,
        totalCount: data.totalCount,
        loading: false
      }));

      if (reset) {
        setOffset(data.activities.length);
      } else {
        setOffset(prev => prev + data.activities.length);
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to fetch activities',
        loading: false
      }));
    }
  }, [projectId, filter, limit, offset]);

  const loadMore = useCallback(() => {
    if (!state.loading && state.hasMore) {
      fetchActivities(false);
    }
  }, [fetchActivities, state.loading, state.hasMore]);

  const refresh = useCallback(() => {
    setOffset(0);
    fetchActivities(true);
  }, [fetchActivities]);

  const addActivity = useCallback((activity: ActivityEvent) => {
    setState(prev => ({
      ...prev,
      activities: [activity, ...prev.activities],
      totalCount: prev.totalCount + 1
    }));
  }, []);

  const updateActivity = useCallback((activityId: string, updates: Partial<ActivityEvent>) => {
    setState(prev => ({
      ...prev,
      activities: prev.activities.map(activity =>
        activity.id === activityId ? { ...activity, ...updates } : activity
      )
    }));
  }, []);

  // Initial load and filter changes
  useEffect(() => {
    setOffset(0);
    fetchActivities(true);
  }, [projectId, filter.userId, filter.action, filter.collaboratorId, filter.dateFrom, filter.dateTo, filter.includePresence]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      if (!state.loading) {
        refresh();
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refresh, state.loading]);

  return {
    ...state,
    loadMore,
    refresh,
    addActivity,
    updateActivity
  };
}

export function useActivityStats(projectId: string, timeframe: 'day' | 'week' | 'month' = 'week') {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/projects/${projectId}/activities/stats?timeframe=${timeframe}`);

      if (!response.ok) {
        throw new Error('Failed to fetch activity stats');
      }

      const data = await response.json();
      setStats(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  }, [projectId, timeframe]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refresh: fetchStats };
}

export function useActivitySummary(projectId: string, period: 'today' | 'week' | 'month' = 'today') {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/projects/${projectId}/activities/summary?period=${period}`);

      if (!response.ok) {
        throw new Error('Failed to fetch activity summary');
      }

      const data = await response.json();
      setSummary(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch summary');
    } finally {
      setLoading(false);
    }
  }, [projectId, period]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, error, refresh: fetchSummary };
}