import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";

// Importar schemas e handlers das tools
import {
  analyzeSecurityGroupsSchema,
  handleAnalyzeSecurityGroups,
} from "./tools/analyze-security-groups.js";
import {
  createSecurityGroupSchema,
  handleCreateSecurityGroup,
} from "./tools/create-security-group.js";
import {
  analyzeEC2InstancesSchema,
  handleAnalyzeEC2Instances,
} from "./tools/analyze-ec2-instances.js";
import {
  createEC2InstanceSchema,
  handleCreateEC2Instance,
} from "./tools/create-ec2-instance.js";
import {
  manageEC2InstanceSchema,
  handleManageEC2Instance,
} from "./tools/manage-ec2-instance.js";
import {
  createEC2ScheduleSchema,
  handleCreateEC2Schedule,
} from "./tools/create-ec2-schedule.js";

// Inicializar Servidor MCP
const server = new Server(
  {
    name: "mcp-aws-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Mapeamento de Tools registradas
const tools = {
  analyze_security_groups: {
    description: "Inspeciona Security Groups existentes em uma VPC e classifica riscos de segurança (regras sensíveis abertas para 0.0.0.0/0).",
    schema: analyzeSecurityGroupsSchema,
    handler: handleAnalyzeSecurityGroups,
  },
  create_security_group: {
    description: "Cria um novo Security Group com validações de menor privilégio e tags obrigatórias.",
    schema: createSecurityGroupSchema,
    handler: handleCreateSecurityGroup,
  },
  analyze_ec2_instances: {
    description: "Lista instâncias EC2 avaliando seu status, IP público/privado, SGs associados e conformidade de tags obrigatórias.",
    schema: analyzeEC2InstancesSchema,
    handler: handleAnalyzeEC2Instances,
  },
  create_ec2_instance: {
    description: "Provisiona uma nova instância EC2 com tags obrigatórias, verificação de chave SSH e SGs existentes, e token de idempotência.",
    schema: createEC2InstanceSchema,
    handler: handleCreateEC2Instance,
  },
  manage_ec2_instance: {
    description: "Ligue (start), Desligue (stop) ou Reinicie (reboot) uma instância EC2 aguardando a transição de estado.",
    schema: manageEC2InstanceSchema,
    handler: handleManageEC2Instance,
  },
  create_ec2_schedule: {
    description: "Cria ou atualiza um agendamento EventBridge Scheduler + Lambda para ligar e desligar uma máquina EC2 no cron especificado.",
    schema: createEC2ScheduleSchema,
    handler: handleCreateEC2Schedule,
  },
};

// Registrar ListTools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.entries(tools).map(([name, tool]) => {
      const rawSchema = zodToJsonSchema(tool.schema as any);
      // O SDK do MCP valida estritamente a estrutura do inputSchema (precisa ser do tipo 'object').
      // zodToJsonSchema adiciona propriedades adicionais ou uma assinatura não-plana que pode conter getters/symbols
      // (como $schema ou typeName de versões do Zod). Criamos um objeto limpo e plano.
      const cleanSchema = {
        type: "object",
        properties: (rawSchema as any).properties || {},
        required: (rawSchema as any).required || [],
      };
      
      return {
        name,
        description: tool.description,
        inputSchema: cleanSchema,
      };
    }),
  };
});

// Registrar CallTool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!name || !(name in tools)) {
    throw new Error(`Tool ${name} não encontrada.`);
  }

  const tool = tools[name as keyof typeof tools];

  try {
    // Validar argumentos usando Zod
    const validatedArgs = (tool.schema as any).parse(args);
    return await tool.handler(validatedArgs);
  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Erro ao executar ${name}: ${err.message}`,
        },
      ],
    };
  }
});

// Inicializar transporte STDIO
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Servidor MCP AWS rodando em modo STDIO");
}

run().catch((error) => {
  console.error("Erro fatal ao iniciar servidor MCP AWS:", error);
  process.exit(1);
});
