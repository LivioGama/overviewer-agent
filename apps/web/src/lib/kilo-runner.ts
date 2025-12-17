import { spawn } from 'child_process';

interface KiloRunResult {
  success: boolean;
  output: string;
  code: number;
}

const getKiloModel = (): string => {
  const provider = process.env.LLM_PROVIDER?.toLowerCase() || 'claude';
  const kiloModel = process.env.KILOCODE_MODEL;
  
  if (kiloModel) return kiloModel;
  
  switch (provider) {
    case 'claude':
      return 'anthropic/claude-sonnet-4-20250514';
    case 'openai':
      return 'openai/gpt-4o';
    default:
      return 'x-ai/grok-code-fast-1';
  }
};

export const runKiloCode = async (
  prompt: string,
  issueNumber: number,
  repoPath: string = '/workspace'
): Promise<KiloRunResult> => {
  const kiloModel = getKiloModel();
  console.log(`[${new Date().toISOString()}] Running Kilo Code for issue #${issueNumber} in ${repoPath} with model: ${kiloModel}`);
  
  return new Promise((resolve, reject) => {
    const kiloProcess = spawn('sh', ['-c', `echo "" | kilocode --auto --yolo --json --timeout 600 "${prompt.replace(/"/g, '\\"')}"`], {
      cwd: repoPath,
      env: {
        ...process.env,
        KILOCODE_TOKEN: process.env.KILOCODE_API_KEY,
        KILOCODE_MODEL: kiloModel,
        KILOCODE_BASE_URL: 'https://api.kilocode.ai'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';
    let buffer = '';
    let currentReasoning = '';
    let lastReasoningPrint = '';

    kiloProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      buffer += chunk;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const json = JSON.parse(line);
            
            if (json.type === 'say' && json.say === 'reasoning') {
              if (json.partial) {
                currentReasoning = json.content || '';
                if (currentReasoning !== lastReasoningPrint) {
                  process.stdout.write(`\r[Kilo] 💭 ${currentReasoning.substring(0, 100)}${currentReasoning.length > 100 ? '...' : ''}`.padEnd(120));
                  lastReasoningPrint = currentReasoning;
                }
              } else {
                if (currentReasoning) {
                  process.stdout.write('\n');
                }
                console.log(`[Kilo] 💭 ${json.content}`);
                currentReasoning = '';
                lastReasoningPrint = '';
              }
            } else if (json.type === 'say' && json.say === 'text') {
              if (json.partial) {
                process.stdout.write(json.content || '');
              } else {
                console.log(json.content || '');
              }
            } else if (json.type === 'say' && json.say === 'checkpoint_saved') {
              if (currentReasoning) process.stdout.write('\n');
              console.log(`[Kilo] 💾 Checkpoint: ${json.content?.substring(0, 8)}`);
              currentReasoning = '';
            } else if (json.type === 'ask' && json.ask === 'tool' && !json.partial) {
              if (currentReasoning) process.stdout.write('\n');
              const tool = json.metadata?.tool;
              const params = json.metadata?.params;
              if (tool === 'write_to_file') {
                console.log(`[Kilo] 📝 Writing: ${params?.path}`);
              } else if (tool === 'read_file') {
                console.log(`[Kilo] 📖 Reading: ${params?.path}`);
              } else if (tool === 'execute_command') {
                console.log(`[Kilo] ⚡ Running: ${params?.command}`);
              } else {
                console.log(`[Kilo] 🔧 Tool: ${tool}`);
              }
              currentReasoning = '';
            } else if (json.type === 'say' && json.say === 'api_req_started') {
              if (currentReasoning) process.stdout.write('\n');
              const provider = json.metadata?.inferenceProvider || 'API';
              const tokensIn = json.metadata?.tokensIn || 0;
              const tokensOut = json.metadata?.tokensOut || 0;
              if (tokensIn > 0) {
                console.log(`[Kilo] 🤖 ${provider} (${tokensIn} → ${tokensOut} tokens)`);
              }
              currentReasoning = '';
            } else if (json.event === 'session_synced') {
              console.log(`[Kilo] ✅ Synced`);
            } else if (json.type === 'completion_result') {
              if (currentReasoning) process.stdout.write('\n');
              console.log(`[Kilo] 🎉 Completed!`);
              currentReasoning = '';
            }
          } catch {
            if (!line.includes('⣿') && !line.includes('█████')) {
              process.stdout.write(line + '\n');
            }
          }
        }
      }
    });

    kiloProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      
      const lines = chunk.split('\n').filter((l: string) => l.trim());
      for (const line of lines) {
        if (line.includes('[ERROR]') || line.includes('Error:')) {
          console.error(`[Kilo] ❌ ${line}`);
        } else if (line.includes('[WARN]') || line.includes('Warning:')) {
          console.warn(`[Kilo] ⚠️  ${line}`);
        }
      }
    });

    kiloProcess.on('close', (code) => {
      console.log(`[${new Date().toISOString()}] Kilo Code exited with code ${code}`);
      if (code === 0 || code === 124) {
        resolve({ success: true, output, code: code || 0 });
      } else {
        reject(new Error(`Kilo Code failed with exit code ${code}: ${errorOutput}`));
      }
    });

    kiloProcess.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] Failed to spawn Kilo Code:`, error);
      reject(error);
    });
  });
};

