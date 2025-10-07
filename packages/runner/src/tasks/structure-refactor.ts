import { Octokit } from "@octokit/rest";
import { Job } from "@overviewer-agent/shared";
import { promises as fs } from "fs";
import path from "path";
import { simpleGit } from "simple-git";
import { BaseTask, TaskResult } from "./base-task.js";

export class StructureRefactorTask extends BaseTask {
  async execute(
    job: Job,
    workspace: string,
    octokit: Octokit,
  ): Promise<TaskResult> {
    const git = simpleGit(workspace);
    const changedFiles: string[] = [];

    try {
      const issueBody = job.taskParams.issueBody || "";
      const moveOperation = this.parseDirectoryMove(issueBody);

      if (!moveOperation) {
        throw new Error(
          "Could not parse directory move operation from issue",
        );
      }

      console.log(
        `Moving ${moveOperation.from} → ${moveOperation.to}`,
      );

      const files = await this.findAllFilesInDirectory(
        workspace,
        moveOperation.from,
      );

      for (const file of files) {
        const relativePath = path.relative(
          path.join(workspace, moveOperation.from),
          file,
        );
        const newPath = path.join(moveOperation.to, relativePath);

        await fs.mkdir(path.join(workspace, path.dirname(newPath)), {
          recursive: true,
        });
        await git.mv(
          path.join(moveOperation.from, relativePath),
          newPath,
        );
        changedFiles.push(newPath);
      }

      await this.updateImportPaths(
        workspace,
        moveOperation.from,
        moveOperation.to,
      );

      await this.updateConfigFiles(
        workspace,
        moveOperation.from,
        moveOperation.to,
      );

      const branchName = await this.createWorkingBranch(
        job,
        "refactor/structure",
      );
      const commitMessage = `Refactor: Move ${moveOperation.from} to ${moveOperation.to}\n\nMoved ${files.length} files and updated all imports`;

      await this.commitAndPush(job, branchName, commitMessage, octokit);

      const prUrl = await this.createPullRequest(
        job,
        branchName,
        `Refactor: Move ${moveOperation.from} to ${moveOperation.to}`,
        `This PR moves the \`${moveOperation.from}\` directory to \`${moveOperation.to}\` and updates all imports accordingly.\n\n**Changes:**\n- Moved ${files.length} files\n- Updated import paths across the codebase\n- Updated configuration files`,
      );

      return {
        success: true,
        changes: {
          files: changedFiles,
          additions: files.length,
          deletions: 0,
        },
        summary: `Successfully moved ${files.length} files from ${moveOperation.from} to ${moveOperation.to}`,
        branchName,
        prUrl,
      };
    } catch (error) {
      return {
        success: false,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: `Structure refactor failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private parseDirectoryMove(issueBody: string): {
    from: string;
    to: string;
  } | null {
    const patterns = [
      /move\s+(?:the\s+)?([^\s]+)\s+(?:directory|folder|package)?\s*(?:to|→|-?>)\s*([^\s]+)/i,
      /rename\s+(?:the\s+)?([^\s]+)\s+(?:directory|folder|package)?\s*(?:to|→|-?>)\s*([^\s]+)/i,
      /([^\s]+)\s*(?:to|→|-?>)\s*([^\s]+)/,
    ];

    for (const pattern of patterns) {
      const match = issueBody.match(pattern);
      if (match) {
        return {
          from: match[1]?.replace(/[`'"]/g, "") || "",
          to: match[2]?.replace(/[`'"]/g, "") || "",
        };
      }
    }

    return null;
  }

  private async findAllFilesInDirectory(
    workspace: string,
    directory: string,
  ): Promise<string[]> {
    const files: string[] = [];
    const fullPath = path.join(workspace, directory);

    const scan = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullEntryPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!this.shouldIgnoreDir(entry.name)) {
            await scan(fullEntryPath);
          }
        } else {
          files.push(fullEntryPath);
        }
      }
    };

    await scan(fullPath);
    return files;
  }

  private shouldIgnoreDir(name: string): boolean {
    return ["node_modules", ".git", "dist", "build", ".next"].includes(
      name,
    );
  }

  private async updateImportPaths(
    workspace: string,
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    const allFiles = await this.findAllCodeFiles(workspace);

    for (const file of allFiles) {
      try {
        let content = await fs.readFile(file, "utf-8");
        let modified = false;

        const importPatterns = [
          new RegExp(`from\\s+['"](\\.\\./)*${oldPath}/`, "g"),
          new RegExp(`require\\(['"](\\.\\./)*${oldPath}/`, "g"),
          new RegExp(`import\\(['"](\\.\\./)*${oldPath}/`, "g"),
        ];

        for (const pattern of importPatterns) {
          const newContent = content.replace(pattern, (match) =>
            match.replace(oldPath, newPath),
          );
          if (newContent !== content) {
            content = newContent;
            modified = true;
          }
        }

        if (modified) {
          await fs.writeFile(file, content, "utf-8");
        }
      } catch (error) {
        console.warn(`Failed to update imports in ${file}:`, error);
      }
    }
  }

  private async findAllCodeFiles(workspace: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = [".ts", ".tsx", ".js", ".jsx", ".json"];

    const scan = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!this.shouldIgnoreDir(entry.name)) {
            await scan(fullPath);
          }
        } else if (extensions.includes(path.extname(entry.name))) {
          files.push(fullPath);
        }
      }
    };

    await scan(workspace);
    return files;
  }

  private async updateConfigFiles(
    workspace: string,
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    const configFiles = [
      "tsconfig.json",
      "package.json",
      "jest.config.js",
      "vite.config.ts",
    ];

    for (const configFile of configFiles) {
      const filePath = path.join(workspace, configFile);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const updated = content.replace(
          new RegExp(oldPath, "g"),
          newPath,
        );

        if (updated !== content) {
          await fs.writeFile(filePath, updated, "utf-8");
        }
      } catch {
        continue;
      }
    }
  }
}

