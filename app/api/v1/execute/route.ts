import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { redactSecretsFromObject } from "@/lib/utils/secretRedaction";
import { validateTaskGraph } from "@/services/orch/router";
import type { TaskGraph, Task } from "@/services/orch/router";

// Import agents
import { CodeGenAgent } from "@/services/agents/codeGenAgent";
import { SchemaAgent } from "@/services/agents/schemaAgent";
import { AuthAgent } from "@/services/agents/authAgent";
import { QAAgent } from "@/services/agents/qaAgent";
import { mcpAgent } from "@/services/agents/mcpAgent";
import type { Agent, AgentContext, AgentResult } from "@/services/agents/types";

interface ExecutionRequest {
  taskGraphId?: string;
  taskGraph?: TaskGraph;
  jobId?: string;
  resume?: boolean;
}

interface ExecutionStatus {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    completedTasks: number;
    totalTasks: number;
    currentTask?: string;
  };
  results?: any;
  error?: string;
  startTime: Date;
  endTime?: Date;
  estimatedTimeRemaining?: number;
}

// In-memory job tracking (in production, this would be Redis or similar)
const runningJobs = new Map<string, ExecutionStatus>();

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskGraphId, taskGraph, jobId, resume }: ExecutionRequest = await req.json();

    // Validate input
    if (!taskGraphId && !taskGraph) {
      return NextResponse.json(
        { error: "Either taskGraphId or taskGraph is required" },
        { status: 400 }
      );
    }

    let graphToExecute: TaskGraph;

    // Get task graph from ID or use provided graph
    if (taskGraphId) {
      // In a real implementation, we'd fetch from database
      return NextResponse.json(
        { error: "Fetching task graphs by ID not yet implemented" },
        { status: 501 }
      );
    } else {
      graphToExecute = taskGraph!;
    }

    // Validate task graph
    const validation = validateTaskGraph(graphToExecute);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Invalid task graph", details: validation.errors },
        { status: 400 }
      );
    }

    // Check if this is a resume request
    if (resume && jobId) {
      const existingJob = runningJobs.get(jobId);
      if (!existingJob) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      if (existingJob.status === 'running') {
        return NextResponse.json({
          jobId,
          status: existingJob.status,
          message: "Job is already running"
        });
      }
    }

    // Create new job ID
    const newJobId = jobId || `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Initialize job status
    const jobStatus: ExecutionStatus = {
      jobId: newJobId,
      status: 'pending',
      progress: {
        completedTasks: 0,
        totalTasks: graphToExecute.tasks.length,
      },
      startTime: new Date(),
    };

    runningJobs.set(newJobId, jobStatus);

    // Start execution asynchronously
    executeTaskGraph(graphToExecute, newJobId, userId)
      .catch(error => {
        console.error(`Job ${newJobId} failed:`, error);
        const job = runningJobs.get(newJobId);
        if (job) {
          job.status = 'failed';
          job.error = error instanceof Error ? error.message : 'Unknown error';
          job.endTime = new Date();
        }
      });

    return NextResponse.json({
      jobId: newJobId,
      status: jobStatus.status,
      message: "Task execution started",
      estimatedTimeMs: graphToExecute.estimatedTimeMs,
    });

  } catch (error) {
    console.error("Execute API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    const jobStatus = runningJobs.get(jobId);
    if (!jobStatus) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Calculate estimated time remaining
    if (jobStatus.status === 'running' && jobStatus.progress.completedTasks > 0) {
      const elapsed = Date.now() - jobStatus.startTime.getTime();
      const avgTimePerTask = elapsed / jobStatus.progress.completedTasks;
      const remainingTasks = jobStatus.progress.totalTasks - jobStatus.progress.completedTasks;
      jobStatus.estimatedTimeRemaining = Math.round(avgTimePerTask * remainingTasks);
    }

    return NextResponse.json(jobStatus);

  } catch (error) {
    console.error("Execute status API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    const jobStatus = runningJobs.get(jobId);
    if (!jobStatus) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    if (jobStatus.status === 'running') {
      jobStatus.status = 'cancelled';
      jobStatus.endTime = new Date();
    }

    return NextResponse.json({
      message: "Job cancelled",
      jobId,
      status: jobStatus.status,
    });

  } catch (error) {
    console.error("Execute cancel API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Execute task graph asynchronously
 */
async function executeTaskGraph(taskGraph: TaskGraph, jobId: string, userId: string): Promise<void> {
  const jobStatus = runningJobs.get(jobId);
  if (!jobStatus) {
    throw new Error(`Job ${jobId} not found`);
  }

  jobStatus.status = 'running';

  try {
    console.log(`Starting execution of task graph ${taskGraph.id} for job ${jobId}`);

    // Execute tasks in dependency order
    const taskResults = new Map<string, AgentResult>();
    const completedTasks = new Set<string>();

    while (completedTasks.size < taskGraph.tasks.length) {
      // Find tasks that can be executed (all dependencies completed)
      const readyTasks = taskGraph.tasks.filter(task =>
        !completedTasks.has(task.id) &&
        task.dependencies.every(depId => completedTasks.has(depId))
      );

      if (readyTasks.length === 0) {
        throw new Error('Circular dependency detected or no tasks ready to execute');
      }

      // Execute ready tasks in parallel
      const taskPromises = readyTasks.map(task => executeTask(task, taskResults, userId, jobId));
      const results = await Promise.allSettled(taskPromises);

      // Process results
      for (let i = 0; i < results.length; i++) {
        const task = readyTasks[i];
        const result = results[i];

        if (result.status === 'fulfilled') {
          taskResults.set(task.id, result.value);
          completedTasks.add(task.id);

          // Update job progress
          jobStatus.progress.completedTasks = completedTasks.size;
          jobStatus.progress.currentTask = undefined;

          console.log(`Task ${task.id} completed successfully`);
        } else {
          console.error(`Task ${task.id} failed:`, result.reason);
          throw new Error(`Task ${task.id} failed: ${result.reason}`);
        }
      }

      // Check if job was cancelled
      if (jobStatus.status === 'cancelled') {
        throw new Error('Job was cancelled');
      }
    }

    // All tasks completed successfully
    jobStatus.status = 'completed';
    jobStatus.endTime = new Date();
    jobStatus.results = {
      taskResults: Array.from(taskResults.entries()).map(([taskId, result]) => ({
        taskId,
        success: result.success,
        outputs: result.outputs,
        artifacts: result.artifacts?.map(a => ({
          id: a.id,
          type: a.type,
          name: a.name,
          path: a.path,
        })),
      })),
    };

    console.log(`Task graph ${taskGraph.id} completed successfully for job ${jobId}`);

  } catch (error) {
    console.error(`Task graph execution failed for job ${jobId}:`, error);
    jobStatus.status = 'failed';
    jobStatus.error = error instanceof Error ? error.message : 'Unknown error';
    jobStatus.endTime = new Date();
    throw error;
  }
}

/**
 * Execute a single task
 */
async function executeTask(
  task: Task,
  previousResults: Map<string, AgentResult>,
  userId: string,
  jobId: string
): Promise<AgentResult> {
  // Update current task in job status
  const jobStatus = runningJobs.get(jobId);
  if (jobStatus) {
    jobStatus.progress.currentTask = task.id;
  }

  // Get agent for task
  const agent = getAgentForTask(task);
  if (!agent) {
    throw new Error(`No agent available for task type: ${task.type}`);
  }

  // Prepare agent context
  const context: AgentContext = {
    userId,
    taskId: task.id,
    sessionId: jobId,
    inputs: {
      ...task.inputs,
      // Include outputs from dependency tasks
      ...task.dependencies.reduce((acc, depId) => {
        const depResult = previousResults.get(depId);
        if (depResult?.outputs) {
          acc[`${depId}_outputs`] = depResult.outputs;
        }
        return acc;
      }, {} as Record<string, any>),
    },
    constraints: task.inputs.constraints,
  };

  // Execute agent
  console.log(`Executing task ${task.id} with agent ${task.agent}`);
  const result = await agent.execute(context);

  // Log to database
  await logTaskExecution(task, result, userId, jobId);

  return result;
}

/**
 * Get agent instance for task
 */
function getAgentForTask(task: Task): Agent | null {
  switch (task.agent) {
    case 'CodeGenAgent':
      return new CodeGenAgent();
    case 'SchemaAgent':
      return new SchemaAgent();
    case 'AuthAgent':
      return new AuthAgent();
    case 'QAAgent':
      return new QAAgent();
    case 'MCPAgent':
      return mcpAgent;
    default:
      console.warn(`Unknown agent type: ${task.agent}`);
      return null;
  }
}

/**
 * Log task execution to database
 */
async function logTaskExecution(
  task: Task,
  result: AgentResult,
  userId: string,
  jobId: string
): Promise<void> {
  try {
    // Find user in database
    const user = await prisma.user.findFirst({
      where: { clerkId: userId },
    });

    if (!user) {
      console.warn(`User not found for clerkId: ${userId}`);
      return;
    }

    // Redact sensitive information
    const redactedInputs = redactSecretsFromObject(task.inputs);
    const redactedOutputs = redactSecretsFromObject(result.outputs || {});

    // Create model run record
    await prisma.modelRun.create({
      data: {
        userId: user.id,
        projectId: task.inputs.projectId,
        taskId: task.id,
        sessionId: jobId,
        agentType: task.agent,
        model: 'claude-3-sonnet-20241022',
        prompt: JSON.stringify(redactedInputs),
        response: result.success ? JSON.stringify(redactedOutputs) : (result.error || 'Task failed'),
        tokensUsed: result.metrics.tokensUsed || 0,
        cost: result.metrics.cost || 0,
        success: result.success,
        error: result.success ? null : result.error,
        metadata: {
          taskType: task.type,
          executionTime: result.metrics.durationMs,
          modelCalls: result.metrics.modelCalls,
          cacheHits: result.metrics.cacheHits,
          artifactCount: result.artifacts?.length || 0,
          snapshotId: result.snapshotId,
        },
      },
    });

    console.log(`Logged task execution for ${task.id}`);

  } catch (error) {
    console.error('Failed to log task execution:', error);
    // Don't throw - logging failures shouldn't stop execution
  }
}