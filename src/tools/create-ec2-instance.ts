import { z } from "zod";
import { EC2InstanceService } from "../services/ec2-instance.service.js";

export const createEC2InstanceSchema = z.object({
  name: z.string().describe("Nome amigável da instância EC2 (será a tag Name)"),
  amiId: z.string().describe("ID da AMI de origem (ex: ami-0c55b159cbfafe1f0)"),
  instanceType: z.string().describe("Tipo de instância (ex: t2.micro, t3.small)"),
  keyName: z.string().describe("Nome da chave SSH já cadastrada na AWS"),
  securityGroupIds: z.array(z.string()).describe("Lista de IDs de Security Groups a associar"),
  subnetId: z.string().describe("ID da Subnet correspondente"),
  tags: z.record(z.string()).optional().describe("Tags associadas (Environment, Owner e Project obrigatórios)"),
  userData: z.string().optional().describe("Script de User Data a rodar no primeiro boot (em texto plano)"),
  clientToken: z.string().optional().describe("Token de idempotência único para evitar criações duplicadas"),
});

export async function handleCreateEC2Instance(args: z.infer<typeof createEC2InstanceSchema>) {
  const service = new EC2InstanceService();
  const instanceId = await service.createEC2Instance(args);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ instanceId, message: "Instância EC2 provisionada com sucesso." }, null, 2),
      },
    ],
  };
}
