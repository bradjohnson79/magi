import fs from 'fs/promises';
import path from 'path';
import { VM } from 'vm2';
import Docker from 'dockerode';
import {
  PluginManifest,
  PluginContext,
  PluginExecutionResult,
  MarketplaceInstallation,
  ExecutionStatus,
  PluginRuntime
} from '@/lib/types/marketplace';
import { Database } from '@/lib/database';

export class PluginLoader {
  private static instance: PluginLoader;
  private db: Database;
  private loadedPlugins: Map<string, LoadedPlugin> = new Map();
  private docker?: Docker;

  constructor() {
    this.db = Database.getInstance();

    // Initialize Docker if available
    try {
      this.docker = new Docker();
    } catch (error) {
      console.warn('Docker not available, plugin containerization disabled');
    }
  }

  static getInstance(): PluginLoader {
    if (!PluginLoader.instance) {
      PluginLoader.instance = new PluginLoader();
    }
    return PluginLoader.instance;
  }

  /**
   * Load plugin from installation
   */
  async loadPlugin(installation: MarketplaceInstallation): Promise<LoadedPlugin> {
    try {
      const cacheKey = `${installation.itemId}-${installation.installedVersion}`;

      if (this.loadedPlugins.has(cacheKey)) {
        return this.loadedPlugins.get(cacheKey)!;
      }

      // Get plugin manifest and code
      const pluginData = await this.getPluginData(installation);

      // Create sandbox based on runtime
      const sandbox = await this.createSandbox(pluginData.manifest, installation);

      const loadedPlugin: LoadedPlugin = {
        installation,
        manifest: pluginData.manifest,
        sandbox,
        code: pluginData.code,
        lastLoaded: new Date()
      };

      this.loadedPlugins.set(cacheKey, loadedPlugin);
      return loadedPlugin;
    } catch (error) {
      console.error('Error loading plugin:', error);
      throw new Error(`Failed to load plugin: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute plugin with inputs
   */
  async executePlugin(
    installation: MarketplaceInstallation,
    inputs: Record<string, any>,
    context: Partial<PluginContext>
  ): Promise<PluginExecutionResult> {
    const startTime = Date.now();
    const executionId = await this.logExecutionStart(installation, inputs);

    try {
      const loadedPlugin = await this.loadPlugin(installation);

      // Validate inputs against manifest
      this.validateInputs(inputs, loadedPlugin.manifest);

      // Create execution context
      const pluginContext = await this.createPluginContext(installation, context);

      // Execute based on runtime
      const result = await this.executeByRuntime(
        loadedPlugin,
        inputs,
        pluginContext
      );

      const executionTime = Date.now() - startTime;

      await this.logExecutionComplete(
        executionId,
        'success',
        result.data,
        undefined,
        executionTime
      );

      return {
        success: true,
        data: result.data,
        metrics: {
          executionTime,
          memoryUsed: result.memoryUsed || 0
        }
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.logExecutionComplete(
        executionId,
        'failed',
        undefined,
        errorMessage,
        executionTime
      );

      return {
        success: false,
        error: errorMessage,
        metrics: {
          executionTime,
          memoryUsed: 0
        }
      };
    }
  }

  /**
   * Unload plugin from memory
   */
  unloadPlugin(installation: MarketplaceInstallation): void {
    const cacheKey = `${installation.itemId}-${installation.installedVersion}`;

    if (this.loadedPlugins.has(cacheKey)) {
      const plugin = this.loadedPlugins.get(cacheKey)!;

      // Cleanup sandbox resources
      if (plugin.sandbox) {
        this.cleanupSandbox(plugin.sandbox);
      }

      this.loadedPlugins.delete(cacheKey);
    }
  }

  /**
   * Get list of loaded plugins
   */
  getLoadedPlugins(): LoadedPlugin[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Private helper methods
   */
  private async getPluginData(installation: MarketplaceInstallation): Promise<{
    manifest: PluginManifest;
    code: string;
  }> {
    // Get marketplace item
    const query = `
      SELECT manifest, runtime, entry_point
      FROM marketplace_items
      WHERE id = $1
    `;

    const result = await this.db.query(query, [installation.itemId]);

    if (result.rows.length === 0) {
      throw new Error('Plugin not found');
    }

    const row = result.rows[0];
    const manifest = row.manifest as PluginManifest;

    // Load plugin code from storage
    const code = await this.loadPluginCode(installation, manifest);

    return { manifest, code };
  }

  private async loadPluginCode(
    installation: MarketplaceInstallation,
    manifest: PluginManifest
  ): Promise<string> {
    // This would load the actual plugin code from storage
    // For now, return a mock implementation

    const pluginDir = path.join(
      process.env.PLUGINS_DIR || '/tmp/plugins',
      installation.itemId,
      installation.installedVersion
    );

    const entryPointPath = path.join(pluginDir, manifest.entryPoint);

    try {
      const code = await fs.readFile(entryPointPath, 'utf-8');
      return code;
    } catch (error) {
      throw new Error(`Failed to load plugin code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async createSandbox(
    manifest: PluginManifest,
    installation: MarketplaceInstallation
  ): Promise<PluginSandbox> {
    const runtime = manifest.runtime;

    switch (runtime) {
      case 'nodejs':
        return this.createNodeJSSandbox(manifest, installation);
      case 'python':
        return this.createPythonSandbox(manifest, installation);
      case 'docker':
        return this.createDockerSandbox(manifest, installation);
      case 'wasm':
        return this.createWASMSandbox(manifest, installation);
      default:
        throw new Error(`Unsupported runtime: ${runtime}`);
    }
  }

  private createNodeJSSandbox(
    manifest: PluginManifest,
    installation: MarketplaceInstallation
  ): PluginSandbox {
    const vm = new VM({
      timeout: 30000, // 30 second timeout
      sandbox: {
        console: {
          log: (...args: any[]) => this.logPluginOutput('info', ...args),
          warn: (...args: any[]) => this.logPluginOutput('warn', ...args),
          error: (...args: any[]) => this.logPluginOutput('error', ...args)
        },
        Buffer,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        require: this.createSafeRequire(manifest.permissions)
      },
      wasm: false,
      eval: false
    });

    return {
      type: 'nodejs',
      vm,
      cleanup: () => {
        // VM2 handles cleanup automatically
      }
    };
  }

  private createPythonSandbox(
    manifest: PluginManifest,
    installation: MarketplaceInstallation
  ): PluginSandbox {
    // Python sandbox would be implemented here
    // This might use a separate Python process or container

    throw new Error('Python runtime not yet implemented');
  }

  private async createDockerSandbox(
    manifest: PluginManifest,
    installation: MarketplaceInstallation
  ): Promise<PluginSandbox> {
    if (!this.docker) {
      throw new Error('Docker not available');
    }

    // Create container for plugin execution
    const container = await this.docker.createContainer({
      Image: 'node:18-alpine',
      Cmd: ['node', '/plugin/index.js'],
      WorkingDir: '/plugin',
      AttachStdout: true,
      AttachStderr: true,
      NetworkMode: manifest.permissions.includes('network:http') ? 'bridge' : 'none',
      Memory: 128 * 1024 * 1024, // 128MB limit
      CpuShares: 512 // 50% CPU
    });

    return {
      type: 'docker',
      container,
      cleanup: async () => {
        try {
          await container.remove({ force: true });
        } catch (error) {
          console.error('Error cleaning up Docker container:', error);
        }
      }
    };
  }

  private createWASMSandbox(
    manifest: PluginManifest,
    installation: MarketplaceInstallation
  ): PluginSandbox {
    // WASM sandbox would be implemented here
    throw new Error('WASM runtime not yet implemented');
  }

  private createSafeRequire(permissions: string[]) {
    const allowedModules = new Set([
      'crypto',
      'util',
      'path',
      'url',
      'querystring'
    ]);

    // Add modules based on permissions
    if (permissions.includes('network:http')) {
      allowedModules.add('https');
      allowedModules.add('http');
    }

    return (moduleName: string) => {
      if (allowedModules.has(moduleName)) {
        return require(moduleName);
      }

      throw new Error(`Module '${moduleName}' is not allowed`);
    };
  }

  private async executeByRuntime(
    plugin: LoadedPlugin,
    inputs: Record<string, any>,
    context: PluginContext
  ): Promise<{ data: any; memoryUsed?: number }> {
    switch (plugin.manifest.runtime) {
      case 'nodejs':
        return this.executeNodeJS(plugin, inputs, context);
      case 'docker':
        return this.executeDocker(plugin, inputs, context);
      default:
        throw new Error(`Runtime execution not implemented: ${plugin.manifest.runtime}`);
    }
  }

  private async executeNodeJS(
    plugin: LoadedPlugin,
    inputs: Record<string, any>,
    context: PluginContext
  ): Promise<{ data: any; memoryUsed?: number }> {
    const vm = plugin.sandbox.vm as VM;

    // Inject context and inputs into sandbox
    vm.sandbox.inputs = inputs;
    vm.sandbox.context = context;

    // Execute plugin code
    const result = vm.run(`
      (function() {
        ${plugin.code}

        // Call main function if it exists
        if (typeof main === 'function') {
          return main(inputs, context);
        } else if (typeof exports === 'object' && typeof exports.main === 'function') {
          return exports.main(inputs, context);
        } else {
          throw new Error('Plugin must export a main function');
        }
      })()
    `);

    return { data: await result };
  }

  private async executeDocker(
    plugin: LoadedPlugin,
    inputs: Record<string, any>,
    context: PluginContext
  ): Promise<{ data: any; memoryUsed?: number }> {
    const container = plugin.sandbox.container;

    if (!container) {
      throw new Error('Docker container not available');
    }

    // Start container and execute
    await container.start();

    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true
    });

    // Send inputs to container
    const inputData = JSON.stringify({ inputs, context });
    container.stdin?.write(inputData);
    container.stdin?.end();

    // Collect output
    const output = await this.collectContainerOutput(stream);

    // Stop container
    await container.stop();

    try {
      const result = JSON.parse(output);
      return { data: result };
    } catch (error) {
      throw new Error(`Invalid plugin output: ${output}`);
    }
  }

  private async collectContainerOutput(stream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';

      stream.on('data', (chunk) => {
        output += chunk.toString();
      });

      stream.on('end', () => {
        resolve(output);
      });

      stream.on('error', reject);

      // Timeout after 30 seconds
      setTimeout(() => {
        reject(new Error('Plugin execution timeout'));
      }, 30000);
    });
  }

  private validateInputs(inputs: Record<string, any>, manifest: PluginManifest): void {
    for (const [inputName, inputSchema] of Object.entries(manifest.inputs)) {
      if (inputSchema.required && !(inputName in inputs)) {
        throw new Error(`Required input missing: ${inputName}`);
      }

      if (inputName in inputs) {
        const value = inputs[inputName];
        this.validateInputValue(value, inputSchema, inputName);
      }
    }
  }

  private validateInputValue(value: any, schema: any, inputName: string): void {
    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          throw new Error(`Input ${inputName} must be a string`);
        }
        if (schema.validation?.min && value.length < schema.validation.min) {
          throw new Error(`Input ${inputName} too short`);
        }
        if (schema.validation?.max && value.length > schema.validation.max) {
          throw new Error(`Input ${inputName} too long`);
        }
        if (schema.validation?.pattern && !new RegExp(schema.validation.pattern).test(value)) {
          throw new Error(`Input ${inputName} does not match pattern`);
        }
        break;
      case 'number':
        if (typeof value !== 'number') {
          throw new Error(`Input ${inputName} must be a number`);
        }
        if (schema.validation?.min && value < schema.validation.min) {
          throw new Error(`Input ${inputName} too small`);
        }
        if (schema.validation?.max && value > schema.validation.max) {
          throw new Error(`Input ${inputName} too large`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new Error(`Input ${inputName} must be a boolean`);
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          throw new Error(`Input ${inputName} must be an array`);
        }
        break;
      case 'object':
        if (typeof value !== 'object' || value === null) {
          throw new Error(`Input ${inputName} must be an object`);
        }
        break;
    }
  }

  private async createPluginContext(
    installation: MarketplaceInstallation,
    context: Partial<PluginContext>
  ): Promise<PluginContext> {
    // Create secure context with only allowed capabilities
    const manifest = await this.getPluginManifest(installation.itemId);

    return {
      project: context.project,
      user: context.user!,
      config: installation.config,
      permissions: manifest.permissions,
      workspace: this.createWorkspaceAPI(manifest.permissions, context.project?.path),
      ai: this.createAIAPI(manifest.permissions),
      http: this.createHTTPAPI(manifest.permissions),
      logger: {
        info: (message: string, meta?: any) => this.logPluginOutput('info', message, meta),
        warn: (message: string, meta?: any) => this.logPluginOutput('warn', message, meta),
        error: (message: string, meta?: any) => this.logPluginOutput('error', message, meta)
      }
    };
  }

  private createWorkspaceAPI(permissions: string[], projectPath?: string) {
    return {
      read: async (filePath: string): Promise<string> => {
        if (!permissions.includes('filesystem:read')) {
          throw new Error('Permission denied: filesystem:read');
        }

        const safePath = this.validateFilePath(filePath, projectPath);
        return fs.readFile(safePath, 'utf-8');
      },

      write: async (filePath: string, content: string): Promise<void> => {
        if (!permissions.includes('filesystem:write')) {
          throw new Error('Permission denied: filesystem:write');
        }

        const safePath = this.validateFilePath(filePath, projectPath);
        await fs.writeFile(safePath, content, 'utf-8');
      },

      delete: async (filePath: string): Promise<void> => {
        if (!permissions.includes('filesystem:delete')) {
          throw new Error('Permission denied: filesystem:delete');
        }

        const safePath = this.validateFilePath(filePath, projectPath);
        await fs.unlink(safePath);
      },

      list: async (dirPath: string): Promise<string[]> => {
        if (!permissions.includes('filesystem:read')) {
          throw new Error('Permission denied: filesystem:read');
        }

        const safePath = this.validateFilePath(dirPath, projectPath);
        return fs.readdir(safePath);
      }
    };
  }

  private createAIAPI(permissions: string[]) {
    return {
      generate: async (prompt: string, options?: any): Promise<string> => {
        if (!permissions.includes('ai:generate')) {
          throw new Error('Permission denied: ai:generate');
        }

        // Integration with AI service would go here
        throw new Error('AI service not available');
      },

      analyze: async (content: string, options?: any): Promise<any> => {
        if (!permissions.includes('ai:analyze')) {
          throw new Error('Permission denied: ai:analyze');
        }

        // Integration with AI service would go here
        throw new Error('AI service not available');
      }
    };
  }

  private createHTTPAPI(permissions: string[]) {
    return {
      get: async (url: string, options?: any): Promise<any> => {
        if (!permissions.includes('network:http')) {
          throw new Error('Permission denied: network:http');
        }

        // Secure HTTP client implementation
        const response = await fetch(url, { ...options, method: 'GET' });
        return response.json();
      },

      post: async (url: string, data: any, options?: any): Promise<any> => {
        if (!permissions.includes('network:http')) {
          throw new Error('Permission denied: network:http');
        }

        const response = await fetch(url, {
          ...options,
          method: 'POST',
          body: JSON.stringify(data),
          headers: {
            'Content-Type': 'application/json',
            ...options?.headers
          }
        });

        return response.json();
      }
    };
  }

  private validateFilePath(filePath: string, projectPath?: string): string {
    // Prevent path traversal attacks
    const normalizedPath = path.normalize(filePath);

    if (normalizedPath.includes('..')) {
      throw new Error('Invalid file path: path traversal not allowed');
    }

    if (projectPath) {
      return path.join(projectPath, normalizedPath);
    }

    return normalizedPath;
  }

  private async getPluginManifest(itemId: string): Promise<PluginManifest> {
    const query = 'SELECT manifest FROM marketplace_items WHERE id = $1';
    const result = await this.db.query(query, [itemId]);

    if (result.rows.length === 0) {
      throw new Error('Plugin not found');
    }

    return result.rows[0].manifest;
  }

  private logPluginOutput(level: string, ...args: any[]): void {
    console.log(`[Plugin ${level.toUpperCase()}]`, ...args);
  }

  private cleanupSandbox(sandbox: PluginSandbox): void {
    if (sandbox.cleanup) {
      sandbox.cleanup();
    }
  }

  private async logExecutionStart(
    installation: MarketplaceInstallation,
    inputs: Record<string, any>
  ): Promise<string> {
    const query = `
      INSERT INTO plugin_executions (installation_id, project_id, input_data, status)
      VALUES ($1, $2, $3, 'running')
      RETURNING id
    `;

    const result = await this.db.query(query, [
      installation.id,
      installation.projectId,
      JSON.stringify(inputs)
    ]);

    return result.rows[0].id;
  }

  private async logExecutionComplete(
    executionId: string,
    status: ExecutionStatus,
    outputData?: any,
    errorMessage?: string,
    executionTimeMs?: number
  ): Promise<void> {
    const query = `
      UPDATE plugin_executions
      SET
        status = $1,
        output_data = $2,
        error_message = $3,
        execution_time_ms = $4,
        completed_at = now()
      WHERE id = $5
    `;

    await this.db.query(query, [
      status,
      outputData ? JSON.stringify(outputData) : null,
      errorMessage,
      executionTimeMs,
      executionId
    ]);
  }
}

// Interfaces for loaded plugins
interface LoadedPlugin {
  installation: MarketplaceInstallation;
  manifest: PluginManifest;
  sandbox: PluginSandbox;
  code: string;
  lastLoaded: Date;
}

interface PluginSandbox {
  type: PluginRuntime;
  vm?: VM;
  container?: any;
  cleanup?: () => void | Promise<void>;
}