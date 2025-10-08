import axios from "axios";

export interface IssueAnalysis {
  taskType:
    | "bug_fix"
    | "code_quality"
    | "documentation"
    | "security_audit"
    | "test_generation"
    | "refactor"
    | "structure_refactor";
  confidence: number;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  estimatedComplexity: "simple" | "moderate" | "complex";
  affectedFiles: string[];
  suggestions: string[];
}

export interface CodeContext {
  files: Array<{
    path: string;
    content: string;
    language: string;
  }>;
  structure: string;
  dependencies: string[];
  testFramework?: string;
  buildTool?: string;
}

export interface CodeChanges {
  files: Array<{
    path: string;
    content: string;
    action: "create" | "modify" | "delete" | "move";
    oldPath?: string;
  }>;
  summary: string;
  reasoning: string;
  testFiles?: Array<{
    path: string;
    content: string;
  }>;
}

export interface ReviewResult {
  approved: boolean;
  concerns: string[];
  suggestions: string[];
  riskLevel: "low" | "medium" | "high";
}

export class LLMService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || "";
    this.baseUrl = "https://api.openai.com/v1";
    this.model = "gpt-4o";
  }

  async analyzeIssue(
    issueTitle: string,
    issueBody: string,
    repoContext?: string,
  ): Promise<IssueAnalysis> {
    const prompt = `Analyze this GitHub issue and determine the best task type and approach:

Title: ${issueTitle}

Body: ${issueBody}

Repository Context: ${repoContext || "Not provided"}

Analyze this issue and provide:
1. The most appropriate task type (bug_fix, code_quality, documentation, security_audit, test_generation, refactor, structure_refactor)
2. Confidence level (0-100)
3. Priority level
4. Estimated complexity
5. Likely affected files or file patterns
6. Specific suggestions for resolution

Task type guidelines:
- structure_refactor: Use when the issue involves moving/renaming entire directories, restructuring monorepo layout (e.g., packages/ to apps/), or reorganizing the project structure
- refactor: Use for code refactoring within existing structure (renaming functions, classes, improving code organization)
- bug_fix: Use for fixing bugs, errors, or incorrect behavior

Respond in JSON format matching the IssueAnalysis interface.`;

    const response = await this.callLLM(prompt);
    return this.parseResponse<IssueAnalysis>(response);
  }

  async generateCodeFix(
    issue: { title: string; body: string },
    codeContext: CodeContext,
    analysis: IssueAnalysis,
  ): Promise<CodeChanges> {
    const isStructuralChange =
      issue.title.toLowerCase().includes("archi") ||
      issue.title.toLowerCase().includes("structure") ||
      issue.title.toLowerCase().includes("organize") ||
      issue.title.toLowerCase().includes("move") ||
      analysis.taskType === "refactor" ||
      analysis.taskType === "structure_refactor";

    const prompt = isStructuralChange
      ? this.buildStructuralChangePrompt(issue, codeContext, analysis)
      : this.buildStandardFixPrompt(issue, codeContext, analysis);

    const response = await this.callLLM(prompt);
    return this.parseResponse<CodeChanges>(response);
  }

  private buildStructuralChangePrompt(
    issue: { title: string; body: string },
    codeContext: CodeContext,
    analysis: IssueAnalysis,
  ): string {
    return `You are an expert software architect tasked with RESTRUCTURING a repository.

Issue: ${issue.title}
Description: ${issue.body}
Analysis: ${JSON.stringify(analysis, null, 2)}

Current Repository Structure:
${codeContext.structure}

Dependencies: ${codeContext.dependencies.join(", ")}

🚨 CRITICAL INSTRUCTIONS FOR STRUCTURAL CHANGES:

This is a STRUCTURAL/ARCHITECTURAL task. You must:

1. ANALYZE THE ENTIRE DIRECTORY STRUCTURE ABOVE
2. IDENTIFY architectural antipatterns:
   - Applications (backend, web, runner, api, etc.) should be in "apps/" ✓ CORRECT
   - Shared libraries/packages in wrong locations
   - Poor monorepo organization

3. FOR MOVING ENTIRE DIRECTORIES, you MUST list EVERY SINGLE FILE in that directory:

   EXAMPLE - If moving packages/backend/ to apps/backend/:
   {
     "files": [
       { "action": "move", "oldPath": "packages/backend/src/index.ts", "path": "apps/backend/src/index.ts", "content": "..." },
       { "action": "move", "oldPath": "packages/backend/src/routes/auth.ts", "path": "apps/backend/src/routes/auth.ts", "content": "..." },
       { "action": "move", "oldPath": "packages/backend/package.json", "path": "apps/backend/package.json", "content": "..." },
       { "action": "move", "oldPath": "packages/backend/tsconfig.json", "path": "apps/backend/tsconfig.json", "content": "..." },
       ... LIST EVERY FILE IN THE DIRECTORY ...
     ]
   }

4. ALSO UPDATE configuration files:
   - Root package.json: Update workspaces ["packages/*"] → ["apps/*", "packages/*"]
   - Update import paths in files that reference moved directories
   - Update tsconfig.json, docker-compose.yml, any CI/CD configs

5. MONOREPO BEST PRACTICES:
   - apps/ = deployable applications (backend, frontend, api, web, mobile)
   - packages/ = shared libraries/packages (shared, common, utils, ui-components)

🎯 YOUR TASK:
Based on the repository structure above, identify what needs to be moved and generate the complete file list with ALL files that need to move.

Respond in JSON format:
{
  "files": [
    {
      "path": "new/path/to/file.ts",
      "content": "full file content here...",
      "action": "move",
      "oldPath": "old/path/to/file.ts"
    }
  ],
  "summary": "Brief summary of the restructuring",
  "reasoning": "Explanation of why this restructuring is needed"
}`;
  }

  private buildStandardFixPrompt(
    issue: { title: string; body: string },
    codeContext: CodeContext,
    analysis: IssueAnalysis,
  ): string {
    return `Fix the following issue:

Title: ${issue.title}
Body: ${issue.body}
Task Type: ${analysis.taskType}

Code Context:
${codeContext.files.map((f) => `File: ${f.path}\n${f.content}`).join("\n\n")}

Repository Structure: ${codeContext.structure}
Dependencies: ${codeContext.dependencies.join(", ")}

Provide a fix in JSON format with the changed files.`;
  }

  private async callLLM(prompt: string): Promise<string> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error("LLM API call failed:", error);
      throw new Error("Failed to call LLM API");
    }
  }

  private parseResponse<T>(response: string): T {
    try {
      // Extract JSON from the response (LLMs sometimes add extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error("Failed to parse LLM response:", response);
      throw new Error(`Invalid JSON response from LLM: ${error}`);
    }
  }

  async reviewCode(
    codeChanges: CodeChanges,
    originalCode: CodeContext,
  ): Promise<ReviewResult> {
    const prompt = `Review the following code changes for quality, correctness, and best practices:

Original Code Context:
${originalCode.structure}

Proposed Changes:
${JSON.stringify(codeChanges, null, 2)}

Provide a review in JSON format with approval status and any concerns.`;

    const response = await this.callLLM(prompt);
    return this.parseResponse<ReviewResult>(response);
  }
}
