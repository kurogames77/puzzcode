// Fallback to child_process Python script when warm service is unavailable
const { spawn } = require('child_process');
const path = require('path');

function detectPythonCommand() {
  if (process.env.PYTHON_COMMAND) {
    return process.env.PYTHON_COMMAND;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

async function callPuzzleAdjustFallback(args) {
  const pythonScriptPath = path.join(__dirname, '../../algorithms/puzzle_adjustment.py');
  const pythonCommand = detectPythonCommand();
  
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn(pythonCommand, [pythonScriptPath], {
      cwd: path.join(__dirname, '../..'),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.stdin.write(JSON.stringify(args));
    pythonProcess.stdin.end();

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const response = JSON.parse(stdout);
        if (response.success) {
          resolve(response.result);
        } else {
          reject(new Error(response.error || 'Algorithm computation failed'));
        }
      } catch (parseError) {
        reject(new Error(`Failed to parse Python output: ${parseError.message}`));
      }
    });

    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });
  });
}

module.exports = {
  callPuzzleAdjustFallback,
  detectPythonCommand,
};

