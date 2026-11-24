module.exports = {
  apps: [
    {
      name: "sohojpharma",
      script: "./.output/server/index.mjs",
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        NITRO_PORT: 3000,
        NITRO_HOST: "127.0.0.1",
        HOST: "127.0.0.1",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        NITRO_PORT: 3000,
        NITRO_HOST: "127.0.0.1",
        HOST: "127.0.0.1",
      },
    },
  ],
};
