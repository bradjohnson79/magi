/**
 * AI Matrix Orchestration Router
 *
 * Maps natural language intents to task graphs and selects appropriate agents.
 * Implements rule-based routing to start, with extensibility for ML-based routing.
 */

import { prisma } from '@/lib/db';
import { redactSecretsFromObject } from '@/lib/utils/secretRedaction';
import { projectClassifier, ProjectCategory } from './classifier';
import { stackRecommender, RecommendedStack } from './recommender';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES, getCurrentTraceId, getCurrentSpanId } from '@/services/tracing/setup';
import { AgentSecretsHelper } from '@/services/agents/secretsHelper';
import { feedbackManager, StackCorrection } from './feedback';

// Task types and agent definitions
export type TaskType =
  | 'schema_design'
  | 'code_generation'
  | 'authentication'
  | 'testing'
  | 'documentation'
  | 'deployment'
  | 'security_scan'
  | 'performance_optimization'
  | 'bug_fix'
  | 'feature_enhancement';

export type AgentType =
  | 'ClaudeCode'
  | 'ChatGPT'
  | 'SchemaAgent'
  | 'CodeGenAgent'
  | 'AuthAgent'
  | 'QAAgent'
  | 'MCPAgent';

export interface Task {
  id: string;
  type: TaskType;
  agent: AgentType;
  priority: number;
  dependencies: string[];
  inputs: Record<string, any>;
  outputs?: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  metadata?: {
    estimatedDuration?: number;
    complexity?: 'low' | 'medium' | 'high';
    requiresHuman?: boolean;
    snapshotRequired?: boolean;
  };
}

export interface TaskGraph {
  id: string;
  intent: string;
  tasks: Task[];
  estimatedTimeMs: number;
  metadata: {
    complexity: 'low' | 'medium' | 'high';
    confidence: number;
    riskLevel: 'low' | 'medium' | 'high';
    requiresApproval: boolean;
    projectCategory?: ProjectCategory;
    recommendedStack?: RecommendedStack;
    classificationConfidence?: number;
  };
}

export interface IntentContext {
  projectId?: string;
  userId: string;
  currentState?: Record<string, any>;
  userPlan?: string;
  teamSize?: number;
  userPreferences?: Record<string, any>;
  constraints?: {
    timeLimit?: number;
    budget?: number;
    technologies?: string[];
    securityLevel?: 'standard' | 'strict' | 'enterprise';
  };
}

/**
 * Intent patterns for rule-based routing
 */
const INTENT_PATTERNS = {
  // Database and Schema
  database: [
    /create.*database/i,
    /design.*schema/i,
    /add.*table/i,
    /database.*migration/i,
    /prisma.*model/i,
  ],

  // Authentication and Security
  authentication: [
    /add.*auth/i,
    /login.*system/i,
    /user.*management/i,
    /permission/i,
    /security.*audit/i,
  ],

  // Code Generation
  codeGeneration: [
    /create.*component/i,
    /build.*feature/i,
    /generate.*code/i,
    /implement.*function/i,
    /add.*endpoint/i,
  ],

  // Testing
  testing: [
    /write.*test/i,
    /test.*coverage/i,
    /e2e.*test/i,
    /unit.*test/i,
    /qa.*automation/i,
  ],

  // Bug Fixes
  bugFix: [
    /fix.*bug/i,
    /resolve.*issue/i,
    /debug/i,
    /error.*handling/i,
    /troubleshoot/i,
  ],

  // Performance
  performance: [
    /optimize.*performance/i,
    /improve.*speed/i,
    /cache/i,
    /reduce.*latency/i,
    /scale/i,
  ],

  // Documentation
  documentation: [
    /write.*docs/i,
    /documentation/i,
    /readme/i,
    /api.*docs/i,
    /comment.*code/i,
  ],

  // Deployment
  deployment: [
    /deploy/i,
    /ci.*cd/i,
    /build.*pipeline/i,
    /release/i,
    /production/i,
  ],
};

/**
 * AI Matrix Orchestration Router
 */
export class OrchestrationRouter {
  private userId: string;
  private projectId?: string;
  private secrets: AgentSecretsHelper;

