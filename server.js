import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import deployRouter from './routes/deploy.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// API healthcheck endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'online', 
    mockServices: process.env.USE_MOCK_SERVICES === 'true',
    deployMethod: process.env.DEPLOY_METHOD || 'SSM'
  });
});

// Register routes
app.use('/api', deployRouter);

// Database Connection
const useMock = process.env.USE_MOCK_SERVICES === 'true';
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/control-panel';

if (useMock) {
  console.log('[Server] Running in simulated/mock mode. Mongoose connection skipped.');
  startServer();
} else {
  console.log(`[Server] Connecting to MongoDB at ${mongoUri}...`);
  mongoose.connect(mongoUri)
    .then(() => {
      console.log('[Server] Successfully connected to MongoDB.');
      startServer();
    })
    .catch((err) => {
      console.error('[Server] MongoDB connection failed:', err.message);
      console.warn('[Server] Starting server with Mock Database fallback active.');
      // Toggle mock settings so that models and queues fallback gracefully
      process.env.USE_MOCK_SERVICES = 'true';
      startServer();
    });
}

function startServer() {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` Hosting Control Panel API Server running on port ${PORT}`);
    console.log(` Environment: ${useMock ? 'SIMULATED (Mock services active)' : 'PRODUCTION'}`);
    console.log(` Deploy Mode: ${process.env.DEPLOY_METHOD || 'SSM'}`);
    console.log(` Health Check: http://localhost:${PORT}/api/health`);
    console.log(`=======================================================`);
  });
}
