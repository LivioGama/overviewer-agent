import type { Octokit } from "@octokit/rest";
import type { Job } from "@overviewer-agent/shared";
import type { OllamaService } from "./ollama.js";

export interface ReviewResult {
  approved: boolean;
  confidence: number;
  comments: ReviewComment[];
  summary: string;
  suggestions: string[];
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  severity: "info" | "warning" | "error";
}

export class PRReviewerService {
  constructor(
    private ollama: OllamaService,
    private octokit: Octokit,
  ) {}

  async reviewPullRequest(
    job: Job,
    prNumber: number,
    originalIssue?: {
      title: string;
      body: string;
    },
  ): Promise<ReviewResult> {
    // Get PR details and diff
    const prDetails = await this.octokit.rest.pulls.get({
      owner: job.repoOwner,
      repo: job.repoName,
      pull_number: prNumber,
    });

    // Get the diff/files changed
    const files = await this.octokit.rest.pulls.listFiles({
      owner: job.repoOwner,
      repo: job.repoName,
      pull_number: prNumber,
    });

    // Analyze changes against original issue
    const reviewResult = await this.analyzeChanges(
      {
        title: prDetails.data.title,
        body: prDetails.data.body || "",
      },
      files.data,
      originalIssue,
      job,
    );

    // Post review comments if any
    if (reviewResult.comments.length > 0) {
      await this.postReviewComments(job, prNumber, reviewResult.comments);
    }

    // Submit overall review
    await this.submitReview(job, prNumber, reviewResult);

    return reviewResult;
  }

  private async analyzeChanges(
    prData: { title: string; body: string },
    files: Array<{
      filename: string;
      additions: number;
      deletions: number;
      patch?: string;
      status: string;
    }>,
    originalIssue?: { title: string; body: string },
    job?: Job,
  ): Promise<ReviewResult> {
    const changes = files.map((file) => ({
      filename: file.filename,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch || "",
      status: file.status,
    }));

    // Use Ollama to analyze the changes
    const analysisPrompt = this.buildAnalysisPrompt(
      prData,
      changes,
      originalIssue,
    );

    try {
      const analysis = await this.ollama.generate({
        model: job?.taskParams.model || "gpt-oss:120b",
        prompt: analysisPrompt,
        system:
          "You are an expert code reviewer. Analyze the changes and provide structured feedback in JSON format.",
      });

      return this.parseAnalysisResult(analysis, changes);
    } catch (error) {
      console.error("Error analyzing PR changes:", error);

      // Fallback to basic analysis
      return this.basicAnalysis(changes, originalIssue);
    }
  }

