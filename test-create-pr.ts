import { existsSync, promises as fs, readFileSync } from "fs";
import * as path from "path";
import { join } from "path";
import { simpleGit } from "simple-git";
import { CodeAnalysisService } from "./packages/runner/src/services/code-analysis.js";
import { LLMService } from "./packages/runner/src/services/llm.js";

interface TestInput {
  taskType: "bug_fix" | "feature" | "refactor" | "code_quality" | "documentation" | "security_audit" | "test_generation" | "structure_refactor";
  issueTitle: string;
  issueBody: string;
  targetRepo?: string;
  targetBranch?: string;
}

const getRepositoryOverview = async (workspace: string): Promise<string> => {
  try {
    const readmePath = join(workspace, "README.md");
    const readme = await fs.readFile(readmePath, "utf-8");
    return readme.slice(0, 2000);
  } catch {
    return "No README.md found";
  }
};

const applyChanges = async (workspace: string, changes: any): Promise<string[]> => {
  const appliedFiles: string[] = [];

  for (const change of changes.files) {
    const filePath = path.join(workspace, change.path);

    try {
      if (change.action === "move") {
        const oldPath = path.join(workspace, change.oldPath);
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        // For move operations, always copy the actual file content
        const content = await fs.readFile(oldPath, "utf-8");
        await fs.writeFile(filePath, content, "utf-8");
        await fs.unlink(oldPath);
      } else if (change.action === "create" || change.action === "modify") {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, change.content || "", "utf-8");
      } else if (change.action === "delete") {
        await fs.unlink(filePath);
      }

      appliedFiles.push(change.path);
      console.log(`  ✓ ${change.action}: ${change.oldPath ? `${change.oldPath} → ` : ""}${change.path}`);
    } catch (error) {
      console.error(`  ✗ Failed to ${change.action} ${change.path}:`, error);
    }
  }

  return appliedFiles;
};

const runTest = async () => {
  console.log("🚀 Starting PR Creation Test\n");

  const inputPath = process.argv[2] || join(process.cwd(), "test-create-input.json");

  if (!existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}\n`);
    console.log("📝 Create a file named 'test-create-input.json' with this format:\n");
    console.log(JSON.stringify({
      taskType: "bug_fix",
      issueTitle: "Fix null pointer in authentication",
      issueBody: "The app crashes when user is null in the requireAuth middleware",
      targetRepo: ".",
      targetBranch: "main"
    }, null, 2));
    process.exit(1);
  }

  const input: TestInput = JSON.parse(readFileSync(inputPath, "utf-8"));

  console.log("📋 Test Configuration:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Task Type: ${input.taskType}`);
  console.log(`Issue: ${input.issueTitle}`);
  console.log(`Target: ${input.targetRepo || "current directory"}`);
  console.log(`Branch: ${input.targetBranch || "main"}\n`);

  const workspace = input.targetRepo ? join(process.cwd(), input.targetRepo) : process.cwd();

  if (!existsSync(workspace)) {
    console.error(`❌ Target repository not found: ${workspace}`);
    process.exit(1);
  }

  console.log(`📁 Working in: ${workspace}\n`);

  const git = simpleGit(workspace);
  
  const status = await git.status();
  if (status.files.length > 0) {
    console.log("⚠️  Warning: Working directory has uncommitted changes");
    console.log("Files:");
    status.files.forEach(f => console.log(`  - ${f.path} (${f.working_dir})`));
    console.log();
  }

  const currentBranch = status.current;
  const newBranch = `overviewer-agent/${input.taskType}-${Date.now()}`;

  console.log(`🌿 Creating branch: ${newBranch}\n`);
  await git.checkoutBranch(newBranch, currentBranch || "main");

  const llm = new LLMService();
  const codeAnalysis = new CodeAnalysisService();

  console.log("🔄 Step 1: Analyzing issue...\n");
  
  try {
    const repoOverview = await getRepositoryOverview(workspace);
    const analysis = await llm.analyzeIssue(
      input.issueTitle,
      input.issueBody,
      repoOverview
    );

    console.log(`  Task Type: ${analysis.taskType}`);
    console.log(`  Confidence: ${analysis.confidence}%\n`);

    console.log("🔄 Step 2: Analyzing repository...\n");
    
    const codeContext = await codeAnalysis.analyzeRepository(workspace);
    console.log(`  Repository analyzed\n`);

    console.log("🔄 Step 3: Generating code changes...\n");
    
    const changes = await llm.generateCodeFix(
      {
        title: input.issueTitle,
        body: input.issueBody,
      },
      codeContext,
      analysis
    );

    console.log(`  Changes generated for ${changes.files.length} file(s)\n`);

    console.log("🔄 Step 4: Applying changes...\n");
    
    const appliedFiles = await applyChanges(workspace, changes);

    if (appliedFiles.length === 0) {
      console.log("\n⚠️  No files were changed");
      await git.checkout(currentBranch || "main");
      await git.deleteLocalBranch(newBranch, true);
      return;
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ CHANGES APPLIED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log(`Summary: ${changes.summary}\n`);

    console.log("📝 Files Changed:");
    appliedFiles.forEach((file) => {
      console.log(`  - ${file}`);
    });
    console.log();

    console.log("💾 Committing changes...");
    await git.add(".");
    await git.commit(`${input.taskType}: ${input.issueTitle}\n\n${input.issueBody}\n\nGenerated by Overviewer Agent`);
    
    const log = await git.log({ maxCount: 1 });
    const commitHash = log.latest?.hash;
    
    console.log(`✅ Created commit: ${commitHash?.substring(0, 7)}\n`);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 SUMMARY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    console.log(`Branch: ${newBranch}`);
    console.log(`Commit: ${commitHash}`);
    console.log(`Files: ${appliedFiles.length}`);
    console.log();
    
    console.log("🔍 View changes:");
    console.log(`  git diff ${currentBranch}..${newBranch}`);
    console.log();
    
    console.log("📤 To create a PR (if you have GitHub CLI):");
    console.log(`  gh pr create --title "${input.taskType}: ${input.issueTitle}" --body "${input.issueBody}\\n\\nGenerated by Overviewer Agent"`);
    console.log();

    console.log("🔄 To reset:");
    console.log(`  git checkout ${currentBranch} && git branch -D ${newBranch}`);
    console.log();

    const diffOutput = await git.diff([`${currentBranch}..${newBranch}`]);
    const diffPreview = diffOutput.split('\n').slice(0, 50).join('\n');
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 DIFF PREVIEW (first 50 lines)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log(diffPreview);
    if (diffOutput.split('\n').length > 50) {
      console.log("\n... (truncated, run git diff to see full changes)");
    }

  } catch (error) {
    console.error("\n❌ Task execution failed:", error);
    console.log("\n🔄 Rolling back...");
    await git.checkout(currentBranch || "main");
    await git.deleteLocalBranch(newBranch, true);
    throw error;
  }
};

runTest().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});

