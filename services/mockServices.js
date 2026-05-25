import { EventEmitter } from 'events';

// 1. Mock MongoDB / Mongoose Model
export class MockDeployment {
  constructor(data) {
    this._id = data._id || 'mock_dep_' + Math.random().toString(36).substring(2, 11);
    this.clientName = data.clientName;
    this.domain = data.domain;
    this.image = data.image;
    this.status = data.status || 'Pending';
    this.logs = data.logs || [`[System] Deployment record created for ${data.clientName}`];
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  async save() {
    MockDeployment.store.set(this._id, this);
    console.log(`[MockDB] Saved deployment: ${this._id} (${this.clientName})`);
    return this;
  }

  static async findById(id) {
    const doc = MockDeployment.store.get(id);
    return doc ? { ...doc } : null;
  }

  static async find() {
    return Array.from(MockDeployment.store.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  static async findByIdAndUpdate(id, update, options = {}) {
    const doc = MockDeployment.store.get(id);
    if (!doc) return null;

    if (update.$push && update.$push.logs) {
      if (typeof update.$push.logs === 'object' && update.$push.logs.$each) {
        doc.logs.push(...update.$push.logs.$each);
      } else {
        doc.logs.push(update.$push.logs);
      }
    }

    if (update.$set) {
      Object.assign(doc, update.$set);
    } else {
      for (const key in update) {
        if (!key.startsWith('$')) {
          doc[key] = update[key];
        }
      }
    }

    doc.updatedAt = new Date();
    MockDeployment.store.set(id, doc);
    return { ...doc };
  }
}
MockDeployment.store = new Map();


// 2. Mock Queue & Worker (BullMQ replacement)
class MockQueueInstance extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
  }

  async add(name, data) {
    const jobId = 'mock_job_' + Math.random().toString(36).substring(2, 11);
    const job = { id: jobId, name, data };
    
    console.log(`[MockQueue] Job ${jobId} added to ${this.name} queue`);
    
    // Process async
    setTimeout(() => {
      this.emit('process', job);
    }, 200);

    return job;
  }
}

const mockQueues = {};

export class MockQueue {
  constructor(name) {
    if (!mockQueues[name]) {
      mockQueues[name] = new MockQueueInstance(name);
    }
    return mockQueues[name];
  }
}

export class MockWorker {
  constructor(name, processor) {
    this.name = name;
    this.processor = processor;
    
    const queue = mockQueues[name] || new MockQueueInstance(name);
    mockQueues[name] = queue;

    queue.on('process', async (job) => {
      console.log(`[MockWorker] Worker processing job ${job.id}`);
      try {
        await this.processor(job);
      } catch (err) {
        console.error(`[MockWorker] Job ${job.id} failed:`, err);
      }
    });

    console.log(`[MockWorker] Registered worker for queue: ${name}`);
  }
}


// 3. Mock SSH/SSM EC2 Deploy
export async function mockDockerDeploy(clientName, domain, image, logFn) {
  const steps = [
    `[Docker] Connecting to EC2 instance...`,
    `[Docker] Connection established. Running verification commands...`,
    `[Docker] Checking Docker Daemon status: active (running)`,
    `[Docker] Pulling docker image: ${image} from registry...`,
    `[Docker] Image ${image} pulled successfully.`,
    `[Docker] Stopping existing container for ${domain} (if any)...`,
    `[Docker] Running new container: docker run -d --name ${clientName.toLowerCase()}-app -p 80:80 -e DOMAIN=${domain} ${image}`,
    `[Docker] Container ${clientName.toLowerCase()}-app is running (ID: d7f3b890ca11)`,
    `[Docker] Verifying container health status... Healthy!`
  ];

  for (const step of steps) {
    await new Promise(resolve => setTimeout(resolve, 800));
    await logFn(step);
  }
}


// 4. Mock AWS Lambda Invoke
export async function mockLambdaInvoke(clientName, domain, logFn) {
  const steps = [
    `[Lambda] Preparing payload for AWS Lambda function...`,
    `[Lambda] Invoking Lambda: post-deployment-setup (Region: us-east-1)...`,
    `[Lambda] Lambda execution in progress: Configuring DNS record for ${domain}...`,
    `[Lambda] Lambda execution in progress: Generating Let's Encrypt SSL Certificates...`,
    `[Lambda] Lambda response: { statusCode: 200, body: "Successfully configured DNS and SSL for ${domain}" }`
  ];

  for (const step of steps) {
    await new Promise(resolve => setTimeout(resolve, 800));
    await logFn(step);
  }
}
