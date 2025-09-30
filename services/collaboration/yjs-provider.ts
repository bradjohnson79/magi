/**
 * Yjs WebSocket Provider for Real-time Collaboration
 *
 * Handles real-time synchronization of documents across multiple clients
 * using Yjs CRDT with WebSocket backend.
 */

import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

export interface CollaborationConfig {
  projectId: string;
  userId: string;
  username: string;
  roomName: string;
  websocketUrl?: string;
  enableWebRTC?: boolean;
  enablePersistence?: boolean;
}

export interface FileChange {
  filePath: string;
  content: string;
  operation: 'create' | 'update' | 'delete' | 'rename';
  timestamp: number;
  userId: string;
  username: string;
}

export interface Cursor {
  userId: string;
  username: string;
  position: {
    line: number;
    column: number;
  };
  selection?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  color: string;
}

export class YjsCollaborationProvider {
  private doc: Y.Doc;
  private wsProvider?: WebsocketProvider;
  private webrtcProvider?: WebrtcProvider;
  private persistence?: IndexeddbPersistence;
  private filesMap: Y.Map<string>;
  private cursorsMap: Y.Map<Cursor>;
  private activityArray: Y.Array<any>;
  private config: CollaborationConfig;
  private connected = false;
  private listeners: Map<string, Set<Function>> = new Map();

  constructor(config: CollaborationConfig) {
    this.config = config;
    this.doc = new Y.Doc();

    // Initialize shared data structures
    this.filesMap = this.doc.getMap('files');
    this.cursorsMap = this.doc.getMap('cursors');
    this.activityArray = this.doc.getArray('activity');

    this.setupProviders();
    this.setupEventListeners();
  }

  /**
   * Setup collaboration providers
   */
  private setupProviders(): void {
    const roomName = `${this.config.projectId}:${this.config.roomName}`;

    // WebSocket provider for server-based sync
    if (this.config.websocketUrl) {
      this.wsProvider = new WebsocketProvider(
        this.config.websocketUrl,
        roomName,
        this.doc,
        {
          params: {
            userId: this.config.userId,
            projectId: this.config.projectId,
          },
        }
      );

      this.wsProvider.on('status', (event: any) => {
        this.connected = event.status === 'connected';
        this.emit('connection', { connected: this.connected });
      });
    }

    // WebRTC provider for P2P sync (fallback)
    if (this.config.enableWebRTC) {
      this.webrtcProvider = new WebrtcProvider(roomName, this.doc, {
        signaling: ['wss://signaling.yjs.dev'],
      });
    }

    // IndexedDB persistence for offline support
    if (this.config.enablePersistence) {
      this.persistence = new IndexeddbPersistence(roomName, this.doc);
    }
  }

