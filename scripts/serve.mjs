import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const nextBin = resolve('node_modules/next/dist/bin/next');
const server = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1'], {
  env: process.env,
  stdio: 'inherit',
});

server.on('error', (error) => {
  console.error('Could not start the Next.js production server:', error.message);
  process.exitCode = 1;
});
server.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.kill(signal));
}
