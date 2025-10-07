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
    let branchName: string | undefined;

    try {
      const issueBody = job.taskParams.issueBody || "";
      const issueTitle = job.taskParams.issueTitle || "";
      const moveOperation = this.parseDirectoryMove(
        `${issueTitle} ${issueBody}`,
      );

      if (!moveOperation) {
        throw new Error(
          "Could not parse directory move operation. Expected format: 'move packages to apps' or 'rename X to Y'",
        );
      }

      const sourcePath = path.join(workspace, moveOperation.from);
      const destPath = path.join(workspace, moveOperation.to);

      try {
        await fs.access(sourcePath);
      } catch {
        throw new Error(
          `Source directory '${moveOperation.from}' does not exist`,
        );
      }

      try {
        await fs.access(destPath);
        throw new Error(
          `Destination directory '${moveOperation.to}' already exists`,
        );
      } catch (error: any) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }

      branchName = await this.createWorkingBranch(
        job,
        "refactor/structure",
      );

      console.log(
        `Moving ${moveOperation.from} → ${moveOperation.to}`,
      );

      const files = await this.findAllFilesInDirectory(
        workspace,
        moveOperation.from,
      );

      if (files.length === 0) {
        throw new Error(
          `No files found in source directory '${moveOperation.from}'`,
        );
      }

      console.log(`Found ${files.length} files to move`);

      for (const file of files) {
        const relativePath = path.relative(sourcePath, file);
        const newPath = path.join(moveOperation.to, relativePath);
        const newFullPath = path.join(workspace, newPath);

        try {
          await fs.mkdir(path.dirname(newFullPath), {
            recursive: true,
          });
        } catch (mkdirError: any) {
          if (mkdirError.code !== "EEXIST") {
            throw mkdirError;
          }
        }

        try {
          await git.mv(
            path.join(moveOperation.from, relativePath),
            newPath,
          );
          changedFiles.push(newPath);
        } catch (mvError) {
          console.error(`Failed to move ${relativePath}:`, mvError);
          throw new Error(
            `Failed to move file: ${relativePath}. Git error: ${mvError}`,
          );
        }
      }

      console.log("Updating import paths...");
      await this.updateImportPaths(
        workspace,
        moveOperation.from,
        moveOperation.to,
      );

      console.log("Updating configuration files...");
      await this.updateConfigFiles(
        workspace,
        moveOperation.from,
        moveOperation.to,
      );

      const commitMessage = `Refactor: Move ${moveOperation.from} to ${moveOperation.to}\n\nMoved ${files.length} files and updated all imports`;

      await this.commitAndPush(job, branchName, commitMessage, octokit);

      const prUrl = await this.createPullRequest(
        job,
        branchName,
        `Refactor: Move ${moveOperation.from} to ${moveOperation.to}`,
        `This PR moves the \`${moveOperation.from}\` directory to \`${moveOperation.to}\` and updates all imports accordingly.\n\n**Changes:**\n- Moved ${files.length} files\n- Updated import paths across the codebase\n- Updated configuration files (tsconfig, package.json)`,
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
      console.error("Structure refactor failed:", error);
      
      if (branchName) {
        try {
          const git = simpleGit(workspace);
          await git.reset(["--hard", "HEAD"]);
          await git.checkout("main");
          await git.deleteLocalBranch(branchName, true);
          console.log("Rolled back changes");
        } catch (rollbackError) {
          console.error("Failed to rollback:", rollbackError);
        }
      }

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
    await this.updateTsConfig(workspace, oldPath, newPath);
    await this.updatePackageJson(workspace, oldPath, newPath);
    await this.updateOtherConfigs(workspace, oldPath, newPath);
  }

  private async updateTsConfig(
    workspace: string,
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    const tsconfigPath = path.join(workspace, "tsconfig.json");
    try {
      const content = await fs.readFile(tsconfigPath, "utf-8");
      const config = JSON.parse(content);

      if (config.compilerOptions?.paths) {
        const paths = config.compilerOptions.paths;
        const updatedPaths: Record<string, string[]> = {};

        for (const [key, value] of Object.entries(paths)) {
          const newKey = key.replace(oldPath, newPath);
          const newValue = (value as string[]).map((v) =>
            v.replace(oldPath, newPath),
          );
          updatedPaths[newKey] = newValue;
        }

        config.compilerOptions.paths = updatedPaths;
      }

      if (config.include) {
        config.include = config.include.map((inc: string) =>
          inc.replace(oldPath, newPath),
        );
      }

      if (config.exclude) {
        config.exclude = config.exclude.map((exc: string) =>
          exc.replace(oldPath, newPath),
        );
      }

      await fs.writeFile(
        tsconfigPath,
        JSON.stringify(config, null, 2) + "\n",
        "utf-8",
      );
      console.log("Updated tsconfig.json");
    } catch (error) {
      console.warn("Could not update tsconfig.json:", error);
    }
  }

  private async updatePackageJson(
    workspace: string,
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    const packageJsonPath = path.join(workspace, "package.json");
    try {
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);

      if (pkg.workspaces) {
        if (Array.isArray(pkg.workspaces)) {
          pkg.workspaces = pkg.workspaces.map((w: string) =>
            w.replace(oldPath, newPath),
          );
        } else if (pkg.workspaces.packages) {
          pkg.workspaces.packages = pkg.workspaces.packages.map(
            (w: string) => w.replace(oldPath, newPath),
          );
        }
      }

      await fs.writeFile(
        packageJsonPath,
        JSON.stringify(pkg, null, 2) + "\n",
        "utf-8",
      );
      console.log("Updated package.json");
    } catch (error) {
      console.warn("Could not update package.json:", error);
    }
  }

  private async updateOtherConfigs(
    workspace: string,
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    const configFiles = [
      "jest.config.js",
      "jest.config.ts",
      "vite.config.ts",
      "vite.config.js",
      "next.config.js",
      ".eslintrc.json",
    ];

    for (const configFile of configFiles) {
      const filePath = path.join(workspace, configFile);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const updated = content.replace(
          new RegExp(oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
          newPath,
        );

        if (updated !== content) {
          await fs.writeFile(filePath, updated, "utf-8");
          console.log(`Updated ${configFile}`);
        }
      } catch {
        continue;
      }
    }
  }
}

