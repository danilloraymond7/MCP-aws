import { NodeSSH } from "node-ssh";
import fs from "fs";

export class SSHService {
  async runCommand(ip: string, username: string, privateKeyPath: string, command: string) {
    if (!fs.existsSync(privateKeyPath)) {
      throw new Error(`Chave privada não encontrada no caminho: ${privateKeyPath}`);
    }

    const ssh = new NodeSSH();
    
    try {
      await ssh.connect({
        host: ip,
        username: username,
        privateKeyPath: privateKeyPath,
      });

      const result = await ssh.execCommand(command);
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code
      };
    } finally {
      ssh.dispose();
    }
  }
}
