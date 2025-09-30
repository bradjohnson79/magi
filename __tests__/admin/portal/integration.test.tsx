import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuth, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import AdminPortalPage from '@/app/admin/portal/page';

// Mock all dependencies
jest.mock('@clerk/nextjs');
jest.mock('next/navigation');
jest.mock('next-themes');

// Mock all tab components with testable content
jest.mock('@/app/admin/portal/tabs/dashboard', () => {
  return function MockDashboardTab() {
    return (
      <div data-testid="dashboard-tab">
        <h3>System Overview</h3>
        <div data-testid="metric-card">Active Users: 1,234</div>
      </div>
    );
  };
});

jest.mock('@/app/admin/portal/tabs/secrets', () => {
  return function MockSecretsTab() {
    return (
      <div data-testid="secrets-tab">
        <h3>API Keys Management</h3>
        <button data-testid="add-secret-btn">Add Secret</button>
        <div data-testid="secret-item">Anthropic API Key</div>
      </div>
    );
  };
});

jest.mock('@/app/admin/portal/tabs/feature-flags', () => {
  return function MockFeatureFlagsTab() {
    return (
      <div data-testid="feature-flags-tab">
        <h3>Feature Toggles</h3>
        <div data-testid="flag-item">Auto Evolution: Enabled</div>
      </div>
    );
  };
});

jest.mock('@/app/admin/portal/tabs/model-weights', () => {
  return function MockModelWeightsTab() {
    return (
      <div data-testid="model-weights-tab">
        <h3>AI Model Configuration</h3>
        <div data-testid="model-item">Claude 3.5 Sonnet: 70%</div>
      </div>
    );
  };
});

jest.mock('@/app/admin/portal/tabs/plan-quotas', () => {
  return function MockPlanQuotasTab() {
    return (
      <div data-testid="plan-quotas-tab">
        <h3>Usage Limits</h3>
        <div data-testid="quota-item">Free Tier: 1,000 requests</div>
      </div>
    );
  };
});

jest.mock('@/app/admin/portal/tabs/audit-logs', () => {
  return function MockAuditLogsTab() {
    return (
      <div data-testid="audit-logs-tab">
        <h3>System Audit Trail</h3>
        <div data-testid="log-item">User login: admin@magi.com</div>
      </div>
    );
  };
});

jest.mock('@/app/admin/portal/tabs/user-management', () => {
  return function MockUserManagementTab() {
    return (
      <div data-testid="user-management-tab">
        <h3>User Accounts</h3>
        <div data-testid="user-item">john.doe@example.com</div>
      </div>
    );
  };
});

jest.mock('@/app/admin/portal/tabs/compliance', () => {
  return function MockComplianceTab() {
    return (
      <div data-testid="compliance-tab">
        <h3>Data Governance</h3>
        <div data-testid="compliance-item">GDPR: Compliant</div>
      </div>
    );
  };
});

// Mock fetch for system health
global.fetch = jest.fn();

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseUser = useUser as jest.MockedFunction<typeof useUser>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseTheme = useTheme as jest.MockedFunction<typeof useTheme>;

