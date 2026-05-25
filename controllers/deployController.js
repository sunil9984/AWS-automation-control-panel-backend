import Deployment from '../models/Deployment.js';
import { deployQueue } from '../queue/deployQueue.js';

// 1. GET /api/deployments - List all deployments
export async function getDeployments(req, res) {
  try {
    const list = await Deployment.find();
    res.json(list);
  } catch (err) {
    console.error('Error fetching deployments:', err);
    res.status(500).json({ error: 'Failed to fetch deployments' });
  }
}

// 2. GET /api/status/:id - Get status and logs of a single deployment
export async function getDeploymentStatus(req, res) {
  const { id } = req.params;
  try {
    const dep = await Deployment.findById(id);
    if (!dep) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    res.json({
      id: dep._id,
      clientName: dep.clientName,
      domain: dep.domain,
      image: dep.image,
      status: dep.status,
      logs: dep.logs,
      createdAt: dep.createdAt,
      updatedAt: dep.updatedAt
    });
  } catch (err) {
    console.error(`Error fetching status for ${id}:`, err);
    res.status(500).json({ error: 'Failed to fetch deployment status' });
  }
}

// 3. POST /api/deploy - Submit a new deployment and add to queue
export async function createDeployment(req, res) {
  const { clientName, domain, image } = req.body;

  // Basic validation
  if (!clientName || !domain || !image) {
    return res.status(400).json({ error: 'Missing required fields: clientName, domain, image' });
  }

  // Domain format validation helper
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(domain) && !domain.includes('localhost') && !domain.startsWith('test.')) {
    return res.status(400).json({ error: 'Invalid domain format' });
  }

  try {
    const time = new Date().toLocaleTimeString();
    const initialLog = `[${time}] [System] Deployment request submitted.`;
    
    // Create new database record with 'Pending' status
    const newDeployment = new Deployment({
      clientName,
      domain,
      image,
      status: 'Pending',
      logs: [initialLog]
    });

    const saved = await newDeployment.save();
    
    // Push task to queue
    const job = await deployQueue.add('deploy-job', {
      id: saved._id,
      clientName,
      domain,
      image
    });

    await Deployment.findByIdAndUpdate(saved._id, {
      $push: { logs: `[${new Date().toLocaleTimeString()}] [Queue] Job enqueued (JobId: ${job.id})` }
    });

    // Respond immediately with 200 OK
    res.status(200).json({
      success: true,
      message: 'Deployment successfully queued',
      id: saved._id
    });

  } catch (err) {
    console.error('Error queuing deployment:', err);
    res.status(500).json({ error: 'Failed to initialize deployment process' });
  }
}
