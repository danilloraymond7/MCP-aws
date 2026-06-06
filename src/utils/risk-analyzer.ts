import { SecurityGroupRuleAnalysis } from "../types/index.js";

const SENSITIVE_PORTS = {
  22: "SSH",
  3389: "RDP",
  3306: "MySQL",
  5432: "PostgreSQL",
  1433: "SQL Server",
  27017: "MongoDB",
  1521: "Oracle DB",
  6379: "Redis",
  9200: "Elasticsearch",
};

export function analyzeRuleRisk(
  direction: "ingress" | "egress",
  protocol: string,
  fromPort?: number,
  toPort?: number,
  cidr?: string
): { risk: SecurityGroupRuleAnalysis["risk"]; reason?: string } {
  // Egress aberto padrão é comum, mas vale pontuar
  if (direction === "egress") {
    if (cidr === "0.0.0.0/0" || cidr === "::/0") {
      return { risk: "OK" }; // Geralmente aceitável para saída
    }
    return { risk: "OK" };
  }

  // CIDR aberto para o mundo inteiro
  const isPublicCidr = cidr === "0.0.0.0/0" || cidr === "::/0";

  if (isPublicCidr) {
    // Caso de protocolo "all" (-1) aberto para o mundo
    if (protocol === "-1" || protocol.toLowerCase() === "all") {
      return {
        risk: "CRITICAL",
        reason: "Todo tráfego de entrada (-1) está aberto para a Internet pública (0.0.0.0/0).",
      };
    }

    // Se de/para portas indefinidos (ex: all TCP/UDP)
    if (fromPort === undefined || toPort === undefined) {
      return {
        risk: "HIGH",
        reason: `Todo tráfego do protocolo ${protocol} está aberto para a Internet pública (0.0.0.0/0).`,
      };
    }

    // Portas sensíveis individuais ou dentro de um range
    for (const [portStr, serviceName] of Object.entries(SENSITIVE_PORTS)) {
      const port = parseInt(portStr, 10);
      if (port >= fromPort && port <= toPort) {
        return {
          risk: "CRITICAL",
          reason: `Porta sensível ${port} (${serviceName}) está aberta para a Internet pública (0.0.0.0/0).`,
        };
      }
    }

    // Range amplo de portas aberto (> 100 portas)
    if (toPort - fromPort > 100) {
      return {
        risk: "HIGH",
        reason: `Range amplo de portas (${fromPort}-${toPort}) aberto para a Internet pública (0.0.0.0/0).`,
      };
    }

    // Portas não críticas abertas para o público (ex: 80, 443)
    return {
      risk: "MEDIUM",
      reason: `Porta ${fromPort === toPort ? fromPort : `${fromPort}-${toPort}`} aberta para a Internet pública (0.0.0.0/0).`,
    };
  }

  // Se for uma rede restrita ou subrede específica
  return { risk: "OK" };
}
