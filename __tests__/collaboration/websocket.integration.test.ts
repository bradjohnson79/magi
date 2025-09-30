import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { WebSocketService } from '@/lib/services/websocket';
import { PresenceService } from '@/lib/services/presence';
import { CommentsService } from '@/lib/services/comments';

// Mock the services
jest.mock('@/lib/services/presence');
jest.mock('@/lib/services/comments');

describe('WebSocket Integration Tests', () => {
  let httpServer: any;
  let wsService: WebSocketService;
  let clientSocket: ClientSocket;
  let serverAddress: string;
  let mockPresenceService: jest.Mocked<PresenceService>;
  let mockCommentsService: jest.Mocked<CommentsService>;

  const mockUserId = 'user-123';
  const mockProjectId = 'project-456';
  const mockToken = 'mock-jwt-token';

  beforeEach(async () => {
    // Setup mock services
    mockPresenceService = {
      updatePresence: jest.fn(),
      getProjectCollaborators: jest.fn(),
      updateHeartbeat: jest.fn(),
      updateCursorPosition: jest.fn()
    } as any;

    mockCommentsService = {
      createComment: jest.fn(),
      updateComment: jest.fn(),
      resolveComment: jest.fn()
    } as any;

    (PresenceService.getInstance as jest.Mock).mockReturnValue(mockPresenceService);
    (CommentsService.getInstance as jest.Mock).mockReturnValue(mockCommentsService);

    // Create HTTP server and WebSocket service
    httpServer = createServer();
    wsService = WebSocketService.getInstance();

    // Mock token verification
    (wsService as any).verifyToken = jest.fn().mockResolvedValue(mockUserId);

    wsService.initialize(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        const port = (httpServer.address() as AddressInfo).port;
        serverAddress = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }

    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }

    jest.clearAllMocks();
  });

  const connectClient = async (token = mockToken): Promise<ClientSocket> => {
    return new Promise((resolve, reject) => {
      const socket = ClientIO(serverAddress, {
        auth: { token }
      });

      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);

      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  };

  describe('Connection and Authentication', () => {
    it('should allow authenticated connections', async () => {
      clientSocket = await connectClient();
      expect(clientSocket.connected).toBe(true);
    });

    it('should reject connections without auth token', async () => {
      await expect(connectClient('')).rejects.toThrow();
    });

    it('should generate session ID for connected users', async () => {
      clientSocket = await connectClient();
      expect(clientSocket.connected).toBe(true);
      // Session ID should be set in socket.data.sessionId
    });
  });

  describe('Project Collaboration', () => {
    beforeEach(async () => {
      clientSocket = await connectClient();

      mockPresenceService.getProjectCollaborators.mockResolvedValue([
        {
          userId: 'other-user',
          userName: 'Other User',
          userEmail: 'other@example.com',
          avatarUrl: 'https://avatar.com/other',
          status: 'online',
          lastSeen: new Date(),
          cursorPosition: null,
          currentPage: null,
          sessionId: 'other-session'
        }
      ]);
    });

    it('should handle joining a project', async () => {
      const projectJoinedPromise = new Promise((resolve) => {
        clientSocket.on('project-joined', resolve);
      });

      clientSocket.emit('join-project', { projectId: mockProjectId });

      const result = await projectJoinedPromise;

      expect(mockPresenceService.updatePresence).toHaveBeenCalledWith(
        mockUserId,
        mockProjectId,
        expect.objectContaining({
          status: 'online'
        })
      );

      expect(result).toEqual(
        expect.objectContaining({
          projectId: mockProjectId,
          collaborators: expect.any(Array)
        })
      );
    });

    it('should handle leaving a project', async () => {
      // First join the project
      clientSocket.emit('join-project', { projectId: mockProjectId });
      await new Promise(resolve => clientSocket.on('project-joined', resolve));

      // Then leave
      clientSocket.emit('leave-project', { projectId: mockProjectId });

      expect(mockPresenceService.updatePresence).toHaveBeenCalledWith(
        mockUserId,
        mockProjectId,
        expect.objectContaining({
          status: 'offline'
        })
      );
    });

    it('should broadcast presence updates to other users', async () => {
      // Create a second client
      const client2 = await connectClient();

      const presenceUpdatePromise = new Promise((resolve) => {
        client2.on('presence-update', resolve);
      });

      // First client joins project
      clientSocket.emit('join-project', { projectId: mockProjectId });
      await new Promise(resolve => clientSocket.on('project-joined', resolve));

      // Second client joins same project
      client2.emit('join-project', { projectId: mockProjectId });
      await new Promise(resolve => client2.on('project-joined', resolve));

      // First client updates presence
      clientSocket.emit('presence-update', {
        status: 'away',
        currentPage: '/editor'
      });

      const presenceUpdate = await presenceUpdatePromise;

      expect(presenceUpdate).toEqual(
        expect.objectContaining({
          userId: mockUserId,
          status: 'away',
          currentPage: '/editor'
        })
      );

      client2.disconnect();
    });
  });

  describe('Real-time Cursor Tracking', () => {
    beforeEach(async () => {
      clientSocket = await connectClient();
      clientSocket.emit('join-project', { projectId: mockProjectId });
      await new Promise(resolve => clientSocket.on('project-joined', resolve));
    });

    it('should broadcast cursor movements', async () => {
      const client2 = await connectClient();
      client2.emit('join-project', { projectId: mockProjectId });
      await new Promise(resolve => client2.on('project-joined', resolve));

      const cursorMovePromise = new Promise((resolve) => {
        client2.on('cursor-move', resolve);
      });

      const cursorPosition = { x: 100, y: 200 };
      clientSocket.emit('cursor-move', {
        position: cursorPosition,
        currentPage: '/editor'
      });

      const cursorUpdate = await cursorMovePromise;

      expect(cursorUpdate).toEqual(
        expect.objectContaining({
          userId: mockUserId,
          position: cursorPosition,
          currentPage: '/editor'
        })
      );

      expect(mockPresenceService.updatePresence).toHaveBeenCalledWith(
        mockUserId,
        mockProjectId,
        expect.objectContaining({
          cursorPosition,
          currentPage: '/editor'
        })
      );

      client2.disconnect();
    });

    it('should update presence with cursor position', async () => {
      const cursorPosition = { x: 300, y: 400 };

      clientSocket.emit('cursor-move', {
        position: cursorPosition,
        currentPage: '/preview'
      });

      await new Promise(resolve => setTimeout(resolve, 100)); // Give time for processing

      expect(mockPresenceService.updatePresence).toHaveBeenCalledWith(
        mockUserId,
        mockProjectId,
        expect.objectContaining({
          cursorPosition,
          currentPage: '/preview'
        })
      );
    });
  });

  describe('Comment System', () => {
    beforeEach(async () => {
      clientSocket = await connectClient();
      clientSocket.emit('join-project', { projectId: mockProjectId });
      await new Promise(resolve => clientSocket.on('project-joined', resolve));

      mockCommentsService.createComment.mockResolvedValue({
        id: 'comment-123',
        projectId: mockProjectId,
        parentId: null,
        authorId: mockUserId,
        authorName: 'Test User',
        authorAvatar: null,
        content: 'Test comment',
        contentHtml: 'Test comment',
        mentions: [],
        position: null,
        resolved: false,
        resolvedBy: null,
        resolvedAt: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        replyCount: 0
      });
    });

    it('should create and broadcast comments', async () => {
      const client2 = await connectClient();
      client2.emit('join-project', { projectId: mockProjectId });
      await new Promise(resolve => client2.on('project-joined', resolve));

      const commentCreatePromise = new Promise((resolve) => {
        client2.on('comment-create', resolve);
      });

      clientSocket.emit('comment-create', {
        content: 'Test comment',
        position: { x: 100, y: 200 }
      });

      const commentEvent = await commentCreatePromise;

      expect(mockCommentsService.createComment).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          projectId: mockProjectId,
          content: 'Test comment',
          position: { x: 100, y: 200 }
        })
      );

      expect(commentEvent).toEqual(
        expect.objectContaining({
          comment: expect.objectContaining({
            content: 'Test comment'
          }),
          authorId: mockUserId
        })
      );

      client2.disconnect();
    });

    it('should update and broadcast comment changes', async () => {
      const commentId = 'comment-123';
      const client2 = await connectClient();
      client2.emit('join-project', { projectId: mockProjectId });

      mockCommentsService.updateComment.mockResolvedValue({
        id: commentId,
        projectId: mockProjectId,
        parentId: null,
        authorId: mockUserId,
        authorName: 'Test User',
        authorAvatar: null,
        content: 'Updated comment',
        contentHtml: 'Updated comment',
        mentions: [],
        position: null,
        resolved: false,
        resolvedBy: null,
        resolvedAt: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        replyCount: 0
      });

      const commentUpdatePromise = new Promise((resolve) => {
        client2.on('comment-update', resolve);
      });

      clientSocket.emit('comment-update', {
        commentId,
        updates: { content: 'Updated comment' }
      });

      const updateEvent = await commentUpdatePromise;

      expect(mockCommentsService.updateComment).toHaveBeenCalledWith(
        commentId,
        mockUserId,
        { content: 'Updated comment' }
      );

      expect(updateEvent).toEqual(
        expect.objectContaining({
          commentId,
          updatedBy: mockUserId
        })
      );

      client2.disconnect();
    });

    it('should resolve and broadcast comment resolution', async () => {
      const commentId = 'comment-123';

      mockCommentsService.resolveComment.mockResolvedValue({
        id: commentId,
        projectId: mockProjectId,
        parentId: null,
        authorId: mockUserId,
        authorName: 'Test User',
        authorAvatar: null,
        content: 'Test comment',
        contentHtml: 'Test comment',
        mentions: [],
        position: null,
        resolved: true,
        resolvedBy: mockUserId,
        resolvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        replyCount: 0
      });

      const client2 = await connectClient();
      client2.emit('join-project', { projectId: mockProjectId });

      const commentResolvePromise = new Promise((resolve) => {
        client2.on('comment-resolve', resolve);
      });

      clientSocket.emit('comment-resolve', { commentId });

      const resolveEvent = await commentResolvePromise;

      expect(mockCommentsService.resolveComment).toHaveBeenCalledWith(
        commentId,
        mockUserId
      );

      expect(resolveEvent).toEqual(
        expect.objectContaining({
          commentId,
          resolved: true,
          resolvedBy: mockUserId
        })
      );

      client2.disconnect();
    });
  });

  describe('Heartbeat and Presence Management', () => {
    beforeEach(async () => {
      clientSocket = await connectClient();
      clientSocket.emit('join-project', { projectId: mockProjectId });
      await new Promise(resolve => clientSocket.on('project-joined', resolve));
    });

    it('should handle heartbeat updates', async () => {
      clientSocket.emit('heartbeat');

      await new Promise(resolve => setTimeout(resolve, 100)); // Give time for processing

      expect(mockPresenceService.updateHeartbeat).toHaveBeenCalledWith(
        mockUserId,
        mockProjectId,
        expect.any(String) // session ID
      );
    });

    it('should handle disconnection and update presence', async () => {
      // Disconnect the client
      clientSocket.disconnect();

      await new Promise(resolve => setTimeout(resolve, 100)); // Give time for processing

      expect(mockPresenceService.updatePresence).toHaveBeenLastCalledWith(
        mockUserId,
        mockProjectId,
        expect.objectContaining({
          status: 'offline'
        })
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      clientSocket = await connectClient();
    });

    it('should handle errors gracefully', async () => {
      const errorPromise = new Promise((resolve) => {
        clientSocket.on('error', resolve);
      });

      // Simulate service error
      mockPresenceService.updatePresence.mockRejectedValue(new Error('Database error'));

      clientSocket.emit('join-project', { projectId: mockProjectId });

      const error = await errorPromise;
      expect(error).toEqual(
        expect.objectContaining({
          message: 'Failed to join project'
        })
      );
    });

    it('should handle comment creation errors', async () => {
      clientSocket.emit('join-project', { projectId: mockProjectId });
      await new Promise(resolve => clientSocket.on('project-joined', resolve));

      const errorPromise = new Promise((resolve) => {
        clientSocket.on('error', resolve);
      });

      mockCommentsService.createComment.mockRejectedValue(new Error('Comment creation failed'));

      clientSocket.emit('comment-create', {
        content: 'This will fail'
      });

      const error = await errorPromise;
      expect(error).toEqual(
        expect.objectContaining({
          message: 'Failed to create comment'
        })
      );
    });
  });
});