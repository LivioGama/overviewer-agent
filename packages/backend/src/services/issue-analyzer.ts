import type { IssueEvent } from "@overviewer-agent/shared";

export interface IssueAnalysis {
  taskType:
    | "bug_fix"
    | "refactor"
    | "test_generation"
    | "documentation"
    | "security_audit"
    | "code_quality";
  complexity: "low" | "medium" | "high";
  priority: "low" | "medium" | "high" | "critical";
  summary: string;
  keywords: string[];
  affectedComponents: string[];
  estimatedEffort: number; // in minutes
  confidence: number; // 0-100
}

export class IssueAnalyzerService {
  analyzeIssue(issueEvent: IssueEvent): IssueAnalysis {
    const issue = issueEvent.issue;
    const title = issue.title.toLowerCase();
    const body = issue.body?.toLowerCase() || "";
    const combined = `${title} ${body}`;

    const taskType = this.determineTaskType(title, body, issue.labels);
    const complexity = this.estimateComplexity(combined);
    const priority = this.determinePriority(title, body, issue.labels);
    const keywords = this.extractKeywords(combined);
    const affectedComponents = this.identifyComponents(combined);

    return {
      taskType,
      complexity,
      priority,
      summary: this.generateSummary(issue.title, taskType),
      keywords,
      affectedComponents,
      estimatedEffort: this.estimateEffort(complexity, taskType),
      confidence: this.calculateConfidence(keywords, taskType),
    };
  }

  shouldProcessIssue(issueEvent: IssueEvent): boolean {
    const issue = issueEvent.issue;

    // Don't process if:
    // - Issue is already closed
    // - Created by a bot
    // - Has "no-automation" or "wontfix" labels
    if (issue.state === "closed") return false;
    if (issue.user.type === "Bot") return false;

    const labelNames = issue.labels.map((l) => l.name.toLowerCase());
    if (
      labelNames.includes("no-automation") ||
      labelNames.includes("wontfix")
    ) {
      return false;
    }

    // Check if there's enough content to analyze
    const title = issue.title.trim();
    const body = issue.body?.trim() || "";

    if (title.length < 10 && body.length < 20) {
      return false;
    }

    return true;
  }

  private determineTaskType(
    title: string,
    body: string,
    labels: Array<{ name: string }>,
  ): IssueAnalysis["taskType"] {
    const labelNames = labels.map((l) => l.name.toLowerCase());

    // Check labels first
    if (labelNames.includes("bug") || labelNames.includes("error")) {
      return "bug_fix";
    }
    if (labelNames.includes("enhancement") || labelNames.includes("feature")) {
      return "refactor";
    }
    if (labelNames.includes("documentation") || labelNames.includes("docs")) {
      return "documentation";
    }
    if (labelNames.includes("security")) {
      return "security_audit";
    }
    if (labelNames.includes("test") || labelNames.includes("testing")) {
      return "test_generation";
    }

    // Check title and body for keywords
    const combined = `${title} ${body}`;

    const bugKeywords = [
      "bug",
      "error",
      "issue",
      "problem",
      "broken",
      "fail",
      "crash",
      "exception",
      "not working",
    ];
    const refactorKeywords = [
      "refactor",
      "improve",
      "optimize",
      "enhance",
      "feature",
      "add",
      "implement",
    ];
    const testKeywords = [
      "test",
      "testing",
      "coverage",
      "spec",
      "unit test",
      "integration test",
    ];
    const docKeywords = [
      "documentation",
      "docs",
      "readme",
      "guide",
      "comment",
      "document",
    ];
    const securityKeywords = [
      "security",
      "vulnerability",
      "auth",
      "permission",
      "xss",
      "sql injection",
    ];
    const qualityKeywords = [
      "quality",
      "lint",
      "format",
      "style",
      "code quality",
    ];

    if (this.containsKeywords(combined, bugKeywords)) {
      return "bug_fix";
    }
    if (this.containsKeywords(combined, testKeywords)) {
      return "test_generation";
    }
    if (this.containsKeywords(combined, docKeywords)) {
      return "documentation";
    }
    if (this.containsKeywords(combined, securityKeywords)) {
      return "security_audit";
    }
    if (this.containsKeywords(combined, qualityKeywords)) {
      return "code_quality";
    }
    if (this.containsKeywords(combined, refactorKeywords)) {
      return "refactor";
    }

    // Default to bug_fix for unclassified issues
    return "bug_fix";
  }