  private buildAnalysisPrompt(
    prData: { title: string; body: string },
    changes: Array<{
      filename: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>,
    originalIssue?: { title: string; body: string },
  ): string {
    return `You are reviewing a pull request that was automatically generated to fix an issue.

Original Issue:
Title: ${originalIssue?.title || "N/A"}
Description: ${originalIssue?.body || "N/A"}

PR Details:
Title: ${prData.title}
Description: ${prData.body}

Files Changed:
${changes
  .map(
    (file) => `
- ${file.filename} (+${file.additions} -${file.deletions})
${file.patch ? `Changes:\n${file.patch.substring(0, 500)}${file.patch.length > 500 ? "..." : ""}` : ""}
`,
  )
  .join("\n")}

Please analyze this PR and provide:
1. Does it properly address the original issue? (yes/no)
2. Are the changes minimal and focused? (yes/no)
3. Any potential issues or risks? (list)
4. Code quality assessment (1-10)
5. Should this be approved? (yes/no)
6. Any specific comments for improvement?

Respond in JSON format:
{
  "addresses_issue": boolean,
  "minimal_changes": boolean,
  "risks": ["risk1", "risk2"],
  "code_quality": number,
  "approve": boolean,
  "comments": [
    {
      "file": "filename",
      "line": number,
      "message": "comment",
      "severity": "info|warning|error"
    }
  ],
  "summary": "Overall assessment"
}`;
  }

  private parseAnalysisResult(
    analysis: string,
    changes: Array<{
      filename: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>,
  ): ReviewResult {
    try {
      const parsed = JSON.parse(analysis);

      const comments: ReviewComment[] = (parsed.comments || []).map(
        (comment: {
          file: string;
          line?: number;
          message: string;
          severity?: string;
        }) => ({
          path: comment.file,
          line: comment.line || 1,
          body: comment.message,
          severity: comment.severity || "info",
        }),
      );

      const confidence = this.calculateConfidence(parsed);

      return {
        approved: parsed.approve === true,
        confidence,
        comments,
        summary: parsed.summary || "AI review completed",
        suggestions: this.generateSuggestions(parsed, changes),
      };
    } catch (error) {
      console.error("Error parsing analysis result:", error);
      return this.basicAnalysis(changes);
    }
  }

  private basicAnalysis(
    changes: Array<{ additions: number; deletions: number; filename: string }>,
    originalIssue?: { title: string; body: string },
  ): ReviewResult {
    // Basic heuristic analysis
    const totalChanges = changes.reduce(
      (sum, file) => sum + file.additions + file.deletions,
      0,
    );
    const fileCount = changes.length;

    const approved = totalChanges < 200 && fileCount < 10; // Conservative approval criteria
    const confidence = totalChanges < 50 ? 80 : totalChanges < 100 ? 60 : 40;

    return {
      approved,
      confidence,
      comments: [],
      summary: `Reviewed ${fileCount} files with ${totalChanges} total changes. ${approved ? "Changes appear reasonable." : "Changes are substantial and require human review."}`,
      suggestions: [
        "Manual testing recommended to verify fix",
        "Consider adding tests if none exist",
        "Verify backward compatibility",
      ],
    };
  }

  private calculateConfidence(parsed: {
    addresses_issue?: boolean;
    minimal_changes?: boolean;
    code_quality?: number;
    risks?: string[];
  }): number {
    let confidence = 50; // Base confidence

    if (parsed.addresses_issue) confidence += 20;
    if (parsed.minimal_changes) confidence += 15;
    if (parsed.code_quality && parsed.code_quality >= 8) confidence += 10;
    if (parsed.risks && parsed.risks.length === 0) confidence += 15;

    return Math.min(confidence, 95); // Cap at 95%
  }

  private generateSuggestions(
    parsed: {
      minimal_changes?: boolean;
      code_quality?: number;
      risks?: string[];
    },
    changes: Array<{ filename: string }>,
  ): string[] {
    const suggestions = [];

    if (!parsed.minimal_changes) {
      suggestions.push(
        "Consider breaking down changes into smaller, more focused commits",
      );
    }

    if (parsed.code_quality && parsed.code_quality < 7) {
      suggestions.push("Code quality could be improved - consider refactoring");
    }

    if (parsed.risks && parsed.risks.length > 0) {
      suggestions.push(`Address identified risks: ${parsed.risks.join(", ")}`);
    }

    const hasTests = changes.some(
      (file) =>
        file.filename.includes("test") ||
        file.filename.includes("spec") ||
        file.filename.includes("__tests__"),
    );

    if (!hasTests) {
      suggestions.push("Consider adding tests to verify the fix");
    }

    return suggestions;
  }

  private async postReviewComments(
    job: Job,
    prNumber: number,
    comments: ReviewComment[],
  ): Promise<void> {
    // Get the latest commit SHA from the PR
    const prDetails = await this.octokit.rest.pulls.get({
      owner: job.repoOwner,
      repo: job.repoName,
      pull_number: prNumber,
    });

    const commitId = prDetails.data.head.sha;

    for (const comment of comments) {
      try {
        await this.octokit.rest.pulls.createReviewComment({
          owner: job.repoOwner,
          repo: job.repoName,
          pull_number: prNumber,
          body: `🤖 **AI Review**: ${comment.body}`,
          path: comment.path,
          line: comment.line,
          commit_id: commitId,
        });
      } catch (error) {
        console.warn(
          `Failed to post review comment on ${comment.path}:${comment.line}:`,
          error,
        );
      }
    }
  }

  private async submitReview(
    job: Job,
    prNumber: number,
    reviewResult: ReviewResult,
  ): Promise<void> {
    const reviewBody = `## 🤖 AI Review Summary

${reviewResult.summary}

**Confidence**: ${reviewResult.confidence}%

### Suggestions:
${reviewResult.suggestions.map((s) => `- ${s}`).join("\n")}

${
  reviewResult.approved
    ? "✅ **This PR looks good to me!** The changes appear to address the issue appropriately."
    : "⚠️ **This PR needs human review** due to complexity or potential issues identified."
}

---
*This review was automatically generated by Ollama Turbo Agent*`;

    try {
      await this.octokit.rest.pulls.createReview({
        owner: job.repoOwner,
        repo: job.repoName,
        pull_number: prNumber,
        body: reviewBody,
        event: reviewResult.approved ? "APPROVE" : "COMMENT",
      });
    } catch (error) {
      console.error("Failed to submit PR review:", error);
    }
  }
}

export const createPRReviewerService = (
  ollama: OllamaService,
  octokit: Octokit,
) => new PRReviewerService(ollama, octokit);
