import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { mockDockerDeploy, mockLambdaInvoke } from './mockServices.js';
import dotenv from 'dotenv';

dotenv.config();

const useMock = process.env.USE_MOCK_SERVICES === 'true';

// Initialize AWS Clients (will fail/throw if no credentials, which is fine if mocking)
let ssmClient;
let lambdaClient;

if (!useMock) {
  try {
    const config = {
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    };
    ssmClient = new SSMClient(config);
    lambdaClient = new LambdaClient(config);
    console.log('[AWS] Real AWS Clients initialized successfully.');
  } catch (err) {
    console.error('[AWS] Failed to initialize AWS clients. Falling back to Mock Services.', err.message);
  }
}

/**
 * Executes a shell command on an EC2 instance via AWS Systems Manager (SSM) SendCommand.
 * Wait until it finishes and stream logs.
 */
export async function deployDockerViaSSM(clientName, domain, image, logFn) {
  if (useMock || !ssmClient) {
    console.log('[AWS SSM] Using Mock SSM Deployment');
    return mockDockerDeploy(clientName, domain, image, logFn);
  }

  const instanceId = process.env.EC2_INSTANCE_ID;
  if (!instanceId) {
    throw new Error('EC2_INSTANCE_ID environment variable is missing.');
  }

  const commands = [
    `echo "=== Starting SSM Deployment for ${clientName} ==="`,
    `docker pull ${image}`,
    `docker stop ${clientName.toLowerCase()}-app || true`,
    `docker rm ${clientName.toLowerCase()}-app || true`,
    `docker run -d --name ${clientName.toLowerCase()}-app -p 80:80 -e DOMAIN=${domain} ${image}`,
    `docker ps --filter name=${clientName.toLowerCase()}-app`
  ];

  await logFn(`[AWS SSM] Sending SSM command to instance ${instanceId}...`);
  
  try {
    const sendCommand = new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: commands
      }
    });

    const response = await ssmClient.send(sendCommand);
    const commandId = response.Command.CommandId;
    await logFn(`[AWS SSM] Command sent. CommandId: ${commandId}. Waiting for completion...`);

    // Poll for command completion status
    let status = 'Pending';
    let attempts = 0;
    const maxAttempts = 30; // 30 * 2 seconds = 60s max execution time
    
    while (status === 'Pending' || status === 'InProgress') {
      if (attempts >= maxAttempts) {
        throw new Error('SSM execution timed out.');
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;

      const checkCommand = new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId
      });
      
      const checkRes = await ssmClient.send(checkCommand);
      status = checkRes.Status;
      await logFn(`[AWS SSM] Status: ${status}`);

      if (status === 'Success') {
        await logFn(`[AWS SSM] Execution complete. Standard Output:\n${checkRes.StandardOutputContent}`);
        return true;
      } else if (status === 'Failed' || status === 'TimedOut' || status === 'Cancelled') {
        throw new Error(`SSM Command failed with status: ${status}. Error:\n${checkRes.StandardErrorContent}`);
      }
    }
  } catch (err) {
    await logFn(`[AWS SSM] Deployment failed: ${err.message}`);
    throw err;
  }
}

/**
 * Invokes an AWS Lambda function for post-deployment steps (e.g. configuring Route 53 DNS or SSL certificates).
 */
export async function invokeLambdaSetup(clientName, domain, image, logFn) {
  if (useMock || !lambdaClient) {
    console.log('[AWS Lambda] Using Mock Lambda Invoke');
    return mockLambdaInvoke(clientName, domain, logFn);
  }

  const functionName = process.env.LAMBDA_FUNCTION_NAME || 'post-deployment-setup';
  await logFn(`[AWS Lambda] Invoking function ${functionName}...`);

  try {
    const payload = JSON.stringify({
      clientName,
      domain,
      image,
      timestamp: new Date().toISOString()
    });

    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: new TextEncoder().encode(payload)
    });

    const response = await lambdaClient.send(command);
    const responsePayload = new TextDecoder().decode(response.Payload);
    const parsedPayload = JSON.parse(responsePayload);

    await logFn(`[AWS Lambda] Function executed. Response Payload: ${JSON.stringify(parsedPayload)}`);

    if (response.FunctionError) {
      throw new Error(`Lambda Function Error: ${response.FunctionError}. Details: ${responsePayload}`);
    }

    return parsedPayload;
  } catch (err) {
    await logFn(`[AWS Lambda] Invocation failed: ${err.message}`);
    throw err;
  }
}
