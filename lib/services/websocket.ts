import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import {
  RealTimeEvent,
  RealTimeEventType,
  WebSocketMessage,
  PresenceUpdateData,
  CursorMoveData,
  CollaborationRoom
} from '@/lib/types/collaboration';
import { PresenceService } from '@/lib/services/presence';
import { CommentsService } from '@/lib/services/comments';
import { NotificationService } from '@/lib/services/notifications';

export class WebSocketService {
  private static instance: WebSocketService;
  private io: SocketIOServer | null = null;
  private rooms: Map<string, CollaborationRoom> = new Map();
  private presenceService: PresenceService;
  private commentsService: CommentsService;
  private notificationService: NotificationService;

  constructor() {
    this.presenceService = PresenceService.getInstance();
    this.commentsService = CommentsService.getInstance();
    this.notificationService = NotificationService.getInstance();
  }

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  initialize(server: HTTPServer): void {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupEventHandlers();
    this.startCleanupInterval();

    console.log('WebSocket server initialized');
  }

  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      console.log(`Socket connected: ${socket.id}`);

      // Authentication middleware
      socket.use(async (packet, next) => {
        try {
          const token = socket.handshake.auth?.token;
          if (!token) {
            return next(new Error('Authentication required'));
          }

          // Verify token and get user info
          const userId = await this.verifyToken(token);
          socket.data.userId = userId;
          socket.data.sessionId = this.generateSessionId();

          next();
        } catch (error) {
          next(new Error('Authentication failed'));
        }
      });

      // Join project room
      socket.on('join-project', async (data: { projectId: string }) => {
        try {
          await this.handleJoinProject(socket, data.projectId);
        } catch (error) {
          console.error('Error joining project:', error);
          socket.emit('error', { message: 'Failed to join project' });
        }
      });

      // Leave project room
      socket.on('leave-project', async (data: { projectId: string }) => {
        try {
          await this.handleLeaveProject(socket, data.projectId);
        } catch (error) {
          console.error('Error leaving project:', error);
        }
      });

      // Presence updates
      socket.on('presence-update', async (data: PresenceUpdateData) => {
        try {
          await this.handlePresenceUpdate(socket, data);
        } catch (error) {
          console.error('Error updating presence:', error);
        }
      });

      // Cursor movement
      socket.on('cursor-move', async (data: CursorMoveData) => {
        try {
          await this.handleCursorMove(socket, data);
        } catch (error) {
          console.error('Error handling cursor move:', error);
        }
      });

      // Comment events
      socket.on('comment-create', async (data: any) => {
        try {
          await this.handleCommentCreate(socket, data);
        } catch (error) {
          console.error('Error creating comment:', error);
          socket.emit('error', { message: 'Failed to create comment' });
        }
      });

      socket.on('comment-update', async (data: any) => {
        try {
          await this.handleCommentUpdate(socket, data);
        } catch (error) {
          console.error('Error updating comment:', error);
        }
      });

      socket.on('comment-resolve', async (data: any) => {
        try {
          await this.handleCommentResolve(socket, data);
        } catch (error) {
          console.error('Error resolving comment:', error);
        }
      });

      // Disconnection
      socket.on('disconnect', async (reason) => {
        console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
        await this.handleDisconnect(socket);
      });

