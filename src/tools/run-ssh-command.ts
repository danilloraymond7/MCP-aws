import { z } from "zod";
import { SSHService } from "../services/ssh.service.js";

export const runSSHCommandSchema = z.object({
  ip: z.string().describe("IP Público da Instância EC2 (ex: 100.51.96.77)"),
  username: z.string().default("ubuntu").describe("Usuário SSH (default: ubuntu)"),
  privateKeyPath: z.string().describe("Caminho absoluto para a chave privada SSH (ex: C:/Users/danil/.ssh/appcorekey.pem)"),
  command: z.string().describe("Comando para rodar na instância EC2 via SSH"),
});

export async function handleRunSSHCommand(args: { ip: string; username: string; privateKeyPath: string; command: string }) {
  const service = new SSHService();
  try {
    const result = await service.runCommand(args.ip, args.username, args.privateKeyPath, args.command);
    return {
      content: [
        {
          type: "text",
          text: `=== STDOUT ===\n${result.stdout}\n\n=== STDERR ===\n${result.stderr}\n\nExit Code: ${result.code}`,
        },
      ],
    };
  } catch (error: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Erro ao executar comando SSH: ${error.message}`,
        },
      ],
    };
  }
}
