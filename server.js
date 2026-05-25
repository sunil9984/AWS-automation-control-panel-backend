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

// Root Route
app.get('/', (req, res) => {
  res.json({
    status: 'Backend Running',
    mockMode: process.env.USE_MOCK_SERVICES === 'true',
    deployMethod: process.env.DEPLOY_METHOD || 'SSM'
  });
});

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
const mongoUri =
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/control-panel';

if (process.env.USE_MOCK_SERVICES === 'true') {
  console.log(
    '[Server] Running in simulated/mock mode. Mongoose connection skipped.'
  );

  startServer();
} else {
  console.log(`[Server] Connecting to MongoDB...`);

  mongoose
    .connect(mongoUri)
    .then(() => {
      console.log(
        '[Server] Successfully connected to MongoDB.'
      );

      startServer();
    })
    .catch((err) => {
      console.error(
        '[Server] MongoDB connection failed:',
        err.message
      );

      console.warn(
        '[Server] Starting server with Mock Database fallback active.'
      );

      process.env.USE_MOCK_SERVICES = 'true';

      startServer();
    });
}

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(500).json({
    error: 'Internal Server Error'
  });
});

function startServer() {
  app.listen(PORT, () => {
    console.log('=======================================================');
    console.log(
      ` Hosting Control Panel API Server running on port ${PORT}`
    );

    console.log(
      ` Environment: ${
        process.env.USE_MOCK_SERVICES === 'true'
          ? 'SIMULATED (Mock services active)'
          : 'PRODUCTION'
      }`
    );

    console.log(
      ` Deploy Mode: ${process.env.DEPLOY_METHOD || 'SSM'}`
    );

    console.log(
      ` Health Check: http://localhost:${PORT}/api/health`
    );

    console.log('=======================================================');
  });
}
