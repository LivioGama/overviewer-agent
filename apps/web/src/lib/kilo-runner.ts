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

    kiloProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      process.stdout.write(chunk);
    });

    kiloProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      process.stderr.write(chunk);
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

