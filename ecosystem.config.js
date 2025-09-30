module.exports = {
  apps: [
    {
      name: 'magi-dev',
      script: 'npm',
      args: 'run dev',
      cwd: '/Users/bradjohnson/Documents/MAGI-online/magi-app',
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      instances: 1,
      exec_mode: 'fork',
      log_file: './logs/magi-dev.log',
      error_file: './logs/magi-dev-error.log',
      out_file: './logs/magi-dev-out.log',
      time: true,
    },
  ],
};