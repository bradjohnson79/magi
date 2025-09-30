/**
 * WebSocket Server for Real-time Collaboration
 *
 * Handles WebSocket connections for Yjs document synchronization
 * with authentication and room management.
 */

import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import { LeveldbPersistence } from 'y-leveldb';
import { setupWSConnection, docs } from 'y-websocket/bin/utils';
import { createServer } from 'http';
import { parse } from 'url';
import { workspaceManager } from '@/services/workspace/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

export interface WebSocketMessage {
  type: 'auth' | 'join' | 'leave' | 'cursor' | 'activity';
  data: any;
}

export interface CollaborationRoom {
  projectId: string;
  doc: Y.Doc;
  clients: Set<AuthenticatedWebSocket>;
  persistence?: LeveldbPersistence;
  lastActivity: number;
}

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  username?: string;
  projectId?: string;
  workspaceId?: string;
  rooms: Set<string>;
  isAuthenticated: boolean;
}

export class CollaborationWebSocketServer {
  private wss: WebSocketServer;
  private rooms = new Map<string, CollaborationRoom>();
  private server: any;
  private port: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(port = 3001) {
    this.port = port;
    this.server = createServer();
    this.wss = new WebSocketServer({ server: this.server });

    this.setupWebSocketServer();
    this.startCleanupScheduler();
  }

  /**
   * Setup WebSocket server with authentication
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: AuthenticatedWebSocket, request) => {
      ws.rooms = new Set();
      ws.isAuthenticated = false;

      // Parse URL for initial room/project info
      const parsedUrl = parse(request.url || '', true);
      const projectId = parsedUrl.query.projectId as string;
      const userId = parsedUrl.query.userId as string;
      const token = parsedUrl.query.token as string;

      // Handle authentication
      this.authenticateConnection(ws, { projectId, userId, token });

      // Handle messages
      ws.on('message', (data) => {
        this.handleMessage(ws, data);
      });

      // Handle disconnect
      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.handleDisconnect(ws);
      });
    });
  }

  /**
   * Authenticate WebSocket connection
   */
  private async authenticateConnection(
    ws: AuthenticatedWebSocket,
    auth: { projectId: string; userId: string; token: string }
  ): Promise<void> {
    return withSpan('collaboration.authenticate', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'collab_auth',
          [SPAN_ATTRIBUTES.USER_ID]: auth.userId,
          [SPAN_ATTRIBUTES.PROJECT_ID]: auth.projectId,
        });

        // TODO: Validate JWT token
        // const tokenPayload = await verifyJWT(auth.token);
        // if (!tokenPayload || tokenPayload.userId !== auth.userId) {
        //   throw new Error('Invalid token');
        // }

        // Validate workspace access
        // TODO: Get workspace ID from project
        // await workspaceManager.validateMemberAccess(workspaceId, auth.userId);

        ws.userId = auth.userId;
        ws.projectId = auth.projectId;
        ws.username = `User-${auth.userId.slice(0, 8)}`; // TODO: Get real username
        ws.isAuthenticated = true;

        // Setup Yjs connection
        if (auth.projectId) {
          this.joinRoom(ws, auth.projectId);
        }

        // Send authentication success
        this.sendMessage(ws, {
          type: 'auth',
          data: { success: true, userId: auth.userId },
        });

