/**
 * React Hooks for Real-time Collaboration
 *
 * Provides React hooks for integrating Yjs collaboration into components.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  YjsCollaborationProvider,
  CollaborationConfig,
  FileChange,
  Cursor,
  collaborationManager
} from '@/services/collaboration/yjs-provider';

export interface UseCollaborationOptions extends Omit<CollaborationConfig, 'userId' | 'username'> {
  enabled?: boolean;
}

export interface CollaborationState {
  provider: YjsCollaborationProvider | null;
  connected: boolean;
  connectedUsers: string[];
  cursors: Cursor[];
  activity: any[];
  files: Record<string, string>;
}

/**
 * Main collaboration hook
 */
export function useCollaboration(
  userId: string,
  username: string,
  options: UseCollaborationOptions
): CollaborationState & {
  updateFile: (filePath: string, content: string) => Promise<void>;
  deleteFile: (filePath: string) => Promise<void>;
  renameFile: (oldPath: string, newPath: string) => Promise<void>;
  updateCursor: (cursor: Omit<Cursor, 'userId' | 'username'>) => void;
  onFileChange: (callback: (change: FileChange) => void) => () => void;
  onCursorChange: (callback: (cursor: Cursor) => void) => () => void;
  onActivity: (callback: (activity: any) => void) => () => void;
} {
  const [state, setState] = useState<CollaborationState>({
    provider: null,
    connected: false,
    connectedUsers: [],
    cursors: [],
    activity: [],
    files: {},
  });

  const callbacksRef = useRef<{
    fileChange: Set<(change: FileChange) => void>;
    cursorChange: Set<(cursor: Cursor) => void>;
    activity: Set<(activity: any) => void>;
  }>({
    fileChange: new Set(),
    cursorChange: new Set(),
    activity: new Set(),
  });

  // Initialize provider
  useEffect(() => {
    if (!options.enabled || !userId || !options.projectId) {
      return;
    }

    const config: CollaborationConfig = {
      ...options,
      userId,
      username,
      websocketUrl: process.env.NEXT_PUBLIC_COLLABORATION_WS_URL || 'ws://localhost:3001',
      enableWebRTC: true,
      enablePersistence: true,
    };

    const provider = collaborationManager.getProvider(config);

    // Setup event listeners
    const handleConnection = (event: { connected: boolean }) => {
      setState(prev => ({
        ...prev,
        connected: event.connected,
        connectedUsers: provider.getConnectedUsers(),
      }));
    };

    const handleFileChange = (change: FileChange) => {
      setState(prev => ({
        ...prev,
        files: provider.getAllFiles(),
      }));

      callbacksRef.current.fileChange.forEach(callback => {
        try {
          callback(change);
        } catch (error) {
          console.error('Error in file change callback:', error);
        }
      });
    };

    const handleCursorChange = (cursor: Cursor) => {
      setState(prev => ({
        ...prev,
        cursors: provider.getCursors(),
        connectedUsers: provider.getConnectedUsers(),
      }));

      callbacksRef.current.cursorChange.forEach(callback => {
        try {
          callback(cursor);
        } catch (error) {
          console.error('Error in cursor change callback:', error);
        }
      });
    };

    const handleActivity = (activity: any) => {
      setState(prev => ({
        ...prev,
        activity: provider.getActivity(50),
      }));

      callbacksRef.current.activity.forEach(callback => {
        try {
          callback(activity);
        } catch (error) {
          console.error('Error in activity callback:', error);
        }
      });
    };

    provider.on('connection', handleConnection);
    provider.on('fileChange', handleFileChange);
    provider.on('cursorChange', handleCursorChange);
    provider.on('activity', handleActivity);

    // Initialize state
    setState(prev => ({
      ...prev,
      provider,
      files: provider.getAllFiles(),
      cursors: provider.getCursors(),
      activity: provider.getActivity(50),
      connectedUsers: provider.getConnectedUsers(),
    }));

    return () => {
      provider.off('connection', handleConnection);
      provider.off('fileChange', handleFileChange);
      provider.off('cursorChange', handleCursorChange);
      provider.off('activity', handleActivity);
    };
  }, [userId, username, options.enabled, options.projectId, options.roomName]);

  // File operations
  const updateFile = useCallback(async (filePath: string, content: string) => {
    if (state.provider) {
      await state.provider.updateFile(filePath, content);
    }
  }, [state.provider]);

  const deleteFile = useCallback(async (filePath: string) => {
    if (state.provider) {
      await state.provider.deleteFile(filePath);
    }
  }, [state.provider]);

  const renameFile = useCallback(async (oldPath: string, newPath: string) => {
    if (state.provider) {
      await state.provider.renameFile(oldPath, newPath);
    }
  }, [state.provider]);

  const updateCursor = useCallback((cursor: Omit<Cursor, 'userId' | 'username'>) => {
    if (state.provider) {
      state.provider.updateCursor(cursor);
    }
  }, [state.provider]);

  // Event listeners
  const onFileChange = useCallback((callback: (change: FileChange) => void) => {
    callbacksRef.current.fileChange.add(callback);
    return () => callbacksRef.current.fileChange.delete(callback);
  }, []);

  const onCursorChange = useCallback((callback: (cursor: Cursor) => void) => {
    callbacksRef.current.cursorChange.add(callback);
    return () => callbacksRef.current.cursorChange.delete(callback);
  }, []);

  const onActivity = useCallback((callback: (activity: any) => void) => {
    callbacksRef.current.activity.add(callback);
    return () => callbacksRef.current.activity.delete(callback);
  }, []);

  return {
    ...state,
    updateFile,
    deleteFile,
    renameFile,
    updateCursor,
    onFileChange,
    onCursorChange,
    onActivity,
  };
}