describe('Admin Portal Integration Tests', () => {
  const mockPush = jest.fn();
  const mockSetTheme = jest.fn();

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      isLoaded: true,
      userId: 'admin-user-123',
      isSignedIn: true,
    } as any);

    mockUseUser.mockReturnValue({
      user: {
        firstName: 'Admin',
        lastName: 'User',
        emailAddresses: [{ emailAddress: 'admin@magi.com' }],
      },
    } as any);

    mockUseRouter.mockReturnValue({
      push: mockPush,
    } as any);

    mockUseTheme.mockReturnValue({
      theme: 'light',
      setTheme: mockSetTheme,
    } as any);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy', issues: 0 }),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Full Portal Navigation Flow', () => {
    it('allows complete navigation through all admin sections', async () => {
      const user = userEvent.setup();
      render(<AdminPortalPage />);

      // Verify initial state (Dashboard)
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-tab')).toBeInTheDocument();
        expect(screen.getByText('System Overview')).toBeInTheDocument();
      });

      // Test navigation to each section
      const navigationTests = [
        { label: 'Secrets / APIs', testId: 'secrets-tab', content: 'API Keys Management' },
        { label: 'Feature Flags', testId: 'feature-flags-tab', content: 'Feature Toggles' },
        { label: 'Model Weights', testId: 'model-weights-tab', content: 'AI Model Configuration' },
        { label: 'Plan Quotas', testId: 'plan-quotas-tab', content: 'Usage Limits' },
        { label: 'Audit Logs', testId: 'audit-logs-tab', content: 'System Audit Trail' },
        { label: 'User Management', testId: 'user-management-tab', content: 'User Accounts' },
        { label: 'Compliance', testId: 'compliance-tab', content: 'Data Governance' },
      ];

      for (const test of navigationTests) {
        await user.click(screen.getByText(test.label));

        await waitFor(() => {
          expect(screen.getByTestId(test.testId)).toBeInTheDocument();
          expect(screen.getByText(test.content)).toBeInTheDocument();
        });

        // Verify previous tab content is not visible
        expect(screen.queryByTestId('dashboard-tab')).not.toBeInTheDocument();
      }

      // Navigate back to Dashboard
      await user.click(screen.getByText('Dashboard'));
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-tab')).toBeInTheDocument();
        expect(screen.getByText('System Overview')).toBeInTheDocument();
      });
    });

    it('maintains active state styling during navigation', async () => {
      const user = userEvent.setup();
      render(<AdminPortalPage />);

      // Dashboard should be active initially
      const dashboardButton = screen.getByRole('button', { name: /dashboard/i });
      expect(dashboardButton).toHaveClass('bg-blue-50');

      // Navigate to Secrets
      const secretsButton = screen.getByRole('button', { name: /secrets/i });
      await user.click(secretsButton);

      await waitFor(() => {
        expect(secretsButton).toHaveClass('bg-blue-50');
        expect(dashboardButton).not.toHaveClass('bg-blue-50');
      });
    });
  });

  describe('System Health Integration', () => {
    it('updates system health badge based on API response', async () => {
      render(<AdminPortalPage />);

      await waitFor(() => {
        expect(screen.getByText('Healthy')).toBeInTheDocument();
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/admin/system/health');
    });

    it('handles different health statuses with appropriate styling', async () => {
      const healthStatuses = [
        { status: 'healthy', issues: 0, expectedClass: 'text-green-600' },
        { status: 'warning', issues: 2, expectedClass: 'text-yellow-600' },
        { status: 'critical', issues: 5, expectedClass: 'text-red-600' },
      ];

      for (const healthStatus of healthStatuses) {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(healthStatus),
        });

        render(<AdminPortalPage />);

        await waitFor(() => {
          const statusText = screen.getByText(new RegExp(healthStatus.status, 'i'));
          expect(statusText.closest('span')).toHaveClass(healthStatus.expectedClass);

          if (healthStatus.issues > 0) {
            expect(screen.getByText(`(${healthStatus.issues})`)).toBeInTheDocument();
          }
        });
      }
    });
  });

  describe('Theme Integration', () => {
    it('toggles between light and dark themes', async () => {
      const user = userEvent.setup();
      render(<AdminPortalPage />);

      // Initially light theme
      expect(mockSetTheme).not.toHaveBeenCalled();

      // Click theme toggle
      const themeButton = screen.getByRole('button', { name: /toggle theme/i });
      await user.click(themeButton);

      expect(mockSetTheme).toHaveBeenCalledWith('dark');

      // Mock dark theme state
      mockUseTheme.mockReturnValue({
        theme: 'dark',
        setTheme: mockSetTheme,
      } as any);

      // Re-render to verify dark theme icon
      render(<AdminPortalPage />);
      await user.click(screen.getByRole('button', { name: /toggle theme/i }));

      expect(mockSetTheme).toHaveBeenCalledWith('light');
    });
  });

  describe('Authentication Integration', () => {
    it('redirects unauthenticated users to sign-in', () => {
      mockUseAuth.mockReturnValue({
        isLoaded: true,
        userId: null,
        isSignedIn: false,
      } as any);

      render(<AdminPortalPage />);

      expect(mockPush).toHaveBeenCalledWith('/sign-in');
    });

    it('shows loading state while authentication loads', () => {
      mockUseAuth.mockReturnValue({
        isLoaded: false,
        userId: null,
      } as any);

      render(<AdminPortalPage />);

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByText('Magi Admin Portal')).not.toBeInTheDocument();
    });
  });

  describe('User Information Display', () => {
    it('displays complete user information in header', async () => {
      render(<AdminPortalPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
        expect(screen.getByText('Admin')).toBeInTheDocument();
        expect(screen.getByText('A')).toBeInTheDocument(); // Avatar initial
      });
    });

    it('handles missing user name gracefully', async () => {
      mockUseUser.mockReturnValue({
        user: {
          firstName: null,
          lastName: null,
          emailAddresses: [{ emailAddress: 'admin@magi.com' }],
        },
      } as any);

      render(<AdminPortalPage />);

      await waitFor(() => {
        // Should show email initial when name is missing
        expect(screen.getByText('a')).toBeInTheDocument(); // First letter of email
      });
    });
  });

  describe('Tab Content Integration', () => {
    it('renders specific content for each tab correctly', async () => {
      const user = userEvent.setup();
      render(<AdminPortalPage />);

      // Test Dashboard content
      await waitFor(() => {
        expect(screen.getByTestId('metric-card')).toBeInTheDocument();
        expect(screen.getByText('Active Users: 1,234')).toBeInTheDocument();
      });

      // Test Secrets content
      await user.click(screen.getByText('Secrets / APIs'));
      await waitFor(() => {
        expect(screen.getByTestId('add-secret-btn')).toBeInTheDocument();
        expect(screen.getByTestId('secret-item')).toBeInTheDocument();
      });

      // Test Feature Flags content
      await user.click(screen.getByText('Feature Flags'));
      await waitFor(() => {
        expect(screen.getByTestId('flag-item')).toBeInTheDocument();
        expect(screen.getByText('Auto Evolution: Enabled')).toBeInTheDocument();
      });
    });

    it('maintains state when switching between tabs', async () => {
      const user = userEvent.setup();
      render(<AdminPortalPage />);

      // Go to Secrets tab
      await user.click(screen.getByText('Secrets / APIs'));
      await waitFor(() => {
        expect(screen.getByTestId('secrets-tab')).toBeInTheDocument();
      });

      // Go to different tab
      await user.click(screen.getByText('User Management'));
      await waitFor(() => {
        expect(screen.getByTestId('user-management-tab')).toBeInTheDocument();
      });

      // Return to Secrets - should re-render correctly
      await user.click(screen.getByText('Secrets / APIs'));
      await waitFor(() => {
        expect(screen.getByTestId('secrets-tab')).toBeInTheDocument();
        expect(screen.getByTestId('add-secret-btn')).toBeInTheDocument();
      });
    });
  });

  describe('Real-time Updates Integration', () => {
    it('polls system health at regular intervals', async () => {
      jest.useFakeTimers();

      render(<AdminPortalPage />);

      // Initial fetch
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Advance time by 60 seconds (health check interval)
      jest.advanceTimersByTime(60000);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      });

      // Advance again
      jest.advanceTimersByTime(60000);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(3);
      });

      jest.useRealTimers();
    });

    it('updates health status when API response changes', async () => {
      jest.useFakeTimers();

      // Start with healthy status
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'healthy', issues: 0 }),
      });

      render(<AdminPortalPage />);

      await waitFor(() => {
        expect(screen.getByText('Healthy')).toBeInTheDocument();
      });

      // Change to warning status
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'warning', issues: 2 }),
      });

      // Trigger next health check
      jest.advanceTimersByTime(60000);

      await waitFor(() => {
        expect(screen.getByText('Warning')).toBeInTheDocument();
        expect(screen.getByText('(2)')).toBeInTheDocument();
      });

      jest.useRealTimers();
    });
  });

  describe('Error Handling Integration', () => {
    it('handles system health API failures gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<AdminPortalPage />);

      await waitFor(() => {
        expect(screen.getByText('Warning')).toBeInTheDocument();
      });

      // Should still render the portal interface
      expect(screen.getByText('Magi Admin Portal')).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('continues to function when individual tabs have issues', async () => {
      const user = userEvent.setup();
      render(<AdminPortalPage />);

      // Should be able to navigate even if individual components might have issues
      await user.click(screen.getByText('Compliance'));
      await waitFor(() => {
        expect(screen.getByTestId('compliance-tab')).toBeInTheDocument();
      });

      // Navigation should still work
      await user.click(screen.getByText('Dashboard'));
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-tab')).toBeInTheDocument();
      });
    });
  });
});