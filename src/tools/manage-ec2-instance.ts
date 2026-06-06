import { z } from "zod";
import { EC2InstanceService } from "../services/ec2-instance.service.js";

export const manageEC2InstanceSchema = z.object({
  instanceId: z.string().describe("ID da Instância EC2 (ex: i-0123456789abcdef0)"),
  action: z.enum(["start", "stop", "reboot"]).describe("Ação a realizar: start (liga), stop (desliga) ou reboot (reinicia)"),
});

export async function handleManageEC2Instance(args: { instanceId: string; action: "start" | "stop" | "reboot" }) {
  const service = new EC2InstanceService();
  const result = await service.manageEC2Instance(args.instanceId, args.action);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
