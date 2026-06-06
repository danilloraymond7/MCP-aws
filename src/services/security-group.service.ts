import {
  DescribeSecurityGroupsCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  AuthorizeSecurityGroupEgressCommand,
  IpPermission,
} from "@aws-sdk/client-ec2";
import { ec2Client } from "../config/aws.js";
import {
  CreateSecurityGroupParams,
  SecurityGroupAnalysis,
  SecurityGroupRuleAnalysis,
} from "../types/index.js";
import { analyzeRuleRisk } from "../utils/risk-analyzer.js";
import { validateTags, formatRecordToTags } from "../utils/tag-validator.js";

const SENSITIVE_PORTS = [22, 3389, 3306, 5432, 1433, 27017, 1521, 6379, 9200];

export class SecurityGroupService {
  async analyzeVpcSecurityGroups(vpcId: string): Promise<SecurityGroupAnalysis[]> {
    const command = new DescribeSecurityGroupsCommand({
      Filters: [{ Name: "vpc-id", Values: [vpcId] }],
    });

    const response = await ec2Client.send(command);
    if (!response.SecurityGroups) return [];

    return response.SecurityGroups.map((sg) => {
      const ingressRules: SecurityGroupRuleAnalysis[] = [];
      const egressRules: SecurityGroupRuleAnalysis[] = [];

      // Mapear regras de entrada
      if (sg.IpPermissions) {
        for (const permission of sg.IpPermissions) {
          const protocol = permission.IpProtocol || "all";
          const fromPort = permission.FromPort;
          const toPort = permission.ToPort;

          if (permission.IpRanges) {
            for (const range of permission.IpRanges) {
              const cidr = range.CidrIp;
              const riskAnalysis = analyzeRuleRisk("ingress", protocol, fromPort, toPort, cidr);
              ingressRules.push({
                protocol,
                fromPort,
                toPort,
                cidr,
                description: range.Description,
                risk: riskAnalysis.risk,
                reason: riskAnalysis.reason,
              });
            }
          }

          if (permission.UserIdGroupPairs) {
            for (const pair of permission.UserIdGroupPairs) {
              ingressRules.push({
                protocol,
                fromPort,
                toPort,
                sourceGroupId: pair.GroupId,
                description: pair.Description,
                risk: "OK",
              });
            }
          }
        }
      }

      // Mapear regras de saída
      if (sg.IpPermissionsEgress) {
        for (const permission of sg.IpPermissionsEgress) {
          const protocol = permission.IpProtocol || "all";
          const fromPort = permission.FromPort;
          const toPort = permission.ToPort;

          if (permission.IpRanges) {
            for (const range of permission.IpRanges) {
              const cidr = range.CidrIp;
              const riskAnalysis = analyzeRuleRisk("egress", protocol, fromPort, toPort, cidr);
              egressRules.push({
                protocol,
                fromPort,
                toPort,
                cidr,
                description: range.Description,
                risk: riskAnalysis.risk,
                reason: riskAnalysis.reason,
              });
            }
          }

          if (permission.UserIdGroupPairs) {
            for (const pair of permission.UserIdGroupPairs) {
              egressRules.push({
                protocol,
                fromPort,
                toPort,
                sourceGroupId: pair.GroupId,
                description: pair.Description,
                risk: "OK",
              });
            }
          }
        }
      }

      return {
        groupId: sg.GroupId || "",
        groupName: sg.GroupName || "",
        description: sg.Description || "",
        vpcId: sg.VpcId || "",
        ingressRules,
        egressRules,
        tags: (sg.Tags || []).map((t) => ({ Key: t.Key || "", Value: t.Value || "" })),
      };
    });
  }

