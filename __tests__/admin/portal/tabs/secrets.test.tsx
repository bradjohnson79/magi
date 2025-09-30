import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SecretsTab from '@/app/admin/portal/tabs/secrets';

// Mock fetch
global.fetch = jest.fn();

// Mock crypto for secret masking
Object.defineProperty(window, 'crypto', {
  value: {
    getRandomValues: jest.fn(() => new Uint32Array(10)),
  },
});

describe('SecretsTab', () => {
  const mockSecrets = {
    'llm-providers': [
      {
        id: 'anthropic-key',
        name: 'Anthropic API Key',
        provider: 'Anthropic',
        key: 'anthropic_key',
        maskedValue: 'ant-***************************xyz',
        description: 'Claude API access',
        lastUpdated: new Date().toISOString(),
        isActive: true,
      },
      {
        id: 'openai-key',
        name: 'OpenAI API Key',
        provider: 'OpenAI',
        key: 'openai_key',
        maskedValue: 'sk-***************************abc',
        description: 'GPT model access',
        lastUpdated: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        isActive: true,
      },
    ],
    'storage-db': [
      {
        id: 'neon-connection',
        name: 'Neon Database URL',
        provider: 'Neon',
        key: 'database_url',
        maskedValue: 'postgresql://***************************',
        description: 'Primary database connection',
        lastUpdated: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        isActive: true,
      },
    ],
    'integrations': [],
  };

  beforeEach(() => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSecrets),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the secrets management interface', async () => {
    render(<SecretsTab />);

    expect(screen.getByText('Secrets / APIs')).toBeInTheDocument();
    expect(screen.getByText('Manage API keys, credentials, and configuration secrets')).toBeInTheDocument();
    expect(screen.getByText('Add Secret')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('LLM Providers')).toBeInTheDocument();
      expect(screen.getByText('Storage / Database')).toBeInTheDocument();
      expect(screen.getByText('Plugins / Integrations')).toBeInTheDocument();
    });
  });

  it('displays loading state initially', () => {
    render(<SecretsTab />);

    // Should show loading cards
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
  });

  it('displays secrets grouped by category', async () => {
    render(<SecretsTab />);

    await waitFor(() => {
      // LLM Providers section
      expect(screen.getByText('Anthropic API Key')).toBeInTheDocument();
      expect(screen.getByText('OpenAI API Key')).toBeInTheDocument();
      expect(screen.getByText('ant-***************************xyz')).toBeInTheDocument();
      expect(screen.getByText('sk-***************************abc')).toBeInTheDocument();

      // Storage section
      expect(screen.getByText('Neon Database URL')).toBeInTheDocument();
      expect(screen.getByText('postgresql://***************************')).toBeInTheDocument();
    });
  });

  it('shows empty state for categories with no secrets', async () => {
    render(<SecretsTab />);

    await waitFor(() => {
      // Click on Plugins / Integrations accordion
      fireEvent.click(screen.getByText('Plugins / Integrations'));
    });

    expect(screen.getByText('No secrets configured for this category')).toBeInTheDocument();
    expect(screen.getByText('Add your first integration secret to get started')).toBeInTheDocument();
  });

  it('opens add secret dialog when button is clicked', async () => {
    const user = userEvent.setup();
    render(<SecretsTab />);

    await user.click(screen.getByText('Add Secret'));

    expect(screen.getByText('Add New Secret')).toBeInTheDocument();
    expect(screen.getByText('Add a new API key or credential to your secrets manager')).toBeInTheDocument();
    expect(screen.getByLabelText('Secret Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Provider')).toBeInTheDocument();
    expect(screen.getByLabelText('Secret Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Secret Value')).toBeInTheDocument();
  });

  it('creates a new secret when form is submitted', async () => {
    const user = userEvent.setup();

    // Mock successful create response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'new-secret' }),
    });

    render(<SecretsTab />);

    // Open dialog
    await user.click(screen.getByText('Add Secret'));

    // Fill form
    await user.type(screen.getByLabelText('Secret Name'), 'Test API Key');
    await user.selectOptions(screen.getByLabelText('Provider'), 'Anthropic');
    await user.type(screen.getByLabelText('Secret Key'), 'test_api_key');
    await user.type(screen.getByLabelText('Secret Value'), 'test-secret-value-123');
    await user.type(screen.getByLabelText('Description (optional)'), 'Test description');

    // Submit form
    await user.click(screen.getByText('Add Secret'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test API Key',
          provider: 'Anthropic',
          key: 'test_api_key',
          value: 'test-secret-value-123',
          description: 'Test description',
          category: 'llm-providers',
        }),
      });
    });
  });

  it('shows validation errors for invalid form data', async () => {
    const user = userEvent.setup();
    render(<SecretsTab />);

    // Open dialog
    await user.click(screen.getByText('Add Secret'));

    // Try to submit without required fields
    await user.click(screen.getByText('Add Secret'));

    // Form should not submit (button should be disabled)
    const submitButton = screen.getByRole('button', { name: 'Add Secret' });
    expect(submitButton).toBeDisabled();
  });

  it('allows editing existing secrets', async () => {
    const user = userEvent.setup();
    render(<SecretsTab />);

    await waitFor(() => {
      expect(screen.getByText('Anthropic API Key')).toBeInTheDocument();
    });

    // Click edit button for first secret
    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await user.click(editButtons[0]);

    expect(screen.getByText('Edit Secret')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Anthropic API Key')).toBeInTheDocument();
  });

  it('allows deleting secrets with confirmation', async () => {
    const user = userEvent.setup();

    // Mock successful delete response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
    });

    render(<SecretsTab />);

    await waitFor(() => {
      expect(screen.getByText('Anthropic API Key')).toBeInTheDocument();
    });

    // Click delete button
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);

    // Confirm deletion
    expect(screen.getByText('Delete Secret')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/secrets/anthropic-key', {
        method: 'DELETE',
      });
    });
  });

  it('toggles secret visibility when eye icon is clicked', async () => {
    const user = userEvent.setup();
    render(<SecretsTab />);

    await waitFor(() => {
      expect(screen.getByText('ant-***************************xyz')).toBeInTheDocument();
    });

    // Click show/hide toggle
    const toggleButtons = screen.getAllByRole('button', { name: /toggle visibility/i });
    await user.click(toggleButtons[0]);

    // Should show unmasked value (mocked)
    expect(screen.getByText('anthropic_actual_key_value')).toBeInTheDocument();

    // Click again to hide
    await user.click(toggleButtons[0]);

    // Should show masked value again
    expect(screen.getByText('ant-***************************xyz')).toBeInTheDocument();
  });

  it('displays secret status badges correctly', async () => {
    render(<SecretsTab />);

    await waitFor(() => {
      // Active secrets should show green badge
      const activeBadges = screen.getAllByText('Active');
      expect(activeBadges[0]).toBeInTheDocument();
      expect(activeBadges[0].closest('span')).toHaveClass('text-green-600');
    });
  });

  it('shows last updated timestamps', async () => {
    render(<SecretsTab />);

    await waitFor(() => {
      expect(screen.getByText(/Updated/)).toBeInTheDocument();
      expect(screen.getByText(/1 day ago|yesterday/i)).toBeInTheDocument();
      expect(screen.getByText(/2 days ago/i)).toBeInTheDocument();
    });
  });

  it('filters secrets by search query', async () => {
    const user = userEvent.setup();
    render(<SecretsTab />);

    await waitFor(() => {
      expect(screen.getByText('Anthropic API Key')).toBeInTheDocument();
      expect(screen.getByText('OpenAI API Key')).toBeInTheDocument();
    });

    // Search for "Anthropic"
    const searchInput = screen.getByPlaceholderText('Search secrets...');
    await user.type(searchInput, 'Anthropic');

    // Should show only Anthropic secret
    expect(screen.getByText('Anthropic API Key')).toBeInTheDocument();
    expect(screen.queryByText('OpenAI API Key')).not.toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

    render(<SecretsTab />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load secrets')).toBeInTheDocument();
    });
  });

  it('validates required fields in add secret form', async () => {
    const user = userEvent.setup();
    render(<SecretsTab />);

    await user.click(screen.getByText('Add Secret'));

    // Submit button should be disabled when required fields are empty
    const submitButton = screen.getByRole('button', { name: 'Add Secret' });
    expect(submitButton).toBeDisabled();

    // Fill required fields
    await user.type(screen.getByLabelText('Secret Name'), 'Test');
    await user.selectOptions(screen.getByLabelText('Provider'), 'Anthropic');
    await user.type(screen.getByLabelText('Secret Key'), 'test_key');
    await user.type(screen.getByLabelText('Secret Value'), 'test_value');

    // Submit button should now be enabled
    expect(submitButton).toBeEnabled();
  });

  it('correctly maps providers to categories', async () => {
    const user = userEvent.setup();
    render(<SecretsTab />);

    await user.click(screen.getByText('Add Secret'));

    // Select different providers and verify category mapping
    await user.selectOptions(screen.getByLabelText('Provider'), 'Stripe');

    // Fill other required fields
    await user.type(screen.getByLabelText('Secret Name'), 'Stripe Key');
    await user.type(screen.getByLabelText('Secret Key'), 'stripe_key');
    await user.type(screen.getByLabelText('Secret Value'), 'sk_test_123');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'new-stripe-secret' }),
    });

    await user.click(screen.getByRole('button', { name: 'Add Secret' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Stripe Key',
          provider: 'Stripe',
          key: 'stripe_key',
          value: 'sk_test_123',
          description: '',
          category: 'integrations',
        }),
      });
    });
  });

  it('displays secret count badges for each category', async () => {
    render(<SecretsTab />);

    await waitFor(() => {
      // Should show count badges
      expect(screen.getByText('2')).toBeInTheDocument(); // LLM Providers
      expect(screen.getByText('1')).toBeInTheDocument(); // Storage/DB
      expect(screen.getByText('0')).toBeInTheDocument(); // Integrations
    });
  });
});