  /**
   * Setup event listeners for document changes
   */
  private setupEventListeners(): void {
    // File changes
    this.filesMap.observe((event) => {
      event.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
          const content = this.filesMap.get(key);
          this.emit('fileChange', {
            filePath: key,
            content,
            operation: change.action === 'add' ? 'create' : 'update',
            timestamp: Date.now(),
            userId: this.config.userId,
            username: this.config.username,
          } as FileChange);
        } else if (change.action === 'delete') {
          this.emit('fileChange', {
            filePath: key,
            content: '',
            operation: 'delete',
            timestamp: Date.now(),
            userId: this.config.userId,
            username: this.config.username,
          } as FileChange);
        }
      });
    });

    // Cursor changes
    this.cursorsMap.observe((event) => {
      event.changes.keys.forEach((change, userId) => {
        if (userId !== this.config.userId) {
          const cursor = this.cursorsMap.get(userId);
          if (cursor) {
            this.emit('cursorChange', cursor);
          }
        }
      });
    });

    // Activity log
    this.activityArray.observe((event) => {
      event.changes.added.forEach((item) => {
        this.emit('activity', item.content);
      });
    });
  }

  /**
   * Update file content
   */
  async updateFile(filePath: string, content: string): Promise<void> {
    return withSpan('collaboration.update_file', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'collab_file_update',
        [SPAN_ATTRIBUTES.USER_ID]: this.config.userId,
        [SPAN_ATTRIBUTES.PROJECT_ID]: this.config.projectId,
        'file.path': filePath,
        'file.size': content.length,
      });

      this.filesMap.set(filePath, content);

      // Log activity
      this.logActivity({
        action: 'file.updated',
        filePath,
        userId: this.config.userId,
        username: this.config.username,
        timestamp: Date.now(),
        metadata: {
          size: content.length,
        },
      });
    });
  }

  /**
   * Get file content
   */
  getFile(filePath: string): string | undefined {
    return this.filesMap.get(filePath);
  }

  /**
   * Delete file
   */
  async deleteFile(filePath: string): Promise<void> {
    return withSpan('collaboration.delete_file', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'collab_file_delete',
        [SPAN_ATTRIBUTES.USER_ID]: this.config.userId,
        [SPAN_ATTRIBUTES.PROJECT_ID]: this.config.projectId,
        'file.path': filePath,
      });

      this.filesMap.delete(filePath);

      this.logActivity({
        action: 'file.deleted',
        filePath,
        userId: this.config.userId,
        username: this.config.username,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Rename file
   */
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    return withSpan('collaboration.rename_file', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'collab_file_rename',
        [SPAN_ATTRIBUTES.USER_ID]: this.config.userId,
        [SPAN_ATTRIBUTES.PROJECT_ID]: this.config.projectId,
        'file.old_path': oldPath,
        'file.new_path': newPath,
      });

      const content = this.filesMap.get(oldPath);
      if (content !== undefined) {
        this.filesMap.set(newPath, content);
        this.filesMap.delete(oldPath);

        this.logActivity({
          action: 'file.renamed',
          filePath: newPath,
          userId: this.config.userId,
          username: this.config.username,
          timestamp: Date.now(),
          metadata: {
            oldPath,
            newPath,
          },
        });
      }
    });
  }

  /**
   * Update cursor position
   */
  updateCursor(cursor: Omit<Cursor, 'userId' | 'username'>): void {
    this.cursorsMap.set(this.config.userId, {
      ...cursor,
      userId: this.config.userId,
      username: this.config.username,
    });
  }

  /**
   * Get all cursors
   */
  getCursors(): Cursor[] {
    const cursors: Cursor[] = [];
    this.cursorsMap.forEach((cursor, userId) => {
      if (userId !== this.config.userId) {
        cursors.push(cursor);
      }
    });
    return cursors;
  }

  /**
   * Get all files
   */
  getAllFiles(): Record<string, string> {
    const files: Record<string, string> = {};
    this.filesMap.forEach((content, filePath) => {
      files[filePath] = content;
    });
    return files;
  }

  /**
   * Get activity log
   */
  getActivity(limit = 50): any[] {
    const activities = this.activityArray.toArray();
    return activities.slice(-limit);
  }

  /**
   * Create text binding for Monaco Editor
   */
  createTextBinding(filePath: string): Y.Text {
    const fileText = this.doc.getText(filePath);
    return fileText;
  }

  /**
   * Apply diff/patch to file
   */
  async applyDiff(filePath: string, diff: any): Promise<void> {
    return withSpan('collaboration.apply_diff', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'collab_apply_diff',
        [SPAN_ATTRIBUTES.USER_ID]: this.config.userId,
        [SPAN_ATTRIBUTES.PROJECT_ID]: this.config.projectId,
        'file.path': filePath,
      });

      const fileText = this.doc.getText(filePath);

      // Apply diff operations
      this.doc.transact(() => {
        diff.ops?.forEach((op: any) => {
          if (op.retain) {
            // Skip characters
          } else if (op.insert) {
            fileText.insert(op.index || 0, op.insert);
          } else if (op.delete) {
            fileText.delete(op.index || 0, op.delete);
          }
        });
      });

      this.logActivity({
        action: 'diff.applied',
        filePath,
        userId: this.config.userId,
        username: this.config.username,
        timestamp: Date.now(),
        metadata: {
          operations: diff.ops?.length || 0,
        },
      });
    });
  }

  /**
   * Get connected users
   */
  getConnectedUsers(): string[] {
    const users = new Set<string>();
    this.cursorsMap.forEach((cursor) => {
      users.add(cursor.userId);
    });
    return Array.from(users);
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Event system
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in collaboration event callback:', error);
      }
    });
  }

  /**
   * Log activity
   */
  private logActivity(activity: any): void {
    this.activityArray.push([activity]);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.wsProvider?.destroy();
    this.webrtcProvider?.destroy();
    this.persistence?.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }

  /**
   * Export document state
   */
  exportState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /**
   * Import document state
   */
  importState(state: Uint8Array): void {
    Y.applyUpdate(this.doc, state);
  }
}

/**
 * Collaboration manager for multiple projects
 */
export class CollaborationManager {
  private providers = new Map<string, YjsCollaborationProvider>();

  /**
   * Create or get collaboration provider for project
   */
  getProvider(config: CollaborationConfig): YjsCollaborationProvider {
    const key = `${config.projectId}:${config.roomName}`;

    if (!this.providers.has(key)) {
      const provider = new YjsCollaborationProvider(config);
      this.providers.set(key, provider);
    }

    return this.providers.get(key)!;
  }

  /**
   * Remove provider
   */
  removeProvider(projectId: string, roomName: string): void {
    const key = `${projectId}:${roomName}`;
    const provider = this.providers.get(key);

    if (provider) {
      provider.destroy();
      this.providers.delete(key);
    }
  }

  /**
   * Cleanup all providers
   */
  cleanup(): void {
    this.providers.forEach(provider => provider.destroy());
    this.providers.clear();
  }
}

export const collaborationManager = new CollaborationManager();