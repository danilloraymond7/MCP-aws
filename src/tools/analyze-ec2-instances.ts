import { z } from "zod";
import { EC2InstanceService } from "../services/ec2-instance.service.js";

export const analyzeEC2InstancesSchema = z.object({
  requiredTags: z.array(z.string()).optional().describe("Lista de tags adicionais para auditoria (default: Environment, Owner, Project)"),
});

export async function handleAnalyzeEC2Instances(args: { requiredTags?: string[] }) {
  const service = new EC2InstanceService();
  const result = await service.analyzeEC2Instances(args.requiredTags);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
