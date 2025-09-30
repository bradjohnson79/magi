import { render, screen, waitFor } from '@testing-library/react';
import DashboardTab from '@/app/admin/portal/tabs/dashboard';

// Mock fetch
global.fetch = jest.fn();

describe('DashboardTab', () => {
  const mockMetrics = {
    health: {
      status: 'healthy',
      uptime: '99.9%',
      lastCheck: new Date().toISOString(),
    },
    performance: {
      responseTime: 150,
      throughput: 1250,
      errorRate: 2.1,
      cpuUsage: 45,
      memoryUsage: 67,
    },
    ai: {
      modelsActive: 5,
      totalRequests: 125000,
      averageLatency: 230,
      successRate: 98.5,
    },
    users: {
      total: 15000,
      active: 3450,
      newToday: 23,
    },
    storage: {
      used: 1200000000, // 1.2GB in bytes
      total: 5000000000, // 5GB in bytes
      percentage: 24,
    },
  };

  beforeEach(() => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockMetrics),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<DashboardTab />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(4); // Loading cards
  });

  it('displays system metrics after loading', async () => {
    render(<DashboardTab />);

    await waitFor(() => {
      expect(screen.getByText('System overview and real-time metrics')).toBeInTheDocument();
    });

    // Check system health card
    expect(screen.getByText('System Health')).toBeInTheDocument();
    expect(screen.getByText('99.9%')).toBeInTheDocument();
    expect(screen.getByText('Uptime')).toBeInTheDocument();

    // Check active users card
    expect(screen.getByText('Active Users')).toBeInTheDocument();
    expect(screen.getByText('3,450')).toBeInTheDocument();
    expect(screen.getByText('of 15,000 total')).toBeInTheDocument();
    expect(screen.getByText('+23 new today')).toBeInTheDocument();

    // Check AI performance card
    expect(screen.getByText('AI Performance')).toBeInTheDocument();
    expect(screen.getByText('98.5%')).toBeInTheDocument();
    expect(screen.getByText('Success rate')).toBeInTheDocument();
    expect(screen.getByText('230ms avg latency')).toBeInTheDocument();

    // Check storage usage card
    expect(screen.getByText('Storage Usage')).toBeInTheDocument();
    expect(screen.getByText('24%')).toBeInTheDocument();
    expect(screen.getByText('1.2 GB of 5.0 GB')).toBeInTheDocument();
  });

  it('displays performance metrics section', async () => {
    render(<DashboardTab />);

    await waitFor(() => {
      expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
    });

    expect(screen.getByText('Real-time system performance indicators')).toBeInTheDocument();
    expect(screen.getByText('Response Time')).toBeInTheDocument();
    expect(screen.getByText('150ms')).toBeInTheDocument();
    expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('Memory Usage')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('Error Rate')).toBeInTheDocument();
    expect(screen.getByText('2.1%')).toBeInTheDocument();
  });

  it('displays AI model statistics section', async () => {
    render(<DashboardTab />);

    await waitFor(() => {
      expect(screen.getByText('AI Model Statistics')).toBeInTheDocument();
    });

    expect(screen.getByText('Current AI model performance and usage')).toBeInTheDocument();
    expect(screen.getByText('Active Models')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Total Requests')).toBeInTheDocument();
    expect(screen.getByText('125.0k')).toBeInTheDocument();
    expect(screen.getByText('Average Latency')).toBeInTheDocument();
    expect(screen.getByText('230ms')).toBeInTheDocument();
    expect(screen.getByText('Throughput')).toBeInTheDocument();
    expect(screen.getByText('1250 req/s')).toBeInTheDocument();
  });

  it('shows error state when metrics fail to load', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Fetch failed'));

    render(<DashboardTab />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load dashboard metrics')).toBeInTheDocument();
    });
  });

  it('shows error state when response is not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(<DashboardTab />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load dashboard metrics')).toBeInTheDocument();
    });
  });

  it('displays system status alerts for high error rate', async () => {
    const metricsWithHighErrorRate = {
      ...mockMetrics,
      performance: {
        ...mockMetrics.performance,
        errorRate: 8.5, // Above 5% threshold
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(metricsWithHighErrorRate),
    });

    render(<DashboardTab />);

    await waitFor(() => {
      expect(screen.getByText('Elevated error rate detected')).toBeInTheDocument();
      expect(screen.getByText('Current error rate: 8.5%')).toBeInTheDocument();
    });
  });

  it('displays system status alerts for high storage usage', async () => {
    const metricsWithHighStorage = {
      ...mockMetrics,
      storage: {
        ...mockMetrics.storage,
        percentage: 85, // Above 80% threshold
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(metricsWithHighStorage),
    });

    render(<DashboardTab />);

    await waitFor(() => {
      expect(screen.getByText('High storage usage')).toBeInTheDocument();
      expect(screen.getByText('85% of storage capacity used')).toBeInTheDocument();
    });
  });

  it('formats bytes correctly in different units', async () => {
    const metricsWithLargeStorage = {
      ...mockMetrics,
      storage: {
        used: 1500000000000, // 1.5TB
        total: 2000000000000, // 2TB
        percentage: 75,
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(metricsWithLargeStorage),
    });

    render(<DashboardTab />);

    await waitFor(() => {
      expect(screen.getByText('1.4 TB of 1.8 TB')).toBeInTheDocument();
    });
  });

  it('updates metrics every 30 seconds', async () => {
    jest.useFakeTimers();

    render(<DashboardTab />);

    // Initial fetch
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Fast-forward 30 seconds
    jest.advanceTimersByTime(30000);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    // Fast-forward another 30 seconds
    jest.advanceTimersByTime(30000);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    jest.useRealTimers();
  });

  it('displays health status badge with correct color', async () => {
    render(<DashboardTab />);

    await waitFor(() => {
      const healthyBadge = screen.getByText('Healthy');
      expect(healthyBadge.closest('span')).toHaveClass('text-green-600');
    });
  });

  it('handles different health statuses correctly', async () => {
    const warningMetrics = {
      ...mockMetrics,
      health: {
        ...mockMetrics.health,
        status: 'warning',
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(warningMetrics),
    });

    render(<DashboardTab />);

    await waitFor(() => {
      const warningBadge = screen.getByText('Warning');
      expect(warningBadge.closest('span')).toHaveClass('text-yellow-600');
    });
  });

  it('shows "All systems operational" when no alerts are present', async () => {
    render(<DashboardTab />);

    await waitFor(() => {
      expect(screen.getByText('All systems operational')).toBeInTheDocument();
    });
  });

  it('formats large numbers correctly', async () => {
    const metricsWithLargeNumbers = {
      ...mockMetrics,
      users: {
        total: 1250000, // Should display as 1.3M
        active: 456000, // Should display as 456K
        newToday: 123,
      },
      ai: {
        ...mockMetrics.ai,
        totalRequests: 2500000, // Should display as 2.5M
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(metricsWithLargeNumbers),
    });

    render(<DashboardTab />);

    await waitFor(() => {
      expect(screen.getByText('456,000')).toBeInTheDocument(); // Active users in card
      expect(screen.getByText('of 1,250,000 total')).toBeInTheDocument(); // Total users
      expect(screen.getByText('2.5k')).toBeInTheDocument(); // Total requests in AI stats
    });
  });
});