import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import path from "path";

export interface CodeChunk {
  id: string;
  filePath: string;
  chunkType: "function" | "class" | "method" | "export" | "interface" | "file";
  name: string;
  content: string;
  startLine: number;
  endLine: number;
  metadata: {
    imports: string[];
    dependencies: string[];
    docstring?: string;
    complexity?: "low" | "medium" | "high";
    parentClass?: string;
    exports?: string[];
  };
  context: string;
}

export class CodeChunker {
  private readonly minChunkSize = 50;
  private readonly maxChunkSize = 1500;

  async chunkFile(filePath: string, content: string): Promise<CodeChunk[]> {
    const ext = path.extname(filePath);

    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
      return this.chunkTypeScript(filePath, content);
    } else if (ext === ".py") {
      return this.chunkPython(filePath, content);
    } else {
      return this.chunkGeneric(filePath, content);
    }
  }

  private async chunkTypeScript(
    filePath: string,
    content: string,
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = content.split("\n");
    const self = this;

    try {
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
        errorRecovery: true,
      });

      const imports: string[] = [];
      const exports: string[] = [];

      traverse(ast, {
        ImportDeclaration(path) {
          const source = path.node.source.value;
          imports.push(source);
        },

        FunctionDeclaration(path) {
          const node = path.node;
          if (!node.loc || !node.id) return;

          const name = node.id.name;
          const startLine = node.loc.start.line;
          const endLine = node.loc.end.line;
          const functionContent = lines.slice(startLine - 1, endLine).join("\n");

          if (functionContent.length < self.minChunkSize) return;

          const docstring = self.extractDocstring(lines, startLine);
          const context = self.buildContext(
            filePath,
            name,
            imports,
            "function",
          );

          chunks.push({
            id: `${filePath}:${name}:${startLine}`,
            filePath,
            chunkType: "function",
            name,
            content: functionContent.slice(0, self.maxChunkSize),
            startLine,
            endLine,
            metadata: {
              imports,
              dependencies: self.extractDependencies(functionContent),
              docstring,
              complexity: self.estimateComplexity(functionContent),
              exports: exports.includes(name) ? [name] : [],
            },
            context,
          });
        },

        ClassDeclaration(path) {
          const node = path.node;
          if (!node.loc || !node.id) return;

          const className = node.id.name;
          const startLine = node.loc.start.line;
          const endLine = node.loc.end.line;
          const classContent = lines.slice(startLine - 1, endLine).join("\n");

          if (classContent.length > self.maxChunkSize * 2) {
            path.traverse({
              ClassMethod(methodPath) {
                const method = methodPath.node;
                if (!method.loc || !method.key || method.key.type !== "Identifier")
                  return;

                const methodName = method.key.name;
                const methodStart = method.loc.start.line;
                const methodEnd = method.loc.end.line;
                const methodContent = lines
                  .slice(methodStart - 1, methodEnd)
                  .join("\n");

                if (methodContent.length < self.minChunkSize) return;

                const context = self.buildContext(
                  filePath,
                  `${className}.${methodName}`,
                  imports,
                  "method",
                  className,
                );

                chunks.push({
                  id: `${filePath}:${className}.${methodName}:${methodStart}`,
                  filePath,
                  chunkType: "method",
                  name: methodName,
                  content: methodContent.slice(0, self.maxChunkSize),
                  startLine: methodStart,
                  endLine: methodEnd,
                  metadata: {
                    imports,
                    dependencies: self.extractDependencies(methodContent),
                    docstring: self.extractDocstring(lines, methodStart),
                    complexity: self.estimateComplexity(methodContent),
                    parentClass: className,
                  },
                  context,
                });
              },
            });
          } else {
            const docstring = self.extractDocstring(lines, startLine);
            const context = self.buildContext(
              filePath,
              className,
              imports,
              "class",
            );

            chunks.push({
              id: `${filePath}:${className}:${startLine}`,
              filePath,
              chunkType: "class",
              name: className,
              content: classContent.slice(0, self.maxChunkSize * 2),
              startLine,
              endLine,
              metadata: {
                imports,
                dependencies: self.extractDependencies(classContent),
                docstring,
                complexity: self.estimateComplexity(classContent),
              },
              context,
            });
          }
        },

        ExportNamedDeclaration(path) {
          if (path.node.declaration?.type === "VariableDeclaration") {
            path.node.declaration.declarations.forEach((decl) => {
              if (decl.id.type === "Identifier") {
                exports.push(decl.id.name);
              }
            });
          } else if (
            path.node.declaration?.type === "FunctionDeclaration" &&
            path.node.declaration.id
          ) {
            exports.push(path.node.declaration.id.name);
          }
        },
      });
    } catch (error) {
      console.warn(`Failed to parse ${filePath}, falling back to generic chunking`);
      return this.chunkGeneric(filePath, content);
    }

    if (chunks.length === 0) {
      return this.chunkGeneric(filePath, content);
    }

    return chunks;
  }

  private chunkPython(filePath: string, content: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split("\n");

    const functionRegex = /^(?:async\s+)?def\s+(\w+)\s*\(/;
    const classRegex = /^class\s+(\w+)[\(:]?/;

    interface CurrentChunk {
      type: "function" | "class";
      name: string;
      start: number;
      indent: number;
    }

    let currentChunk: CurrentChunk | null = null;

    lines.forEach((line, idx) => {
      const trimmed = line.trimStart();
      const indent = line.length - trimmed.length;

      if (currentChunk && indent <= currentChunk.indent && trimmed) {
        const chunkContent = lines
          .slice(currentChunk.start, idx)
          .join("\n")
          .trim();

        if (chunkContent.length >= this.minChunkSize) {
          chunks.push({
            id: `${filePath}:${currentChunk.name}:${currentChunk.start}`,
            filePath,
            chunkType: currentChunk.type,
            name: currentChunk.name,
            content: chunkContent.slice(0, this.maxChunkSize),
            startLine: currentChunk.start + 1,
            endLine: idx,
            metadata: {
              imports: [],
              dependencies: this.extractDependencies(chunkContent),
              complexity: this.estimateComplexity(chunkContent),
            },
            context: this.buildContext(
              filePath,
              currentChunk.name,
              [],
              currentChunk.type,
            ),
          });
        }
        currentChunk = null;
      }

      const funcMatch = trimmed.match(functionRegex);
      if (funcMatch && funcMatch[1] && !currentChunk) {
        currentChunk = {
          type: "function",
          name: funcMatch[1],
          start: idx,
          indent,
        };
      }

      const classMatch = trimmed.match(classRegex);
      if (classMatch && classMatch[1] && !currentChunk) {
        currentChunk = {
          type: "class",
          name: classMatch[1],
          start: idx,
          indent,
        };
      }
    });

    if (currentChunk !== null) {
      const chunk: CurrentChunk = currentChunk;
      const chunkContent = lines.slice(chunk.start).join("\n").trim();
      if (chunkContent.length >= this.minChunkSize) {
        chunks.push({
          id: `${filePath}:${chunk.name}:${chunk.start}`,
          filePath,
          chunkType: chunk.type,
          name: chunk.name,
          content: chunkContent.slice(0, this.maxChunkSize),
          startLine: chunk.start + 1,
          endLine: lines.length,
          metadata: {
            imports: [],
            dependencies: this.extractDependencies(chunkContent),
            complexity: this.estimateComplexity(chunkContent),
          },
          context: this.buildContext(
            filePath,
            chunk.name,
            [],
            chunk.type,
          ),
        });
      }
    }

    return chunks.length > 0 ? chunks : this.chunkGeneric(filePath, content);
  }

  private chunkGeneric(filePath: string, content: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i += 40) {
      const chunkLines = lines.slice(i, i + 50);
      const chunkContent = chunkLines.join("\n");

      if (chunkContent.trim().length < this.minChunkSize) continue;

      chunks.push({
        id: `${filePath}:chunk:${i}`,
        filePath,
        chunkType: "file",
        name: `${path.basename(filePath)}_chunk_${Math.floor(i / 40)}`,
        content: chunkContent.slice(0, this.maxChunkSize),
        startLine: i + 1,
        endLine: Math.min(i + 50, lines.length),
        metadata: {
          imports: [],
          dependencies: [],
        },
        context: this.buildContext(filePath, "file_chunk", [], "file"),
      });
    }

    return chunks;
  }

  private extractDocstring(lines: string[], startLine: number): string {
    let docstring = "";
    for (let i = startLine - 2; i >= Math.max(0, startLine - 10); i--) {
      const line = lines[i]?.trim();
      if (!line) continue;

      if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/**")) {
        docstring = line + "\n" + docstring;
      } else {
        break;
      }
    }
    return docstring.trim();
  }

  private extractDependencies(content: string): string[] {
    const deps: string[] = [];
    const importRegex = /from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) deps.push(match[1]);
    }
    while ((match = requireRegex.exec(content)) !== null) {
      if (match[1]) deps.push(match[1]);
    }

    return [...new Set(deps)];
  }

  private estimateComplexity(
    content: string,
  ): "low" | "medium" | "high" {
    const lines = content.split("\n").length;
    const cyclomaticIndicators = (content.match(/\b(if|else|while|for|case|catch|\?\?|\?\.|&&|\|\|)\b/g) || []).length;

    if (lines > 100 || cyclomaticIndicators > 15) return "high";
    if (lines > 50 || cyclomaticIndicators > 8) return "medium";
    return "low";
  }

  private buildContext(
    filePath: string,
    name: string,
    imports: string[],
    type: string,
    parentClass?: string,
  ): string {
    const parts = [
      `File: ${filePath}`,
      `Type: ${type}`,
      `Name: ${name}`,
    ];

    if (parentClass) {
      parts.push(`Class: ${parentClass}`);
    }

    if (imports.length > 0) {
      parts.push(`Imports: ${imports.slice(0, 5).join(", ")}`);
    }

    return parts.join(" | ");
  }

  formatChunkForContext(chunk: CodeChunk): string {
    return `${chunk.context}

${chunk.metadata.docstring || ""}

\`\`\`
${chunk.content}
\`\`\``;
  }
}

