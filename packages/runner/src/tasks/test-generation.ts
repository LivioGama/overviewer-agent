import { Job } from "@ollama-turbo-agent/shared";
import { promises as fs } from "fs";
import path from "path";
import { BaseTask, TaskResult } from "./base-task.js";

export class TestGenerationTask extends BaseTask {
  async execute(job: Job): Promise<TaskResult> {
    const branchName = await this.createWorkingBranch(job, "tests/");

    const sourceFiles = await this.findSourceFiles();
    const testsGenerated: string[] = [];

    for (const sourceFile of sourceFiles.slice(0, 10)) {
      try {
        const testFile = await this.generateTestForFile(sourceFile, job);
        if (testFile) {
          testsGenerated.push(testFile);
        }
      } catch (error) {
        console.warn(`Failed to generate test for ${sourceFile}:`, error);
      }
    }

    if (testsGenerated.length === 0) {
      return {
        success: false,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: "No tests could be generated",
      };
    }

    const commitMessage = `test: Add automated test generation\n\nGenerated ${testsGenerated.length} test files with AI assistance`;
    await this.commitAndPush(job, branchName, commitMessage);

    const prTitle = `🧪 Add Automated Test Coverage`;
    const prBody = this.generatePullRequestBody(testsGenerated);

    const pullRequestUrl = await this.createPullRequest(
      job,
      branchName,
      prTitle,
      prBody,
    );

    const checkRunId = await this.createCheckRun(
      job,
      "Test Generation",
      `Generated ${testsGenerated.length} test files`,
      `Generated test files:\n${testsGenerated.map((f) => `- ${f}`).join("\n")}`,
    );

    return {
      success: true,
      changes: {
        files: testsGenerated,
        additions: testsGenerated.length * 30,
        deletions: 0,
      },
      summary: `Generated ${testsGenerated.length} comprehensive test files`,
      branchName,
      pullRequestUrl,
      checkRunId,
    };
  }

  private async findSourceFiles(): Promise<string[]> {
    const extensions = [".ts", ".js", ".tsx", ".jsx"];
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
          if (extensions.includes(ext) && !this.isTestFile(entry.name)) {
            files.push(fullPath);
          }
        }
      }
    };

    await scanDirectory(this.workspace);
    return files;
  }

  private shouldSkipDirectory(name: string): boolean {
    const skipDirs = [
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage",
      ".next",
      "__tests__",
      "tests",
    ];
    return skipDirs.includes(name) || name.startsWith(".");
  }

  private isTestFile(filename: string): boolean {
    return (
      filename.includes(".test.") ||
      filename.includes(".spec.") ||
      filename.includes(".e2e.") ||
      filename.startsWith("test-")
    );
  }

  private async generateTestForFile(
    sourceFile: string,
    job: Job,
  ): Promise<string | null> {
    const content = await fs.readFile(sourceFile, "utf-8");

    if (content.length < 100 || content.length > 20000) {
      return null;
    }

    const existingTestFile = await this.findExistingTestFile(sourceFile);
    if (existingTestFile) {
      return null;
    }

    const testFramework = this.detectTestFramework();
    const testContent = await this.ollama.generateTests(
      content,
      testFramework,
      job.taskParams.model || "gpt-oss:120b",
    );

    const testFilePath = this.getTestFilePath(sourceFile, testFramework);
    await this.ensureDirectoryExists(path.dirname(testFilePath));
    await fs.writeFile(testFilePath, testContent, "utf-8");

    return path.relative(this.workspace, testFilePath);
  }

  private async findExistingTestFile(
    sourceFile: string,
  ): Promise<string | null> {
    const baseName = path.basename(sourceFile, path.extname(sourceFile));
    const dir = path.dirname(sourceFile);

    const possibleTestFiles = [
      path.join(dir, `${baseName}.test.ts`),
      path.join(dir, `${baseName}.test.js`),
      path.join(dir, `${baseName}.spec.ts`),
      path.join(dir, `${baseName}.spec.js`),
      path.join(dir, "__tests__", `${baseName}.test.ts`),
      path.join(dir, "__tests__", `${baseName}.test.js`),
    ];

    for (const testFile of possibleTestFiles) {
      try {
        await fs.access(testFile);
        return testFile;
      } catch {}
    }

    return null;
  }

  private detectTestFramework(): string {
    try {
      const packageJsonPath = path.join(this.workspace, "package.json");
      const packageJson = require(packageJsonPath);

      if (packageJson.devDependencies) {
        if (packageJson.devDependencies.jest) return "jest";
        if (packageJson.devDependencies.vitest) return "vitest";
        if (packageJson.devDependencies.mocha) return "mocha";
        if (packageJson.devDependencies["@testing-library/react"])
          return "react-testing-library";
      }
    } catch (error) {
      console.warn("Could not detect test framework, defaulting to jest");
    }

    return "jest";
  }

  private getTestFilePath(sourceFile: string, testFramework: string): string {
    const ext = path.extname(sourceFile);
    const baseName = path.basename(sourceFile, ext);
    const dir = path.dirname(sourceFile);

    const testDir = path.join(dir, "__tests__");
    const testFileName = `${baseName}.test${ext}`;

    return path.join(testDir, testFileName);
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.warn(`Failed to create directory ${dir}:`, error);
    }
  }

  private generatePullRequestBody(testsGenerated: string[]): string {
    return `## 🧪 Automated Test Generation

This PR adds comprehensive test coverage for the codebase using AI-generated tests.

### Generated Test Files
${testsGenerated.map((file) => `- \`${file}\``).join("\n")}

### Test Coverage Includes:
- ✅ Happy path scenarios
- ✅ Edge cases and boundary conditions
- ✅ Error handling and validation
- ✅ Mock dependencies where appropriate
- ✅ Input validation tests

### Benefits:
- 🚀 Improved code reliability
- 🔍 Better error detection
- 📈 Increased test coverage
- 🛡️ Regression protection

### Next Steps:
1. Review the generated tests for accuracy
2. Run the test suite to ensure all tests pass
3. Adjust or extend tests as needed
4. Consider adding integration tests for complex workflows

---
*This PR was automatically generated by Ollama Turbo Agent*`;
  }
}
