import axios, { type AxiosInstance } from "axios";

export interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaRequest {
  model: string;
  prompt: string;
  system?: string;
  context?: number[];
  response_format?: {
    type: "json_object";
    schema?: object;
  };
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
}

export class OllamaService {
  private client: AxiosInstance;
  private baseUrl: string;

  private static readonly CODE_OUTPUT_SCHEMA = {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "The generated or modified code without any markdown formatting, explanations, or comments"
      }
    },
    required: ["code"],
    additionalProperties: false
  };

  private static readonly SECURITY_ANALYSIS_SCHEMA = {
    type: "object",
    properties: {
      vulnerabilities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            severity: { type: "string", enum: ["High", "Medium", "Low"] },
            description: { type: "string" },
            location: { type: "string" },
            recommendation: { type: "string" },
            fixedCode: { type: "string" }
          },
          required: ["type", "severity", "description", "recommendation"]
        }
      }
    },
    required: ["vulnerabilities"],
    additionalProperties: false
  };

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl || process.env.OLLAMA_API_URL || "https://ollama.com";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (process.env.OLLAMA_API_KEY) {
      headers["Authorization"] = `Bearer ${process.env.OLLAMA_API_KEY}`;
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 120000,
      headers,
    });
  }

  async generate(request: OllamaRequest): Promise<string> {
    try {
      const response = await this.client.post("/api/generate", {
        ...request,
        stream: false,
      });

      if (response.data?.response) {
        return response.data.response;
      }

      throw new Error("Invalid response from Ollama");
    } catch (error) {
      console.error("Ollama API error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Ollama generation failed: ${message}`);
    }
  }

  private async generateStructured<T>(request: OllamaRequest & { response_format: { type: "json_object"; schema: object } }): Promise<T> {
    try {
      const response = await this.client.post("/api/generate", {
        ...request,
        stream: false,
      });

      if (response.data?.response) {
        try {
          return JSON.parse(response.data.response);
        } catch (parseError) {
          console.warn("Failed to parse structured response, trying to extract JSON:", parseError);
          const jsonMatch = response.data.response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
          throw new Error("No valid JSON found in response");
        }
      }

      throw new Error("Invalid response from Ollama");
    } catch (error) {
      console.error("Ollama structured API error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Ollama structured generation failed: ${message}`);
    }
  }

  private async generateCodeOnly(prompt: string, system: string, model: string): Promise<string> {
    const request = {
      model,
      prompt: `${prompt}\n\nIMPORTANT: Respond ONLY with a JSON object containing the code. No markdown, no explanations, no additional text.`,
      system: `${system} You must respond with valid JSON in this exact format: {"code": "your_code_here"}`,
      response_format: {
        type: "json_object" as const,
        schema: OllamaService.CODE_OUTPUT_SCHEMA
      }
    };

    const result = await this.generateStructured<{ code: string }>(request);
    return result.code;
  }

  async generateCodeRefactoring(
    code: string,
    instructions: string,
    model = "gpt-oss:120b",
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
      model
    );
  }

  async generateTests(
    code: string,
    testFramework = "jest",
    model = "gpt-oss:120b",
  ): Promise<string> {
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
      model
    );
  }

  async generateDocumentation(
    code: string,
    codeType: "function" | "class" | "module" = "function",
    model = "gpt-oss:120b",
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
      model
    );
  }

  async analyzeSecurity(code: string, model = "gpt-oss:120b"): Promise<string> {
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
      const request = {
        model,
        prompt: `${prompt}\n\nIMPORTANT: Respond ONLY with a JSON object containing the analysis. No markdown, no explanations.`,
        system: "You are a security expert. Provide thorough security analysis in JSON format.",
        response_format: {
          type: "json_object" as const,
          schema: OllamaService.SECURITY_ANALYSIS_SCHEMA
        }
      };

      const result = await this.generateStructured<{ vulnerabilities: any[] }>(request);
      return JSON.stringify(result, null, 2);
    } catch (error) {
      console.warn("Structured security analysis failed, falling back to regular generation:", error);
      return this.generate({
        model,
        prompt,
        system: "You are a security expert. Provide thorough security analysis and actionable recommendations.",
      });
    }
  }

  async fixBugs(
    code: string,
    errorDescription: string,
    model = "gpt-oss:120b",
  ): Promise<string> {
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
3. Add appropriate error handling if needed
4. Maintain existing functionality

Provide ONLY the fixed code without any explanations or markdown formatting.
`;

    return this.generateCodeOnly(
      prompt,
      "You are a debugging expert. Fix bugs while maintaining code quality and functionality.",
      model
    );
  }

  async improveCodeQuality(
    code: string,
    model = "gpt-oss:120b",
  ): Promise<string> {
    const prompt = `
Improve the code quality of the following code:

\`\`\`
${code}
\`\`\`

Focus on:
- Code readability and clarity
- Performance optimizations
- Best practices and conventions
- Error handling
- Code structure and organization
- Type safety (if applicable)
- Removing code smells

Provide ONLY the improved code without any explanations or markdown formatting.
`;

    return this.generateCodeOnly(
      prompt,
      "You are a code quality expert. Improve code while maintaining functionality.",
      model
    );
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.get("/api/tags");

      if (response.data?.models) {
        return response.data.models.map(
          (model: { name: string }) => model.name,
        );
      }

      return [];
    } catch (error) {
      console.error("Failed to list Ollama models:", error);
      return [];
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get("/api/version");
      return true;
    } catch (error) {
      return false;
    }
  }
}
