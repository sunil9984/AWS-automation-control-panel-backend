import mongoose from 'mongoose';
import { MockDeployment } from '../services/mockServices.js';
import dotenv from 'dotenv';

dotenv.config();

let Deployment;

if (process.env.USE_MOCK_SERVICES === 'true') {
  console.log('[Database] Using Mock Database Model (USE_MOCK_SERVICES=true)');
  Deployment = MockDeployment;
} else {
  const deploymentSchema = new mongoose.Schema({
    clientName: { type: String, required: true },
    domain: { type: String, required: true },
    image: { type: String, required: true },
    status: { 
      type: String, 
      enum: ['Pending', 'Docker_Deploying', 'Lambda_Invoking', 'Completed', 'Failed'], 
      default: 'Pending' 
    },
    logs: [{ type: String }]
  }, { 
    timestamps: true 
  });

  try {
    Deployment = mongoose.model('Deployment', deploymentSchema);
    console.log('[Database] Defined Mongoose Model "Deployment"');
  } catch (err) {
    console.warn('[Database] Mongoose model definition failed, falling back to MockDeployment:', err.message);
    Deployment = MockDeployment;
  }
}

export default Deployment;
export { Deployment };
