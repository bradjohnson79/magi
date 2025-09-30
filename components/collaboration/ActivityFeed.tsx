import React, { useState, useMemo } from 'react';
import { format, formatDistanceToNow, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { ActivityEvent, ActivityFilter, Collaborator } from '@/lib/types/collaboration';
import { useActivityFeed } from '@/lib/hooks/useActivityFeed';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Filter, Calendar as CalendarIcon, Users, MessageSquare, Activity, Eye, EyeOff, RefreshCw } from 'lucide-react';

interface ActivityFeedProps {
  projectId: string;
  collaborators: Collaborator[];
  className?: string;
}

const ACTION_TYPES = [
  { value: 'all', label: 'All Actions' },
  { value: 'comment_created', label: 'Comments' },
  { value: 'comment_mention', label: 'Mentions' },
  { value: 'comment_reply', label: 'Replies' },
  { value: 'user_joined', label: 'User Joined' },
  { value: 'user_left', label: 'User Left' },
  { value: 'project_updated', label: 'Project Updates' },
  { value: 'collaborator_added', label: 'Collaborator Added' }
];

const TIME_RANGES = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' }
];

export function ActivityFeed({ projectId, collaborators, className }: ActivityFeedProps) {
  const [filter, setFilter] = useState<ActivityFilter>({
    includePresence: true
  });
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});

  const {
    activities,
    loading,
    error,
    hasMore,
    totalCount,
    loadMore,
    refresh
  } = useActivityFeed({
    projectId,
    filter,
    limit: 25,
    autoRefresh: true
  });

  const filteredActivities = useMemo(() => {
    return activities.filter(activity => {
      if (!filter.includePresence && activity.action.includes('user_')) {
        return false;
      }
      return true;
    });
  }, [activities, filter.includePresence]);

  const handleFilterChange = (key: keyof ActivityFilter, value: any) => {
    setFilter(prev => ({ ...prev, [key]: value }));
  };

  const handleTimeRangeChange = (range: string) => {
    const now = new Date();
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    switch (range) {
      case 'today':
        dateFrom = startOfDay(now);
        break;
      case 'week':
        dateFrom = startOfWeek(now);
        break;
      case 'month':
        dateFrom = startOfMonth(now);
        break;
      default:
        dateFrom = undefined;
        dateTo = undefined;
    }

    setFilter(prev => ({ ...prev, dateFrom, dateTo }));
    setDateRange({ from: dateFrom, to: dateTo });
  };

  const handleUserFilter = (userId: string) => {
    const newUserId = userId === 'all' ? undefined : userId;
    handleFilterChange('userId', newUserId);
  };

  const handleActionFilter = (action: string) => {
    const newAction = action === 'all' ? undefined : action;
    handleFilterChange('action', newAction);
  };

  const getActivityIcon = (action: string) => {
    if (action.includes('comment')) return <MessageSquare className="h-4 w-4" />;
    if (action.includes('user_')) return <Users className="h-4 w-4" />;
    if (action.includes('project')) return <Activity className="h-4 w-4" />;
    return <Activity className="h-4 w-4" />;
  };

  const getActivityColor = (action: string) => {
    if (action.includes('comment')) return 'bg-blue-500';
    if (action.includes('user_joined')) return 'bg-green-500';
    if (action.includes('user_left')) return 'bg-gray-500';
    if (action.includes('project')) return 'bg-purple-500';
    return 'bg-gray-500';
  };

  const formatActivityTime = (date: Date) => {
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return formatDistanceToNow(date, { addSuffix: true });
    }
    return format(date, 'MMM d, HH:mm');
  };

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center text-red-600">
            <p>Failed to load activity feed</p>
            <Button variant="outline" onClick={refresh} className="mt-2">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Activity Feed</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t">
            <Select value={filter.userId || 'all'} onValueChange={handleUserFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {collaborators.map(collaborator => (
                  <SelectItem key={collaborator.userId} value={collaborator.userId}>
                    {collaborator.userName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filter.action || 'all'} onValueChange={handleActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value="all" onValueChange={handleTimeRangeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map(range => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="md:col-span-3 flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleFilterChange('includePresence', !filter.includePresence)}
                className="flex items-center gap-2"
              >
                {filter.includePresence ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {filter.includePresence ? 'Hide' : 'Show'} Presence Events
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    Custom Date Range
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => {
                      setDateRange(range || {});
                      setFilter(prev => ({
                        ...prev,
                        dateFrom: range?.from,
                        dateTo: range?.to
                      }));
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {totalCount > 0 && (
          <div className="px-6 py-2 text-sm text-muted-foreground border-b">
            {totalCount} activities
          </div>
        )}

        <div className="max-h-96 overflow-y-auto">
          {filteredActivities.length === 0 && !loading ? (
            <div className="p-6 text-center text-muted-foreground">
              No activities found
            </div>
          ) : (
            <div className="divide-y">
              {filteredActivities.map((activity) => (
                <div key={activity.id} className="p-4 hover:bg-muted/50">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-full p-1.5 ${getActivityColor(activity.action)}`}>
                      {getActivityIcon(activity.action)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Avatar className="h-6 w-6">
                          {activity.userAvatar && (
                            <img src={activity.userAvatar} alt={activity.userName} />
                          )}
                        </Avatar>
                        <span className="font-medium text-sm">{activity.userName}</span>
                        <Badge variant="secondary" className="text-xs">
                          {activity.action.replace(/_/g, ' ')}
                        </Badge>
                      </div>

                      <p className="text-sm text-muted-foreground mb-2">
                        {activity.description}
                      </p>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {formatActivityTime(activity.createdAt)}
                        </span>

                        {activity.metadata?.projectName && (
                          <Badge variant="outline" className="text-xs">
                            {activity.metadata.projectName}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {hasMore && (
                <div className="p-4 text-center">
                  <Button
                    variant="ghost"
                    onClick={loadMore}
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? 'Loading...' : 'Load More'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}