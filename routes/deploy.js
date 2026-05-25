import express from 'express';
import { 
  getDeployments, 
  getDeploymentStatus, 
  createDeployment 
} from '../controllers/deployController.js';

const router = express.Router();

// 1. GET /api/deployments - List all deployments
router.get('/deployments', getDeployments);

// 2. GET /api/status/:id - Get status and logs of a single deployment
router.get('/status/:id', getDeploymentStatus);

// 3. POST /api/deploy - Submit a new deployment and add to queue
router.post('/deploy', createDeployment);

export default router;
export { router };
