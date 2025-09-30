import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useActivityStats, useActivitySummary } from '@/lib/hooks/useActivityFeed';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, MessageSquare, Users, TrendingUp } from 'lucide-react';

interface ActivityStatsProps {
  projectId: string;
  className?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export function ActivityStats({ projectId, className }: ActivityStatsProps) {
  const [timeframe, setTimeframe] = React.useState<'day' | 'week' | 'month'>('week');
  const [period, setPeriod] = React.useState<'today' | 'week' | 'month'>('today');

  const { stats, loading: statsLoading } = useActivityStats(projectId, timeframe);
  const { summary, loading: summaryLoading } = useActivitySummary(projectId, period);

  const activityTrendData = stats?.activityTrend?.map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    }),
    count: item.count
  })) || [];

  const activityTypeData = stats ? Object.entries(stats.activitiesByType).map(([type, count]) => ({
    name: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value: count,
    type
  })) : [];

  const summaryCards = [
    {
      title: 'Total Activities',
      value: summary?.totalActivities || 0,
      icon: Activity,
      color: 'text-blue-600'
    },
    {
      title: 'Comments',
      value: summary?.commentsActivity || 0,
      icon: MessageSquare,
      color: 'text-green-600'
    },
    {
      title: 'Presence Events',
      value: summary?.presenceActivity || 0,
      icon: Users,
      color: 'text-purple-600'
    },
    {
      title: 'Project Updates',
      value: summary?.projectActivity || 0,
      icon: TrendingUp,
      color: 'text-orange-600'
    }
  ];

  if (statsLoading || summaryLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {card.title}
                    </p>
                    <p className="text-2xl font-bold">{card.value}</p>
                  </div>
                  <Icon className={`h-8 w-8 ${card.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Top Contributors */}
      {summary?.topContributors && summary.topContributors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Contributors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summary.topContributors.slice(0, 5).map((contributor, index) => (
                <div key={contributor.userId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="w-8 h-8 rounded-full flex items-center justify-center p-0">
                      {index + 1}
                    </Badge>
                    <span className="font-medium">{contributor.userName}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {contributor.activityCount} activities
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Trend Chart */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Activity Trend</CardTitle>
            <Select value={timeframe} onValueChange={(value: 'day' | 'week' | 'month') => setTimeframe(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Last 24h</SelectItem>
                <SelectItem value="week">Last Week</SelectItem>
                <SelectItem value="month">Last Month</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {activityTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={activityTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Types Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Activity Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {activityTypeData.length > 0 ? (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={activityTypeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {activityTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>

                <div className="space-y-2">
                  {activityTypeData.map((entry, index) => (
                    <div key={entry.type} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span>{entry.name}</span>
                      </div>
                      <span className="font-medium">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Activity Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{stats.totalActivities}</p>
                <p className="text-sm text-muted-foreground">Total Activities</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{stats.activeUsers}</p>
                <p className="text-sm text-muted-foreground">Active Users</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">{Object.keys(stats.activitiesByType).length}</p>
                <p className="text-sm text-muted-foreground">Activity Types</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}