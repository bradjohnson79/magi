import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

interface SemgrepFinding {
  check_id: string;
  path: string;
  start: {
    line: number;
    col: number;
  };
  end: {
    line: number;
    col: number;
  };
  message: string;
  severity: "ERROR" | "WARNING" | "INFO";
  metadata?: {
    category?: string;
    cwe?: string;
    owasp?: string;
    references?: string[];
  };
  extra: {
    message: string;
    metavars: Record<string, any>;
    severity: string;
    metadata: Record<string, any>;
  };
}

interface SemgrepResult {
  findings: SemgrepFinding[];
  stats: {
    total: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  success: boolean;
  error?: string;
}

interface SemgrepOptions {
  configPath?: string;
  outputPath?: string;
  includeInfo?: boolean;
  maxFindings?: number;
  timeout?: number;
}

export class SemgrepRunner {
  private configPath: string;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.configPath = path.join(projectRoot, ".semgrep.yml");
  }

  /**
   * Run Semgrep security scan
   */
  async runScan(options: SemgrepOptions = {}): Promise<SemgrepResult> {
    const {
      configPath = this.configPath,
      outputPath,
      includeInfo = false,
      maxFindings = 1000,
      timeout = 300000, // 5 minutes
    } = options;

    try {
      // Verify Semgrep is installed
      await this.verifySemgrepInstalled();

      // Verify config file exists
      await this.verifyConfigExists(configPath);

      // Build Semgrep command
      const command = this.buildSemgrepCommand(configPath, outputPath, includeInfo);

      console.log(`Running Semgrep scan: ${command}`);

      // Execute Semgrep
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectRoot,
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      // Parse results
      const findings = this.parseFindings(stdout);

      // Limit findings if specified
      const limitedFindings = maxFindings > 0 ? findings.slice(0, maxFindings) : findings;

      // Calculate statistics
      const stats = this.calculateStats(limitedFindings);

      // Write output file if specified
      if (outputPath) {
        await this.writeOutputFile(outputPath, limitedFindings, stats);
      }

      return {
        findings: limitedFindings,
        stats,
        success: true,
      };
    } catch (error) {
      console.error("Semgrep scan failed:", error);

      return {
        findings: [],
        stats: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Run Semgrep for CI with specific output format
   */
  async runCIScan(failOnHigh: boolean = true): Promise<SemgrepResult> {
    const outputPath = path.join(this.projectRoot, "semgrep-ci-results.json");

    const result = await this.runScan({
      outputPath,
      includeInfo: false,
      maxFindings: 100, // Limit for CI performance
    });

    // Generate CI annotations
    if (result.findings.length > 0) {
      await this.generateCIAnnotations(result.findings);
    }

    // Fail CI if high severity findings are found and failOnHigh is true
    if (failOnHigh && result.stats.high > 0) {
      throw new Error(`Semgrep found ${result.stats.high} high severity security issues`);
    }

    return result;
  }

  private async verifySemgrepInstalled(): Promise<void> {
    try {
      await execAsync("semgrep --version");
    } catch (error) {
      throw new Error("Semgrep is not installed or not in PATH");
    }
  }

  private async verifyConfigExists(configPath: string): Promise<void> {
    try {
      await fs.access(configPath);
    } catch (error) {
      throw new Error(`Semgrep config file not found: ${configPath}`);
    }
  }

  private buildSemgrepCommand(
    configPath: string,
    outputPath?: string,
    includeInfo: boolean = false
  ): string {
    const parts = [
      "semgrep",
      `--config=${configPath}`,
      "--json",
      "--quiet",
      "--no-git-ignore",
      "--skip-unknown-extensions",
    ];

    if (!includeInfo) {
      parts.push("--severity=ERROR", "--severity=WARNING");
    }

    if (outputPath) {
      parts.push(`--output=${outputPath}`);
    }

    parts.push("."); // Scan current directory

    return parts.join(" ");
  }

  private parseFindings(output: string): SemgrepFinding[] {
    try {
      const result = JSON.parse(output);
      return result.results || [];
    } catch (error) {
      console.error("Failed to parse Semgrep output:", error);
      return [];
    }
  }

  private calculateStats(findings: SemgrepFinding[]): SemgrepResult["stats"] {
    const stats = {
      total: findings.length,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    findings.forEach((finding) => {
      switch (finding.severity) {
        case "ERROR":
          stats.high++;
          break;
        case "WARNING":
          stats.medium++;
          break;
        case "INFO":
          stats.info++;
          break;
        default:
          stats.low++;
      }
    });

    return stats;
  }

  private async writeOutputFile(
    outputPath: string,
    findings: SemgrepFinding[],
    stats: SemgrepResult["stats"]
  ): Promise<void> {
    const output = {
      scan_info: {
        timestamp: new Date().toISOString(),
        tool: "semgrep",
        version: await this.getSemgrepVersion(),
        config: this.configPath,
      },
      statistics: stats,
      findings: findings.map((finding) => ({
        id: finding.check_id,
        file: finding.path,
        line: finding.start.line,
        column: finding.start.col,
        endLine: finding.end.line,
        endColumn: finding.end.col,
        message: finding.message,
        severity: finding.severity,
        category: finding.metadata?.category || "security",
        cwe: finding.metadata?.cwe,
        owasp: finding.metadata?.owasp,
        references: finding.metadata?.references || [],
      })),
    };

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf-8");
    console.log(`Semgrep results written to: ${outputPath}`);
  }

  private async getSemgrepVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync("semgrep --version");
      return stdout.trim();
    } catch (error) {
      return "unknown";
    }
  }

  private async generateCIAnnotations(findings: SemgrepFinding[]): Promise<void> {
    // Generate GitHub Actions annotations
    const annotationsPath = path.join(this.projectRoot, "semgrep-annotations.txt");
    const annotations: string[] = [];

    findings.forEach((finding) => {
      const level = finding.severity === "ERROR" ? "error" : "warning";
      const annotation = `::${level} file=${finding.path},line=${finding.start.line},col=${finding.start.col}::${finding.message} (${finding.check_id})`;
      annotations.push(annotation);
    });

    if (annotations.length > 0) {
      await fs.writeFile(annotationsPath, annotations.join("\n"), "utf-8");
      console.log(`Generated ${annotations.length} CI annotations`);
    }
  }

  /**
   * Get summary of findings for reporting
   */
  getSummary(result: SemgrepResult): string {
    if (!result.success) {
      return `❌ Semgrep scan failed: ${result.error}`;
    }

    if (result.stats.total === 0) {
      return "✅ No security issues found by Semgrep";
    }

    const parts = [`🔍 Semgrep found ${result.stats.total} security issues:`];

    if (result.stats.high > 0) {
      parts.push(`❌ ${result.stats.high} high severity`);
    }
    if (result.stats.medium > 0) {
      parts.push(`⚠️ ${result.stats.medium} medium severity`);
    }
    if (result.stats.low > 0) {
      parts.push(`ℹ️ ${result.stats.low} low severity`);
    }

    return parts.join(", ");
  }
}

// Export default instance
export const semgrepRunner = new SemgrepRunner();