        addSpanAttributes(span, {
          'auth.success': true,
        });
      } catch (error) {
        span?.recordException?.(error as Error);
        console.error('Authentication failed:', error);

        this.sendMessage(ws, {
          type: 'auth',
          data: { success: false, error: 'Authentication failed' },
        });

        ws.close(1008, 'Authentication failed');
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(ws: AuthenticatedWebSocket, data: any): Promise<void> {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      if (!ws.isAuthenticated && message.type !== 'auth') {
        return;
      }

      switch (message.type) {
        case 'join':
          await this.handleJoinRoom(ws, message.data);
          break;

        case 'leave':
          await this.handleLeaveRoom(ws, message.data);
          break;

        case 'cursor':
          await this.handleCursorUpdate(ws, message.data);
          break;

        case 'activity':
          await this.handleActivity(ws, message.data);
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  /**
   * Join collaboration room
   */
  private async joinRoom(ws: AuthenticatedWebSocket, projectId: string): Promise<void> {
    return withSpan('collaboration.join_room', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'collab_join_room',
          [SPAN_ATTRIBUTES.USER_ID]: ws.userId!,
          [SPAN_ATTRIBUTES.PROJECT_ID]: projectId,
        });

        // Get or create room
        let room = this.rooms.get(projectId);
        if (!room) {
          room = await this.createRoom(projectId);
          this.rooms.set(projectId, room);
        }

        // Add client to room
        room.clients.add(ws);
        ws.rooms.add(projectId);
        room.lastActivity = Date.now();

        // Setup Yjs WebSocket connection
        setupWSConnection(ws as any, undefined, {
          docName: projectId,
          gc: true,
        });

        // Notify other clients
        this.broadcastToRoom(projectId, {
          type: 'user_joined',
          data: {
            userId: ws.userId,
            username: ws.username,
            timestamp: Date.now(),
          },
        }, ws);

        addSpanAttributes(span, {
          'room.client_count': room.clients.size,
        });
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Handle join room request
   */
  private async handleJoinRoom(ws: AuthenticatedWebSocket, data: any): Promise<void> {
    const { projectId } = data;

    if (!projectId) {
      this.sendMessage(ws, {
        type: 'error',
        data: { message: 'Project ID required' },
      });
      return;
    }

    try {
      // TODO: Validate project access
      await this.joinRoom(ws, projectId);

      this.sendMessage(ws, {
        type: 'joined',
        data: { projectId, success: true },
      });
    } catch (error) {
      this.sendMessage(ws, {
        type: 'error',
        data: { message: 'Failed to join room' },
      });
    }
  }

  /**
   * Handle leave room request
   */
  private async handleLeaveRoom(ws: AuthenticatedWebSocket, data: any): Promise<void> {
    const { projectId } = data;
    this.leaveRoom(ws, projectId);
  }

  /**
   * Leave collaboration room
   */
  private leaveRoom(ws: AuthenticatedWebSocket, projectId: string): void {
    const room = this.rooms.get(projectId);
    if (room) {
      room.clients.delete(ws);
      ws.rooms.delete(projectId);

      // Notify other clients
      this.broadcastToRoom(projectId, {
        type: 'user_left',
        data: {
          userId: ws.userId,
          username: ws.username,
          timestamp: Date.now(),
        },
      }, ws);

      // Cleanup empty rooms
      if (room.clients.size === 0) {
        this.scheduleRoomCleanup(projectId);
      }
    }
  }

  /**
   * Handle cursor updates
   */
  private async handleCursorUpdate(ws: AuthenticatedWebSocket, data: any): Promise<void> {
    const { projectId, cursor } = data;

    if (!projectId || !cursor) {
      return;
    }

    // Broadcast cursor to other clients in room
    this.broadcastToRoom(projectId, {
      type: 'cursor',
      data: {
        userId: ws.userId,
        username: ws.username,
        cursor,
        timestamp: Date.now(),
      },
    }, ws);
  }

  /**
   * Handle activity logging
   */
  private async handleActivity(ws: AuthenticatedWebSocket, data: any): Promise<void> {
    const { projectId, activity } = data;

    if (!projectId || !activity) {
      return;
    }

    // Broadcast activity to other clients in room
    this.broadcastToRoom(projectId, {
      type: 'activity',
      data: {
        ...activity,
        userId: ws.userId,
        username: ws.username,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(ws: AuthenticatedWebSocket): void {
    // Leave all rooms
    ws.rooms.forEach(projectId => {
      this.leaveRoom(ws, projectId);
    });
  }

  /**
   * Create new collaboration room
   */
  private async createRoom(projectId: string): Promise<CollaborationRoom> {
    return withSpan('collaboration.create_room', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'collab_create_room',
        [SPAN_ATTRIBUTES.PROJECT_ID]: projectId,
      });

      const doc = new Y.Doc();

      // Setup persistence
      const persistence = new LeveldbPersistence(`./yjs-data/${projectId}`, doc);

      const room: CollaborationRoom = {
        projectId,
        doc,
        clients: new Set(),
        persistence,
        lastActivity: Date.now(),
      };

      return room;
    });
  }

  /**
   * Broadcast message to all clients in room
   */
  private broadcastToRoom(
    projectId: string,
    message: WebSocketMessage,
    exclude?: AuthenticatedWebSocket
  ): void {
    const room = this.rooms.get(projectId);
    if (!room) return;

    room.clients.forEach(client => {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        this.sendMessage(client, message);
      }
    });
  }

  /**
   * Send message to specific client
   */
  private sendMessage(ws: AuthenticatedWebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  }

  /**
   * Schedule room cleanup
   */
  private scheduleRoomCleanup(projectId: string): void {
    setTimeout(() => {
      const room = this.rooms.get(projectId);
      if (room && room.clients.size === 0) {
        // Check if room is still empty and inactive
        const inactiveTime = Date.now() - room.lastActivity;
        if (inactiveTime > 5 * 60 * 1000) { // 5 minutes
          this.cleanupRoom(projectId);
        }
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Cleanup room resources
   */
  private cleanupRoom(projectId: string): void {
    const room = this.rooms.get(projectId);
    if (room) {
      room.persistence?.destroy();
      room.doc.destroy();
      this.rooms.delete(projectId);

      // Remove from global docs if using y-websocket utils
      if (docs.has(projectId)) {
        docs.delete(projectId);
      }
    }
  }

  /**
   * Start cleanup scheduler
   */
  private startCleanupScheduler(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

      this.rooms.forEach((room, projectId) => {
        if (room.clients.size === 0 && (now - room.lastActivity) > inactiveThreshold) {
          this.cleanupRoom(projectId);
        }
      });
    }, 10 * 60 * 1000); // Check every 10 minutes
  }

  /**
   * Start the server
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`Collaboration WebSocket server running on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      clearInterval(this.cleanupInterval);

      // Cleanup all rooms
      this.rooms.forEach((room, projectId) => {
        this.cleanupRoom(projectId);
      });

      this.wss.close(() => {
        this.server.close(() => {
          console.log('Collaboration WebSocket server stopped');
          resolve();
        });
      });
    });
  }

  /**
   * Get server stats
   */
  getStats(): {
    rooms: number;
    totalClients: number;
    activeRooms: Array<{ projectId: string; clients: number; lastActivity: number }>;
  } {
    const activeRooms = Array.from(this.rooms.entries()).map(([projectId, room]) => ({
      projectId,
      clients: room.clients.size,
      lastActivity: room.lastActivity,
    }));

    return {
      rooms: this.rooms.size,
      totalClients: Array.from(this.rooms.values()).reduce((sum, room) => sum + room.clients.size, 0),
      activeRooms,
    };
  }
}

// Export singleton instance
let collaborationServer: CollaborationWebSocketServer;

export function getCollaborationServer(): CollaborationWebSocketServer {
  if (!collaborationServer) {
    collaborationServer = new CollaborationWebSocketServer(
      parseInt(process.env.COLLABORATION_PORT || '3001')
    );
  }
  return collaborationServer;
}

export { collaborationServer };