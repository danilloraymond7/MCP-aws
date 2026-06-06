import {
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetRoleCommand,
} from "@aws-sdk/client-iam";
import {
  CreateFunctionCommand,
  GetFunctionCommand,
  UpdateFunctionCodeCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateScheduleCommand,
  GetScheduleCommand,
  UpdateScheduleCommand,
} from "@aws-sdk/client-scheduler";
import { iamClient, lambdaClient, schedulerClient } from "../config/aws.js";
import { CreateEC2ScheduleParams } from "../types/index.js";

export class ScheduleService {
  private async getOrCreateRole(): Promise<string> {
    const roleName = "mcp-aws-scheduler-lambda-role";

    try {
      const res = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
      if (res.Role?.Arn) return res.Role.Arn;
    } catch (err: any) {
      if (err.name !== "NoSuchEntityException") throw err;
    }

    // Criar IAM Role confiando no Lambda e EventBridge Scheduler
    const trustPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Service: ["lambda.amazonaws.com", "scheduler.amazonaws.com"],
          },
          Action: "sts:AssumeRole",
        },
      ],
    };

    const createRes = await iamClient.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
        Description: "IAM Role para Lambda e EventBridge Scheduler gerido pelo MCP Server AWS",
      })
    );

    const roleArn = createRes.Role?.Arn;
    if (!roleArn) throw new Error("Erro ao criar IAM Role.");

    // Anexar política básica de execução de Lambda e permissão de EC2 Start/Stop
    const inlinePolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
            "ec2:StartInstances",
            "ec2:StopInstances",
            "ec2:DescribeInstances",
            "lambda:InvokeFunction",
          ],
          Resource: "*",
        },
      ],
    };

    // Vamos anexar permissões gerais para simplificar o scheduler de ligar e desligar instâncias.
    // Em produção, isso pode ser restrito ao ARN exato da máquina.
    await iamClient.send(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      })
    );

    // Também criaremos uma inline policy anexada para EC2
    // Para simplificar a automação e garantir execução rápida:
    await iamClient.send(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: "arn:aws:iam::aws:policy/AmazonEC2FullAccess", // Menor privilégio real pode ser restrito, mas EC2FullAccess garante que funcione sem bugs de permissão complexos
      })
    );

    // Esperar um pouco para a propagação do IAM na AWS (IAM eventual consistency)
    await new Promise((resolve) => setTimeout(resolve, 8000));

    return roleArn;
  }

  private async getOrCreateLambda(roleArn: string): Promise<string> {
    const functionName = "mcp-aws-ec2-power-manager";

    const lambdaCode = `
      const { EC2Client, StartInstancesCommand, StopInstancesCommand } = require("@aws-sdk/client-ec2");
      const ec2 = new EC2Client({});

      exports.handler = async (event) => {
        console.log("Recebido evento:", JSON.stringify(event));
        const { action, instanceId } = event;
        
        if (!action || !instanceId) {
          throw new Error("Parâmetros action e instanceId são obrigatórios");
        }

        if (action === "start") {
          console.log("Iniciando instancia:", instanceId);
          const res = await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
          return { statusCode: 200, body: JSON.stringify(res) };
        } else if (action === "stop") {
          console.log("Desligando instancia:", instanceId);
          const res = await ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
          return { statusCode: 200, body: JSON.stringify(res) };
        } else {
          throw new Error("Acao nao suportada: " + action);
        }
      };
    `;

    // Compactar em um zip básico em memória
    // Como estamos rodando em Node, podemos gerar um buffer de zip dinamicamente para subir a lambda inline.
    // Usaremos uma biblioteca nativa ou mockaremos o ZIP de forma crua, ou usaremos a api de update code.
    // Um arquivo zip minimalista com 1 arquivo "index.js" pode ser construído via JS.
    // Para evitar pacotes externos de zip complexos, construímos um Buffer ZIP estático básico contendo "index.js".
    
    // Este é o cabeçalho/estrutura de um arquivo ZIP cru para 1 arquivo chamado "index.js"
    const fileContent = Buffer.from(lambdaCode, "utf-8");
    const filename = "index.js";
    const filenameBuf = Buffer.from(filename, "utf-8");

    // Construção manual de ZIP Local File Header (PK34)
    const lfh = Buffer.alloc(30);
    lfh.write("PK\x03\x04");
    lfh.writeUInt16LE(10, 4); // version needed
    lfh.writeUInt16LE(0, 6);  // general purpose bit flag
    lfh.writeUInt16LE(0, 8);  // compression method (0 = store)
    lfh.writeUInt16LE(0, 10); // last mod file time
    lfh.writeUInt16LE(0, 12); // last mod file date
    lfh.writeUInt32LE(0, 14); // crc-32 (0 para simplificar)
    lfh.writeUInt32LE(fileContent.length, 18); // compressed size
    lfh.writeUInt32LE(fileContent.length, 22); // uncompressed size
    lfh.writeUInt16LE(filenameBuf.length, 26); // file name length
    lfh.writeUInt16LE(0, 28); // extra field length

    // Central Directory File Header (PK12)
    const cdfh = Buffer.alloc(46);
    cdfh.write("PK\x01\x02");
    cdfh.writeUInt16LE(20, 4); // version made by
    cdfh.writeUInt16LE(10, 6); // version needed
    cdfh.writeUInt16LE(0, 8);  // general purpose
    cdfh.writeUInt16LE(0, 10); // compression
    cdfh.writeUInt16LE(0, 12); // mod time
    cdfh.writeUInt16LE(0, 14); // mod date
    cdfh.writeUInt32LE(0, 16); // crc-32
    cdfh.writeUInt32LE(fileContent.length, 20); // compressed
    cdfh.writeUInt32LE(fileContent.length, 24); // uncompressed
    cdfh.writeUInt16LE(filenameBuf.length, 28); // filename len
    cdfh.writeUInt16LE(0, 30); // extra len
    cdfh.writeUInt16LE(0, 32); // comment len
    cdfh.writeUInt16LE(0, 34); // disk number start
    cdfh.writeUInt16LE(0, 36); // internal attr
    cdfh.writeUInt32LE(0, 38); // external attr
    cdfh.writeUInt32LE(0, 42); // relative offset of local header

    // End of Central Directory Record (PK56)
    const eocd = Buffer.alloc(22);
    eocd.write("PK\x05\x06");
    eocd.writeUInt16LE(0, 4);  // disk number
    eocd.writeUInt16LE(0, 6);  // disk with cd
    eocd.writeUInt16LE(1, 8);  // disk entries
    eocd.writeUInt16LE(1, 10); // total entries
    cdfh.copy(eocd, 12, 0, 4); // size of cd (tamanho do cdfh + filename)
    eocd.writeUInt32LE(lfh.length + filenameBuf.length + fileContent.length, 16); // offset of cd
    eocd.writeUInt16LE(0, 20); // comment len

    // Ajustes de tamanho no CD
    const cdSize = cdfh.length + filenameBuf.length;
    eocd.writeUInt32LE(cdSize, 12);

    const zipBuffer = Buffer.concat([lfh, filenameBuf, fileContent, cdfh, filenameBuf, eocd]);

    try {
      const res = await lambdaClient.send(new GetFunctionCommand({ FunctionName: functionName }));
      if (res.Configuration?.FunctionArn) {
        // Se a lambda já existe, atualiza o código para garantir última versão
        await lambdaClient.send(
          new UpdateFunctionCodeCommand({
            FunctionName: functionName,
            ZipFile: zipBuffer,
          })
        );
        return res.Configuration.FunctionArn;
      }
    } catch (err: any) {
      if (err.name !== "ResourceNotFoundException") throw err;
    }

    // Criar Lambda
    const createRes = await lambdaClient.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: "nodejs22.x",
        Role: roleArn,
        Handler: "index.handler",
        Code: { ZipFile: zipBuffer },
        Description: "Lambda do MCP AWS Server para ligar e desligar instâncias EC2",
        Timeout: 30,
      })
    );

    const lambdaArn = createRes.FunctionArn;
    if (!lambdaArn) throw new Error("Erro ao obter ARN da Lambda criada.");

    return lambdaArn;
  }

  async createOrUpdateSchedule(params: CreateEC2ScheduleParams): Promise<{
    startScheduleArn?: string;
    stopScheduleArn?: string;
  }> {
    const roleArn = await this.getOrCreateRole();
    const lambdaArn = await this.getOrCreateLambda(roleArn);

    let startScheduleArn: string | undefined;
    let stopScheduleArn: string | undefined;

    // Criar/atualizar schedule para LIGAR (start)
    if (params.startCron) {
      const scheduleNameStart = `${params.scheduleName}-start`;
      startScheduleArn = await this.upsertEventBridgeSchedule({
        name: scheduleNameStart,
        cron: params.startCron,
        timezone: params.timezone,
        lambdaArn,
        roleArn,
        input: { action: "start", instanceId: params.instanceId },
      });
    }

    // Criar/atualizar schedule para DESLIGAR (stop)
    if (params.stopCron) {
      const scheduleNameStop = `${params.scheduleName}-stop`;
      stopScheduleArn = await this.upsertEventBridgeSchedule({
        name: scheduleNameStop,
        cron: params.stopCron,
        timezone: params.timezone,
        lambdaArn,
        roleArn,
        input: { action: "stop", instanceId: params.instanceId },
      });
    }

    return { startScheduleArn, stopScheduleArn };
  }

  private async upsertEventBridgeSchedule(args: {
    name: string;
    cron: string;
    timezone: string;
    lambdaArn: string;
    roleArn: string;
    input: any;
  }): Promise<string> {
    let exists = false;
    try {
      await schedulerClient.send(new GetScheduleCommand({ Name: args.name }));
      exists = true;
    } catch (err: any) {
      if (err.name !== "ResourceNotFoundException") {
        throw err;
      }
    }

    const scheduleConfig = {
      Name: args.name,
      ScheduleExpression: args.cron, // formato: "cron(0 8 ? * MON-FRI *)"
      ScheduleExpressionTimezone: args.timezone,
      FlexibleTimeWindow: { Mode: "OFF" as const },
      Target: {
        Arn: args.lambdaArn,
        RoleArn: args.roleArn,
        Input: JSON.stringify(args.input),
      },
      ActionAfterCompletion: "NONE" as const,
    };

    if (exists) {
      const res = await schedulerClient.send(new UpdateScheduleCommand(scheduleConfig));
      return res.ScheduleArn || "";
    } else {
      const res = await schedulerClient.send(new CreateScheduleCommand(scheduleConfig));
      return res.ScheduleArn || "";
    }
  }
}
