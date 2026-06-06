import { EC2Client } from "@aws-sdk/client-ec2";
import { IAMClient } from "@aws-sdk/client-iam";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import dotenv from "dotenv";

// Carrega variáveis do .env
dotenv.config();

const region = process.env.AWS_REGION || "us-east-1";

// Configuração padrão que resolve credenciais em ordem:
// 1. Variáveis de ambiente
// 2. ~/.aws/credentials
// 3. IAM Roles / ECS Task Roles
const awsConfig = {
  region,
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
        },
      }
    : {}),
};

export const ec2Client = new EC2Client(awsConfig);
export const iamClient = new IAMClient(awsConfig);
export const lambdaClient = new LambdaClient(awsConfig);
export const schedulerClient = new SchedulerClient(awsConfig);

export function getAwsRegion(): string {
  return region;
}
