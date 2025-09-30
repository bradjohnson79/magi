import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

interface SerenaFinding {
  id: string;
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: "HIGH" | "MEDIUM" | "LOW" | "INFO";
  category: string;
  rule: string;
  cwe?: string;
  owasp?: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  impact: "HIGH" | "MEDIUM" | "LOW";
  likelihood: "HIGH" | "MEDIUM" | "LOW";
  references?: string[];
  remediation?: string;
}

interface SerenaResult {
  findings: SerenaFinding[];
  stats: {
    total: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  success: boolean;
  error?: string;
  scanInfo?: {
    duration: number;
    filesScanned: number;
    rulesApplied: number;
  };
}

interface SerenaOptions {
  configPath?: string;
  outputPath?: string;
  severity?: string[];
  timeout?: number;
  maxFindings?: number;
}

export class SerenaRunner {
  private configPath: string;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.configPath = path.join(projectRoot, "serena", "serena.yml");
  }

  /**
   * Run Serena security scan
   */
  async runScan(options: SerenaOptions = {}): Promise<SerenaResult> {
    const {
      configPath = this.configPath,
      outputPath,
      severity = ["HIGH", "MEDIUM", "LOW"],
      timeout = 300000, // 5 minutes
      maxFindings = 1000,
    } = options;

    const startTime = Date.now();

    try {
      // Verify Serena is available
      await this.verifySerenaInstalled();

      // Verify config file exists
      await this.verifyConfigExists(configPath);

      // Build Serena command
      const command = this.buildSerenaCommand(configPath, outputPath);

      console.log(`Running Serena scan: ${command}`);

      // Execute Serena
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectRoot,
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        env: {
          ...process.env,
          SERENA_TOKEN: process.env.SERENA_TOKEN,
          SERENA_OUTPUT_FORMAT: "json",
        },
      });

      // Parse results
      const findings = await this.parseFindings(stdout);

      // Filter by severity
      const filteredFindings = findings.filter((finding) =>
        severity.includes(finding.severity)
      );

      // Limit findings if specified
      const limitedFindings = maxFindings > 0
        ? filteredFindings.slice(0, maxFindings)
        : filteredFindings;

      // Calculate statistics
      const stats = this.calculateStats(limitedFindings);

      // Calculate scan info
      const scanInfo = {
        duration: Date.now() - startTime,
        filesScanned: await this.countScannedFiles(),
        rulesApplied: await this.countAppliedRules(configPath),
      };

      // Write output file if specified
      if (outputPath) {
        await this.writeOutputFile(outputPath, limitedFindings, stats, scanInfo);
      }

