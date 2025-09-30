/**
 * Feedback API Tests
 *
 * Tests for the enhanced feedback API with corrections and provenance tracking.
 */

import { POST, GET } from '@/app/api/v1/feedback/route';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@clerk/nextjs/server');
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
    },
    modelRun: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    feedback: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    telemetryEvent: {
      create: jest.fn(),
    },
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('/api/v1/feedback', () => {
  const mockUser = {
    id: 'user-1',
    clerkId: 'clerk-1',
    name: 'Test User',
    email: 'test@example.com',
  };

  const mockModelRun = {
    id: 'run-1',
    projectId: 'project-1',
    success: true,
    outputPayload: { result: 'original' },
    provenance: { version: '1.0' },
    model: { name: 'Test Model' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/feedback', () => {
    it('should create feedback with rating and comment', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockPrisma.modelRun.findFirst.mockResolvedValue(mockModelRun as any);
      mockPrisma.feedback.create.mockResolvedValue({ id: 'feedback-1' } as any);
      mockPrisma.feedback.aggregate.mockResolvedValue({
        _count: { id: 1 },
        _avg: { rating: 4.5 },
      } as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const request = new NextRequest('http://localhost/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify({
          modelRunId: 'run-1',
          rating: 4,
          comment: 'Good response',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe('feedback-1');
      expect(data.status).toBe('recorded');
      expect(data.impact).toBe('monitoring');
      expect(data.stats.totalFeedback).toBe(1);
      expect(data.stats.averageRating).toBe(4.5);

      expect(mockPrisma.feedback.create).toHaveBeenCalledWith({
        data: {
          modelRunId: 'run-1',
          userId: 'user-1',
          rating: 4,
          comment: 'Good response',
          correction: null,
          metadata: expect.objectContaining({
            timestamp: expect.any(String),
            modelName: 'Test Model',
            hasCorrection: false,
            feedbackVersion: '2.0',
          }),
        },
      });
    });

    it('should create feedback with correction', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockPrisma.modelRun.findFirst.mockResolvedValue(mockModelRun as any);
      mockPrisma.feedback.create.mockResolvedValue({ id: 'feedback-1' } as any);
      mockPrisma.modelRun.update.mockResolvedValue({} as any);
      mockPrisma.feedback.aggregate.mockResolvedValue({
        _count: { id: 1 },
        _avg: { rating: null },
      } as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const correction = { field: 'corrected_value' };

      const request = new NextRequest('http://localhost/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify({
          modelRunId: 'run-1',
          correction,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.impact).toBe('correction_applied');
      expect(data.nextActions).toContain('correction_stored');

      expect(mockPrisma.modelRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: {
          outputPayload: {
            result: 'original',
            correction,
          },
          provenance: {
            version: '1.0',
            reviewed: true,
            reviewedAt: expect.any(String),
            reviewedBy: 'user-1',
            correctionApplied: true,
          },
        },
      });
    });

    it('should trigger model review for poor ratings', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockPrisma.modelRun.findFirst.mockResolvedValue(mockModelRun as any);
      mockPrisma.feedback.create.mockResolvedValue({ id: 'feedback-1' } as any);
      mockPrisma.feedback.aggregate.mockResolvedValue({
        _count: { id: 5 },
        _avg: { rating: 2.0 },
      } as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const request = new NextRequest('http://localhost/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify({
          modelRunId: 'run-1',
          rating: 2,
          comment: 'Poor response',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.impact).toBe('will_review_model');
      expect(data.nextActions).toContain('model_review_triggered');
    });

    it('should trigger retraining for very poor ratings', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockPrisma.modelRun.findFirst.mockResolvedValue(mockModelRun as any);
      mockPrisma.feedback.create.mockResolvedValue({ id: 'feedback-1' } as any);
      mockPrisma.feedback.aggregate.mockResolvedValue({
        _count: { id: 12 },
        _avg: { rating: 1.8 },
      } as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const request = new NextRequest('http://localhost/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify({
          modelRunId: 'run-1',
          rating: 1,
          comment: 'Terrible response',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.impact).toBe('will_retrain');
      expect(data.nextActions).toContain('retraining_queued');
    });

    it('should reject unauthorized requests', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const request = new NextRequest('http://localhost/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify({
          modelRunId: 'run-1',
          rating: 4,
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should validate input schema', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });

      const request = new NextRequest('http://localhost/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify({
          modelRunId: 'invalid-uuid',
          rating: 6, // Invalid rating
          comment: 'x'.repeat(2001), // Too long
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid input');
      expect(data.details).toContain('modelRunId: Invalid uuid');
      expect(data.details).toContain('rating: Number must be less than or equal to 5');
      expect(data.details).toContain('comment: String must contain at most 2000 character(s)');
    });

    it('should reject access to unauthorized model runs', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockPrisma.modelRun.findFirst.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify({
          modelRunId: '550e8400-e29b-41d4-a716-446655440000',
          rating: 4,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Model run not found or access denied');
    });

    it('should handle database errors gracefully', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify({
          modelRunId: '550e8400-e29b-41d4-a716-446655440000',
          rating: 4,
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/v1/feedback', () => {
    const mockFeedback = [
      {
        id: 'feedback-1',
        rating: 4,
        comment: 'Good',
        correction: null,
        createdAt: new Date(),
        user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
        modelRun: {
          id: 'run-1',
          success: true,
          createdAt: new Date(),
          model: { name: 'Test Model' },
        },
      },
    ];

    it('should retrieve feedback with pagination', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockPrisma.feedback.findMany.mockResolvedValue(mockFeedback as any);
      mockPrisma.feedback.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost/api/v1/feedback?limit=10&offset=0');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.feedback).toHaveLength(1);
      expect(data.feedback[0].id).toBe('feedback-1');
      expect(data.feedback[0].hasCorrection).toBe(false);
      expect(data.pagination.total).toBe(1);
      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.hasMore).toBe(false);
    });

    it('should filter feedback by model run ID', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockPrisma.feedback.findMany.mockResolvedValue(mockFeedback as any);
      mockPrisma.feedback.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost/api/v1/feedback?modelRunId=run-1');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          modelRunId: 'run-1',
        }),
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 0,
      });
    });

    it('should respect pagination limits', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockPrisma.feedback.findMany.mockResolvedValue([]);
      mockPrisma.feedback.count.mockResolvedValue(0);

      const request = new NextRequest('http://localhost/api/v1/feedback?limit=150&offset=50');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100, // Should be capped at 100
          skip: 50,
        })
      );
    });

    it('should reject unauthorized requests', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const request = new NextRequest('http://localhost/api/v1/feedback');

      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should handle database errors', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/v1/feedback');

      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });

  describe('feedback impact calculation', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockPrisma.modelRun.findFirst.mockResolvedValue(mockModelRun as any);
      mockPrisma.feedback.create.mockResolvedValue({ id: 'feedback-1' } as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);
    });

    it('should calculate correct impact for different scenarios', async () => {
      const testCases = [
        {
          feedbackCount: 3,
          avgRating: 4.0,
          hasCorrection: false,
          expectedImpact: 'monitoring',
          expectedActions: [],
        },
        {
          feedbackCount: 6,
          avgRating: 2.2,
          hasCorrection: false,
          expectedImpact: 'will_review_model',
          expectedActions: ['model_review_triggered'],
        },
        {
          feedbackCount: 12,
          avgRating: 1.5,
          hasCorrection: false,
          expectedImpact: 'will_retrain',
          expectedActions: ['retraining_queued'],
        },
        {
          feedbackCount: 1,
          avgRating: 3.0,
          hasCorrection: true,
          expectedImpact: 'correction_applied',
          expectedActions: ['correction_stored'],
        },
      ];

      for (const testCase of testCases) {
        mockPrisma.feedback.aggregate.mockResolvedValue({
          _count: { id: testCase.feedbackCount },
          _avg: { rating: testCase.avgRating },
        } as any);

        if (testCase.hasCorrection) {
          mockPrisma.modelRun.update.mockResolvedValue({} as any);
        }

        const requestBody = {
          modelRunId: 'run-1',
          rating: 3,
          ...(testCase.hasCorrection && { correction: { field: 'value' } }),
        };

        const request = new NextRequest('http://localhost/api/v1/feedback', {
          method: 'POST',
          body: JSON.stringify(requestBody),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(data.impact).toBe(testCase.expectedImpact);
        testCase.expectedActions.forEach(action => {
          expect(data.nextActions).toContain(action);
        });
      }
    });
  });
});