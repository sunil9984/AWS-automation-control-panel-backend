import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import Deployment from '../models/Deployment.js';
import { deployDockerViaSSM, invokeLambdaSetup } from '../services/awsService.js';
import { deployDockerViaSSH } from '../services/sshService.js';
import { MockQueue, MockWorker } from '../services/mockServices.js';
import dotenv from 'dotenv';

dotenv.config();

const useMock = process.env.USE_MOCK_SERVICES === 'true';
const QUEUE_NAME = 'deployment-queue';

let deployQueue;
let deployWorker;

// Helper to check if Redis is running before launching BullMQ
async function checkRedisConnection(host, port) {
  return new Promise((resolve) => {
    const client = new Redis({
      host,
      port,
      connectTimeout: 1000,
      lazyConnect: false,
      retryStrategy: () => null // Do not retry connection
    });

    client.on('connect', () => {
      client.disconnect();
      resolve(true);
    });

    client.on('error', () => {
      client.disconnect();
      resolve(false);
    });
  });
}

// Log function that pushes to DB deployment record logs list
async function createLogger(deploymentId) {
  return async (message) => {
    const time = new Date().toLocaleTimeString();
    const logMessage = `[${time}] ${message}`;
    console.log(`[Worker][Dep:${deploymentId}] ${message}`);
    await Deployment.findByIdAndUpdate(deploymentId, {
      $push: { logs: logMessage }
    });
  };
}

async function processDeployment(job) {
  const { id, clientName, domain, image } = job.data;
  const log = await createLogger(id);

  try {
    await log('Background worker picked up deployment job.');
    
    // 1. Update status to Docker_Deploying
    await Deployment.findByIdAndUpdate(id, { status: 'Docker_Deploying' });
    await log('Initiating Docker deployment on EC2...');

    const deployMethod = process.env.DEPLOY_METHOD || 'SSM';
    if (deployMethod === 'SSH') {
      await deployDockerViaSSH(clientName, domain, image, log);
    } else {
      await deployDockerViaSSM(clientName, domain, image, log);
    }

    // 2. Update status to Lambda_Invoking
    await Deployment.findByIdAndUpdate(id, { status: 'Lambda_Invoking' });
    await log('Docker deployment complete. Triggering AWS Lambda post-deployment setup...');

    await invokeLambdaSetup(clientName, domain, image, log);

    // 3. Update status to Completed
    await Deployment.findByIdAndUpdate(id, { status: 'Completed' });
    await log('System successfully deployed! Configuration complete.');

  } catch (err) {
    console.error(`[Worker error]`, err);
    await Deployment.findByIdAndUpdate(id, { status: 'Failed' });
    await log(`CRITICAL ERROR during deployment: ${err.message}`);
  }
}

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379');

let isRedisOnline = false;
if (!useMock) {
  isRedisOnline = await checkRedisConnection(redisHost, redisPort);
}

if (!useMock && isRedisOnline) {
  const connection = { host: redisHost, port: redisPort };
  try {
    deployQueue = new Queue(QUEUE_NAME, { connection });
    deployWorker = new Worker(QUEUE_NAME, processDeployment, { connection });
    console.log('[Queue] Real BullMQ Queue and Worker initialized.');
    
    deployWorker.on('error', (err) => console.error('[Queue Worker Error]', err));
    deployWorker.on('failed', (job, err) => console.error(`[Queue Job ${job?.id} Failed]`, err));
  } catch (err) {
    console.warn('[Queue] Failed to initialize BullMQ. Falling back to Mock Queue:', err.message);
    deployQueue = new MockQueue(QUEUE_NAME);
    deployWorker = new MockWorker(QUEUE_NAME, processDeployment);
  }
} else {
  if (!useMock) {
    console.warn(`[Queue] Redis is offline at ${redisHost}:${redisPort}. Falling back to Mock Queue (No ECONNREFUSED loops).`);
  } else {
    console.log('[Queue] Initializing Mock Queue and Worker (USE_MOCK_SERVICES=true)');
  }
  deployQueue = new MockQueue(QUEUE_NAME);
  deployWorker = new MockWorker(QUEUE_NAME, processDeployment);
}

export { deployQueue, deployWorker };