      return {
        findings: limitedFindings,
        stats,
        success: true,
        scanInfo,
      };
    } catch (error) {
      console.error("Serena scan failed:", error);

      return {
        findings: [],
        stats: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Run Serena for CI with specific policies
   */
  async runCIScan(failOnHigh: boolean = true): Promise<SerenaResult> {
    const outputPath = path.join(this.projectRoot, "serena-ci-results.json");

    const result = await this.runScan({
      outputPath,
      severity: ["HIGH", "MEDIUM"], // Only check high and medium in CI
      maxFindings: 50, // Limit for CI performance
    });

    // Generate CI annotations
    if (result.findings.length > 0) {
      await this.generateCIAnnotations(result.findings);
    }

    // Fail CI if high severity findings are found and failOnHigh is true
    if (failOnHigh && result.stats.high > 0) {
      throw new Error(`Serena found ${result.stats.high} high severity security issues`);
    }

    return result;
  }

  /**
   * Run quick Serena scan for pre-deploy checks
   */
  async runQuickScan(): Promise<SerenaResult> {
    return this.runScan({
      severity: ["HIGH"], // Only check high severity for quick scans
      maxFindings: 10,
      timeout: 60000, // 1 minute timeout
    });
  }

  private async verifySerenaInstalled(): Promise<void> {
    try {
      // Try multiple installation methods
      const commands = [
        "serena --version",
        "npx serena --version",
        "docker run --rm serena:latest --version",
      ];

      for (const cmd of commands) {
        try {
          await execAsync(cmd);
          console.log(`Serena found via: ${cmd}`);
          return;
        } catch (error) {
          // Continue to next command
        }
      }

      throw new Error("Serena not found via any installation method");
    } catch (error) {
      throw new Error("Serena is not installed or not accessible");
    }
  }

  private async verifyConfigExists(configPath: string): Promise<void> {
    try {
      await fs.access(configPath);
    } catch (error) {
      throw new Error(`Serena config file not found: ${configPath}`);
    }
  }

  private buildSerenaCommand(configPath: string, outputPath?: string): string {
    const parts = [
      this.getSerenaExecutable(),
      "scan",
      `-c ${configPath}`,
      "--format json",
      "--no-color",
      "--quiet",
    ];

    if (outputPath) {
      parts.push(`--output ${outputPath}`);
    }

    if (process.env.SERENA_TOKEN) {
      parts.push(`--token ${process.env.SERENA_TOKEN}`);
    }

    parts.push("."); // Scan current directory

    return parts.join(" ");
  }

  private getSerenaExecutable(): string {
    // Determine the best way to run Serena based on environment
    if (process.env.CI) {
      // In CI, prefer npx for consistency
      return "npx serena";
    }

    if (process.env.DOCKER_SERENA) {
      // Use Docker if specified
      return "docker run --rm -v $(pwd):/workspace serena:latest";
    }

    // Default to direct execution
    return "serena";
  }

  private async parseFindings(output: string): Promise<SerenaFinding[]> {
    try {
      const result = JSON.parse(output);

      // Handle different Serena output formats
      if (result.vulnerabilities) {
        return result.vulnerabilities.map(this.normalizeSerenaFinding);
      }

      if (result.findings) {
        return result.findings.map(this.normalizeSerenaFinding);
      }

      if (Array.isArray(result)) {
        return result.map(this.normalizeSerenaFinding);
      }

      return [];
    } catch (error) {
      console.error("Failed to parse Serena output:", error);
      // Try to extract findings from text output as fallback
      return this.parseTextOutput(output);
    }
  }

  private normalizeSerenaFinding(raw: any): SerenaFinding {
    return {
      id: raw.id || raw.rule_id || `serena-${Date.now()}`,
      file: raw.file || raw.filename || raw.path || "unknown",
      line: raw.line || raw.line_number || 1,
      column: raw.column || raw.col || 1,
      endLine: raw.end_line || raw.endLine,
      endColumn: raw.end_column || raw.endColumn,
      message: raw.message || raw.description || "Security issue detected",
      severity: this.normalizeSeverity(raw.severity || raw.level),
      category: raw.category || raw.type || "security",
      rule: raw.rule || raw.rule_name || raw.check || "unknown",
      cwe: raw.cwe || raw.cwe_id,
      owasp: raw.owasp || raw.owasp_category,
      confidence: this.normalizeConfidence(raw.confidence),
      impact: this.normalizeImpact(raw.impact),
      likelihood: this.normalizeLikelihood(raw.likelihood),
      references: raw.references || [],
      remediation: raw.remediation || raw.fix || raw.recommendation,
    };
  }

  private normalizeSeverity(severity: string): "HIGH" | "MEDIUM" | "LOW" | "INFO" {
    const normalized = (severity || "").toUpperCase();
    if (["HIGH", "CRITICAL", "ERROR"].includes(normalized)) return "HIGH";
    if (["MEDIUM", "MODERATE", "WARNING"].includes(normalized)) return "MEDIUM";
    if (["LOW", "MINOR"].includes(normalized)) return "LOW";
    return "INFO";
  }

  private normalizeConfidence(confidence: string): "HIGH" | "MEDIUM" | "LOW" {
    const normalized = (confidence || "").toUpperCase();
    if (["HIGH", "CERTAIN"].includes(normalized)) return "HIGH";
    if (["MEDIUM", "LIKELY"].includes(normalized)) return "MEDIUM";
    return "LOW";
  }

  private normalizeImpact(impact: string): "HIGH" | "MEDIUM" | "LOW" {
    const normalized = (impact || "").toUpperCase();
    if (["HIGH", "SEVERE"].includes(normalized)) return "HIGH";
    if (["MEDIUM", "MODERATE"].includes(normalized)) return "MEDIUM";
    return "LOW";
  }

  private normalizeLikelihood(likelihood: string): "HIGH" | "MEDIUM" | "LOW" {
    const normalized = (likelihood || "").toUpperCase();
    if (["HIGH", "LIKELY"].includes(normalized)) return "HIGH";
    if (["MEDIUM", "POSSIBLE"].includes(normalized)) return "MEDIUM";
    return "LOW";
  }

  private parseTextOutput(output: string): SerenaFinding[] {
    // Fallback parser for text output
    const findings: SerenaFinding[] = [];
    const lines = output.split("\n");

    let currentFinding: Partial<SerenaFinding> = {};

    for (const line of lines) {
      if (line.includes("Severity:")) {
        const severity = line.split("Severity:")[1]?.trim();
        currentFinding.severity = this.normalizeSeverity(severity);
      }

      if (line.includes("File:")) {
        const file = line.split("File:")[1]?.trim();
        currentFinding.file = file;
      }

      if (line.includes("Line:")) {
        const lineNum = parseInt(line.split("Line:")[1]?.trim() || "1");
        currentFinding.line = lineNum;
      }

      if (line.includes("Message:")) {
        const message = line.split("Message:")[1]?.trim();
        currentFinding.message = message;

        // End of finding, add to results
        if (currentFinding.file && currentFinding.message) {
          findings.push({
            id: `serena-text-${findings.length}`,
            file: currentFinding.file,
            line: currentFinding.line || 1,
            message: currentFinding.message,
            severity: currentFinding.severity || "MEDIUM",
            category: "security",
            rule: "unknown",
            confidence: "MEDIUM",
            impact: "MEDIUM",
            likelihood: "MEDIUM",
          });
          currentFinding = {};
        }
      }
    }

    return findings;
  }

  private calculateStats(findings: SerenaFinding[]): SerenaResult["stats"] {
    const stats = {
      total: findings.length,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    findings.forEach((finding) => {
      switch (finding.severity) {
        case "HIGH":
          stats.high++;
          break;
        case "MEDIUM":
          stats.medium++;
          break;
        case "LOW":
          stats.low++;
          break;
        case "INFO":
          stats.info++;
          break;
      }
    });

    return stats;
  }

  private async countScannedFiles(): Promise<number> {
    try {
      const { stdout } = await execAsync("find . -name '*.ts' -o -name '*.js' -o -name '*.tsx' -o -name '*.jsx' | grep -v node_modules | wc -l");
      return parseInt(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  private async countAppliedRules(configPath: string): Promise<number> {
    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      const rules = configContent.match(/rules:/g) || [];
      return rules.length;
    } catch (error) {
      return 0;
    }
  }

  private async writeOutputFile(
    outputPath: string,
    findings: SerenaFinding[],
    stats: SerenaResult["stats"],
    scanInfo: SerenaResult["scanInfo"]
  ): Promise<void> {
    const output = {
      scan_info: {
        timestamp: new Date().toISOString(),
        tool: "serena",
        version: await this.getSerenaVersion(),
        config: this.configPath,
        duration_ms: scanInfo?.duration,
        files_scanned: scanInfo?.filesScanned,
        rules_applied: scanInfo?.rulesApplied,
      },
      statistics: stats,
      findings,
    };

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf-8");
    console.log(`Serena results written to: ${outputPath}`);
  }

  private async getSerenaVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync("serena --version");
      return stdout.trim();
    } catch (error) {
      return "unknown";
    }
  }

  private async generateCIAnnotations(findings: SerenaFinding[]): Promise<void> {
    // Generate GitHub Actions annotations
    const annotationsPath = path.join(this.projectRoot, "serena-annotations.txt");
    const annotations: string[] = [];

    findings.forEach((finding) => {
      const level = finding.severity === "HIGH" ? "error" : "warning";
      const annotation = `::${level} file=${finding.file},line=${finding.line}::${finding.message} (${finding.rule})`;
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
  getSummary(result: SerenaResult): string {
    if (!result.success) {
      return `❌ Serena scan failed: ${result.error}`;
    }

    if (result.stats.total === 0) {
      return "✅ No security issues found by Serena";
    }

    const parts = [`🛡️ Serena found ${result.stats.total} security issues:`];

    if (result.stats.high > 0) {
      parts.push(`❌ ${result.stats.high} high severity`);
    }
    if (result.stats.medium > 0) {
      parts.push(`⚠️ ${result.stats.medium} medium severity`);
    }
    if (result.stats.low > 0) {
      parts.push(`ℹ️ ${result.stats.low} low severity`);
    }

    if (result.scanInfo) {
      parts.push(`(${result.scanInfo.filesScanned} files, ${result.scanInfo.duration}ms)`);
    }

    return parts.join(", ");
  }
}

// Export default instance
export const serenaRunner = new SerenaRunner();