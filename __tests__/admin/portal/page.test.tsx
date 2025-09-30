import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAuth, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import AdminPortalPage from '@/app/admin/portal/page';

// Mock the dependencies
jest.mock('@clerk/nextjs');
jest.mock('next/navigation');
jest.mock('next-themes');

// Mock the tab components
jest.mock('@/app/admin/portal/tabs/dashboard', () => {
  return function MockDashboardTab() {
    return <div data-testid="dashboard-tab">Dashboard Content</div>;
  };
});

jest.mock('@/app/admin/portal/tabs/secrets', () => {
  return function MockSecretsTab() {
    return <div data-testid="secrets-tab">Secrets Content</div>;
  };
});

jest.mock('@/app/admin/portal/tabs/feature-flags', () => {
  return function MockFeatureFlagsTab() {
    return <div data-testid="feature-flags-tab">Feature Flags Content</div>;
  };
});

jest.mock('@/app/admin/portal/tabs/model-weights', () => {
  return function MockModelWeightsTab() {
    return <div data-testid="model-weights-tab">Model Weights Content</div>;
  };
});

jest.mock('@/app/admin/portal/tabs/plan-quotas', () => {
  return function MockPlanQuotasTab() {
    return <div data-testid="plan-quotas-tab">Plan Quotas Content</div>;
  };
});

jest.mock('@/app/admin/portal/tabs/audit-logs', () => {
  return function MockAuditLogsTab() {
    return <div data-testid="audit-logs-tab">Audit Logs Content</div>;
  };
});

jest.mock('@/app/admin/portal/tabs/user-management', () => {
  return function MockUserManagementTab() {
    return <div data-testid="user-management-tab">User Management Content</div>;
  };
});

jest.mock('@/app/admin/portal/tabs/compliance', () => {
  return function MockComplianceTab() {
    return <div data-testid="compliance-tab">Compliance Content</div>;
  };
});

// Mock fetch for system health
global.fetch = jest.fn();

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseUser = useUser as jest.MockedFunction<typeof useUser>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseTheme = useTheme as jest.MockedFunction<typeof useTheme>;

describe('AdminPortalPage', () => {
  const mockPush = jest.fn();
  const mockSetTheme = jest.fn();

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      isLoaded: true,
      userId: 'user-123',
      isSignedIn: true,
    } as any);

    mockUseUser.mockReturnValue({
      user: {
        firstName: 'John',
        lastName: 'Doe',
        emailAddresses: [{ emailAddress: 'john.doe@example.com' }],
      },
    } as any);

    mockUseRouter.mockReturnValue({
      push: mockPush,
    } as any);

    mockUseTheme.mockReturnValue({
      theme: 'light',
      setTheme: mockSetTheme,
    } as any);

    // Mock successful system health fetch
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy', issues: 0 }),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the admin portal with all navigation items', async () => {
    render(<AdminPortalPage />);

    // Check header
    expect(screen.getByText('Magi Admin Portal')).toBeInTheDocument();
    expect(screen.getByText('System administration and configuration')).toBeInTheDocument();

    // Check navigation items
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Secrets / APIs')).toBeInTheDocument();
    expect(screen.getByText('Feature Flags')).toBeInTheDocument();
    expect(screen.getByText('Model Weights')).toBeInTheDocument();
    expect(screen.getByText('Plan Quotas')).toBeInTheDocument();
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Compliance')).toBeInTheDocument();

    // Check default tab content
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-tab')).toBeInTheDocument();
    });
  });

  it('redirects to sign-in when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isLoaded: true,
      userId: null,
      isSignedIn: false,
    } as any);

    render(<AdminPortalPage />);

    expect(mockPush).toHaveBeenCalledWith('/sign-in');
  });

  it('shows loading spinner when auth is not loaded', () => {
    mockUseAuth.mockReturnValue({
      isLoaded: false,
      userId: null,
    } as any);

    render(<AdminPortalPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('switches tabs when navigation items are clicked', async () => {
    render(<AdminPortalPage />);

    // Initially shows dashboard
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-tab')).toBeInTheDocument();
    });

    // Click on Secrets tab
    fireEvent.click(screen.getByText('Secrets / APIs'));
    await waitFor(() => {
      expect(screen.getByTestId('secrets-tab')).toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-tab')).not.toBeInTheDocument();
    });

    // Click on Feature Flags tab
    fireEvent.click(screen.getByText('Feature Flags'));
    await waitFor(() => {
      expect(screen.getByTestId('feature-flags-tab')).toBeInTheDocument();
      expect(screen.queryByTestId('secrets-tab')).not.toBeInTheDocument();
    });
  });

  it('toggles theme when theme button is clicked', () => {
    render(<AdminPortalPage />);

    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    fireEvent.click(themeButton);

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('displays user information in header', async () => {
    render(<AdminPortalPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('J')).toBeInTheDocument(); // Avatar initial
    });
  });

  it('displays system health status', async () => {
    render(<AdminPortalPage />);

    await waitFor(() => {
      expect(screen.getByText('Healthy')).toBeInTheDocument();
    });
  });

  it('handles system health fetch failure gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Fetch failed'));

    render(<AdminPortalPage />);

    await waitFor(() => {
      expect(screen.getByText('Warning')).toBeInTheDocument();
    });
  });

  it('shows system health with issues count when there are issues', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'warning', issues: 3 }),
    });

    render(<AdminPortalPage />);

    await waitFor(() => {
      expect(screen.getByText('Warning')).toBeInTheDocument();
      expect(screen.getByText('(3)')).toBeInTheDocument();
    });
  });

  it('applies active styles to current tab', async () => {
    render(<AdminPortalPage />);

    // Dashboard should be active by default
    const dashboardButton = screen.getByRole('button', { name: /dashboard/i });
    expect(dashboardButton).toHaveClass('bg-blue-50');

    // Click on Secrets tab
    const secretsButton = screen.getByRole('button', { name: /secrets/i });
    fireEvent.click(secretsButton);

    await waitFor(() => {
      expect(secretsButton).toHaveClass('bg-blue-50');
      expect(dashboardButton).not.toHaveClass('bg-blue-50');
    });
  });

  it('renders all tab components correctly', async () => {
    render(<AdminPortalPage />);

    const tabs = [
      { name: 'Secrets / APIs', testId: 'secrets-tab' },
      { name: 'Feature Flags', testId: 'feature-flags-tab' },
      { name: 'Model Weights', testId: 'model-weights-tab' },
      { name: 'Plan Quotas', testId: 'plan-quotas-tab' },
      { name: 'Audit Logs', testId: 'audit-logs-tab' },
      { name: 'User Management', testId: 'user-management-tab' },
      { name: 'Compliance', testId: 'compliance-tab' },
    ];

    for (const tab of tabs) {
      fireEvent.click(screen.getByText(tab.name));
      await waitFor(() => {
        expect(screen.getByTestId(tab.testId)).toBeInTheDocument();
      });
    }
  });

  it('maintains system health polling interval', async () => {
    jest.useFakeTimers();

    render(<AdminPortalPage />);

    // Initial fetch
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Fast-forward 60 seconds
    jest.advanceTimersByTime(60000);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    jest.useRealTimers();
  });
});