      // Heartbeat for presence
      socket.on('heartbeat', async () => {
        if (socket.data.currentProjectId) {
          await this.presenceService.updateHeartbeat(
            socket.data.userId,
            socket.data.currentProjectId,
            socket.data.sessionId
          );
        }
      });
    });
  }

  private async handleJoinProject(socket: any, projectId: string): Promise<void> {
    const userId = socket.data.userId;
    const sessionId = socket.data.sessionId;

    // Join socket room
    await socket.join(projectId);
    socket.data.currentProjectId = projectId;

    // Update presence
    await this.presenceService.updatePresence(userId, projectId, {
      status: 'online',
      sessionId
    });

    // Get current collaborators
    const collaborators = await this.presenceService.getProjectCollaborators(projectId);

    // Notify others about new user
    socket.to(projectId).emit('presence-join', {
      userId,
      sessionId,
      collaborators: collaborators.filter(c => c.sessionId !== sessionId)
    });

    // Send current state to joining user
    socket.emit('project-joined', {
      projectId,
      collaborators,
      sessionId
    });

    // Update room state
    this.updateRoomState(projectId);

    console.log(`User ${userId} joined project ${projectId}`);
  }

  private async handleLeaveProject(socket: any, projectId: string): Promise<void> {
    const userId = socket.data.userId;
    const sessionId = socket.data.sessionId;

    // Leave socket room
    await socket.leave(projectId);
    socket.data.currentProjectId = null;

    // Update presence to offline
    await this.presenceService.updatePresence(userId, projectId, {
      status: 'offline',
      sessionId
    });

    // Notify others about user leaving
    socket.to(projectId).emit('presence-leave', {
      userId,
      sessionId
    });

    console.log(`User ${userId} left project ${projectId}`);
  }

  private async handlePresenceUpdate(socket: any, data: PresenceUpdateData): Promise<void> {
    const userId = socket.data.userId;
    const projectId = socket.data.currentProjectId;
    const sessionId = socket.data.sessionId;

    if (!projectId) return;

    // Update presence in database
    await this.presenceService.updatePresence(userId, projectId, {
      ...data,
      sessionId
    });

    // Broadcast to other users in the project
    socket.to(projectId).emit('presence-update', {
      userId,
      sessionId,
      ...data
    });
  }

  private async handleCursorMove(socket: any, data: CursorMoveData): Promise<void> {
    const userId = socket.data.userId;
    const projectId = socket.data.currentProjectId;
    const sessionId = socket.data.sessionId;

    if (!projectId) return;

    // Update cursor position in presence
    await this.presenceService.updatePresence(userId, projectId, {
      cursorPosition: data.position,
      currentPage: data.currentPage,
      sessionId
    });

    // Broadcast cursor position to other users
    socket.to(projectId).emit('cursor-move', {
      userId,
      sessionId,
      position: data.position,
      currentPage: data.currentPage
    });
  }

  private async handleCommentCreate(socket: any, data: any): Promise<void> {
    const userId = socket.data.userId;
    const projectId = socket.data.currentProjectId;

    if (!projectId) return;

    // Create comment in database
    const comment = await this.commentsService.createComment(userId, {
      ...data,
      projectId
    });

    // Broadcast comment to all users in project
    this.io?.to(projectId).emit('comment-create', {
      comment,
      authorId: userId
    });

    // Handle mentions and create notifications (done by database trigger)
  }

  private async handleCommentUpdate(socket: any, data: any): Promise<void> {
    const userId = socket.data.userId;
    const projectId = socket.data.currentProjectId;

    if (!projectId) return;

    // Update comment in database
    const comment = await this.commentsService.updateComment(data.commentId, userId, data.updates);

    // Broadcast update to all users in project
    this.io?.to(projectId).emit('comment-update', {
      commentId: data.commentId,
      comment,
      updatedBy: userId
    });
  }

  private async handleCommentResolve(socket: any, data: any): Promise<void> {
    const userId = socket.data.userId;
    const projectId = socket.data.currentProjectId;

    if (!projectId) return;

    // Resolve comment in database
    const comment = await this.commentsService.resolveComment(data.commentId, userId);

    // Broadcast resolution to all users in project
    this.io?.to(projectId).emit('comment-resolve', {
      commentId: data.commentId,
      resolved: comment.resolved,
      resolvedBy: userId,
      resolvedAt: comment.resolvedAt
    });
  }

  private async handleDisconnect(socket: any): Promise<void> {
    const userId = socket.data.userId;
    const projectId = socket.data.currentProjectId;
    const sessionId = socket.data.sessionId;

    if (projectId && userId) {
      // Update presence to offline
      await this.presenceService.updatePresence(userId, projectId, {
        status: 'offline',
        sessionId
      });

      // Notify others about disconnection
      socket.to(projectId).emit('presence-leave', {
        userId,
        sessionId
      });
    }
  }

  // Public methods for external services to emit events
  public emitToProject(projectId: string, event: string, data: any): void {
    this.io?.to(projectId).emit(event, data);
  }

  public emitToUser(userId: string, event: string, data: any): void {
    // Find all sockets for this user
    this.io?.sockets.sockets.forEach((socket) => {
      if (socket.data.userId === userId) {
        socket.emit(event, data);
      }
    });
  }

  public emitNotification(userId: string, notification: any): void {
    this.emitToUser(userId, 'notification', notification);
  }

  public emitActivityUpdate(projectId: string, activity: any): void {
    this.emitToProject(projectId, 'activity-update', activity);
  }

  private updateRoomState(projectId: string): void {
    // Update in-memory room state if needed
    if (!this.rooms.has(projectId)) {
      this.rooms.set(projectId, {
        projectId,
        participants: new Map(),
        comments: new Map(),
        lastActivity: new Date()
      });
    }

    const room = this.rooms.get(projectId)!;
    room.lastActivity = new Date();
  }

  private startCleanupInterval(): void {
    // Clean up old presence records every 5 minutes
    setInterval(async () => {
      try {
        await this.presenceService.cleanupOldPresence();
      } catch (error) {
        console.error('Error during presence cleanup:', error);
      }
    }, 5 * 60 * 1000);
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private async verifyToken(token: string): Promise<string> {
    // Implement token verification logic here
    // This should integrate with your authentication system (Clerk, etc.)
    // For now, return a mock user ID
    return 'user123';
  }

  public getConnectedUsers(): number {
    return this.io?.sockets.sockets.size || 0;
  }

  public getProjectRooms(): string[] {
    return Array.from(this.rooms.keys());
  }

  public isUserOnline(userId: string): boolean {
    let isOnline = false;
    this.io?.sockets.sockets.forEach((socket) => {
      if (socket.data.userId === userId) {
        isOnline = true;
      }
    });
    return isOnline;
  }
}