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
  private fastModel: string;
  private provider: "openrouter" | "grok" | "openai";

  constructor() {
    this.provider = (process.env.LLM_PROVIDER as "openrouter" | "grok" | "openai") || "openrouter";

    if (this.provider === "openrouter") {
      this.apiKey = process.env.OPENROUTER_API_KEY || "";
      this.baseUrl = "https://openrouter.ai/api/v1";
      this.model = process.env.OPENROUTER_MODEL || "x-ai/grok-code-fast-1";
      this.fastModel = process.env.OPENROUTER_MODEL || "x-ai/grok-code-fast-1";
    } else if (this.provider === "grok") {
      this.apiKey = process.env.XAI_API_KEY || "";
      this.baseUrl = "https://api.x.ai/v1";
      this.model = "grok-beta";
      this.fastModel = "grok-beta";
    } else {
      this.apiKey = process.env.OPENAI_API_KEY || "";
      this.baseUrl = "https://api.openai.com/v1";
      this.model = "gpt-4o";
      this.fastModel = "gpt-4o-mini";
    }

    console.log(`Using LLM provider: ${this.provider} (${this.model})`);
  }

  async analyzeIssue(
    issueTitle: string,
    issueBody: string,
    repoContext?: string,
  ): Promise<IssueAnalysis> {
    const prompt = `Analyze this GitHub issue and determine the best task type and approach:

Title: ${issueTitle}

Body: ${issueBody.slice(0, 1000)}

Repository Context: ${repoContext?.slice(0, 500) || "Not provided"}

Analyze this issue and provide:
1. The most appropriate task type (bug_fix, code_quality, documentation, security_audit, test_generation, refactor)
2. Confidence level (0-100)
3. Priority level
4. Estimated complexity
5. Likely affected files or file patterns
6. Specific suggestions for resolution

Respond in JSON format matching the IssueAnalysis interface.`;

    const response = await this.callLLM(prompt, {
      model: this.fastModel,
      maxTokens: 800,
    });
    return this.parseResponse<IssueAnalysis>(response);
  }

  async generateCodeFix(
    issue: { title: string; body: string },
    codeContext: CodeContext,
    analysis: IssueAnalysis,
  ): Promise<CodeChanges> {
    const relevantFiles = codeContext.files.slice(0, 5);

    const prompt = `Generate a code fix for this issue:

Issue: ${issue.title}
Description: ${issue.body.slice(0, 1000)}

Task Type: ${analysis.taskType}
Complexity: ${analysis.estimatedComplexity}
Affected Areas: ${analysis.affectedFiles.join(", ")}

Repository Info:
- Dependencies: ${codeContext.dependencies.slice(0, 10).join(", ")}
- Test Framework: ${codeContext.testFramework || "None"}
- Build Tool: ${codeContext.buildTool || "None"}

Relevant Files (${relevantFiles.length}):
${relevantFiles
  .map(
    (f) => `
=== ${f.path} ===
${f.content.slice(0, 800)}
`,
  )
  .join("\n")}

Generate the necessary code changes to fix this issue. Focus on:
1. Minimal, targeted changes
2. Following existing code patterns
3. Maintaining backwards compatibility
4. Adding appropriate error handling

Respond in JSON format matching the CodeChanges interface.`;

    const response = await this.callLLM(prompt, { maxTokens: 3000 });
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

Dependencies: ${context.dependencies.slice(0, 10).join(", ")}
Test Framework: ${context.testFramework || "None"}

Evaluate:
1. Code quality and adherence to best practices
2. Potential breaking changes or side effects
3. Security implications
4. Performance impact
5. Test coverage
6. Whether this should be a draft PR initially

Respond in JSON format matching the ReviewResult interface.`;

    const response = await this.callLLM(prompt, {
      model: this.fastModel,
      maxTokens: 600,
    });
    return this.parseResponse<ReviewResult>(response);
  }

  async generateCommitMessage(changes: CodeChanges): Promise<string> {
    const prompt = `Generate a conventional commit message for these changes:

Summary: ${changes.summary}
Files changed: ${changes.files.map((f) => f.path).join(", ")}

Follow conventional commit format: type(scope): description`;

    const response = await this.callLLM(prompt, {
      model: this.fastModel,
      maxTokens: 100,
    });
    return response.trim();
  }

  async generatePRDescription(
    issue: { title: string; body: string; number: number },
    changes: CodeChanges,
    analysis: IssueAnalysis,
  ): Promise<string> {
    const prompt = `Generate a comprehensive PR description for this fix:

Issue: #${issue.number} - ${issue.title}
Issue Description: ${issue.body.slice(0, 500)}

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

    const response = await this.callLLM(prompt, {
      model: this.fastModel,
      maxTokens: 800,
    });
    return response;
  }

  private async callLLM(
    prompt: string,
    options?: { model?: string; maxTokens?: number },
  ): Promise<string> {
    try {
      if (this.provider === "openrouter") {
        return await this.callOpenRouter(prompt, options);
      } else if (this.provider === "grok") {
        return await this.callGrok(prompt, options);
      } else {
        return await this.callOpenAI(prompt, options);
      }
    } catch (error) {
      console.error(`${this.provider} API call failed:`, error);
      throw new Error(
        `Failed to get AI response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async callOpenRouter(
    prompt: string,
    options?: { model?: string; maxTokens?: number },
  ): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: options?.model || this.model,
        messages: [
          {
            role: "system",
            content: "You are an expert AI code assistant specialized in analyzing codebases, generating fixes, and providing detailed technical solutions. Always respond with accurate, efficient code following best practices.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: options?.maxTokens || 4000,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/overviewer-agent",
          "X-Title": "Overviewer Agent",
        },
        timeout: 120000,
      },
    );

    return response.data.choices[0].message.content;
  }

  private async callGrok(
    prompt: string,
    options?: { model?: string; maxTokens?: number },
  ): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: options?.model || this.model,
        messages: [
          {
            role: "system",
            content: "You are Grok, a highly capable AI assistant specialized in code analysis and generation. Always respond with accurate, efficient code following best practices.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: options?.maxTokens || 2000,
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      },
    );

    return response.data.choices[0].message.content;
  }

  private async callOpenAI(
    prompt: string,
    options: {
      model?: string;
      maxTokens?: number;
      stream?: boolean;
    } = {},
  ): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: options.model || this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: options.maxTokens || 2000,
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      },
    );

    return response.data.choices[0].message.content;
  }

  private parseResponse<T>(response: string): T {
    try {
      const jsonMatch =
        response.match(/```json\n([\s\S]*?)\n```/) ||
        response.match(/```\n([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;

      const parsed = JSON.parse((jsonStr || response).trim());
      
      return this.ensureDefaults(parsed);
    } catch (error) {
      console.error("Failed to parse LLM response:", response);
      throw new Error("Invalid JSON response from LLM");
    }
  }

  private ensureDefaults<T>(parsed: any): T {
    if (parsed.concerns && !Array.isArray(parsed.concerns)) {
      parsed.concerns = [];
    }
    if (parsed.suggestions && !Array.isArray(parsed.suggestions)) {
      parsed.suggestions = [];
    }
    if (parsed.affectedFiles && !Array.isArray(parsed.affectedFiles)) {
      parsed.affectedFiles = [];
    }
    if (parsed.files && !Array.isArray(parsed.files)) {
      parsed.files = [];
    }
    
    if (!parsed.concerns) parsed.concerns = [];
    if (!parsed.suggestions) parsed.suggestions = [];
    if (!parsed.affectedFiles) parsed.affectedFiles = [];
    
    return parsed as T;
  }
}
