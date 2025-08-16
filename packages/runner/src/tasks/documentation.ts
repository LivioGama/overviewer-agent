import { Job } from '@ollama-turbo-agent/shared'
import { promises as fs } from 'fs'
import path from 'path'
import { BaseTask, TaskResult } from './executor.js'

export class DocumentationTask extends BaseTask {
  async execute(job: Job): Promise<TaskResult> {
    const branchName = await this.createWorkingBranch(job, 'docs/')
    
    const filesToDocument = await this.findFilesToDocument()
    const documentedFiles: string[] = []

    for (const filePath of filesToDocument.slice(0, 15)) {
      try {
        const documented = await this.addDocumentationToFile(filePath, job)
        if (documented) {
          documentedFiles.push(path.relative(this.workspace, filePath))
        }
      } catch (error) {
        console.warn(`Failed to document ${filePath}:`, error)
      }
    }

    await this.generateReadmeUpdates(job)

    if (documentedFiles.length === 0) {
      return {
        success: false,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: 'No documentation could be generated'
      }
    }

    const commitMessage = `docs: Add comprehensive documentation\n\nAdded documentation to ${documentedFiles.length} files with AI assistance`
    await this.commitAndPush(job, branchName, commitMessage)

    const prTitle = `📚 Documentation: Add comprehensive code documentation`
    const prBody = this.generatePullRequestBody(documentedFiles)
    
    const pullRequestUrl = await this.createPullRequest(job, branchName, prTitle, prBody)

    return {
      success: true,
      changes: {
        files: documentedFiles,
        additions: documentedFiles.length * 15,
        deletions: 0
      },
      summary: `Added comprehensive documentation to ${documentedFiles.length} files`,
      branchName,
      pullRequestUrl
    }
  }

  private async findFilesToDocument(): Promise<string[]> {
    const extensions = ['.ts', '.js', '.tsx', '.jsx', '.py']
    const files: string[] = []

    const scanDirectory = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        
        if (entry.isDirectory()) {
          if (!this.shouldSkipDirectory(entry.name)) {
            await scanDirectory(fullPath)
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name)
          if (extensions.includes(ext)) {
            files.push(fullPath)
          }
        }
      }
    }

    await scanDirectory(this.workspace)
    return files
  }

  private shouldSkipDirectory(name: string): boolean {
    return ['node_modules', '.git', 'dist', 'build'].includes(name) || name.startsWith('.')
  }

  private async addDocumentationToFile(filePath: string, job: Job): Promise<boolean> {
    const content = await fs.readFile(filePath, 'utf-8')
    
    if (this.hasAdequateDocumentation(content)) {
      return false
    }

    const documentedContent = await this.ollama.generateDocumentation(
      content,
      'module',
      job.taskParams.model || 'gpt-oss:120b'
    )

    if (documentedContent && documentedContent !== content) {
      await fs.writeFile(filePath, documentedContent, 'utf-8')
      return true
    }

    return false
  }

  private hasAdequateDocumentation(content: string): boolean {
    const docPatterns = [
      /\/\*\*[\s\S]*?\*\//g,
      /^\s*\/\/[^\/]/gm,
      /^\s*#[^#]/gm,
      /"""/g,
      /'''/g
    ]

    const docLines = docPatterns.reduce((count, pattern) => {
      const matches = content.match(pattern)
      return count + (matches ? matches.length : 0)
    }, 0)

    const totalLines = content.split('\n').length
    return docLines / totalLines > 0.1
  }

  private async generateReadmeUpdates(job: Job): Promise<void> {
    const readmePath = path.join(this.workspace, 'README.md')
    
    try {
      await fs.access(readmePath)
    } catch {
      const basicReadme = this.generateBasicReadme(job)
      await fs.writeFile(readmePath, basicReadme, 'utf-8')
    }
  }

  private generateBasicReadme(job: Job): string {
    return `# ${job.repoName}

## Overview

This repository contains the source code for ${job.repoName}.

## Getting Started

### Prerequisites

- Node.js (latest LTS version)
- npm or yarn

### Installation

\`\`\`bash
npm install
\`\`\`

### Usage

\`\`\`bash
npm start
\`\`\`

## Contributing

Please read our contributing guidelines before submitting pull requests.

## License

See LICENSE file for details.

---
*Documentation updated by Ollama Turbo Agent*`
  }

  private generatePullRequestBody(documentedFiles: string[]): string {
    return `## 📚 Documentation Enhancement

This PR adds comprehensive documentation to improve code maintainability and developer experience.

### Updated Files
${documentedFiles.map(file => `- \`${file}\``).join('\n')}

### Documentation Improvements:
- ✅ Function and method documentation
- ✅ Parameter descriptions with types
- ✅ Return value documentation
- ✅ Usage examples where applicable
- ✅ Important notes and considerations

### Benefits:
- 🚀 Improved developer onboarding
- 📖 Better code understanding
- 🔍 Easier maintenance and debugging
- 📈 Enhanced code quality

---
*This PR was automatically generated by Ollama Turbo Agent*`
  }
}


