import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PresenceService } from '@/lib/services/presence';
import { Database } from '@/lib/database';
import { PresenceStatus, CursorPosition } from '@/lib/types/collaboration';

// Mock the database
jest.mock('@/lib/database');

describe('PresenceService', () => {
  let presenceService: PresenceService;
  let mockDb: jest.Mocked<Database>;

  const mockUserId = 'user-123';
  const mockProjectId = 'project-456';
  const mockSessionId = 'session-789';

  const mockPresenceData = {
    id: 'presence-1',
    user_id: mockUserId,
    project_id: mockProjectId,
    status: 'online' as PresenceStatus,
    cursor_position: { x: 100, y: 200 },
    current_page: '/editor',
    session_id: mockSessionId,
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
      getInstance: jest.fn()
    } as any;

    (Database.getInstance as jest.Mock).mockReturnValue(mockDb);
    presenceService = PresenceService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updatePresence', () => {
    it('should create new presence record', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [mockPresenceData]
      });

      const result = await presenceService.updatePresence(mockUserId, mockProjectId, {
        status: 'online',
        cursorPosition: { x: 100, y: 200 },
        currentPage: '/editor',
        sessionId: mockSessionId
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_presence'),
        [
          mockUserId,
          mockProjectId,
          'online',
          JSON.stringify({ x: 100, y: 200 }),
          '/editor',
          mockSessionId
        ]
      );

      expect(result).toEqual({
        id: 'presence-1',
        userId: mockUserId,
        projectId: mockProjectId,
        status: 'online',
        cursorPosition: { x: 100, y: 200 },
        currentPage: '/editor',
        sessionId: mockSessionId,
        lastSeen: expect.any(Date),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });

    it('should update existing presence record', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          ...mockPresenceData,
          status: 'away'
        }]
      });

      const result = await presenceService.updatePresence(mockUserId, mockProjectId, {
        status: 'away',
        sessionId: mockSessionId
      });

      expect(result.status).toBe('away');
    });

    it('should handle cursor position updates', async () => {
      const newCursorPosition: CursorPosition = { x: 300, y: 400 };

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          ...mockPresenceData,
          cursor_position: newCursorPosition
        }]
      });

      const result = await presenceService.updatePresence(mockUserId, mockProjectId, {
        status: 'online',
        cursorPosition: newCursorPosition,
        sessionId: mockSessionId
      });

      expect(result.cursorPosition).toEqual(newCursorPosition);
    });
  });

  describe('getProjectCollaborators', () => {
    it('should return active collaborators for a project', async () => {
      const mockCollaborators = [
        {
          user_id: 'user-1',
          user_name: 'John Doe',
          user_email: 'john@example.com',
          avatar_url: 'https://avatar.com/john',
          status: 'online',
          last_seen: new Date().toISOString(),
          cursor_position: { x: 100, y: 200 },
          current_page: '/editor',
          session_id: 'session-1'
        },
        {
          user_id: 'user-2',
          user_name: 'Jane Smith',
          user_email: 'jane@example.com',
          avatar_url: 'https://avatar.com/jane',
          status: 'away',
          last_seen: new Date().toISOString(),
          cursor_position: null,
          current_page: '/dashboard',
          session_id: 'session-2'
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockCollaborators
      });

      const result = await presenceService.getProjectCollaborators(mockProjectId);

      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM get_project_collaborators($1)',
        [mockProjectId]
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        userId: 'user-1',
        userName: 'John Doe',
        userEmail: 'john@example.com',
        avatarUrl: 'https://avatar.com/john',
        status: 'online',
        lastSeen: expect.any(Date),
        cursorPosition: { x: 100, y: 200 },
        currentPage: '/editor',
        sessionId: 'session-1'
      });
    });

    it('should return empty array when no collaborators', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      const result = await presenceService.getProjectCollaborators(mockProjectId);

      expect(result).toEqual([]);
    });
  });

  describe('updateCursorPosition', () => {
    it('should update cursor position and current page', async () => {
      const newPosition: CursorPosition = { x: 500, y: 600 };
      const newPage = '/preview';

      mockDb.query.mockResolvedValueOnce({
        rows: [{}]
      });

      await presenceService.updateCursorPosition(
        mockUserId,
        mockProjectId,
        mockSessionId,
        newPosition,
        newPage
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_presence'),
        [
          mockUserId,
          mockProjectId,
          mockSessionId,
          JSON.stringify(newPosition),
          newPage
        ]
      );
    });

    it('should not throw error on cursor position update failure', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database error'));

      // Should not throw
      await expect(
        presenceService.updateCursorPosition(
          mockUserId,
          mockProjectId,
          mockSessionId,
          { x: 100, y: 200 }
        )
      ).resolves.toBeUndefined();
    });
  });

  describe('isUserOnlineInProject', () => {
    it('should return true when user is online', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ count: '1' }]
      });

      const result = await presenceService.isUserOnlineInProject(mockUserId, mockProjectId);

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count'),
        [mockUserId, mockProjectId]
      );
    });

    it('should return false when user is offline', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ count: '0' }]
      });

      const result = await presenceService.isUserOnlineInProject(mockUserId, mockProjectId);

      expect(result).toBe(false);
    });

    it('should return false on database error', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database error'));

      const result = await presenceService.isUserOnlineInProject(mockUserId, mockProjectId);

      expect(result).toBe(false);
    });
  });

  describe('getCollaboratorSuggestions', () => {
    it('should return collaborator suggestions for mentions', async () => {
      const mockSuggestions = [
        {
          user_id: 'user-1',
          user_name: 'John Doe',
          user_email: 'john@example.com',
          avatar_url: 'https://avatar.com/john',
          is_online: true
        },
        {
          user_id: 'user-2',
          user_name: 'Jane Smith',
          user_email: 'jane@example.com',
          avatar_url: null,
          is_online: false
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockSuggestions
      });

      const result = await presenceService.getCollaboratorSuggestions(mockProjectId, 'john');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        userId: 'user-1',
        userName: 'John Doe',
        userEmail: 'john@example.com',
        avatarUrl: 'https://avatar.com/john',
        isOnline: true
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT DISTINCT'),
        [mockProjectId, '%john%']
      );
    });

    it('should return all suggestions when no query provided', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      await presenceService.getCollaboratorSuggestions(mockProjectId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.not.stringContaining('ILIKE'),
        [mockProjectId]
      );
    });
  });

  describe('cleanupOldPresence', () => {
    it('should call cleanup function', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      await presenceService.cleanupOldPresence();

      expect(mockDb.query).toHaveBeenCalledWith('SELECT cleanup_old_presence()');
    });

    it('should not throw error on cleanup failure', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Cleanup failed'));

      // Should not throw
      await expect(presenceService.cleanupOldPresence()).resolves.toBeUndefined();
    });
  });
});