import axios, { type AxiosInstance } from 'axios'

export interface OllamaResponse {
  model: string
  response: string
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

export interface OllamaRequest {
  model: string
  prompt: string
  system?: string
  context?: number[]
  options?: {
    temperature?: number
    top_p?: number
    top_k?: number
    num_predict?: number
    stop?: string[]
  }
}

export class OllamaService {
  private client: AxiosInstance
  private baseUrl: string

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.OLLAMA_API_URL || 'https://ollama.com'
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    
    if (process.env.OLLAMA_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.OLLAMA_API_KEY}`
    }
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 120000,
      headers
    })
  }

  async generate(request: OllamaRequest): Promise<string> {
    try {
      const response = await this.client.post('/api/generate', {
        ...request,
        stream: false
      })

      if (response.data?.response) {
        return response.data.response
      }

      throw new Error('Invalid response from Ollama')
    } catch (error) {
      console.error('Ollama API error:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Ollama generation failed: ${message}`)
    }
  }

  async generateCodeRefactoring(
    code: string,
    instructions: string,
    model = 'gpt-oss:120b'
  ): Promise<string> {
    const prompt = `
You are an expert software engineer. I need you to refactor the following code based on these instructions: ${instructions}

Code to refactor:
\`\`\`
${code}
\`\`\`

Please provide the refactored code with improvements for:
- Code quality and readability
- Performance optimizations
- Best practices
- Security considerations
- Maintainability

Return only the refactored code without explanations.
`

    return this.generate({
      model,
      prompt,
      system: 'You are a helpful code refactoring assistant. Always respond with clean, well-structured code.'
    })
  }

  async generateTests(
    code: string,
    testFramework = 'jest',
    model = 'gpt-oss:120b'
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

Return only the test code without explanations.
`

    return this.generate({
      model,
      prompt,
      system: `You are a test generation expert. Create thorough ${testFramework} tests.`
    })
  }

  async generateDocumentation(
    code: string,
    codeType: 'function' | 'class' | 'module' = 'function',
    model = 'gpt-oss:120b'
  ): Promise<string> {
    const prompt = `
Generate comprehensive documentation for the following ${codeType}:

\`\`\`
${code}
\`\`\`

Include:
- Clear description of purpose and functionality
- Parameter descriptions with types
- Return value description
- Usage examples
- Any important notes or considerations

Use appropriate documentation format (JSDoc for JavaScript/TypeScript).
`

    return this.generate({
      model,
      prompt,
      system: 'You are a documentation expert. Create clear, comprehensive documentation.'
    })
  }

  async analyzeSecurity(
    code: string,
    model = 'gpt-oss:120b'
  ): Promise<string> {
    const prompt = `
Analyze the following code for security vulnerabilities and provide recommendations:

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

Provide a structured security analysis with:
1. Identified vulnerabilities
2. Risk level (High/Medium/Low)
3. Specific recommendations for fixes
4. Improved code examples where applicable
`

    return this.generate({
      model,
      prompt,
      system: 'You are a security expert. Provide thorough security analysis and actionable recommendations.'
    })
  }

  async fixBugs(
    code: string,
    errorDescription: string,
    model = 'gpt-oss:120b'
  ): Promise<string> {
    const prompt = `
Fix the following bug in this code:

Error description: ${errorDescription}

Code with bug:
\`\`\`
${code}
\`\`\`

Please:
1. Identify the root cause of the bug
2. Provide the corrected code
3. Ensure the fix doesn't introduce new issues
4. Add appropriate error handling if needed

Return only the fixed code without explanations.
`

    return this.generate({
      model,
      prompt,
      system: 'You are a debugging expert. Fix bugs while maintaining code quality and functionality.'
    })
  }

  async improveCodeQuality(
    code: string,
    model = 'gpt-oss:120b'
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

Return only the improved code without explanations.
`

    return this.generate({
      model,
      prompt,
      system: 'You are a code quality expert. Improve code while maintaining functionality.'
    })
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.get('/api/tags')

      if (response.data?.models) {
        return response.data.models.map((model: { name: string }) => model.name)
      }

      return []
    } catch (error) {
      console.error('Failed to list Ollama models:', error)
      return []
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get('/api/version')
      return true
    } catch (error) {
      return false
    }
  }
}
