import { promises as fs } from "fs";
import path from "path";
import { CodeContext } from "./llm.js";

export interface FileInfo {
  path: string;
  size: number;
  language: string;
  isTest: boolean;
  isConfig: boolean;
  importance: number;
}

export class CodeAnalysisService {
  private readonly maxFileSize = 50000;
  private readonly maxFiles = 20;
  private readonly supportedExtensions = new Set([
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".py",
    ".java",
    ".cpp",
    ".c",
    ".cs",
    ".rb",
    ".go",
    ".php",
    ".rs",
    ".kt",
    ".swift",
  ]);

  async analyzeRepository(workspacePath: string): Promise<CodeContext> {
    const structure = await this.generateDirectoryStructure(workspacePath);
    const dependencies = await this.extractDependencies(workspacePath);
    const testFramework = await this.detectTestFramework(workspacePath);
    const buildTool = await this.detectBuildTool(workspacePath);
    const files = await this.getRelevantFiles(workspacePath);

    return {
      structure,
      dependencies,
      testFramework,
      buildTool,
      files,
    };
  }

  async findRelevantFiles(
    workspacePath: string,
    issueDescription: string,
  ): Promise<string[]> {
    const allFiles = await this.scanFiles(workspacePath);
    const scoredFiles = await this.scoreFileRelevance(
      allFiles,
      issueDescription,
    );

    return scoredFiles
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxFiles)
      .map((f) => f.path);
  }

  private async generateDirectoryStructure(rootPath: string): Promise<string> {
    const structure: string[] = [];

    const generateTree = async (
      dir: string,
      prefix = "",
      isLast = true,
    ): Promise<void> => {
      const baseName = path.basename(dir);
      const connector = isLast ? "└── " : "├── ";
      structure.push(`${prefix}${connector}${baseName}`);

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const dirs = entries.filter(
          (e) => e.isDirectory() && !this.shouldIgnoreDir(e.name),
        );

        for (let i = 0; i < dirs.length; i++) {
          const isLastDir = i === dirs.length - 1;
          const newPrefix = prefix + (isLast ? "    " : "│   ");
          await generateTree(
            path.join(dir, dirs[i].name),
            newPrefix,
            isLastDir,
          );
        }
      } catch (error) {
      }
    };

    await generateTree(rootPath);
    return structure.join("\n");
  }

  private async extractDependencies(workspacePath: string): Promise<string[]> {
    const dependencies: string[] = [];

    try {
      const packageJsonPath = path.join(workspacePath, "package.json");
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, "utf-8"),
      );

      if (packageJson.dependencies) {
        dependencies.push(...Object.keys(packageJson.dependencies));
      }
      if (packageJson.devDependencies) {
        dependencies.push(...Object.keys(packageJson.devDependencies));
      }
    } catch {
    }

    try {
      const requirementsPath = path.join(workspacePath, "requirements.txt");
      const requirements = await fs.readFile(requirementsPath, "utf-8");
      const pythonDeps = requirements
        .split("\n")
        .map((line) => line.split("==")[0].split(">=")[0].split("<=")[0].trim())
        .filter((dep) => dep && !dep.startsWith("#"));
      dependencies.push(...pythonDeps);
    } catch {
    }

    try {
      const cargoPath = path.join(workspacePath, "Cargo.toml");
      const cargoContent = await fs.readFile(cargoPath, "utf-8");
      const dependencySection = cargoContent.match(
        /\[dependencies\]([\s\S]*?)(\[|$)/,
      );
      if (dependencySection) {
        const rustDeps = dependencySection[1]
          .split("\n")
          .map((line) => line.split("=")[0].trim())
          .filter((dep) => dep && !dep.startsWith("#"));
        dependencies.push(...rustDeps);
      }
    } catch {
    }

    return [...new Set(dependencies)].slice(0, 50);
  }

  private async detectTestFramework(
    workspacePath: string,
  ): Promise<string | undefined> {
    const testFrameworks = [
      {
        name: "Jest",
        indicators: ["jest.config.js", "jest.config.ts", "jest.setup.js"],
      },
      { name: "Vitest", indicators: ["vitest.config.js", "vitest.config.ts"] },
      { name: "Mocha", indicators: ["mocha.opts", ".mocharc.json"] },
      { name: "PyTest", indicators: ["pytest.ini", "conftest.py"] },
      { name: "JUnit", indicators: ["pom.xml", "build.gradle"] },
      { name: "RSpec", indicators: [".rspec", "spec_helper.rb"] },
    ];

    for (const framework of testFrameworks) {
      for (const indicator of framework.indicators) {
        try {
          await fs.access(path.join(workspacePath, indicator));
          return framework.name;
        } catch {
          continue;
        }
      }
    }

    const testDirs = ["test", "tests", "__tests__", "spec"];
    for (const dir of testDirs) {
      try {
        const stat = await fs.stat(path.join(workspacePath, dir));
        if (stat.isDirectory()) {
          return "Generic Test Framework";
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  private async detectBuildTool(
    workspacePath: string,
  ): Promise<string | undefined> {
    const buildTools = [
      { name: "npm", file: "package.json" },
      { name: "Vite", file: "vite.config.js" },
      { name: "Webpack", file: "webpack.config.js" },
      { name: "Maven", file: "pom.xml" },
      { name: "Gradle", file: "build.gradle" },
      { name: "Cargo", file: "Cargo.toml" },
      { name: "Make", file: "Makefile" },
      { name: "CMake", file: "CMakeLists.txt" },
    ];

    for (const tool of buildTools) {
      try {
        await fs.access(path.join(workspacePath, tool.file));
        return tool.name;
      } catch {
        continue;
      }
    }

    return undefined;
  }

  private async getRelevantFiles(
    workspacePath: string,
  ): Promise<Array<{ path: string; content: string; language: string }>> {
    const files = await this.scanFiles(workspacePath);
    const sortedFiles = files
      .sort((a, b) => b.importance - a.importance)
      .slice(0, this.maxFiles);

    const result = [];
    for (const file of sortedFiles) {
      try {
        const content = await fs.readFile(file.path, "utf-8");
        result.push({
          path: path.relative(workspacePath, file.path),
          content: content.slice(0, this.maxFileSize),
          language: this.getLanguageFromExtension(path.extname(file.path)),
        });
      } catch {
      }
    }

    return result;
  }

  private async scanFiles(rootPath: string): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    const scanDirectory = async (dir: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (!this.shouldIgnoreDir(entry.name)) {
              await scanDirectory(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (this.supportedExtensions.has(ext)) {
              try {
                const stat = await fs.stat(fullPath);
                if (stat.size < this.maxFileSize) {
                  files.push({
                    path: fullPath,
                    size: stat.size,
                    language: this.getLanguageFromExtension(ext),
                    isTest: this.isTestFile(fullPath),
                    isConfig: this.isConfigFile(fullPath),
                    importance: this.calculateImportance(fullPath, stat.size),
                  });
                }
              } catch {
              }
            }
          }
        }
      } catch {
      }
    };

    await scanDirectory(rootPath);
    return files;
  }

  private async scoreFileRelevance(
    files: FileInfo[],
    issueDescription: string,
  ): Promise<Array<{ path: string; score: number }>> {
    const keywords = this.extractKeywords(issueDescription);

    return files.map((file) => {
      let score = file.importance;

      for (const keyword of keywords) {
        if (file.path.toLowerCase().includes(keyword.toLowerCase())) {
          score += 10;
        }
      }

      if (issueDescription.toLowerCase().includes("test") && file.isTest) {
        score += 5;
      }

      if (issueDescription.toLowerCase().includes("config") && file.isConfig) {
        score += 5;
      }

      return { path: file.path, score };
    });
  }

  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    return words
      .filter(
        (word) =>
          word.length > 3 &&
          ![
            "the",
            "and",
            "for",
            "are",
            "but",
            "not",
            "you",
            "all",
            "can",
            "had",
            "her",
            "was",
            "one",
            "our",
            "out",
            "day",
            "get",
            "has",
            "him",
            "his",
            "how",
            "man",
            "new",
            "now",
            "old",
            "see",
            "two",
            "way",
            "who",
            "boy",
            "did",
            "its",
            "let",
            "put",
            "say",
            "she",
            "too",
            "use",
          ].includes(word),
      )
      .slice(0, 20);
  }

  private shouldIgnoreDir(name: string): boolean {
    const ignoredDirs = [
      "node_modules",
      ".git",
      ".svn",
      ".hg",
      ".bzr",
      "dist",
      "build",
      "target",
      "bin",
      "obj",
      ".next",
      ".nuxt",
      ".vscode",
      ".idea",
      "__pycache__",
      ".pytest_cache",
      "venv",
      "env",
      "coverage",
      ".nyc_output",
    ];
    return ignoredDirs.includes(name) || name.startsWith(".");
  }

  private isTestFile(filePath: string): boolean {
    const fileName = path.basename(filePath).toLowerCase();
    const dirName = path.dirname(filePath).toLowerCase();

    return (
      fileName.includes("test") ||
      fileName.includes("spec") ||
      dirName.includes("test") ||
      dirName.includes("spec") ||
      dirName.includes("__tests__")
    );
  }

  private isConfigFile(filePath: string): boolean {
    const fileName = path.basename(filePath).toLowerCase();
    const configFiles = [
      "config",
      "configuration",
      "settings",
      "options",
      "webpack",
      "babel",
      "eslint",
      "prettier",
      "jest",
      "tsconfig",
      "package.json",
      "composer.json",
      "requirements.txt",
      "cargo.toml",
      "pom.xml",
    ];

    return configFiles.some((config) => fileName.includes(config));
  }

  private calculateImportance(filePath: string, size: number): number {
    let importance = 1;

    if (size > 1000 && size < 10000) importance += 2;
    else if (size > 500) importance += 1;

    const fileName = path.basename(filePath).toLowerCase();
    if (
      ["index", "main", "app", "server"].some((name) =>
        fileName.startsWith(name),
      )
    ) {
      importance += 5;
    }

    if (!this.isTestFile(filePath)) {
      importance += 2;
    }

    if (this.isConfigFile(filePath)) {
      importance += 1;
    }

    return importance;
  }

  private getLanguageFromExtension(ext: string): string {
    const langMap: Record<string, string> = {
      ".js": "javascript",
      ".ts": "typescript",
      ".jsx": "javascript",
      ".tsx": "typescript",
      ".py": "python",
      ".java": "java",
      ".cpp": "cpp",
      ".c": "c",
      ".cs": "csharp",
      ".rb": "ruby",
      ".go": "go",
      ".php": "php",
      ".rs": "rust",
      ".kt": "kotlin",
      ".swift": "swift",
    };

    return langMap[ext] || "text";
  }
}
