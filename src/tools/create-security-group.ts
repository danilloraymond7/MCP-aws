import { z } from "zod";
import { SecurityGroupService } from "../services/security-group.service.js";

const ruleSchema = z.object({
  IpProtocol: z.string().describe("Protocolo (ex: tcp, udp, icmp, -1 para todos)"),
  FromPort: z.number().optional().describe("Porta inicial (ex: 80)"),
  ToPort: z.number().optional().describe("Porta final (ex: 80)"),
  CidrIp: z.string().optional().describe("CIDR de origem (ex: 192.168.1.0/24)"),
  GroupId: z.string().optional().describe("ID do Security Group de origem"),
  Description: z.string().optional().describe("Descrição amigável da regra"),
});

export const createSecurityGroupSchema = z.object({
  name: z.string().describe("Nome do Security Group"),
  description: z.string().describe("Descrição do Security Group"),
  vpcId: z.string().describe("ID da VPC correspondente"),
  ingressRules: z.array(ruleSchema).optional().describe("Regras de entrada"),
  egressRules: z.array(ruleSchema).optional().describe("Regras de saída"),
  tags: z.record(z.string()).optional().describe("Tags do recurso (Environment, Owner e Project obrigatórios)"),
});

export async function handleCreateSecurityGroup(args: z.infer<typeof createSecurityGroupSchema>) {
  const service = new SecurityGroupService();
  const result = await service.createSecurityGroup(args);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
