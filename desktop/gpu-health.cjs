const { execFile } = require('node:child_process');
const probe = [
  'import torch',
  "assert torch.cuda.is_available(), 'CUDA is unavailable'",
  "x = torch.ones((32,32), device='cuda')",
  'assert float((x @ x).sum().item()) == 32768.0',
  'torch.cuda.synchronize()',
  "print('IMMERSE_GPU_READY')",
].join('\n');
function createGpuProbe(execute = execFile) {
  return (python) =>
    new Promise((resolve) => {
      execute(
        python,
        ['-c', probe],
        {
          windowsHide: true,
          timeout: 120000,
          env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
        },
        (error, stdout, stderr) => {
          resolve({
            ready: !error && String(stdout).trim() === 'IMMERSE_GPU_READY',
            detail: error ? String(stderr || error.message).slice(-4000) : String(stdout).trim(),
          });
        },
      );
    });
}
module.exports = { probeGpu: createGpuProbe(), createGpuProbe };
