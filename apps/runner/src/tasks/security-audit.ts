import { Octokit } from "@octokit/rest";
import { Job } from "@overviewer-agent/shared";
import { CodeAnalysisService } from "../services/code-analysis.js";
import { LLMService } from "../services/llm.js";
import { BaseTask, TaskResult } from "./base-task.js";

export class SecurityAuditTask extends BaseTask {
  private codeAnalysis = new CodeAnalysisService();
  private llm = new LLMService();

  async execute(
    job: Job,
    workspace: string,
    octokit: Octokit,
  ): Promise<TaskResult> {
    console.log(`Starting security audit for job ${job.id}`);

    try {
      const codeContext = await this.codeAnalysis.analyzeRepository(workspace);

      const securityFixes = await this.llm.generateCodeFix(
        {
          title: "Security Audit and Fixes",
          body: "Scan for security vulnerabilities and apply fixes",
        },
        codeContext,
        {
          taskType: "security_audit",
          confidence: 80,
          description: "Security vulnerability fixes",
          priority: "high",
          estimatedComplexity: "complex",
          affectedFiles: [],
          suggestions: [
            "Fix security vulnerabilities",
            "Update dependencies",
            "Add input validation",
          ],
        },
      );

      const branchName = await this.createWorkingBranch(job, "security/audit");
      const commitMessage = await this.llm.generateCommitMessage(securityFixes);

      await this.commitAndPush(job, branchName, commitMessage, octokit);

      const prUrl = await this.createPullRequest(
        job,
        branchName,
        "Security audit fixes",
        securityFixes.summary,
      );

      return {
        success: true,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: "Security audit completed",
        branchName,
        prUrl,
      };
    } catch (error) {
      return {
        success: false,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: `Security audit failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
