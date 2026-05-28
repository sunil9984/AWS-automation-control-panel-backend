AWS Automation Control Panel — Backend

Backend API service for automating Docker deployment workflows using Node.js, Express, queue workers, and AWS integration simulation.

🚀 Features ⚡ REST API for deployments 🐳 Docker deployment automation ☁️ AWS Lambda trigger support 📦 Queue-based job processing 🧪 Mock deployment mode 📜 Deployment log generation 🌐 Deployment status APIs 🔄 MongoDB optional support

🛠 Tech Stack Node.js Express.js Docker BullMQ MongoDB (optional) AWS SDK


⚙️ Installation Clone Repository git clone https://github.com/YOUR_USERNAME/aws-automation-control-panel.git Navigate to Backend cd backend Install Dependencies npm install 🔥 Environment Variables

PORT=5000

USE_MOCK_SERVICES=true

DEPLOY_METHOD=SSM

MONGODB_URI=mongodb://localhost:27017/control-panel

🚀 Run Backend Development Mode npm run dev Production Mode npm start

🌐 API Runs On - const API_BASE = 'https://your-backend-url.onrender.com/api';

http://localhost:5000 📌 API Endpoints Health Check GET /api/health Create Deployment POST /api/deploy

Request Body { "clientName": "Acme Corp", "domain": "acme.example.com", "image": "nginx:latest" }

Get Deployments GET /api/deployments Get Deployment Status GET /api/status/:id

🧪 Mock Mode

Enable mock deployment system:

USE_MOCK_SERVICES=true

This disables:

MongoDB requirement Real AWS calls Redis dependency

Useful for: Local testing

⚡ Deployment Workflow

Deployment request received Job added to queue Docker deployment initiated AWS Lambda triggered Logs updated Final status returned

🌍 Deploy Backend

Render AWS EC2 📦 Future Improvements Real Docker deployment WebSocket live logs Redis production queues Kubernetes support CI/CD pipelines Multi-region deployment

👨‍💻 Author Sunil Kumar Gupta

Full Stack Developer | AWS Automation Enthusiast
