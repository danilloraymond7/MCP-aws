# Memória do Projeto: Servidor MCP AWS

Este arquivo serve como repositório de contexto e memória técnica de longo prazo para os agentes AI que interagem com esta infraestrutura.

---

## 🔒 Arquitetura de Segurança e Decisões Técnicas

### 1. Princípio do Menor Privilégio (Least Privilege)
- **Bloqueio de Portas Sensíveis**: A tool `create_security_group` impede ativamente o provisionamento de Security Groups com portas de administração e bancos de dados abertas para `0.0.0.0/0`.
- Portas monitoradas e bloqueadas no Ingress público:
  - `22` (SSH)
  - `3389` (RDP)
  - `3306` (MySQL)
  - `5432` (PostgreSQL)
  - `1433` (SQL Server)
  - `27017` (MongoDB)
  - `1521` (Oracle DB)
  - `6379` (Redis)
  - `9200` (Elasticsearch)
- Qualquer tentativa de criar regras públicas para essas portas disparará um erro de validação local **antes** de enviar a requisição à AWS.

### 2. Mecanismo de Idempotência
- **Security Groups**: O servidor realiza um `Describe` filtrando pelo nome do Security Group e pela VPC antes de tentar criá-lo. Se ele já existe, retorna o ID atual imediatamente em vez de falhar ou duplicar.
- **EC2 Instances**: A API `RunInstances` da AWS recebe um `ClientToken`. Caso o usuário não passe o `clientToken` nos parâmetros da tool, o servidor gera um UUID dinâmico baseado em `crypto.randomUUID()`. Se a requisição for repetida com o mesmo token, a AWS reconhece e não cria uma máquina duplicada.
- **Schedules**: A criação de agendamentos no EventBridge Scheduler usa uma estratégia de `upsert`. O servidor faz um `GetSchedule` e, se encontrar o agendamento com o nome configurado, faz um `UpdateSchedule` modificando apenas a expressão cron em vez de lançar um erro.

### 3. Estratégia de Tags Obrigatórias
Para manter o compliance e rastreabilidade da infraestrutura, todos os recursos (EC2 e Security Groups) criados pelo servidor MCP precisam obrigatoriamente conter as seguintes tags de metadados:
- **`Environment`**: Ambiente do recurso (ex: `Production`, `Staging`, `Development`).
- **`Owner`**: Squad, e-mail ou responsável direto pelo recurso.
- **`Project`**: Nome do sistema ou projeto associado.

O servidor adiciona automaticamente em tempo de execução:
- **`ManagedBy`**: Sempre com o valor `mcp-aws-server`.
- **`CreatedAt`**: Data/hora ISO 8601 da criação do recurso.

---

## 🕒 Automating EC2 Power (Scheduler)

A ferramenta `create_ec2_schedule` cria uma automação sem servidores (serverless) na AWS:
1. **IAM Role (`mcp-aws-scheduler-lambda-role`)**: Permissão mínima necessária para invocar a Lambda e para a Lambda interagir com `ec2:StartInstances`/`ec2:StopInstances`.
2. **Lambda Function (`mcp-aws-ec2-power-manager`)**: Uma função simples em NodeJS que recebe `{ action: 'start' | 'stop', instanceId }` e envia o comando respectivo para a API da AWS.
3. **Amazon EventBridge Scheduler**: Agenda execuções cron customizadas ligando e desligando a máquina, de forma nativamente compatível com Timezones (ex: `America/Sao_Paulo`).

---

## 🛠️ Stack Tecnológica
- **Linguagem**: TypeScript com tipagem estrita (`tsconfig.json` configurado com `strict: true`).
- **Padrão de Módulos**: ES Modules (ESM) para suporte nativo e moderno do ecossistema.
- **SDK AWS**: AWS SDK para JavaScript v3 (Modular, carregando apenas os pacotes de clientes utilizados).

---

## 🔍 Resolução de Problemas (Troubleshooting)

### Erro: `typeName` indefinido ao listar tools (`failed to get tools: calling "tools/list"`)
- **Causa**: Os schemas das ferramentas em `src/tools/` estavam definidos como objetos JS simples (`const schema = { vpcId: z.string() }`), em vez de instâncias válidas do Zod (`const schema = z.object({ vpcId: z.string() })`). Ao tentar converter para JSON Schema via `zodToJsonSchema`, ocorria a falha ao acessar `_def.typeName`.
- **Correção**: Todos os schemas de ferramentas foram envolvidos em `z.object(...)` e as tipagens simplificadas para usar `z.infer<typeof schema>` diretamente.
