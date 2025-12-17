import { spawn } from 'child_process';

interface KiloRunResult {
  success: boolean;
  output: string;
  code: number;
}

export const runKiloCode = async (
  prompt: string,
  issueNumber: number,
  repoPath: string = '/workspace'
): Promise<KiloRunResult> => {
  console.log(`[${new Date().toISOString()}] Running Kilo Code for issue #${issueNumber} in ${repoPath}`);
  
  return new Promise((resolve, reject) => {
    const kiloProcess = spawn('sh', ['-c', `echo "" | kilocode --auto --yolo --json --timeout 600 "${prompt.replace(/"/g, '\\"')}"`], {
      cwd: repoPath,
      env: {
        ...process.env,
        KILOCODE_TOKEN: process.env.KILOCODE_API_KEY,
        KILOCODE_MODEL: 'x-ai/grok-code-fast-1',
        KILOCODE_BASE_URL: 'https://api.kilocode.ai'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';
    let buffer = '';

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
            
            if (json.type === 'say' && json.say === 'reasoning' && !json.partial) {
              console.log(`[Kilo] 💭 ${json.content}`);
            } else if (json.type === 'say' && json.say === 'checkpoint_saved') {
              console.log(`[Kilo] 💾 Checkpoint saved: ${json.content?.substring(0, 8)}`);
            } else if (json.type === 'ask' && json.ask === 'tool' && !json.partial) {
              const tool = json.metadata?.tool;
              console.log(`[Kilo] 🔧 Using tool: ${tool}`);
            } else if (json.type === 'say' && json.say === 'api_req_started') {
              const provider = json.metadata?.inferenceProvider || 'API';
              const tokensIn = json.metadata?.tokensIn || 0;
              const tokensOut = json.metadata?.tokensOut || 0;
              if (tokensIn > 0) {
                console.log(`[Kilo] 🤖 ${provider} request (${tokensIn} → ${tokensOut} tokens)`);
              }
            } else if (json.event === 'session_synced') {
              console.log(`[Kilo] ✅ Session synced`);
            } else if (json.type === 'completion_result') {
              console.log(`[Kilo] 🎉 Task completed!`);
            }
          } catch {
            process.stdout.write(line + '\n');
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

