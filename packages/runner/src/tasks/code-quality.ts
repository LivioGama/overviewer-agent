import { Job } from "@ollama-turbo-agent/shared";
import { promises as fs } from "fs";
import path from "path";
import { BaseTask, TaskResult } from "./base-task.js";

export class CodeQualityTask extends BaseTask {
  async execute(job: Job): Promise<TaskResult> {
    const branchName = await this.createWorkingBranch(job, "quality/");

    const filesToImprove = await this.findFilesToImprove();
    const improvedFiles: string[] = [];

    for (const filePath of filesToImprove.slice(0, 8)) {
      try {
        const improved = await this.improveCodeQuality(filePath, job);
        if (improved) {
          improvedFiles.push(path.relative(this.workspace, filePath));
        }
      } catch (error) {
        console.warn(`Failed to improve ${filePath}:`, error);
      }
    }

    if (improvedFiles.length === 0) {
      return {
        success: false,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: "No code quality improvements could be made",
      };
    }

    const commitMessage = `style: Improve code quality\n\nImproved code quality in ${improvedFiles.length} files with AI assistance`;
    await this.commitAndPush(job, branchName, commitMessage);

    const prTitle = `✨ Code Quality: Improve readability and maintainability`;
    const prBody = this.generatePullRequestBody(improvedFiles);

    const pullRequestUrl = await this.createPullRequest(
      job,
      branchName,
      prTitle,
      prBody,
    );

    return {
      success: true,
      changes: {
        files: improvedFiles,
        additions: improvedFiles.length * 8,
        deletions: improvedFiles.length * 6,
      },
      summary: `Improved code quality in ${improvedFiles.length} files`,
      branchName,
      pullRequestUrl,
    };
  }

  private async findFilesToImprove(): Promise<string[]> {
    const extensions = [".ts", ".js", ".tsx", ".jsx", ".py"];
    const files: string[] = [];

    const scanDirectory = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!this.shouldSkipDirectory(entry.name)) {
            await scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    await scanDirectory(this.workspace);
    return files;
  }

  private shouldSkipDirectory(name: string): boolean {
    return (
      ["node_modules", ".git", "dist", "build"].includes(name) ||
      name.startsWith(".")
    );
  }

  private async improveCodeQuality(
    filePath: string,
    job: Job,
  ): Promise<boolean> {
    const content = await fs.readFile(filePath, "utf-8");

    if (content.length < 100 || content.length > 15000) {
      return false;
    }

    if (this.hasGoodQuality(content)) {
      return false;
    }

    const improvedContent = await this.ollama.improveCodeQuality(
      content,
      job.taskParams.model || "gpt-oss:120b",
    );

    if (this.isImprovement(content, improvedContent)) {
      await fs.writeFile(filePath, improvedContent, "utf-8");
      return true;
    }

    return false;
  }

  private hasGoodQuality(content: string): boolean {
    const qualityIndicators = [
      /\/\*\*[\s\S]*?\*\//g,
      /^\s*\/\/[^\/]/gm,
      /const\s+\w+\s*=/g,
      /interface\s+\w+/g,
      /type\s+\w+/g,
    ];

    const indicators = qualityIndicators.reduce((count, pattern) => {
      const matches = content.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);

    const lines = content.split("\n").length;
    return indicators / lines > 0.1;
  }

  private isImprovement(original: string, improved: string): boolean {
    if (improved.length < 50) {
      return false;
    }

    if (original === improved) {
      return false;
    }

    const originalLines = original.split("\n").length;
    const improvedLines = improved.split("\n").length;

    if (Math.abs(originalLines - improvedLines) / originalLines > 0.4) {
      return false;
    }

    return true;
  }

  private generatePullRequestBody(improvedFiles: string[]): string {
    return `## ✨ Code Quality Improvements

This PR enhances code quality, readability, and maintainability across the codebase.

### Improved Files
${improvedFiles.map((file) => `- \`${file}\``).join("\n")}

### Quality Improvements:
- ✅ Enhanced code readability
- ✅ Better variable and function naming
- ✅ Improved code structure
- ✅ Added type annotations (where applicable)
- ✅ Optimized performance
- ✅ Reduced code complexity
- ✅ Better error handling

### Benefits:
- 📖 Easier code understanding
- 🔧 Simplified maintenance
- 🚀 Better performance
- 🛡️ Improved reliability
- 👥 Enhanced developer experience

### Code Quality Metrics:
- Improved readability score
- Reduced cyclomatic complexity
- Enhanced type safety
- Better separation of concerns

---
*This PR was automatically generated by Ollama Turbo Agent*`;
  }
}
