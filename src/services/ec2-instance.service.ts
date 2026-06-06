import {
  DescribeInstancesCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
  DescribeKeyPairsCommand,
  DescribeSecurityGroupsCommand,
  waitUntilInstanceRunning,
  waitUntilInstanceStopped,
} from "@aws-sdk/client-ec2";
import { ec2Client } from "../config/aws.js";
import { CreateEC2InstanceParams, EC2InstanceAnalysis } from "../types/index.js";
import { validateTags, formatRecordToTags } from "../utils/tag-validator.js";

export class EC2InstanceService {
  async analyzeEC2Instances(requiredTags?: string[]): Promise<EC2InstanceAnalysis[]> {
    const command = new DescribeInstancesCommand({});
    const response = await ec2Client.send(command);

    const instances: EC2InstanceAnalysis[] = [];
    if (!response.Reservations) return [];

    for (const reservation of response.Reservations) {
      if (!reservation.Instances) continue;

      for (const inst of reservation.Instances) {
        const tags = (inst.Tags || []).map((t) => ({ Key: t.Key || "", Value: t.Value || "" }));
        const nameTag = tags.find((t) => t.Key === "Name");
        const name = nameTag ? nameTag.Value : "Unnamed Instance";

        const compliance = validateTags(tags);

        instances.push({
          instanceId: inst.InstanceId || "",
          name,
          state: inst.State?.Name || "unknown",
          instanceType: inst.InstanceType || "",
          publicIp: inst.PublicIpAddress,
          privateIp: inst.PrivateIpAddress,
          vpcId: inst.VpcId,
          subnetId: inst.SubnetId,
          keyName: inst.KeyName,
          launchTime: inst.LaunchTime ? inst.LaunchTime.toISOString() : undefined,
          securityGroups: (inst.SecurityGroups || []).map((sg) => ({
            groupId: sg.GroupId || "",
            groupName: sg.GroupName || "",
          })),
          tags,
          tagCompliance: compliance,
        });
      }
    }

    return instances;
  }

  async createEC2Instance(params: CreateEC2InstanceParams): Promise<string> {
    const formattedTags = formatRecordToTags(params.tags);
    
    // 1. Validar Tags obrigatórias
    const compliance = validateTags(formattedTags);
    if (!compliance.compliant) {
      throw new Error(
        `Falha no provisionamento EC2: Faltam tags obrigatórias: ${compliance.missingTags.join(", ")}`
      );
    }

    // 2. Validar se a SSH Key existe
    try {
      await ec2Client.send(
        new DescribeKeyPairsCommand({
          KeyNames: [params.keyName],
        })
      );
    } catch (err) {
      throw new Error(`Falha no provisionamento: A chave SSH '${params.keyName}' não existe na região.`);
    }

    // 3. Validar se os SGs existem
    try {
      await ec2Client.send(
        new DescribeSecurityGroupsCommand({
          GroupIds: params.securityGroupIds,
        })
      );
    } catch (err) {
      throw new Error(
        `Falha no provisionamento: Um ou mais Security Groups fornecidos não existem: ${params.securityGroupIds.join(", ")}`
      );
    }

    // 4. Determinar Token de Idempotência
    const clientToken = params.clientToken || crypto.randomUUID();

    // 5. Executar criação da Instância
    const command = new RunInstancesCommand({
      ImageId: params.amiId,
      InstanceType: params.instanceType as any, // Conversão segura para o enum interno da SDK
      KeyName: params.keyName,
      SecurityGroupIds: params.securityGroupIds,
      SubnetId: params.subnetId,
      MinCount: 1,
      MaxCount: 1,
      ClientToken: clientToken,
      UserData: params.userData ? Buffer.from(params.userData).toString("base64") : undefined,
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [
            ...formattedTags,
            { Key: "Name", Value: params.name },
            { Key: "ManagedBy", Value: "mcp-aws-server" },
            { Key: "CreatedAt", Value: new Date().toISOString() },
          ],
        },
      ],
    });

    const response = await ec2Client.send(command);
    const instanceId = response.Instances?.[0]?.InstanceId;

    if (!instanceId) {
      throw new Error("Erro desconhecido: Instância ID não foi retornado pela AWS.");
    }

    return instanceId;
  }

  async manageEC2Instance(
    instanceId: string,
    action: "start" | "stop" | "reboot"
  ): Promise<{ previousState: string; currentState: string; publicIp?: string }> {
    // 1. Obter estado atual
    const descCommand = new DescribeInstancesCommand({ InstanceIds: [instanceId] });
    const descRes = await ec2Client.send(descCommand);
    const inst = descRes.Reservations?.[0]?.Instances?.[0];

    if (!inst) {
      throw new Error(`Instância ${instanceId} não encontrada.`);
    }

    const previousState = inst.State?.Name || "unknown";

    if (action === "start") {
      if (previousState === "running") {
        return { previousState, currentState: "running", publicIp: inst.PublicIpAddress };
      }

      await ec2Client.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
      
      // Aguardar até que a máquina esteja rodando
      await waitUntilInstanceRunning(
        { client: ec2Client, maxWaitTime: 120 },
        { InstanceIds: [instanceId] }
      );

      // Obter informações atualizadas (IP público)
      const updatedDesc = await ec2Client.send(descCommand);
      const updatedInst = updatedDesc.Reservations?.[0]?.Instances?.[0];

      return {
        previousState,
        currentState: "running",
        publicIp: updatedInst?.PublicIpAddress,
      };
    } else if (action === "stop") {
      if (previousState === "stopped") {
        return { previousState, currentState: "stopped" };
      }

      await ec2Client.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));

      // Aguardar desligar
      await waitUntilInstanceStopped(
        { client: ec2Client, maxWaitTime: 120 },
        { InstanceIds: [instanceId] }
      );

      return {
        previousState,
        currentState: "stopped",
      };
    } else {
      // Reboot
      await ec2Client.send(new RebootInstancesCommand({ InstanceIds: [instanceId] }));
      return {
        previousState,
        currentState: "rebooting (requested)",
      };
    }
  }
}
