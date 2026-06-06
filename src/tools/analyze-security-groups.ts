import { z } from "zod";
import { SecurityGroupService } from "../services/security-group.service.js";

export const analyzeSecurityGroupsSchema = z.object({
  vpcId: z.string().describe("O ID da VPC onde buscar os Security Groups."),
});

export async function handleAnalyzeSecurityGroups(args: { vpcId: string }) {
  const service = new SecurityGroupService();
  const analysis = await service.analyzeVpcSecurityGroups(args.vpcId);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(analysis, null, 2),
      },
    ],
  };
}
