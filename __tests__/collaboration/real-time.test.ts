/**
 * Real-time Collaboration Tests
 *
 * Tests Yjs integration, WebSocket connections, and real-time file synchronization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YjsCollaborationProvider } from '@/services/collaboration/yjs-provider';
import * as Y from 'yjs';

// Mock WebSocket and WebRTC providers
vi.mock('y-websocket', () => ({
  WebsocketProvider: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn(),
    awareness: {
      on: vi.fn(),
      off: vi.fn(),
      setLocalStateField: vi.fn(),
      getStates: vi.fn().mockReturnValue(new Map()),
    },
    synced: true,
  })),
}));

vi.mock('y-webrtc', () => ({
  WebrtcProvider: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn(),
    awareness: {
      on: vi.fn(),
      off: vi.fn(),
      setLocalStateField: vi.fn(),
      getStates: vi.fn().mockReturnValue(new Map()),
    },
  })),
}));

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    off: vi.fn(),
    clearData: vi.fn(),
    destroy: vi.fn(),
  })),
}));

// Mock activity logger
vi.mock('@/services/activity/logger', () => ({
  activityLogger: {
    logActivity: vi.fn(),
  },
}));

describe('Real-time Collaboration', () => {
  let provider: YjsCollaborationProvider;
  let doc: Y.Doc;

  beforeEach(() => {
    doc = new Y.Doc();
    provider = new YjsCollaborationProvider('test-room', 'user-1', {
      websocketUrl: 'ws://localhost:3001',
      enableWebRTC: true,
      enablePersistence: true,
    });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await provider.disconnect();
    doc.destroy();
    vi.restoreAllMocks();
  });

  describe('Provider Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(provider).toBeDefined();
      expect(provider.getRoomId()).toBe('test-room');
      expect(provider.getUserId()).toBe('user-1');
    });

    it('should setup WebSocket provider when enabled', async () => {
      const { WebsocketProvider } = await import('y-websocket');

      await provider.connect();

      expect(WebsocketProvider).toHaveBeenCalledWith(
        'ws://localhost:3001',
        'test-room',
        expect.any(Y.Doc)
      );
    });

    it('should setup WebRTC provider when enabled', async () => {
      const { WebrtcProvider } = await import('y-webrtc');

      await provider.connect();

      expect(WebrtcProvider).toHaveBeenCalledWith(
        'test-room',
        expect.any(Y.Doc)
      );
    });

    it('should setup IndexedDB persistence when enabled', async () => {
      const { IndexeddbPersistence } = await import('y-indexeddb');

      await provider.connect();

      expect(IndexeddbPersistence).toHaveBeenCalledWith(
        'test-room',
        expect.any(Y.Doc)
      );
    });
  });

  describe('File Synchronization', () => {
    beforeEach(async () => {
      await provider.connect();
    });

    it('should sync file content between collaborators', async () => {
      const filePath = '/src/components/Button.tsx';
      const content = 'export default function Button() { return <button>Click me</button>; }';

      // Simulate file update from first user
      await provider.updateFile(filePath, content, {
        userId: 'user-1',
        timestamp: Date.now(),
      });

      const syncedContent = provider.getFileContent(filePath);
      expect(syncedContent).toBe(content);
    });

    it('should handle concurrent edits with CRDT resolution', async () => {
      const filePath = '/src/utils/helpers.ts';
      const initialContent = 'export function helper() {}';

      // Initialize file
      await provider.updateFile(filePath, initialContent, {
        userId: 'user-1',
        timestamp: Date.now(),
      });

      // Simulate concurrent edits
      const edit1 = 'export function helper() {\n  return "hello";\n}';
      const edit2 = 'export function helperFunction() {}';

      // Both users edit simultaneously
      await Promise.all([
        provider.updateFile(filePath, edit1, {
          userId: 'user-1',
          timestamp: Date.now(),
        }),
        provider.updateFile(filePath, edit2, {
          userId: 'user-2',
          timestamp: Date.now() + 1,
        }),
      ]);

      const finalContent = provider.getFileContent(filePath);

      // Content should be deterministically merged by Yjs
      expect(finalContent).toBeDefined();
      expect(typeof finalContent).toBe('string');
    });

    it('should track file creation and deletion', async () => {
      const filePath = '/src/new-component.tsx';
      const content = 'export default function NewComponent() {}';

      // Create new file
      await provider.createFile(filePath, content, 'user-1');

      expect(provider.fileExists(filePath)).toBe(true);
      expect(provider.getFileContent(filePath)).toBe(content);

      // Delete file
      await provider.deleteFile(filePath, 'user-1');

      expect(provider.fileExists(filePath)).toBe(false);
    });

    it('should maintain file history for undo/redo', async () => {
      const filePath = '/src/history-test.ts';

      // Multiple edits
      await provider.updateFile(filePath, 'version 1', { userId: 'user-1', timestamp: 1 });
      await provider.updateFile(filePath, 'version 2', { userId: 'user-1', timestamp: 2 });
      await provider.updateFile(filePath, 'version 3', { userId: 'user-1', timestamp: 3 });

      const history = provider.getFileHistory(filePath);
      expect(history).toHaveLength(3);
      expect(history[0].content).toBe('version 1');
      expect(history[2].content).toBe('version 3');
    });
  });

  describe('User Awareness', () => {
    beforeEach(async () => {
      await provider.connect();
    });

    it('should track active users in the room', () => {
      const activeUsers = provider.getActiveUsers();

      // Should include current user
      expect(activeUsers.has('user-1')).toBe(true);
    });

    it('should update user cursor position', () => {
      const cursorData = {
        file: '/src/components/App.tsx',
        line: 42,
        column: 15,
        selection: { start: { line: 42, column: 15 }, end: { line: 42, column: 25 } },
      };

      provider.updateCursor(cursorData);

      const userCursor = provider.getUserCursor('user-1');
      expect(userCursor).toMatchObject(cursorData);
    });

    it('should notify of user presence changes', (done) => {
      const mockCallback = vi.fn();
      provider.onUserJoined(mockCallback);

      // Simulate user joining
      provider.simulateUserJoin('user-2', {
        name: 'Test User 2',
        avatar: 'https://example.com/avatar2.jpg',
      });

      setTimeout(() => {
        expect(mockCallback).toHaveBeenCalledWith('user-2', expect.any(Object));
        done();
      }, 100);
    });

    it('should handle user leaving gracefully', (done) => {
      const mockCallback = vi.fn();
      provider.onUserLeft(mockCallback);

      // First simulate user joining
      provider.simulateUserJoin('user-3', { name: 'Test User 3' });

      // Then simulate user leaving
      provider.simulateUserLeave('user-3');

      setTimeout(() => {
        expect(mockCallback).toHaveBeenCalledWith('user-3');
        expect(provider.getActiveUsers().has('user-3')).toBe(false);
        done();
      }, 100);
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket connection failures', async () => {
      const provider = new YjsCollaborationProvider('test-room', 'user-1', {
        websocketUrl: 'ws://invalid-url:9999',
        enableWebRTC: false,
        enablePersistence: false,
      });

      const errorCallback = vi.fn();
      provider.onError(errorCallback);

      await provider.connect();

      // Simulate connection error
      provider.simulateConnectionError(new Error('WebSocket connection failed'));

      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'WebSocket connection failed',
        })
      );
    });

    it('should fallback to WebRTC when WebSocket fails', async () => {
      const provider = new YjsCollaborationProvider('test-room', 'user-1', {
        websocketUrl: 'ws://invalid-url:9999',
        enableWebRTC: true,
        enablePersistence: false,
      });

      await provider.connect();

      // Simulate WebSocket failure
      provider.simulateConnectionError(new Error('WebSocket failed'));

      // Should still be connected via WebRTC
      expect(provider.isConnected()).toBe(true);
    });

    it('should handle document conflicts gracefully', async () => {
      await provider.connect();

      const filePath = '/src/conflict-test.ts';

      // Simulate conflicting operations
      const operations = [
        { type: 'insert', position: 0, content: 'A' },
        { type: 'insert', position: 0, content: 'B' },
        { type: 'delete', position: 1, length: 1 },
      ];

      // Apply operations concurrently
      await Promise.all(
        operations.map(op => provider.applyOperation(filePath, op, 'user-1'))
      );

      // Should resolve without throwing
      const content = provider.getFileContent(filePath);
      expect(typeof content).toBe('string');
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      await provider.connect();
    });

    it('should batch small edits for efficiency', async () => {
      const filePath = '/src/performance-test.ts';
      const baseContent = 'function test() {\n  // Initial content\n}';

      await provider.updateFile(filePath, baseContent, {
        userId: 'user-1',
        timestamp: Date.now(),
      });

      // Make many small edits
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        await provider.applyOperation(filePath, {
          type: 'insert',
          position: 20 + i,
          content: 'x',
        }, 'user-1');
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (batching should help)
      expect(duration).toBeLessThan(1000); // 1 second
    });

    it('should compress large documents efficiently', async () => {
      const filePath = '/src/large-file.ts';

      // Create large content
      const largeContent = 'x'.repeat(50000);

      await provider.updateFile(filePath, largeContent, {
        userId: 'user-1',
        timestamp: Date.now(),
      });

      // Should handle large files without issues
      const retrievedContent = provider.getFileContent(filePath);
      expect(retrievedContent).toBe(largeContent);
    });
  });

  describe('Cleanup', () => {
    it('should properly disconnect and cleanup resources', async () => {
      await provider.connect();

      const isConnectedBefore = provider.isConnected();
      expect(isConnectedBefore).toBe(true);

      await provider.disconnect();

      const isConnectedAfter = provider.isConnected();
      expect(isConnectedAfter).toBe(false);
    });

    it('should clear local data when requested', async () => {
      await provider.connect();

      const filePath = '/src/cleanup-test.ts';
      await provider.updateFile(filePath, 'test content', {
        userId: 'user-1',
        timestamp: Date.now(),
      });

      expect(provider.fileExists(filePath)).toBe(true);

      await provider.clearLocalData();

      // Local data should be cleared
      expect(provider.getFileContent(filePath)).toBe('');
    });
  });
});