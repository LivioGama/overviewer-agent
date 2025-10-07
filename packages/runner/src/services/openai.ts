import axios, { type AxiosInstance } from "axios";

export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIRequest {
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: {
    type: "json_object";
  };
}

export class OpenAIService {
  private client: AxiosInstance;
  private model: string;

  constructor(apiKey?: string, model = "gpt-4o") {
    const key = apiKey || process.env.OPENAI_API_KEY;

    if (!key) {
      throw new Error("OPENAI_API_KEY is required");
    }

    this.model = model;
    this.client = axios.create({
      baseURL: "https://api.openai.com/v1",
      timeout: 120000,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    });
  }

  async generate(
    request: Omit<OpenAIRequest, "model"> & { model?: string },
  ): Promise<string> {
    try {
      const response = await this.client.post<OpenAIResponse>(
        "/chat/completions",
        {
          model: request.model || this.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.1,
          max_tokens: request.max_tokens ?? 4000,
          response_format: request.response_format,
        },
      );

      const content = response.data.choices[0]?.message?.content;

      if (!content) {
        throw new Error("Invalid response from OpenAI");
      }

      return content;
    } catch (error) {
      console.error("OpenAI API error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`OpenAI generation failed: ${message}`);
    }
  }

  private async generateStructured<T>(
    messages: OpenAIRequest["messages"],
  ): Promise<T> {
    try {
      const response = await this.client.post<OpenAIResponse>(
        "/chat/completions",
        {
          model: this.model,
          messages,
          temperature: 0.1,
          max_tokens: 4000,
          response_format: { type: "json_object" },
        },
      );

      const content = response.data.choices[0]?.message?.content;

      if (!content) {
        throw new Error("Invalid response from OpenAI");
      }

      try {
        return JSON.parse(content);
      } catch (parseError) {
        console.warn(
          "Failed to parse structured response, trying to extract JSON:",
          parseError,
        );
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        throw new Error("No valid JSON found in response");
      }
    } catch (error) {
      console.error("OpenAI structured API error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`OpenAI structured generation failed: ${message}`);
    }
  }

  private async generateCodeOnly(
    prompt: string,
    system: string,
  ): Promise<string> {
    const messages = [
      {
        role: "system" as const,
        content: `${system} You must respond with valid JSON in this exact format: {"code": "your_code_here"}`,
      },
      {
        role: "user" as const,
        content: `${prompt}\n\nIMPORTANT: Respond ONLY with a JSON object containing the code. No markdown, no explanations, no additional text.`,
      },
    ];

    const result = await this.generateStructured<{ code: string }>(messages);
    return result.code;
  }

  async generateCodeRefactoring(
    code: string,
    instructions: string,
  ): Promise<string> {
    const prompt = `
You are an expert software engineer. Refactor the following code based on these instructions: ${instructions}

Code to refactor:
\`\`\`
${code}
\`\`\`

Improve the code for:
- Code quality and readability
- Performance optimizations
- Best practices
- Security considerations
- Maintainability

Provide ONLY the refactored code without any explanations or markdown formatting.
`;

    return this.generateCodeOnly(
      prompt,
      "You are a helpful code refactoring assistant. Return only clean, well-structured code.",
    );
  }

  async generateTests(code: string, testFramework = "jest"): Promise<string> {
    const prompt = `
Generate comprehensive unit tests for the following code using ${testFramework}:

\`\`\`
${code}
\`\`\`

Include tests for:
- Happy path scenarios
- Edge cases
- Error conditions
- Input validation
- Mock dependencies where appropriate

Provide ONLY the test code without any explanations or markdown formatting.
`;

    return this.generateCodeOnly(
      prompt,
      `You are a test generation expert. Create thorough ${testFramework} tests.`,
    );
  }

  async generateDocumentation(
    code: string,
    codeType: "function" | "class" | "module" = "function",
  ): Promise<string> {
    const prompt = `
Add comprehensive JSDoc documentation to the following ${codeType}:

\`\`\`
${code}
\`\`\`

Add JSDoc comments including:
- Clear description of purpose and functionality
- @param descriptions with types for all parameters
- @returns description for return values
- @example usage examples where helpful
- Any important @throws or @deprecated notes

Return the original code with JSDoc comments added. Do NOT include markdown explanations.
`;

    return this.generateCodeOnly(
      prompt,
      "You are a documentation expert. Add proper JSDoc comments to code and return the documented code.",
    );
  }

  async analyzeSecurity(code: string): Promise<string> {
    const prompt = `
Analyze the following code for security vulnerabilities:

\`\`\`
${code}
\`\`\`

Look for:
- SQL injection vulnerabilities
- XSS vulnerabilities
- Authentication/authorization issues
- Input validation problems
- Sensitive data exposure
- Cryptographic issues
- Dependency vulnerabilities

Provide a structured analysis in JSON format with vulnerabilities array.
`;

    try {
      const messages = [
        {
          role: "system" as const,
          content:
            "You are a security expert. Provide thorough security analysis in JSON format.",
        },
        {
          role: "user" as const,
          content: `${prompt}\n\nIMPORTANT: Respond ONLY with a JSON object containing the analysis. No markdown, no explanations.`,
        },
      ];

      const result = await this.generateStructured<{ vulnerabilities: any[] }>(
        messages,
      );
      return JSON.stringify(result, null, 2);
    } catch (error) {
      console.warn(
        "Structured security analysis failed, falling back to regular generation:",
        error,
      );
      return this.generate({
        messages: [
          {
            role: "system",
            content:
              "You are a security expert. Provide thorough security analysis and actionable recommendations.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });
    }
  }

  async fixBugs(code: string, errorDescription: string): Promise<string> {
    const prompt = `
Fix the following bug in this code:

Error description: ${errorDescription}

Code with bug:
\`\`\`
${code}
\`\`\`

Requirements:
1. Identify and fix the root cause of the bug
2. Ensure the fix doesn't introduce new issues
3. Maintain the original code structure and style
4. Add error handling if needed

Provide ONLY the fixed code without explanations or markdown formatting.
`;

    return this.generateCodeOnly(
      prompt,
      "You are a debugging expert. Fix bugs while maintaining code quality and style.",
    );
  }
}
