import React, { useState, useEffect } from 'react';
import { CursorPosition, Collaborator } from '@/lib/types/collaboration';
import { Avatar } from '@/components/ui/avatar';

interface CursorData {
  userId: string;
  sessionId: string;
  position: CursorPosition;
  currentPage?: string;
  userName: string;
  avatarUrl?: string;
}

interface CursorOverlayProps {
  cursors: CursorData[];
  currentUserId: string;
  containerRef: React.RefObject<HTMLElement>;
  className?: string;
}

const CURSOR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
  '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
  '#10AC84', '#EE5A24', '#0984E3', '#6C5CE7', '#A29BFE'
];

function getCursorColor(userId: string): string {
  // Generate consistent color based on userId
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

interface AnimatedCursorProps {
  cursor: CursorData;
  color: string;
  isCurrentPage: boolean;
}

function AnimatedCursor({ cursor, color, isCurrentPage }: AnimatedCursorProps) {
  const [visible, setVisible] = useState(false);
  const [lastPosition, setLastPosition] = useState(cursor.position);

  useEffect(() => {
    if (isCurrentPage) {
      setVisible(true);
      setLastPosition(cursor.position);

      // Hide cursor after 5 seconds of inactivity
      const hideTimer = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(hideTimer);
    } else {
      setVisible(false);
    }
  }, [cursor.position, isCurrentPage]);

  if (!visible || !isCurrentPage) {
    return null;
  }

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${cursor.position.x}px`,
    top: `${cursor.position.y}px`,
    zIndex: 9999,
    pointerEvents: 'none',
    transition: 'all 0.1s ease-out',
    transform: 'translate(-2px, -2px)'
  };

  return (
    <div style={style} className="flex items-start gap-1">
      {/* Cursor pointer */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
      >
        <path
          d="M5 3L19 12L12 13L8 19L5 3Z"
          fill={color}
          stroke="white"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>

      {/* User label */}
      <div
        className="px-2 py-1 rounded-md text-white text-xs font-medium whitespace-nowrap"
        style={{
          backgroundColor: color,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}
      >
        <div className="flex items-center gap-1">
          <Avatar className="h-4 w-4">
            {cursor.avatarUrl && (
              <img src={cursor.avatarUrl} alt={cursor.userName} />
            )}
          </Avatar>
          <span>{cursor.userName}</span>
        </div>
      </div>
    </div>
  );
}

export function CursorOverlay({
  cursors,
  currentUserId,
  containerRef,
  className = ''
}: CursorOverlayProps) {
  const [currentPage, setCurrentPage] = useState<string>('');

  useEffect(() => {
    // Get current page identifier (you might want to customize this)
    setCurrentPage(window.location.pathname);
  }, []);

  // Filter out current user's cursors and invalid positions
  const validCursors = cursors.filter(cursor =>
    cursor.userId !== currentUserId &&
    cursor.position &&
    typeof cursor.position.x === 'number' &&
    typeof cursor.position.y === 'number' &&
    cursor.position.x >= 0 &&
    cursor.position.y >= 0
  );

  if (!containerRef.current || validCursors.length === 0) {
    return null;
  }

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      {validCursors.map(cursor => (
        <AnimatedCursor
          key={`${cursor.userId}-${cursor.sessionId}`}
          cursor={cursor}
          color={getCursorColor(cursor.userId)}
          isCurrentPage={!cursor.currentPage || cursor.currentPage === currentPage}
        />
      ))}
    </div>
  );
}

interface CursorPositionTrackerProps {
  onCursorMove: (position: CursorPosition) => void;
  currentPage?: string;
  children: React.ReactNode;
  className?: string;
}

export function CursorPositionTracker({
  onCursorMove,
  currentPage,
  children,
  className = ''
}: CursorPositionTrackerProps) {
  const [isTracking, setIsTracking] = useState(true);

  useEffect(() => {
    if (!isTracking) return;

    let lastEmitTime = 0;
    const THROTTLE_MS = 50; // Emit at most every 50ms

    const handleMouseMove = (event: MouseEvent) => {
      const now = Date.now();
      if (now - lastEmitTime < THROTTLE_MS) return;

      lastEmitTime = now;

      // Get position relative to the document
      const position: CursorPosition = {
        x: event.clientX + window.scrollX,
        y: event.clientY + window.scrollY
      };

      onCursorMove(position);
    };

    const handleMouseLeave = () => {
      // Optionally emit a "cursor left" event
      setIsTracking(false);
      setTimeout(() => setIsTracking(true), 1000); // Re-enable after 1 second
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [onCursorMove, isTracking]);

  return (
    <div className={className}>
      {children}
    </div>
  );
}

interface CollaboratorCursorListProps {
  cursors: CursorData[];
  currentUserId: string;
  onUserClick?: (userId: string) => void;
  className?: string;
}

export function CollaboratorCursorList({
  cursors,
  currentUserId,
  onUserClick,
  className = ''
}: CollaboratorCursorListProps) {
  const activeCursors = cursors.filter(cursor => cursor.userId !== currentUserId);

  if (activeCursors.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <h4 className="text-sm font-medium text-muted-foreground">Active Cursors</h4>
      <div className="space-y-1">
        {activeCursors.map(cursor => (
          <div
            key={`${cursor.userId}-${cursor.sessionId}`}
            className={`flex items-center gap-2 p-2 rounded-md text-sm ${
              onUserClick ? 'cursor-pointer hover:bg-muted/50' : ''
            }`}
            onClick={() => onUserClick?.(cursor.userId)}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: getCursorColor(cursor.userId) }}
            />
            <Avatar className="h-5 w-5">
              {cursor.avatarUrl && (
                <img src={cursor.avatarUrl} alt={cursor.userName} />
              )}
            </Avatar>
            <span className="flex-1 truncate">{cursor.userName}</span>
            {cursor.currentPage && (
              <span className="text-xs text-muted-foreground truncate max-w-20">
                {cursor.currentPage.split('/').pop()}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Hook for managing cursor data
export function useCursorTracking(
  onCursorMove: (position: CursorPosition, currentPage?: string) => void,
  throttleMs = 50
) {
  const [currentPage, setCurrentPage] = useState<string>('');

  useEffect(() => {
    setCurrentPage(window.location.pathname);
  }, []);

  const handleCursorMove = React.useCallback((position: CursorPosition) => {
    onCursorMove(position, currentPage);
  }, [onCursorMove, currentPage]);

  return {
    currentPage,
    handleCursorMove
  };
}