  constructor(userId: string, projectId?: string) {
    this.userId = userId;
    this.projectId = projectId;
    this.secrets = new AgentSecretsHelper('orchestration-router', userId);
  }

  /**
   * Route an intent to a task graph with intelligent classification
   */
  async routeIntent(intent: string, context: IntentContext): Promise<TaskGraph> {
    return await withSpan('router.route_intent', async () => {
      try {
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'intent_routing',
          'intent.length': intent.length,
          'user.id': context.userId,
          'project.id': context.projectId || 'unknown',
        });

        // Log the routing attempt
        await this.logRouting('intent_received', { intent, context });

        // Step 1: Classify the project intent
        const classification = await projectClassifier.classifyProjectIntent(
          intent,
          context.projectId,
          context.userId
        );

        // Store classification in project if provided
        if (context.projectId && classification.category !== ProjectCategory.UNKNOWN) {
          await projectClassifier.storeClassificationResult(context.projectId, classification);
        }

        // Step 2: Get stack recommendation based on classification
        const recommendedStack = await stackRecommender.recommendStack(
          classification.category,
          {
            userId: context.userId,
            teamSize: context.teamSize,
            userPlan: context.userPlan,
            preferences: context.userPreferences,
          }
        );

        // Step 3: Analyze intent complexity and requirements (enhanced with classification)
        const analysis = await this.analyzeIntentWithClassification(
          intent,
          context,
          classification,
          recommendedStack
        );

        // Step 4: Generate task graph based on classification and stack recommendation
        const taskGraph = this.generateTaskGraphWithStack(
          intent,
          analysis,
          context,
          classification,
          recommendedStack
        );

        // Step 5: Validate and optimize task graph
        const optimizedGraph = this.optimizeTaskGraph(taskGraph);

        // Step 6: Store chosen stack in model run provenance (will be done during execution)
        await this.logModelRunPlanning(optimizedGraph, classification, recommendedStack);

        // Log successful routing
        await this.logRouting('task_graph_generated', {
          intent,
          category: classification.category,
          confidence: classification.confidence,
          stackComplexity: recommendedStack.complexity,
          taskCount: optimizedGraph.tasks.length,
          estimatedTime: optimizedGraph.estimatedTimeMs,
        });

        return optimizedGraph;

      } catch (error) {
        await this.logRouting('routing_error', {
          intent,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    });
  }

  /**
   * Enhanced intent analysis with classification context
   */
  private async analyzeIntentWithClassification(
    intent: string,
    context: IntentContext,
    classification: any,
    recommendedStack: RecommendedStack
  ) {
    // Start with basic analysis
    const basicAnalysis = this.analyzeIntent(intent, context);

    // Enhance with classification insights
    const enhancedComplexity = this.enhanceComplexityWithStack(
      basicAnalysis.complexity,
      recommendedStack.complexity
    );

    // Adjust confidence based on classification confidence
    const adjustedConfidence = Math.min(
      basicAnalysis.confidence * classification.confidence,
      1.0
    );

    return {
      ...basicAnalysis,
      complexity: enhancedComplexity,
      confidence: adjustedConfidence,
      projectCategory: classification.category,
      stackRecommendation: recommendedStack,
      classificationMethod: classification.method,
      stackConfidence: recommendedStack.confidence,
    };
  }

  /**
   * Generate enhanced task graph with stack-specific tasks
   */
  private generateTaskGraphWithStack(
    intent: string,
    analysis: any,
    context: IntentContext,
    classification: any,
    recommendedStack: RecommendedStack
  ): TaskGraph {
    const taskId = `task-${Date.now()}`;

    // Generate base tasks
    const baseTasks = this.generateTasks(analysis.category, analysis, context);

    // Add stack-specific setup tasks if this is a new project
    const stackTasks = this.generateStackSetupTasks(
      recommendedStack,
      classification.category,
      context
    );

    // Combine tasks
    const allTasks = [...stackTasks, ...baseTasks];

    // Update dependencies to ensure stack setup happens first
    const updatedTasks = this.updateTaskDependencies(allTasks, stackTasks);

    // Calculate estimated time
    const estimatedTimeMs = updatedTasks.reduce((total, task) =>
      total + (task.metadata?.estimatedDuration || 30000), 0
    );

    return {
      id: taskId,
      intent,
      tasks: updatedTasks,
      estimatedTimeMs,
      metadata: {
        complexity: analysis.complexity,
        confidence: analysis.confidence,
        riskLevel: analysis.riskLevel,
        requiresApproval: analysis.requiresApproval,
        projectCategory: classification.category,
        recommendedStack,
        classificationConfidence: classification.confidence,
      },
    };
  }

  /**
   * Generate stack setup tasks for new projects
   */
  private generateStackSetupTasks(
    stack: RecommendedStack,
    category: ProjectCategory,
    context: IntentContext
  ): Task[] {
    const baseTaskId = `setup-${Date.now()}`;
    const tasks: Task[] = [];

    // Only add setup tasks for new projects or when explicitly requested
    const needsSetup = this.determineIfSetupNeeded(stack, context);
    if (!needsSetup) return [];

    // Database setup task
    if (stack.database.primary !== 'None') {
      tasks.push({
        id: `${baseTaskId}-db`,
        type: 'schema_design',
        agent: 'SchemaAgent',
        priority: 1,
        dependencies: [],
        inputs: {
          context,
          database: stack.database.primary,
          category,
        },
        status: 'pending',
        metadata: {
          estimatedDuration: 45000,
          complexity: stack.complexity === 'simple' ? 'low' : 'medium',
          snapshotRequired: true,
        },
      });
    }

    // Authentication setup task
    if (stack.auth.provider !== 'None') {
      tasks.push({
        id: `${baseTaskId}-auth`,
        type: 'authentication',
        agent: 'AuthAgent',
        priority: 2,
        dependencies: stack.database.primary !== 'None' ? [`${baseTaskId}-db`] : [],
        inputs: {
          context,
          authProvider: stack.auth.provider,
          category,
        },
        status: 'pending',
        metadata: {
          estimatedDuration: 60000,
          complexity: 'medium',
          requiresHuman: true,
          snapshotRequired: true,
        },
      });
    }

    // Frontend setup task
    if (stack.frontend.framework !== 'None') {
      const dependencies = [];
      if (stack.database.primary !== 'None') dependencies.push(`${baseTaskId}-db`);
      if (stack.auth.provider !== 'None') dependencies.push(`${baseTaskId}-auth`);

      tasks.push({
        id: `${baseTaskId}-frontend`,
        type: 'code_generation',
        agent: 'CodeGenAgent',
        priority: 3,
        dependencies,
        inputs: {
          context,
          framework: stack.frontend.framework,
          language: stack.frontend.language,
          styling: stack.frontend.styling,
          category,
        },
        status: 'pending',
        metadata: {
          estimatedDuration: 90000,
          complexity: stack.complexity === 'simple' ? 'low' : 'medium',
          snapshotRequired: true,
        },
      });
    }

    // Backend setup task (if separate from frontend)
    if (stack.backend && stack.backend.framework !== stack.frontend.framework) {
      tasks.push({
        id: `${baseTaskId}-backend`,
        type: 'code_generation',
        agent: 'CodeGenAgent',
        priority: 4,
        dependencies: [`${baseTaskId}-frontend`],
        inputs: {
          context,
          framework: stack.backend.framework,
          language: stack.backend.language,
          category,
        },
        status: 'pending',
        metadata: {
          estimatedDuration: 75000,
          complexity: 'medium',
          snapshotRequired: true,
        },
      });
    }

    return tasks;
  }

  /**
   * Enhance complexity assessment with stack complexity
   */
  private enhanceComplexityWithStack(
    intentComplexity: 'low' | 'medium' | 'high',
    stackComplexity: 'simple' | 'moderate' | 'complex'
  ): 'low' | 'medium' | 'high' {
    const complexityMatrix = {
      low: { simple: 'low', moderate: 'low', complex: 'medium' },
      medium: { simple: 'low', moderate: 'medium', complex: 'high' },
      high: { simple: 'medium', moderate: 'high', complex: 'high' },
    };

    return complexityMatrix[intentComplexity][stackComplexity] as 'low' | 'medium' | 'high';
  }

  /**
   * Determine if stack setup is needed
   */
  private determineIfSetupNeeded(stack: RecommendedStack, context: IntentContext): boolean {
    // Check if this is likely a new project setup
    const setupKeywords = [
      'create', 'build', 'start', 'new', 'initialize', 'setup',
      'bootstrap', 'scaffold', 'generate project'
    ];

    // Simple heuristic - could be enhanced with project state analysis
    return setupKeywords.some(keyword =>
      context.currentState?.intent?.toLowerCase().includes(keyword)
    ) || !context.currentState;
  }

  /**
   * Update task dependencies to ensure proper order
   */
  private updateTaskDependencies(allTasks: Task[], setupTasks: Task[]): Task[] {
    if (setupTasks.length === 0) return allTasks;

    const setupTaskIds = new Set(setupTasks.map(t => t.id));
    const lastSetupTaskId = setupTasks[setupTasks.length - 1]?.id;

    return allTasks.map(task => {
      // Skip setup tasks
      if (setupTaskIds.has(task.id)) return task;

      // Add dependency on last setup task for non-setup tasks
      if (lastSetupTaskId && !task.dependencies.includes(lastSetupTaskId)) {
        return {
          ...task,
          dependencies: [...task.dependencies, lastSetupTaskId],
        };
      }

      return task;
    });
  }

  /**
   * Log model run planning for provenance tracking
   */
  private async logModelRunPlanning(
    taskGraph: TaskGraph,
    classification: any,
    recommendedStack: RecommendedStack
  ): Promise<void> {
    try {
      // This will be stored in model_runs.provenance when execution starts
      const provenanceData = {
        router_version: '2.0.0',
        classification: {
          category: classification.category,
          confidence: classification.confidence,
          method: classification.method,
          reasoning: classification.reasoning,
        },
        recommended_stack: {
          database: recommendedStack.database.primary,
          auth: recommendedStack.auth.provider,
          frontend: recommendedStack.frontend.framework,
          backend: recommendedStack.backend?.framework,
          hosting: recommendedStack.hosting.platform,
          complexity: recommendedStack.complexity,
          confidence: recommendedStack.confidence,
        },
        task_graph: {
          id: taskGraph.id,
          task_count: taskGraph.tasks.length,
          estimated_time_ms: taskGraph.estimatedTimeMs,
          requires_approval: taskGraph.metadata.requiresApproval,
        },
        trace_id: getCurrentTraceId(),
        span_id: getCurrentSpanId(),
        planning_timestamp: new Date().toISOString(),
      };

      await this.logRouting('model_run_planned', provenanceData);
    } catch (error) {
      console.warn('Failed to log model run planning:', error);
    }
  }

  /**
   * Analyze intent to determine complexity and requirements
   */
  private analyzeIntent(intent: string, context: IntentContext) {
    const intentLower = intent.toLowerCase();

    // Determine primary intent category
    const category = this.categorizeIntent(intentLower);

    // Assess complexity based on keywords and context
    const complexity = this.assessComplexity(intentLower, context);

    // Calculate confidence in routing decision
    const confidence = this.calculateConfidence(intentLower, category);

    // Assess risk level
    const riskLevel = this.assessRiskLevel(intentLower, context);

    return {
      category,
      complexity,
      confidence,
      riskLevel,
      requiresApproval: riskLevel === 'high' || complexity === 'high',
      keywords: this.extractKeywords(intentLower),
    };
  }

  /**
   * Categorize intent based on patterns
   */
  private categorizeIntent(intent: string): TaskType {
    for (const [category, patterns] of Object.entries(INTENT_PATTERNS)) {
      if (patterns.some(pattern => pattern.test(intent))) {
        switch (category) {
          case 'database': return 'schema_design';
          case 'authentication': return 'authentication';
          case 'codeGeneration': return 'code_generation';
          case 'testing': return 'testing';
          case 'bugFix': return 'bug_fix';
          case 'performance': return 'performance_optimization';
          case 'documentation': return 'documentation';
          case 'deployment': return 'deployment';
          default: return 'feature_enhancement';
        }
      }
    }

    // Default to feature enhancement for unmatched intents
    return 'feature_enhancement';
  }

  /**
   * Assess complexity based on intent and context
   */
  private assessComplexity(intent: string, context: IntentContext): 'low' | 'medium' | 'high' {
    let complexityScore = 0;

    // Check for complexity indicators
    const highComplexityKeywords = [
      'enterprise', 'scale', 'migrate', 'refactor', 'architecture',
      'distributed', 'microservice', 'real-time', 'machine learning'
    ];

    const mediumComplexityKeywords = [
      'integrate', 'optimize', 'security', 'authentication', 'database',
      'api', 'deployment', 'testing', 'performance'
    ];

    if (highComplexityKeywords.some(keyword => intent.includes(keyword))) {
      complexityScore += 3;
    }

    if (mediumComplexityKeywords.some(keyword => intent.includes(keyword))) {
      complexityScore += 2;
    }

    // Consider context factors
    if (context.constraints?.securityLevel === 'enterprise') complexityScore += 2;
    if (context.constraints?.timeLimit && context.constraints.timeLimit < 3600000) complexityScore += 1; // < 1 hour

    if (complexityScore >= 4) return 'high';
    if (complexityScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * Calculate confidence in routing decision
   */
  private calculateConfidence(intent: string, category: TaskType): number {
    // Start with base confidence
    let confidence = 0.7;

    // Increase confidence for clear pattern matches
    const patterns = Object.values(INTENT_PATTERNS).flat();
    const matchCount = patterns.filter(pattern => pattern.test(intent)).length;

    confidence += Math.min(matchCount * 0.1, 0.3);

    // Decrease confidence for ambiguous or complex intents
    if (intent.split(' ').length > 20) confidence -= 0.1;
    if (intent.includes('maybe') || intent.includes('perhaps')) confidence -= 0.2;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Assess risk level of the intent
   */
  private assessRiskLevel(intent: string, context: IntentContext): 'low' | 'medium' | 'high' {
    const highRiskKeywords = [
      'delete', 'drop', 'remove', 'production', 'live', 'migrate',
      'security', 'authentication', 'permission', 'admin'
    ];

    const mediumRiskKeywords = [
      'deploy', 'update', 'modify', 'change', 'database', 'schema'
    ];

    if (highRiskKeywords.some(keyword => intent.toLowerCase().includes(keyword))) {
      return 'high';
    }

    if (mediumRiskKeywords.some(keyword => intent.toLowerCase().includes(keyword))) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Extract relevant keywords from intent
   */
  private extractKeywords(intent: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'among', 'can', 'could',
      'should', 'would', 'will', 'shall', 'may', 'might', 'must', 'is', 'are',
      'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
      'did', 'get', 'got', 'make', 'made', 'take', 'took', 'go', 'went'
    ]);

    return intent
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 10); // Limit to top 10 keywords
  }

  /**
   * Generate task graph based on intent analysis
   */
  private generateTaskGraph(
    intent: string,
    analysis: any,
    context: IntentContext
  ): TaskGraph {
    const taskId = `task-${Date.now()}`;

    // Generate tasks based on category
    const tasks = this.generateTasks(analysis.category, analysis, context);

    // Calculate estimated time
    const estimatedTimeMs = tasks.reduce((total, task) =>
      total + (task.metadata?.estimatedDuration || 30000), 0
    );

    return {
      id: taskId,
      intent,
      tasks,
      estimatedTimeMs,
      metadata: {
        complexity: analysis.complexity,
        confidence: analysis.confidence,
        riskLevel: analysis.riskLevel,
        requiresApproval: analysis.requiresApproval,
      },
    };
  }

  /**
   * Generate specific tasks based on category
   */
  private generateTasks(category: TaskType, analysis: any, context: IntentContext): Task[] {
    const baseTaskId = `task-${Date.now()}`;

    switch (category) {
      case 'schema_design':
        return [
          {
            id: `${baseTaskId}-1`,
            type: 'schema_design',
            agent: 'SchemaAgent',
            priority: 1,
            dependencies: [],
            inputs: { context, keywords: analysis.keywords },
            status: 'pending',
            metadata: {
              estimatedDuration: 45000,
              complexity: analysis.complexity,
              snapshotRequired: true,
            },
          },
          {
            id: `${baseTaskId}-2`,
            type: 'code_generation',
            agent: 'CodeGenAgent',
            priority: 2,
            dependencies: [`${baseTaskId}-1`],
            inputs: { context, type: 'migration' },
            status: 'pending',
            metadata: {
              estimatedDuration: 30000,
              complexity: 'medium',
              snapshotRequired: true,
            },
          },
        ];

      case 'authentication':
        return [
          {
            id: `${baseTaskId}-1`,
            type: 'authentication',
            agent: 'AuthAgent',
            priority: 1,
            dependencies: [],
            inputs: { context, requirements: analysis.keywords },
            status: 'pending',
            metadata: {
              estimatedDuration: 60000,
              complexity: analysis.complexity,
              requiresHuman: true,
              snapshotRequired: true,
            },
          },
          {
            id: `${baseTaskId}-2`,
            type: 'security_scan',
            agent: 'QAAgent',
            priority: 2,
            dependencies: [`${baseTaskId}-1`],
            inputs: { context, scanType: 'auth' },
            status: 'pending',
            metadata: {
              estimatedDuration: 20000,
              complexity: 'low',
            },
          },
        ];

      case 'code_generation':
        return [
          {
            id: `${baseTaskId}-1`,
            type: 'code_generation',
            agent: 'CodeGenAgent',
            priority: 1,
            dependencies: [],
            inputs: { context, requirements: analysis.keywords },
            status: 'pending',
            metadata: {
              estimatedDuration: 40000,
              complexity: analysis.complexity,
              snapshotRequired: analysis.complexity !== 'low',
            },
          },
          {
            id: `${baseTaskId}-2`,
            type: 'testing',
            agent: 'QAAgent',
            priority: 2,
            dependencies: [`${baseTaskId}-1`],
            inputs: { context, testType: 'unit' },
            status: 'pending',
            metadata: {
              estimatedDuration: 25000,
              complexity: 'medium',
            },
          },
        ];

      case 'testing':
        return [
          {
            id: `${baseTaskId}-1`,
            type: 'testing',
            agent: 'QAAgent',
            priority: 1,
            dependencies: [],
            inputs: { context, testRequirements: analysis.keywords },
            status: 'pending',
            metadata: {
              estimatedDuration: 35000,
              complexity: analysis.complexity,
            },
          },
        ];

      default:
        // Generic feature enhancement
        return [
          {
            id: `${baseTaskId}-1`,
            type: 'feature_enhancement',
            agent: 'ClaudeCode',
            priority: 1,
            dependencies: [],
            inputs: { context, intent: analysis.keywords },
            status: 'pending',
            metadata: {
              estimatedDuration: 30000,
              complexity: analysis.complexity,
              snapshotRequired: analysis.complexity === 'high',
            },
          },
        ];
    }
  }

  /**
   * Optimize task graph for efficiency
   */
  private optimizeTaskGraph(taskGraph: TaskGraph): TaskGraph {
    // Sort tasks by priority and dependencies
    const optimizedTasks = this.topologicalSort(taskGraph.tasks);

    // Identify parallelizable tasks
    const parallelGroups = this.identifyParallelTasks(optimizedTasks);

    // Adjust estimated time for parallel execution
    const optimizedTime = this.calculateOptimizedTime(parallelGroups);

    return {
      ...taskGraph,
      tasks: optimizedTasks,
      estimatedTimeMs: optimizedTime,
    };
  }

  /**
   * Topological sort for task dependencies
   */
  private topologicalSort(tasks: Task[]): Task[] {
    const taskMap = new Map(tasks.map(task => [task.id, task]));
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: Task[] = [];

    const visit = (taskId: string) => {
      if (visiting.has(taskId)) {
        throw new Error(`Circular dependency detected involving task ${taskId}`);
      }

      if (visited.has(taskId)) return;

      visiting.add(taskId);

      const task = taskMap.get(taskId);
      if (task) {
        task.dependencies.forEach(depId => visit(depId));
        visiting.delete(taskId);
        visited.add(taskId);
        result.push(task);
      }
    };

    tasks.forEach(task => {
      if (!visited.has(task.id)) {
        visit(task.id);
      }
    });

    return result;
  }

  /**
   * Identify tasks that can run in parallel
   */
  private identifyParallelTasks(tasks: Task[]): Task[][] {
    const groups: Task[][] = [];
    const processed = new Set<string>();

    for (const task of tasks) {
      if (processed.has(task.id)) continue;

      const group = [task];
      processed.add(task.id);

      // Find other tasks that can run in parallel
      for (const otherTask of tasks) {
        if (processed.has(otherTask.id)) continue;

        const canRunInParallel = this.canRunInParallel(task, otherTask, tasks);
        if (canRunInParallel) {
          group.push(otherTask);
          processed.add(otherTask.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Check if two tasks can run in parallel
   */
  private canRunInParallel(task1: Task, task2: Task, allTasks: Task[]): boolean {
    // Tasks can't run in parallel if one depends on the other
    if (task1.dependencies.includes(task2.id) || task2.dependencies.includes(task1.id)) {
      return false;
    }

    // Check for transitive dependencies
    const getDependencies = (taskId: string): Set<string> => {
      const deps = new Set<string>();
      const task = allTasks.find(t => t.id === taskId);

      if (task) {
        task.dependencies.forEach(depId => {
          deps.add(depId);
          getDependencies(depId).forEach(transitiveDep => deps.add(transitiveDep));
        });
      }

      return deps;
    };

    const task1Deps = getDependencies(task1.id);
    const task2Deps = getDependencies(task2.id);

    return !task1Deps.has(task2.id) && !task2Deps.has(task1.id);
  }

  /**
   * Calculate optimized execution time considering parallelization
   */
  private calculateOptimizedTime(parallelGroups: Task[][]): number {
    return parallelGroups.reduce((totalTime, group) => {
      const maxGroupTime = Math.max(...group.map(task =>
        task.metadata?.estimatedDuration || 30000
      ));
      return totalTime + maxGroupTime;
    }, 0);
  }

  /**
   * Log routing events for monitoring and debugging
   */
  private async logRouting(eventType: string, data: any): Promise<void> {
    try {
      const redactedData = redactSecretsFromObject(data);

      await prisma.telemetryEvent.create({
        data: {
          eventType: `orchestration_${eventType}`,
          data: redactedData,
          metadata: {
            userId: this.userId,
            projectId: this.projectId,
            source: 'orchestration-router',
            version: '1.0.0',
          },
        },
      });
    } catch (error) {
      console.warn('Failed to log orchestration event:', error);
    }
  }

  /**
   * Record user feedback when they override AI recommendations
   */
  async recordStackOverride(
    modelRunId: string,
    originalStack: RecommendedStack,
    correctedStack: Partial<RecommendedStack>,
    reason?: string
  ): Promise<void> {
    return withSpan('record_stack_override', async (span) => {
      try {
        if (!this.projectId) {
          throw new Error('Project ID required for stack override recording');
        }

        // Get project classification for context
        const project = await prisma.project.findUnique({
          where: { id: this.projectId },
          select: { category: true },
        });

        const correction: StackCorrection = {
          originalCategory: (project?.category as ProjectCategory) || ProjectCategory.WEB_APP,
          originalStack,
          correctedStack,
          reason,
          confidence: this.calculateCorrectionConfidence(originalStack, correctedStack),
        };

        await feedbackManager.recordStackCorrection(
          this.userId,
          this.projectId,
          modelRunId,
          correction,
          getCurrentTraceId(),
          getCurrentSpanId()
        );

        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.FEEDBACK_TYPE]: 'stack_override',
          [SPAN_ATTRIBUTES.USER_ID]: this.userId,
          [SPAN_ATTRIBUTES.PROJECT_ID]: this.projectId,
          'feedback.model_run_id': modelRunId,
          'feedback.correction_confidence': correction.confidence,
        });

        // Log the override event
        await this.logRouting('stack_override', {
          modelRunId,
          originalStack: {
            database: originalStack.database.primary,
            frontend: originalStack.frontend.framework,
            backend: originalStack.backend?.framework,
            complexity: originalStack.complexity,
          },
          correctedStack,
          confidence: correction.confidence,
        });

      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Record category correction when user changes project classification
   */
  async recordCategoryCorrection(
    originalCategory: ProjectCategory,
    correctedCategory: ProjectCategory,
    confidence: number = 0.9,
    reason?: string
  ): Promise<void> {
    return withSpan('record_category_correction', async (span) => {
      try {
        if (!this.projectId) {
          throw new Error('Project ID required for category correction');
        }

        await feedbackManager.recordCategoryCorrection(
          this.userId,
          this.projectId,
          originalCategory,
          correctedCategory,
          confidence,
          reason
        );

        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.FEEDBACK_TYPE]: 'category_correction',
          [SPAN_ATTRIBUTES.USER_ID]: this.userId,
          [SPAN_ATTRIBUTES.PROJECT_ID]: this.projectId,
          'feedback.original_category': originalCategory,
          'feedback.corrected_category': correctedCategory,
          'feedback.confidence': confidence,
        });

        // Log the correction event
        await this.logRouting('category_correction', {
          originalCategory,
          correctedCategory,
          confidence,
          reason,
        });

      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Get feedback metrics for the current model/context
   */
  async getFeedbackMetrics(window?: string): Promise<any> {
    return withSpan('get_feedback_metrics', async (span) => {
      try {
        // For now, get metrics for the classification model
        // In the future, this could be parameterized for different models
        const classificationModelId = 'project-classifier-v1';

        const metrics = await feedbackManager.getFeedbackMetrics(
          classificationModelId,
          window
        );

        addSpanAttributes(span, {
          'metrics.model_id': classificationModelId,
          'metrics.window': window || 'current',
          'metrics.found': metrics ? 'true' : 'false',
        });

        return metrics;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Get learning insights from feedback data
   */
  async getLearningInsights(timeWindow?: string): Promise<any> {
    return withSpan('get_learning_insights', async (span) => {
      try {
        const insights = await feedbackManager.getLearningInsights(timeWindow);

        addSpanAttributes(span, {
          'insights.time_window': timeWindow || 'current',
          'insights.common_corrections': insights.commonCorrections.length,
          'insights.suggestions': insights.improvementSuggestions.length,
        });

        return insights;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Calculate confidence level for user corrections
   */
  private calculateCorrectionConfidence(
    originalStack: RecommendedStack,
    correctedStack: Partial<RecommendedStack>
  ): number {
    let changesCount = 0;
    let totalFields = 0;

    // Count significant changes
    const fields = ['database', 'auth', 'frontend', 'backend', 'hosting'];

    fields.forEach(field => {
      totalFields++;
      const original = (originalStack as any)[field];
      const corrected = (correctedStack as any)[field];

      if (corrected && JSON.stringify(original) !== JSON.stringify(corrected)) {
        changesCount++;
      }
    });

    // More changes = lower confidence in original recommendation
    const changeRatio = changesCount / totalFields;
    return Math.max(0.1, 1 - changeRatio);
  }
}

// Export utility functions
export function createRouter(userId: string, projectId?: string): OrchestrationRouter {
  return new OrchestrationRouter(userId, projectId);
}

export function validateTaskGraph(taskGraph: TaskGraph): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate basic structure
  if (!taskGraph.id) errors.push('Task graph must have an ID');
  if (!taskGraph.intent) errors.push('Task graph must have an intent');
  if (!Array.isArray(taskGraph.tasks)) errors.push('Task graph must have tasks array');

  // Validate tasks
  for (const task of taskGraph.tasks) {
    if (!task.id) errors.push(`Task missing ID: ${JSON.stringify(task)}`);
    if (!task.type) errors.push(`Task missing type: ${task.id}`);
    if (!task.agent) errors.push(`Task missing agent: ${task.id}`);
    if (!Array.isArray(task.dependencies)) errors.push(`Task dependencies must be array: ${task.id}`);
  }

  // Check for circular dependencies
  try {
    const router = new OrchestrationRouter('validation', 'validation');
    router['topologicalSort'](taskGraph.tasks);
  } catch (error) {
    errors.push(`Circular dependency detected: ${error.message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}