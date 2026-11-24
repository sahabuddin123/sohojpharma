const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  const env = {};
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx !== -1) {
        const key = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[key] = val;
      }
    }
  }
  return env;
}

const envVars = loadEnvFile(path.join(__dirname, ".env"));

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
        ...envVars,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        NITRO_PORT: 3000,
        NITRO_HOST: "127.0.0.1",
        HOST: "127.0.0.1",
        ...envVars,
      },
    },
  ],
};
