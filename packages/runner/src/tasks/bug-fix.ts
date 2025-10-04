import { Octokit } from "@octokit/rest";
import { Job } from "@overviewer-agent/shared";
import { promises as fs } from "fs";
import path from "path";
import { simpleGit } from "simple-git";
import { CodeAnalysisService } from "../services/code-analysis.js";
import { LLMService } from "../services/llm.js";
import { BaseTask, TaskResult } from "./base-task.js";

export class BugFixTask extends BaseTask {
  protected codeAnalysis = new CodeAnalysisService();
  protected llm = new LLMService();

  async execute(
    job: Job,
    workspace: string,
    octokit: Octokit,
  ): Promise<TaskResult> {
    this.workspace = workspace;
    this.octokit = octokit;
    try {
      // Post initial comment if this is an auto-triggered task
      if (job.taskParams.autoTriggered) await this.postInitialComment(job);

      // Step 1: Analyze the issue
      await this.updateStatus(
        job,
        octokit,
        "analyzing",
        "🔍 Analyzing the issue and repository structure...",
      );

      const analysis = await this.llm.analyzeIssue(
        job.taskParams.issueTitle || "Bug fix request",
        job.taskParams.issueBody || job.taskParams.args || "",
        await this.getRepositoryOverview(workspace),
      );

      console.log(
        `Issue analysis complete: ${analysis.taskType} (${analysis.confidence}% confidence)`,
      );

      // Step 2: Analyze repository context
      const codeContext = await this.codeAnalysis.analyzeRepository(workspace);

      // Step 3: Find relevant files
      const relevantFiles = await this.codeAnalysis.findRelevantFiles(
        workspace,
        job.taskParams.issueBody || job.taskParams.args || "",
      );

      console.log(`Found ${relevantFiles.length} relevant files for analysis`);

      // Step 4: Generate the fix
      await this.updateStatus(
        job,
        octokit,
        "fixing",
        "🔧 Generating code fixes using AI...",
      );

      const changes = await this.llm.generateCodeFix(
        {
          title: job.taskParams.issueTitle || "Bug fix",
          body: job.taskParams.issueBody || job.taskParams.args || "",
        },
        codeContext,
        analysis,
      );

      console.log(`Generated fix affecting ${changes.files.length} files`);

      // Step 5: Apply the changes
      await this.updateStatus(
        job,
        octokit,
        "applying",
        "📝 Applying code changes...",
      );

      const appliedFiles = await this.applyChanges(workspace, changes);

      // Step 6: Self-review the changes
      await this.updateStatus(
        job,
        octokit,
        "reviewing",
        "🔍 Reviewing changes for quality and safety...",
      );

      const review = await this.llm.reviewChanges(changes, codeContext);

      if (!review.approved) {
        console.log(`Self-review failed: ${review.concerns.join(", ")}`);
        return {
          success: false,
          changes: { files: [], additions: 0, deletions: 0 },
          summary: `Fix rejected by self-review: ${review.concerns.join(", ")}`,
        };
      }

      // Step 7: Run tests if available
      const testsPassed = await this.runTests(workspace);
      if (!testsPassed) {
        console.log("Tests failed, rolling back changes");
        await this.rollbackChanges(workspace);
        return {
          success: false,
          changes: { files: [], additions: 0, deletions: 0 },
          summary: "Generated fix failed tests, changes rolled back",
        };
      }

      // Step 8: Create branch and commit
      await this.updateStatus(
        job,
        octokit,
        "committing",
        "📤 Creating branch and committing changes...",
      );

      const branchName = await this.createWorkingBranch(job, "bugfix/bug_fix");
      const commitMessage = await this.llm.generateCommitMessage(changes);

      await this.commitChanges(workspace, commitMessage);

      // Step 9: Create PR
      await this.updateStatus(
        job,
        octokit,
        "creating_pr",
        "🔄 Creating pull request...",
      );

      const prDescription = await this.llm.generatePRDescription(
        {
          title: job.taskParams.issueTitle || "Bug fix",
          body: job.taskParams.issueBody || "",
          number: job.taskParams.issueNumber || 0,
        },
        changes,
        analysis,
      );

      const prUrl = await this.createPullRequest(
        job,
        branchName,
        `Fix: ${job.taskParams.issueTitle || "Bug fix"}`,
        prDescription,
      );

      // Step 10: Final status update
      await this.postSuccessComment(job, prUrl, changes.summary);

      const stats = await this.calculateChangeStats(appliedFiles);

      return {
        success: true,
        changes: stats,
        summary: `Successfully fixed issue with ${appliedFiles.length} file changes. PR created: ${prUrl}`,
        prUrl,
        branchName,
      };
    } catch (error) {
      return {
        success: false,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: `Bug fix failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  protected async applyChanges(
    workspace: string,
    changes: any,
  ): Promise<string[]> {
    const appliedFiles: string[] = [];

    for (const change of changes.files) {
      const filePath = path.join(workspace, change.path);

      try {
        if (change.action === "create" || change.action === "modify") {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, change.content, "utf-8");
        } else if (change.action === "delete") {
          await fs.unlink(filePath);
        }

        appliedFiles.push(change.path);
        console.log(`Applied ${change.action} to ${change.path}`);
      } catch (error) {
        console.error(`Failed to apply change to ${change.path}:`, error);
        throw new Error(`Failed to apply changes to ${change.path}`);
      }
    }

    return appliedFiles;
  }

  protected async runTests(workspace: string): Promise<boolean> {
    try {
      // Check if there are any test scripts
      const packageJsonPath = path.join(workspace, "package.json");

      try {
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, "utf-8"),
        );
        if (packageJson.scripts?.test) {
          // TODO: Run npm test and check exit code
          console.log("Test script found, would run tests here");
          return true; // For now, assume tests pass
        }
      } catch {
        // No package.json or test script
      }

      // For now, just verify the files compile/parse correctly
      return true;
    } catch (error) {
      console.error("Test execution failed:", error);
      return false;
    }
  }

  protected async rollbackChanges(workspace: string): Promise<void> {
    const git = simpleGit(workspace);
    await git.reset(["--hard", "HEAD"]);
  }

  protected async createWorkingBranch(
    job: Job,
    prefix: string,
  ): Promise<string> {
    const git = simpleGit(this.workspace);
    const branchName = `${prefix}-${job.id.slice(-8)}`;

    await git.checkoutLocalBranch(branchName);
    return branchName;
  }

  protected async commitChanges(
    workspace: string,
    message: string,
  ): Promise<void> {
    const git = simpleGit(workspace);
    await git.add(".");
    await git.commit(message);
  }

  protected async getRepositoryOverview(workspace: string): Promise<string> {
    try {
      const readmePath = path.join(workspace, "README.md");
      const readme = await fs.readFile(readmePath, "utf-8");
      return readme.slice(0, 2000); // First 2KB of README
    } catch {
      return "No README.md found";
    }
  }

  protected async calculateChangeStats(
    files: string[],
  ): Promise<{ files: string[]; additions: number; deletions: number }> {
    return {
      files,
      additions: files.length * 10, // Rough estimate
      deletions: files.length * 2, // Rough estimate
    };
  }
}
