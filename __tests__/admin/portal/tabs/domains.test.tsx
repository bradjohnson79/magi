import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DomainsTab from '@/app/admin/portal/tabs/domains';

// Mock fetch
global.fetch = jest.fn();

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(),
  },
});

describe('DomainsTab', () => {
  const mockDomains = [
    {
      id: 'domain-1',
      projectId: 'project-1',
      domain: 'my-app.magi.dev',
      domainType: 'subdomain',
      verified: true,
      sslStatus: 'issued',
      provider: 'vercel',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      sslIssuedAt: new Date().toISOString(),
      url: 'https://my-app.magi.dev',
      status: 'Active'
    },
    {
      id: 'domain-2',
      projectId: 'project-1',
      domain: 'myawesomeapp.com',
      domainType: 'custom',
      verified: true,
      sslStatus: 'issued',
      provider: 'vercel',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
      verifiedAt: new Date(Date.now() - 3600000).toISOString(),
      sslIssuedAt: new Date(Date.now() - 1800000).toISOString(),
      url: 'https://myawesomeapp.com',
      status: 'Active'
    },
    {
      id: 'domain-3',
      projectId: 'project-2',
      domain: 'shop.example.com',
      domainType: 'custom',
      verified: false,
      sslStatus: 'pending',
      provider: 'cloudflare',
      verificationRecord: 'abc123.domains.magi.dev',
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      updatedAt: new Date().toISOString(),
      url: 'https://shop.example.com',
      status: 'Pending Verification',
      verificationInstructions: {
        recordType: 'CNAME',
        name: '_magi-verify.shop.example.com',
        value: 'abc123.domains.magi.dev',
        instructions: 'Add a CNAME record with name "_magi-verify" pointing to "abc123.domains.magi.dev" to verify ownership of shop.example.com.'
      }
    }
  ];

  beforeEach(() => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDomains),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the domains management interface', async () => {
    render(<DomainsTab />);

    expect(screen.getByText('Domains')).toBeInTheDocument();
    expect(screen.getByText('Manage project domains and SSL certificates')).toBeInTheDocument();
    expect(screen.getByText('Add Domain')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Domains')).toBeInTheDocument();
      expect(screen.getByText('SSL Certificates')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });

  it('displays loading state initially', () => {
    render(<DomainsTab />);

    // Should show loading cards
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
  });

  it('displays domain statistics in overview tab', async () => {
    render(<DomainsTab />);

    await waitFor(() => {
      expect(screen.getByText('Total Domains')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Custom')).toBeInTheDocument();
      expect(screen.getByText('Subdomains')).toBeInTheDocument();
      expect(screen.getByText('SSL Issued')).toBeInTheDocument();
    });

    // Check stats values
    expect(screen.getByText('3')).toBeInTheDocument(); // Total domains
    expect(screen.getByText('2')).toBeInTheDocument(); // Active domains
    expect(screen.getByText('1')).toBeInTheDocument(); // Subdomains
  });

  it('displays domains list in domains tab', async () => {
    const user = userEvent.setup();
    render(<DomainsTab />);

    // Switch to domains tab
    await user.click(screen.getByRole('tab', { name: /domains/i }));

    await waitFor(() => {
      expect(screen.getByText('my-app.magi.dev')).toBeInTheDocument();
      expect(screen.getByText('myawesomeapp.com')).toBeInTheDocument();
      expect(screen.getByText('shop.example.com')).toBeInTheDocument();
    });

    // Check domain status badges
    expect(screen.getAllByText('Active')).toHaveLength(2);
    expect(screen.getByText('Pending Verification')).toBeInTheDocument();
  });

  it('opens add domain dialog when button is clicked', async () => {
    const user = userEvent.setup();
    render(<DomainsTab />);

    await user.click(screen.getByText('Add Domain'));

    expect(screen.getByText('Add New Domain')).toBeInTheDocument();
    expect(screen.getByText('Add a custom domain or create a subdomain for your project.')).toBeInTheDocument();
    expect(screen.getByLabelText('Project')).toBeInTheDocument();
    expect(screen.getByLabelText('Domain Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Domain')).toBeInTheDocument();
  });

  it('creates a new domain when form is submitted', async () => {
    const user = userEvent.setup();

    // Mock successful create response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'new-domain',
        domain: 'newsite.com',
        status: 'Pending Verification'
      }),
    });

    render(<DomainsTab />);

    // Open dialog
    await user.click(screen.getByText('Add Domain'));

    // Fill form
    await user.selectOptions(screen.getByLabelText('Project'), 'project-1');
    await user.selectOptions(screen.getByLabelText('Domain Type'), 'custom');
    await user.type(screen.getByLabelText('Domain'), 'newsite.com');
    await user.selectOptions(screen.getByLabelText('SSL Provider'), 'vercel');

    // Submit form
    await user.click(screen.getByRole('button', { name: 'Add Domain' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'newsite.com',
          projectId: 'project-1',
          domainType: 'custom',
          provider: 'vercel',
          redirectTo: ''
        }),
      });
    });
  });

  it('shows verification instructions for unverified domains', async () => {
    const user = userEvent.setup();
    render(<DomainsTab />);

    // Switch to domains tab
    await user.click(screen.getByRole('tab', { name: /domains/i }));

    await waitFor(() => {
      expect(screen.getByText('DNS Verification Required')).toBeInTheDocument();
      expect(screen.getByText('Record Type: CNAME')).toBeInTheDocument();
      expect(screen.getByText('Name: _magi-verify.shop.example.com')).toBeInTheDocument();
      expect(screen.getByText('Value: abc123.domains.magi.dev')).toBeInTheDocument();
    });
  });

  it('allows verifying pending domains', async () => {
    const user = userEvent.setup();

    // Mock successful verification response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ verified: true }),
    });

    render(<DomainsTab />);

    // Switch to domains tab
    await user.click(screen.getByRole('tab', { name: /domains/i }));

    await waitFor(() => {
      expect(screen.getByText('Verify Domain')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Verify Domain'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/domains/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId: 'domain-3' }),
      });
    });
  });

  it('allows deleting custom domains', async () => {
    const user = userEvent.setup();

    // Mock successful delete response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
    });

    render(<DomainsTab />);

    // Switch to domains tab
    await user.click(screen.getByRole('tab', { name: /domains/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Delete')).toHaveLength(2); // Two custom domains
    });

    await user.click(screen.getAllByText('Delete')[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/domains/domain-2', {
        method: 'DELETE',
      });
    });
  });

  it('allows copying DNS records to clipboard', async () => {
    const user = userEvent.setup();
    render(<DomainsTab />);

    // Switch to domains tab
    await user.click(screen.getByRole('tab', { name: /domains/i }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /copy/i })).toHaveLength(4); // 3 DNS records + 1 URL
    });

    const copyButtons = screen.getAllByRole('button', { name: /copy/i });
    await user.click(copyButtons[0]);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('CNAME');
  });

  it('displays SSL certificates in SSL tab', async () => {
    const user = userEvent.setup();
    render(<DomainsTab />);

    // Switch to SSL tab
    await user.click(screen.getByRole('tab', { name: /ssl/i }));

    await waitFor(() => {
      expect(screen.getByText('SSL Certificates')).toBeInTheDocument();
      expect(screen.getByText('Manage SSL certificates for your domains')).toBeInTheDocument();
    });

    // Check SSL status for each domain
    expect(screen.getAllByText('issued')).toHaveLength(2);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('shows settings in settings tab', async () => {
    const user = userEvent.setup();
    render(<DomainsTab />);

    // Switch to settings tab
    await user.click(screen.getByRole('tab', { name: /settings/i }));

    await waitFor(() => {
      expect(screen.getByText('Domain Settings')).toBeInTheDocument();
      expect(screen.getByText('Wildcard SSL Certificate')).toBeInTheDocument();
      expect(screen.getByText('Auto-Verification')).toBeInTheDocument();
      expect(screen.getByText('SSL Auto-Renewal')).toBeInTheDocument();
    });

    // Check settings are enabled
    expect(screen.getByText('*.magi.dev')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('filters domains by project', async () => {
    const user = userEvent.setup();
    render(<DomainsTab />);

    // Switch to domains tab
    await user.click(screen.getByRole('tab', { name: /domains/i }));

    await waitFor(() => {
      expect(screen.getByText('my-app.magi.dev')).toBeInTheDocument();
      expect(screen.getByText('shop.example.com')).toBeInTheDocument();
    });

    // Filter by specific project
    await user.selectOptions(screen.getByDisplayValue('All Projects'), 'project-1');

    // Should only show domains for project-1
    expect(screen.getByText('my-app.magi.dev')).toBeInTheDocument();
    expect(screen.getByText('myawesomeapp.com')).toBeInTheDocument();
    expect(screen.queryByText('shop.example.com')).not.toBeInTheDocument();
  });

  it('shows provider icons correctly', async () => {
    const user = userEvent.setup();
    render(<DomainsTab />);

    // Switch to domains tab
    await user.click(screen.getByRole('tab', { name: /domains/i }));

    await waitFor(() => {
      expect(screen.getAllByText('vercel')).toHaveLength(2);
      expect(screen.getByText('cloudflare')).toBeInTheDocument();
    });
  });

  it('handles domain creation errors gracefully', async () => {
    const user = userEvent.setup();

    // Mock failed create response
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

    render(<DomainsTab />);

    // Open dialog and try to create domain
    await user.click(screen.getByText('Add Domain'));
    await user.selectOptions(screen.getByLabelText('Project'), 'project-1');
    await user.type(screen.getByLabelText('Domain'), 'newsite.com');
    await user.click(screen.getByRole('button', { name: 'Add Domain' }));

    // Should handle error gracefully (no crash)
    expect(screen.getByText('Add New Domain')).toBeInTheDocument();
  });

  it('validates form before allowing submission', async () => {
    const user = userEvent.setup();
    render(<DomainsTab />);

    await user.click(screen.getByText('Add Domain'));

    // Submit button should be disabled when required fields are empty
    const submitButton = screen.getByRole('button', { name: 'Add Domain' });
    expect(submitButton).toBeDisabled();

    // Fill required fields
    await user.selectOptions(screen.getByLabelText('Project'), 'project-1');
    await user.type(screen.getByLabelText('Domain'), 'newsite.com');

    // Submit button should now be enabled
    expect(submitButton).toBeEnabled();
  });

  it('displays recent domains in overview', async () => {
    render(<DomainsTab />);

    await waitFor(() => {
      expect(screen.getByText('Recent Domains')).toBeInTheDocument();
      expect(screen.getByText('Latest domain additions and updates')).toBeInTheDocument();
    });

    // Should show first 3 domains as recent
    expect(screen.getByText('my-app.magi.dev')).toBeInTheDocument();
    expect(screen.getByText('myawesomeapp.com')).toBeInTheDocument();
    expect(screen.getByText('shop.example.com')).toBeInTheDocument();
  });

  it('opens external domain links correctly', async () => {
    const user = userEvent.setup();
    render(<DomainsTab />);

    // Switch to domains tab
    await user.click(screen.getByRole('tab', { name: /domains/i }));

    await waitFor(() => {
      const externalLinks = screen.getAllByRole('link');
      expect(externalLinks).toHaveLength(3); // One for each domain
      expect(externalLinks[0]).toHaveAttribute('href', 'https://my-app.magi.dev');
      expect(externalLinks[0]).toHaveAttribute('target', '_blank');
    });
  });
});