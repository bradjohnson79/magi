import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  // Clean existing data
  await prisma.telemetryEvent.deleteMany()
  await prisma.feedback.deleteMany()
  await prisma.modelRun.deleteMany()
  await prisma.model.deleteMany()
  await prisma.snapshot.deleteMany()
  await prisma.log.deleteMany()
  await prisma.billing.deleteMany()
  await prisma.prompt.deleteMany()
  await prisma.secret.deleteMany()
  await prisma.project.deleteMany()
  await prisma.teamMember.deleteMany()
  await prisma.team.deleteMany()
  await prisma.workspace.deleteMany()
  await prisma.user.deleteMany()

  // Create users
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@magi.dev',
      name: 'Admin User',
      role: 'admin',
      clerkId: 'clerk_admin_123',
      metadata: { preferences: { theme: 'dark' } },
    },
  })

  const testUser = await prisma.user.create({
    data: {
      email: 'test@magi.dev',
      name: 'Test User',
      role: 'user',
      clerkId: 'clerk_test_456',
      metadata: { preferences: { theme: 'light' } },
    },
  })

  // Create workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Magi Development Workspace',
      ownerId: adminUser.id,
      slug: 'magi-dev-workspace',
      settings: {
        defaultModel: 'gpt-4-turbo',
        allowedFileTypes: ['ts', 'tsx', 'js', 'jsx', 'md'],
        maxFileSize: 1048576
      },
      metadata: { description: 'Main development workspace for Magi projects' },
    },
  })

  // Create team
  const team = await prisma.team.create({
    data: {
      name: 'Magi Development Team',
      ownerId: adminUser.id,
      slug: 'magi-dev',
      metadata: { description: 'Core development team' },
    },
  })

  // Add team member
  await prisma.teamMember.create({
    data: {
      teamId: team.id,
      userId: testUser.id,
      role: 'developer',
      permissions: { canEdit: true, canDelete: false },
    },
  })

  // Create billing
  await prisma.billing.create({
    data: {
      userId: adminUser.id,
      plan: 'pro',
      status: 'active',
      stripeCustomerId: 'cus_mock_123',
      stripeSubscriptionId: 'sub_mock_456',
      renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      usageLimits: { projects: 100, prompts: 10000 },
    },
  })

  await prisma.billing.create({
    data: {
      userId: testUser.id,
      plan: 'free',
      status: 'active',
      usageLimits: { projects: 3, prompts: 100 },
    },
  })

  // Create models
  const models = await Promise.all([
    prisma.model.create({
      data: {
        name: 'GPT-4 Turbo',
        provider: 'openai',
        role: 'code_generation',
        version: 'gpt-4-turbo-preview',
        config: { temperature: 0.7, maxTokens: 4000 },
        capabilities: ['javascript', 'typescript', 'react', 'nextjs'],
        isActive: true,
      },
    }),
    prisma.model.create({
      data: {
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        role: 'schema_design',
        version: 'claude-3-opus',
        config: { temperature: 0.5, maxTokens: 4000 },
        capabilities: ['database', 'architecture', 'system-design'],
        isActive: true,
      },
    }),
    prisma.model.create({
      data: {
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        role: 'qa_testing',
        version: 'gpt-3.5-turbo',
        config: { temperature: 0.3, maxTokens: 2000 },
        capabilities: ['testing', 'validation', 'documentation'],
        isActive: true,
      },
    }),
  ])

  // Create projects in workspace
  const project1 = await prisma.project.create({
    data: {
      teamId: team.id,
      workspaceId: workspace.id,
      ownerId: adminUser.id,
      name: 'E-Commerce Platform',
      type: 'nextjs',
      status: 'active',
      config: { framework: 'nextjs', database: 'postgresql', styling: 'tailwind' },
      metadata: { version: '1.0.0', lastDeployment: new Date().toISOString() },
    },
  })

  const project2 = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      ownerId: testUser.id,
      name: 'Personal Blog',
      type: 'react',
      status: 'active',
      config: { framework: 'react', database: 'sqlite', styling: 'css' },
      metadata: { version: '0.1.0' },
    },
  })

  // Create demo secrets (global secrets for the platform)
  await prisma.secret.create({
    data: {
      name: 'OPENAI_API_KEY',
      valueEncrypted: 'encrypted_demo_key_sk-1234567890abcdef',
      maskedValue: 'sk-****...abcdef',
      provider: 'openai',
      description: 'OpenAI API key for GPT models',
      createdBy: adminUser.id,
    },
  })

  await prisma.secret.create({
    data: {
      name: 'STRIPE_SECRET_KEY',
      valueEncrypted: 'encrypted_sk_test_demo_1234567890',
      maskedValue: 'sk_test_****...67890',
      provider: 'stripe',
      description: 'Stripe secret key for payments',
      createdBy: adminUser.id,
    },
  })

  await prisma.secret.create({
    data: {
      name: 'EMAIL_SERVICE_KEY',
      valueEncrypted: 'encrypted_demo_email_key_abc123',
      maskedValue: 'demo_****...bc123',
      provider: 'sendgrid',
      description: 'Email service API key',
      createdBy: testUser.id,
    },
  })

  // Create prompts
  await prisma.prompt.create({
    data: {
      projectId: project1.id,
      userId: adminUser.id,
      content: 'Create a product listing page with filters and search',
      response: 'Generated ProductListing component with filtering and search functionality...',
      tokensUsed: 1500,
      costCents: 3,
      metadata: { model: 'gpt-4-turbo', duration: 2500 },
    },
  })

  await prisma.prompt.create({
    data: {
      projectId: project2.id,
      userId: testUser.id,
      content: 'Add a contact form with email validation',
      response: 'Created ContactForm component with email validation...',
      tokensUsed: 800,
      costCents: 1,
      metadata: { model: 'gpt-3.5-turbo', duration: 1200 },
    },
  })

  // Create model runs
  const modelRun1 = await prisma.modelRun.create({
    data: {
      projectId: project1.id,
      userId: adminUser.id,
      modelId: models[0].id,
      inputPayload: { task: 'generate_component', prompt: 'Create product listing' },
      outputPayload: { code: '// Generated code...', files: ['ProductListing.tsx'] },
      success: true,
      runtimeMs: 2500,
      costUsd: 0.03,
      confidence: 0.92,
      provenance: { promptHash: 'abc123', version: '1.0' },
    },
  })

  // Create feedback
  await prisma.feedback.create({
    data: {
      modelRunId: modelRun1.id,
      userId: adminUser.id,
      rating: 4,
      comment: 'Good output but needed minor adjustments',
      correction: { original: 'const data = []', corrected: 'const data: Product[] = []' },
      metadata: { helpful: true },
    },
  })

  // Create snapshots
  await prisma.snapshot.create({
    data: {
      projectId: project1.id,
      createdBy: adminUser.id,
      snapshotName: 'Before major refactor',
      description: 'Snapshot before implementing new authentication system',
      metadata: { filesCount: 42, commitHash: 'abc123def' },
      storageRef: 's3://magi-snapshots/project1/snapshot1.tar.gz',
      sizeBytes: 1048576n,
    },
  })

  // Create logs
  await prisma.log.create({
    data: {
      projectId: project1.id,
      userId: adminUser.id,
      action: 'project.created',
      level: 'info',
      metadata: { projectName: 'E-Commerce Platform' },
    },
  })

  await prisma.log.create({
    data: {
      projectId: project2.id,
      userId: testUser.id,
      action: 'code.generated',
      level: 'info',
      metadata: { component: 'ContactForm' },
    },
  })

  // Create telemetry events
  await prisma.telemetryEvent.create({
    data: {
      projectId: project1.id,
      userId: adminUser.id,
      eventType: 'page.view',
      payload: { page: '/dashboard', duration: 1500 },
      sessionId: 'session_123',
    },
  })

  console.log('✅ Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })