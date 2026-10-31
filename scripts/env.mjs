import { existsSync } from 'node:fs';
// Match Next's local env precedence for the standalone scheduler/start command.
const mode = process.env.NODE_ENV || 'development';
for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}
