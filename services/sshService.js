import { Client } from 'ssh2';
import { mockDockerDeploy } from './mockServices.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const useMock = process.env.USE_MOCK_SERVICES === 'true';

export async function deployDockerViaSSH(clientName, domain, image, logFn) {
  if (useMock) {
    console.log('[SSH] Using Mock SSH Deployment');
    return mockDockerDeploy(clientName, domain, image, logFn);
  }

  const host = process.env.EC2_HOST;
  const username = process.env.EC2_USERNAME || 'ubuntu';
  const sshKeyPath = process.env.EC2_SSH_KEY_PATH;

  if (!host) {
    throw new Error('EC2_HOST environment variable is missing.');
  }

  let privateKey;
  try {
    if (sshKeyPath) {
      privateKey = fs.readFileSync(sshKeyPath, 'utf8');
    } else {
      throw new Error('EC2_SSH_KEY_PATH is not configured.');
    }
  } catch (err) {
    await logFn(`[SSH] Failed to load SSH private key: ${err.message}. Falling back to Mock SSH.`);
    return mockDockerDeploy(clientName, domain, image, logFn);
  }

  await logFn(`[SSH] Connecting to EC2 host ${host} as ${username}...`);

  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      logFn('[SSH] Connection established. Running commands...')
        .then(() => {
          const command = `
            echo "=== Starting SSH Deployment for ${clientName} ===" &&
            docker pull ${image} &&
            docker stop ${clientName.toLowerCase()}-app || true &&
            docker rm ${clientName.toLowerCase()}-app || true &&
            docker run -d --name ${clientName.toLowerCase()}-app -p 80:80 -e DOMAIN=${domain} ${image} &&
            docker ps --filter name=${clientName.toLowerCase()}-app
          `;

          conn.exec(command, (err, stream) => {
            if (err) {
              conn.end();
              return reject(err);
            }

            let stdout = '';
            let stderr = '';

            stream.on('close', (code, signal) => {
              conn.end();
              logFn(`[SSH] Command finished with exit code ${code}`)
                .then(() => {
                  if (code === 0) {
                    resolve(true);
                  } else {
                    reject(new Error(`SSH Deployment Command failed with exit code ${code}. Error: ${stderr}`));
                  }
                });
            });

            stream.on('data', (data) => {
              const chunk = data.toString();
              stdout += chunk;
              logFn(`[SSH stdout] ${chunk.trim()}`);
            });

            stream.stderr.on('data', (data) => {
              const chunk = data.toString();
              stderr += chunk;
              logFn(`[SSH stderr] ${chunk.trim()}`);
            });
          });
        });
    });

    conn.on('error', (err) => {
      logFn(`[SSH] SSH connection error: ${err.message}`)
        .then(() => {
          logFn('[SSH] Falling back to Mock SSH...')
            .then(() => {
              mockDockerDeploy(clientName, domain, image, logFn)
                .then(resolve)
                .catch(reject);
            });
        })
        .catch(() => {
          reject(err);
        });
    });

    conn.connect({
      host,
      port: 21, // default SSH port or configure
      username,
      privateKey
    });
  });
}
