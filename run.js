const { spawn } = require('child_process');
const path = require('path');

console.log('====================================================');
console.log('          STARTING AVENIR AI FULL-STACK            ');
console.log('            "Your Future Starts Here."             ');
console.log('====================================================');

// Start Backend
const backend = spawn('node', ['server.js'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: 'inherit',
  shell: true,
});

// Start Frontend
const frontend = spawn('node', ['serve.js'], {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'inherit',
  shell: true,
});

const cleanup = () => {
  console.log('\nShutting down AVENIR AI servers...');
  backend.kill();
  frontend.kill();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

