import axios from "axios";

export interface IssueAnalysis {
  taskType:
    | "bug_fix"
    | "code_quality"
    | "documentation"
    | "security_audit"
    | "test_generation"
    | "refactor";
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
    action: "create" | "modify" | "delete";
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
  shouldCreateDraft: boolean;
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
1. The most appropriate task type (bug_fix, code_quality, documentation, security_audit, test_generation, refactor)
2. Confidence level (0-100)
3. Priority level
4. Estimated complexity
5. Likely affected files or file patterns
6. Specific suggestions for resolution

Respond in JSON format matching the IssueAnalysis interface.`;

    const response = await this.callLLM(prompt);
    return this.parseResponse<IssueAnalysis>(response);
  }

  async generateCodeFix(
    issue: { title: string; body: string },
    codeContext: CodeContext,
    analysis: IssueAnalysis,
  ): Promise<CodeChanges> {
    const prompt = `Generate a code fix for this issue:

Issue: ${issue.title}
Description: ${issue.body}
Analysis: ${JSON.stringify(analysis, null, 2)}

Code Context:
${this.formatCodeContext(codeContext)}

Generate the necessary code changes to fix this issue. Focus on:
1. Minimal, targeted changes
2. Following existing code patterns
3. Maintaining backwards compatibility
4. Adding appropriate error handling
5. Including tests if needed

Respond in JSON format matching the CodeChanges interface.`;

    const response = await this.callLLM(prompt);
    return this.parseResponse<CodeChanges>(response);
  }

  async reviewChanges(
    changes: CodeChanges,
    context: CodeContext,
  ): Promise<ReviewResult> {
    const prompt = `Review these code changes for quality and safety:

Changes Summary: ${changes.summary}
Reasoning: ${changes.reasoning}

Files Modified:
${changes.files.map((f) => `${f.path} (${f.action})`).join("\n")}

Code Context:
${this.formatCodeContext(context)}

Evaluate:
1. Code quality and adherence to best practices
2. Potential breaking changes or side effects
3. Security implications
4. Performance impact
5. Test coverage
6. Whether this should be a draft PR initially

Respond in JSON format matching the ReviewResult interface.`;

    const response = await this.callLLM(prompt);
    return this.parseResponse<ReviewResult>(response);
  }

  async generateCommitMessage(changes: CodeChanges): Promise<string> {
    const prompt = `Generate a conventional commit message for these changes:

Summary: ${changes.summary}
Files changed: ${changes.files.map((f) => f.path).join(", ")}

Follow conventional commit format: type(scope): description`;

    const response = await this.callLLM(prompt);
    return response.trim();
  }

  async generatePRDescription(
    issue: { title: string; body: string; number: number },
    changes: CodeChanges,
    analysis: IssueAnalysis,
  ): Promise<string> {
    const prompt = `Generate a comprehensive PR description for this fix:

Issue: #${issue.number} - ${issue.title}
Issue Description: ${issue.body}

Changes Made: ${changes.summary}
Files Modified: ${changes.files.length} files
Complexity: ${analysis.estimatedComplexity}

Generate a professional PR description that includes:
- Brief summary of the fix
- What was changed and why
- How it addresses the issue
- Any considerations for reviewers
- Testing information

Use GitHub markdown formatting.`;

    const response = await this.callLLM(prompt);
    return response;
  }

  private async callLLM(prompt: string): Promise<string> {
    try {
      return await this.callOpenAI(prompt);
    } catch (error) {
      console.error("LLM API call failed:", error);
      throw new Error(
        `Failed to get AI response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 4000,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data.choices[0].message.content;
  }

  private formatCodeContext(context: CodeContext): string {
    return `
Repository Structure:
${context.structure}

Dependencies: ${context.dependencies.join(", ")}
Test Framework: ${context.testFramework || "Not detected"}
Build Tool: ${context.buildTool || "Not detected"}

Relevant Files:
${context.files
  .map(
    (f) => `
=== ${f.path} (${f.language}) ===
${f.content.slice(0, 2000)}${f.content.length > 2000 ? "..." : ""}
`,
  )
  .join("\n")}
`;
  }

  private parseResponse<T>(response: string): T {
    try {
      const jsonMatch =
        response.match(/```json\n([\s\S]*?)\n```/) ||
        response.match(/```\n([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;

      return JSON.parse(jsonStr.trim());
    } catch (error) {
      console.error("Failed to parse LLM response:", response);
      throw new Error("Invalid JSON response from LLM");
    }
  }
}
