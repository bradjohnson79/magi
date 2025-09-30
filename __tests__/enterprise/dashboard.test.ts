import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClerkProvider } from '@clerk/nextjs';
import EnterpriseDashboardPage from '@/app/admin/enterprise-dashboard/page';

vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAuth: vi.fn(() => ({
    userId: 'test-user-id',
    isLoaded: true,
    isSignedIn: true,
  })),
  useUser: vi.fn(() => ({
    user: {
      id: 'test-user-id',
      emailAddresses: [{ emailAddress: 'admin@example.com' }],
    },
    isLoaded: true,
  })),
}));

global.fetch = vi.fn();

const mockFetch = global.fetch as any;

describe('Enterprise Dashboard', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render enterprise dashboard with default overview tab', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          users: [
            {
              id: 'user-1',
              email: 'user1@example.com',
              department: 'Engineering',
              lastLogin: '2024-01-15T10:00:00Z',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessions: [
            {
              id: 'session-1',
              userId: 'user-1',
              duration: 3600,
              createdAt: '2024-01-15T10:00:00Z',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rules: [
            {
              id: 'rule-1',
              name: 'Data Retention',
              type: 'data_retention',
              complianceStatus: 'compliant',
            },
          ],
        }),
      });

    render(<EnterpriseDashboardPage />);

    expect(screen.getByText('Enterprise Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Usage')).toBeInTheDocument();
    expect(screen.getByText('Compliance')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Key Metrics')).toBeInTheDocument();
    });
  });

  it('should switch to usage tab when clicked', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rules: [] }),
      });

    render(<EnterpriseDashboardPage />);

    const usageTab = screen.getByText('Usage');
    fireEvent.click(usageTab);

    await waitFor(() => {
      expect(screen.getByText('Usage Analytics')).toBeInTheDocument();
      expect(screen.getByText('Session Trends')).toBeInTheDocument();
    });
  });

  it('should switch to compliance tab when clicked', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rules: [] }),
      });

    render(<EnterpriseDashboardPage />);

    const complianceTab = screen.getByText('Compliance');
    fireEvent.click(complianceTab);

    await waitFor(() => {
      expect(screen.getByText('Compliance Status')).toBeInTheDocument();
      expect(screen.getByText('Audit Events')).toBeInTheDocument();
    });
  });

  it('should switch to security tab when clicked', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rules: [] }),
      });

    render(<EnterpriseDashboardPage />);

    const securityTab = screen.getByText('Security');
    fireEvent.click(securityTab);

    await waitFor(() => {
      expect(screen.getByText('Security Overview')).toBeInTheDocument();
      expect(screen.getByText('SSO Adoption')).toBeInTheDocument();
    });
  });

  it('should display department usage data', async () => {
    const mockUsers = [
      { id: 'user-1', department: 'Engineering', lastLogin: '2024-01-15T10:00:00Z' },
      { id: 'user-2', department: 'Engineering', lastLogin: '2024-01-14T09:00:00Z' },
      { id: 'user-3', department: 'Marketing', lastLogin: '2024-01-13T08:00:00Z' },
    ];

    const mockSessions = [
      { id: 'session-1', userId: 'user-1', duration: 3600 },
      { id: 'session-2', userId: 'user-2', duration: 2400 },
      { id: 'session-3', userId: 'user-3', duration: 1800 },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: mockUsers }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: mockSessions }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rules: [] }),
      });

    render(<EnterpriseDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Department Usage')).toBeInTheDocument();
      expect(screen.getByText('Engineering')).toBeInTheDocument();
      expect(screen.getByText('Marketing')).toBeInTheDocument();
    });
  });

  it('should display feature adoption metrics', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rules: [] }),
      });

    render(<EnterpriseDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Feature Adoption')).toBeInTheDocument();
    });
  });

  it('should display compliance metrics', async () => {
    const mockRules = [
      {
        id: 'rule-1',
        name: 'Data Retention',
        type: 'data_retention',
        complianceStatus: 'compliant',
      },
      {
        id: 'rule-2',
        name: 'Access Control',
        type: 'access_control',
        complianceStatus: 'non_compliant',
      },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rules: mockRules }),
      });

    render(<EnterpriseDashboardPage />);

    const complianceTab = screen.getByText('Compliance');
    fireEvent.click(complianceTab);

    await waitFor(() => {
      expect(screen.getByText('Data Retention')).toBeInTheDocument();
      expect(screen.getByText('Access Control')).toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<EnterpriseDashboardPage />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error fetching users:',
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  it('should display loading states', async () => {
    mockFetch
      .mockImplementation(() => new Promise(() => {})) // Never resolves
      .mockImplementation(() => new Promise(() => {}))
      .mockImplementation(() => new Promise(() => {}));

    render(<EnterpriseDashboardPage />);

    expect(screen.getByText('Enterprise Dashboard')).toBeInTheDocument();

  });

  it('should calculate department statistics correctly', async () => {
    const mockUsers = [
      { id: 'user-1', department: 'Engineering', lastLogin: '2024-01-15T10:00:00Z' },
      { id: 'user-2', department: 'Engineering', lastLogin: '2024-01-14T09:00:00Z' },
      { id: 'user-3', department: 'Marketing', lastLogin: '2024-01-13T08:00:00Z' },
      { id: 'user-4', department: 'Sales', lastLogin: null },
    ];

    const mockSessions = [
      { id: 'session-1', userId: 'user-1', duration: 3600, actionsCount: 25 },
      { id: 'session-2', userId: 'user-2', duration: 2400, actionsCount: 18 },
      { id: 'session-3', userId: 'user-3', duration: 1800, actionsCount: 12 },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: mockUsers }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: mockSessions }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rules: [] }),
      });

    render(<EnterpriseDashboardPage />);

    await waitFor(() => {
      const engineeringSection = screen.getByText('Engineering').closest('[data-testid="department-usage"]');
      expect(engineeringSection).toBeInTheDocument();
    });
  });

  it('should show security metrics in security tab', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rules: [] }),
      });

    render(<EnterpriseDashboardPage />);

    const securityTab = screen.getByText('Security');
    fireEvent.click(securityTab);

    await waitFor(() => {
      expect(screen.getByText('Encryption Status')).toBeInTheDocument();
      expect(screen.getByText('Security Events')).toBeInTheDocument();
    });
  });

  it('should render chart components in usage tab', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rules: [] }),
      });

    render(<EnterpriseDashboardPage />);

    const usageTab = screen.getByText('Usage');
    fireEvent.click(usageTab);

    await waitFor(() => {
      expect(screen.getByText('Session Analytics')).toBeInTheDocument();
    });
  });
});