  private estimateComplexity(content: string): IssueAnalysis["complexity"] {
    const complexityIndicators = {
      high: [
        "multiple files",
        "architecture",
        "database",
        "breaking change",
        "major refactor",
      ],
      medium: ["several", "component", "module", "integration", "api"],
      low: ["simple", "small", "minor", "typo", "quick fix"],
    };

    if (this.containsKeywords(content, complexityIndicators.high)) {
      return "high";
    }
    if (this.containsKeywords(content, complexityIndicators.medium)) {
      return "medium";
    }

    return "low";
  }

  private determinePriority(
    title: string,
    body: string,
    labels: Array<{ name: string }>,
  ): IssueAnalysis["priority"] {
    const labelNames = labels.map((l) => l.name.toLowerCase());

    if (labelNames.includes("critical") || labelNames.includes("urgent")) {
      return "critical";
    }
    if (labelNames.includes("high priority")) {
      return "high";
    }
    if (labelNames.includes("low priority")) {
      return "low";
    }

    const combined = `${title} ${body}`;
    const criticalKeywords = [
      "critical",
      "urgent",
      "production",
      "security",
      "data loss",
    ];
    const highKeywords = ["important", "blocker", "broken", "failing"];
    const lowKeywords = [
      "enhancement",
      "nice to have",
      "future",
      "improvement",
    ];

    if (this.containsKeywords(combined, criticalKeywords)) {
      return "critical";
    }
    if (this.containsKeywords(combined, highKeywords)) {
      return "high";
    }
    if (this.containsKeywords(combined, lowKeywords)) {
      return "low";
    }

    return "medium";
  }

  private extractKeywords(content: string): string[] {
    const allKeywords = [
      "bug",
      "error",
      "issue",
      "problem",
      "broken",
      "fail",
      "crash",
      "refactor",
      "improve",
      "optimize",
      "enhance",
      "feature",
      "test",
      "testing",
      "coverage",
      "documentation",
      "security",
    ];

    return allKeywords.filter((keyword) => content.includes(keyword));
  }

  private identifyComponents(content: string): string[] {
    const componentPatterns = [
      /(?:component|module|service|controller|model|view):\s*([a-zA-Z0-9_-]+)/gi,
      /(?:file|path):\s*([a-zA-Z0-9_/.-]+)/gi,
      /(?:in|at)\s+([a-zA-Z0-9_.-]+\.[a-zA-Z]{2,4})/gi,
    ];

    const components: string[] = [];

    for (const pattern of componentPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          components.push(match[1]);
        }
      }
    }

    return [...new Set(components)]; // Remove duplicates
  }

  private generateSummary(title: string, taskType: string): string {
    const taskTypeMap = {
      bug_fix: "a bug fix",
      refactor: "code refactoring",
      test_generation: "test creation",
      documentation: "documentation updates",
      security_audit: "security improvements",
      code_quality: "code quality improvements",
    };

    return `${taskTypeMap[taskType as keyof typeof taskTypeMap]} for: ${title}`;
  }

  private estimateEffort(complexity: string, taskType: string): number {
    const baseEffort = {
      bug_fix: 30,
      refactor: 45,
      test_generation: 25,
      documentation: 20,
      security_audit: 60,
      code_quality: 35,
    };

    const multiplier = {
      low: 1,
      medium: 2,
      high: 4,
    };

    return (
      baseEffort[taskType as keyof typeof baseEffort] *
      multiplier[complexity as keyof typeof multiplier]
    );
  }

  private calculateConfidence(keywords: string[], taskType: string): number {
    if (keywords.length === 0) return 50;

    const relevantKeywords = {
      bug_fix: ["bug", "error", "issue", "problem", "broken", "fail"],
      refactor: ["refactor", "improve", "optimize", "enhance"],
      test_generation: ["test", "testing", "coverage"],
      documentation: ["documentation", "docs"],
      security_audit: ["security", "vulnerability"],
      code_quality: ["quality", "lint", "format"],
    };

    const relevant =
      relevantKeywords[taskType as keyof typeof relevantKeywords] || [];
    const matchCount = keywords.filter((k) => relevant.includes(k)).length;

    return Math.min(50 + matchCount * 15, 95);
  }

  private containsKeywords(content: string, keywords: string[]): boolean {
    return keywords.some((keyword) => content.includes(keyword));
  }
}

export const issueAnalyzerService = new IssueAnalyzerService();
