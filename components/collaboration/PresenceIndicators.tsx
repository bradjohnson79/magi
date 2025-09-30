import React from 'react';
import { Collaborator, PresenceStatus } from '@/lib/types/collaboration';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';

interface PresenceIndicatorsProps {
  collaborators: Collaborator[];
  maxVisible?: number;
  showStatus?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const getStatusColor = (status: PresenceStatus) => {
  switch (status) {
    case 'online':
      return 'bg-green-500';
    case 'away':
      return 'bg-yellow-500';
    case 'offline':
      return 'bg-gray-400';
    default:
      return 'bg-gray-400';
  }
};

const getStatusText = (status: PresenceStatus) => {
  switch (status) {
    case 'online':
      return 'Online';
    case 'away':
      return 'Away';
    case 'offline':
      return 'Offline';
    default:
      return 'Unknown';
  }
};

const getAvatarSize = (size: 'sm' | 'md' | 'lg') => {
  switch (size) {
    case 'sm':
      return 'h-6 w-6';
    case 'md':
      return 'h-8 w-8';
    case 'lg':
      return 'h-10 w-10';
    default:
      return 'h-8 w-8';
  }
};

export function PresenceIndicators({
  collaborators,
  maxVisible = 5,
  showStatus = true,
  size = 'md',
  className = ''
}: PresenceIndicatorsProps) {
  const onlineCollaborators = collaborators.filter(c => c.status === 'online');
  const visibleCollaborators = onlineCollaborators.slice(0, maxVisible);
  const hiddenCount = Math.max(0, onlineCollaborators.length - maxVisible);

  const avatarSize = getAvatarSize(size);

  if (collaborators.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className={`flex items-center gap-1 ${className}`}>
        {visibleCollaborators.map((collaborator, index) => (
          <Tooltip key={`${collaborator.userId}-${collaborator.sessionId}`}>
            <TooltipTrigger asChild>
              <div className="relative">
                <Avatar className={`${avatarSize} border-2 border-background`} style={{ zIndex: maxVisible - index }}>
                  {collaborator.avatarUrl ? (
                    <img src={collaborator.avatarUrl} alt={collaborator.userName} />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-medium">
                      {collaborator.userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </Avatar>
                {showStatus && (
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${getStatusColor(collaborator.status)}`}
                    aria-label={`${collaborator.userName} is ${getStatusText(collaborator.status)}`}
                  />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <p className="font-medium">{collaborator.userName}</p>
                <p className="text-xs text-muted-foreground">{collaborator.userEmail}</p>
                <div className="flex items-center gap-1 text-xs">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(collaborator.status)}`} />
                  <span>{getStatusText(collaborator.status)}</span>
                </div>
                {collaborator.currentPage && (
                  <p className="text-xs text-muted-foreground">
                    Viewing: {collaborator.currentPage}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Last seen {formatDistanceToNow(collaborator.lastSeen, { addSuffix: true })}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}

        {hiddenCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="rounded-full">
                +{hiddenCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <p className="font-medium">{hiddenCount} more online</p>
                {onlineCollaborators.slice(maxVisible).map(collaborator => (
                  <div key={`${collaborator.userId}-${collaborator.sessionId}`} className="text-xs">
                    {collaborator.userName}
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

interface PresenceSummaryProps {
  collaborators: Collaborator[];
  className?: string;
}

export function PresenceSummary({ collaborators, className = '' }: PresenceSummaryProps) {
  const onlineCount = collaborators.filter(c => c.status === 'online').length;
  const awayCount = collaborators.filter(c => c.status === 'away').length;
  const totalActive = onlineCount + awayCount;

  if (totalActive === 0) {
    return (
      <div className={`text-sm text-muted-foreground ${className}`}>
        No active collaborators
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 text-sm ${className}`}>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="font-medium">{onlineCount}</span>
        <span className="text-muted-foreground">online</span>
      </div>
      {awayCount > 0 && (
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="font-medium">{awayCount}</span>
          <span className="text-muted-foreground">away</span>
        </div>
      )}
    </div>
  );
}

interface CollaboratorListProps {
  collaborators: Collaborator[];
  onUserSelect?: (userId: string) => void;
  className?: string;
}

export function CollaboratorList({ collaborators, onUserSelect, className = '' }: CollaboratorListProps) {
  const sortedCollaborators = [...collaborators].sort((a, b) => {
    // Sort by status first (online > away > offline), then by name
    const statusOrder = { online: 0, away: 1, offline: 2 };
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return a.userName.localeCompare(b.userName);
  });

  return (
    <div className={`space-y-2 ${className}`}>
      {sortedCollaborators.map((collaborator) => (
        <div
          key={`${collaborator.userId}-${collaborator.sessionId}`}
          className={`flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors ${
            onUserSelect ? 'cursor-pointer' : ''
          }`}
          onClick={() => onUserSelect?.(collaborator.userId)}
        >
          <div className="relative">
            <Avatar className="h-8 w-8">
              {collaborator.avatarUrl ? (
                <img src={collaborator.avatarUrl} alt={collaborator.userName} />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-medium text-sm">
                  {collaborator.userName.charAt(0).toUpperCase()}
                </div>
              )}
            </Avatar>
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${getStatusColor(collaborator.status)}`}
            />
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{collaborator.userName}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{getStatusText(collaborator.status)}</span>
              {collaborator.currentPage && (
                <>
                  <span>•</span>
                  <span className="truncate">{collaborator.currentPage}</span>
                </>
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {formatDistanceToNow(collaborator.lastSeen, { addSuffix: true })}
          </div>
        </div>
      ))}
    </div>
  );
}