  async createSecurityGroup(params: CreateSecurityGroupParams): Promise<{ groupId: string; existed: boolean }> {
    const formattedTags = formatRecordToTags(params.tags);
    
    // 1. Validação de Tags Obrigatórias
    const compliance = validateTags(formattedTags);
    if (!compliance.compliant) {
      throw new Error(
        `Falha na criação do Security Group: Faltam tags obrigatórias: ${compliance.missingTags.join(", ")}`
      );
    }

    // 2. Prevenção de Regras Ingress Inseguras antes de chamar a AWS
    if (params.ingressRules) {
      for (const rule of params.ingressRules) {
        const isPublicCidr = rule.CidrIp === "0.0.0.0/0" || rule.CidrIp === "::/0";
        if (isPublicCidr) {
          const protocol = rule.IpProtocol || "tcp";
          const fromPort = rule.FromPort;
          const toPort = rule.ToPort;

          // Se protocolo for "all" (-1)
          if (protocol === "-1" || protocol.toLowerCase() === "all") {
            throw new Error(
              "Erro de Segurança (Princípio de Menor Privilégio): É proibido abrir todo o tráfego de entrada para 0.0.0.0/0."
            );
          }

          if (fromPort !== undefined && toPort !== undefined) {
            for (const p of SENSITIVE_PORTS) {
              if (p >= fromPort && p <= toPort) {
                throw new Error(
                  `Erro de Segurança (Princípio de Menor Privilégio): É proibido expor a porta sensível ${p} para a Internet pública (0.0.0.0/0).`
                );
              }
            }
          }
        }
      }
    }

    // 3. Idempotência: Verificar se SG com mesmo nome já existe na VPC
    const checkCommand = new DescribeSecurityGroupsCommand({
      Filters: [
        { Name: "group-name", Values: [params.name] },
        { Name: "vpc-id", Values: [params.vpcId] },
      ],
    });

    try {
      const checkRes = await ec2Client.send(checkCommand);
      if (checkRes.SecurityGroups && checkRes.SecurityGroups.length > 0) {
        return {
          groupId: checkRes.SecurityGroups[0].GroupId || "",
          existed: true,
        };
      }
    } catch (err) {
      // Ignorar erros de busca se não encontrar nada
    }

    // 4. Criação do Security Group
    const createCommand = new CreateSecurityGroupCommand({
      GroupName: params.name,
      Description: params.description,
      VpcId: params.vpcId,
      TagSpecifications: [
        {
          ResourceType: "security-group",
          Tags: [
            ...formattedTags,
            { Key: "ManagedBy", Value: "mcp-aws-server" },
            { Key: "CreatedAt", Value: new Date().toISOString() },
          ],
        },
      ],
    });

    const createRes = await ec2Client.send(createCommand);
    const groupId = createRes.GroupId;
    if (!groupId) {
      throw new Error("Erro desconhecido: ID do Security Group não retornado.");
    }

    // 5. Adicionar Regras Ingress
    if (params.ingressRules && params.ingressRules.length > 0) {
      const ipPermissions: IpPermission[] = params.ingressRules.map((rule) => ({
        IpProtocol: rule.IpProtocol,
        FromPort: rule.FromPort,
        ToPort: rule.ToPort,
        IpRanges: rule.CidrIp ? [{ CidrIp: rule.CidrIp, Description: rule.Description }] : undefined,
        UserIdGroupPairs: rule.GroupId ? [{ GroupId: rule.GroupId, Description: rule.Description }] : undefined,
      }));

      await ec2Client.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: groupId,
          IpPermissions: ipPermissions,
        })
      );
    }

    // 6. Adicionar Regras Egress (Nota: Por padrão, a AWS cria SGs com egress liberado para 0.0.0.0/0).
    // Se o usuário especificou egress customizado, aplicamos aqui.
    if (params.egressRules && params.egressRules.length > 0) {
      const ipPermissions: IpPermission[] = params.egressRules.map((rule) => ({
        IpProtocol: rule.IpProtocol,
        FromPort: rule.FromPort,
        ToPort: rule.ToPort,
        IpRanges: rule.CidrIp ? [{ CidrIp: rule.CidrIp, Description: rule.Description }] : undefined,
        UserIdGroupPairs: rule.GroupId ? [{ GroupId: rule.GroupId, Description: rule.Description }] : undefined,
      }));

      await ec2Client.send(
        new AuthorizeSecurityGroupEgressCommand({
          GroupId: groupId,
          IpPermissions: ipPermissions,
        })
      );
    }

    return { groupId, existed: false };
  }
}