/**
 * Hook for specific file collaboration
 */
export function useFileCollaboration(
  userId: string,
  username: string,
  projectId: string,
  filePath: string,
  options: { enabled?: boolean } = {}
) {
  const collaboration = useCollaboration(userId, username, {
    projectId,
    roomName: 'editor',
    enabled: options.enabled,
  });

  const [fileContent, setFileContent] = useState<string>('');
  const [cursors, setCursors] = useState<Cursor[]>([]);

  // Get file content
  useEffect(() => {
    if (collaboration.provider && filePath) {
      const content = collaboration.provider.getFile(filePath) || '';
      setFileContent(content);
    }
  }, [collaboration.provider, filePath, collaboration.files]);

  // Filter cursors for current file
  useEffect(() => {
    const fileCursors = collaboration.cursors.filter(cursor =>
      cursor.position && 'filePath' in cursor.position &&
      (cursor.position as any).filePath === filePath
    );
    setCursors(fileCursors);
  }, [collaboration.cursors, filePath]);

  const updateFileContent = useCallback(async (content: string) => {
    if (filePath) {
      await collaboration.updateFile(filePath, content);
      setFileContent(content);
    }
  }, [collaboration.updateFile, filePath]);

  const updateFileCursor = useCallback((position: { line: number; column: number }, selection?: any) => {
    collaboration.updateCursor({
      position: { ...position, filePath } as any,
      selection,
      color: `hsl(${userId.charCodeAt(0) * 137.5 % 360}, 70%, 50%)`,
    });
  }, [collaboration.updateCursor, filePath, userId]);

  return {
    content: fileContent,
    cursors,
    connected: collaboration.connected,
    connectedUsers: collaboration.connectedUsers,
    updateContent: updateFileContent,
    updateCursor: updateFileCursor,
    onFileChange: collaboration.onFileChange,
  };
}

/**
 * Hook for real-time cursors display
 */
export function useCursors(
  userId: string,
  username: string,
  projectId: string,
  filePath?: string
) {
  const [cursors, setCursors] = useState<Cursor[]>([]);

  const collaboration = useCollaboration(userId, username, {
    projectId,
    roomName: 'cursors',
    enabled: true,
  });

  useEffect(() => {
    const filteredCursors = filePath
      ? collaboration.cursors.filter(cursor =>
          'filePath' in cursor.position &&
          (cursor.position as any).filePath === filePath
        )
      : collaboration.cursors;

    setCursors(filteredCursors);
  }, [collaboration.cursors, filePath]);

  const updateCursor = useCallback((position: any, selection?: any) => {
    collaboration.updateCursor({
      position: filePath ? { ...position, filePath } : position,
      selection,
      color: `hsl(${userId.charCodeAt(0) * 137.5 % 360}, 70%, 50%)`,
    });
  }, [collaboration.updateCursor, filePath, userId]);

  return {
    cursors,
    updateCursor,
    connected: collaboration.connected,
  };
}

/**
 * Hook for activity feed
 */
export function useActivityFeed(
  userId: string,
  username: string,
  projectId: string,
  limit = 50
) {
  const collaboration = useCollaboration(userId, username, {
    projectId,
    roomName: 'activity',
    enabled: true,
  });

  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    if (collaboration.provider) {
      const recentActivity = collaboration.provider.getActivity(limit);
      setActivities(recentActivity);
    }
  }, [collaboration.activity, collaboration.provider, limit]);

  return {
    activities,
    connected: collaboration.connected,
    onActivity: collaboration.onActivity,
  };
}