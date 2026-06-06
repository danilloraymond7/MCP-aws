# 🌩️ MCP Server AWS — EC2, Security Groups & Scheduling

Um servidor robusto e seguro de **Model Context Protocol (MCP)** desenvolvido em **TypeScript** e **AWS SDK v3**. Ele fornece ferramentas integradas para auditoria, provisionamento e automação de instâncias EC2 e regras de Security Groups seguindo preceitos rígidos de **SaaS, Clean Architecture e Security-First**.

---

## 🛠️ Tecnologias Utilizadas
* **Runtime:** Node.js (v18+) & TypeScript (Strict Mode)
* **SDK:** `@aws-sdk/client-ec2`, `@aws-sdk/client-iam`, `@aws-sdk/client-lambda`, `@aws-sdk/client-scheduler`
* **Protocolo:** `@modelcontextprotocol/sdk` (STDIO Transport)
* **Validação:** Zod & Zod-to-JSON-Schema

---

## 🚀 Como Executar

### 1. Instalação de Dependências
Clone o repositório e instale os pacotes necessários:
```bash
npm install
```

### 2. Configurações de Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto (use o `.env.example` como base):
```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=SUA_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=SUA_SECRET_KEY
```

### 3. Scripts Disponíveis
* **Desenvolvimento (Auto-Reload):**
  ```bash
  npm run dev
  ```
* **Compilação TypeScript:**
  ```bash
  npm run build
  ```
* **Executar em Produção:**
  ```bash
  npm start
  ```

---

## 🔌 Configuração no Cliente MCP (ex: Claude Desktop / cursor)
Adicione as configurações do servidor no seu arquivo `mcp_config.json`:

```json
{
  "mcpServers": {
    "mcp-aws": {
      "command": "node",
      "args": [
        "c:/Users/danil/OneDrive/Documentos/GitHub/appcoreflow/mcp-aws/dist/index.js"
      ],
      "env": {
        "AWS_REGION": "us-east-1",
        "AWS_ACCESS_KEY_ID": "SUA_ACCESS_KEY",
        "AWS_SECRET_ACCESS_KEY": "SUA_SECRET_KEY"
      }
    }
  }
}
```

---

## 🛡️ Ferramentas Expostas (MCP Tools)

### 1. `analyze_security_groups`
Busca e audita regras de entrada e saída em Security Groups de uma VPC específica.
* **Input:** `vpcId` (string)
* **Comportamento:** Classifica o risco das regras de entrada e saída. Portas sensíveis (`22`, `3306`, `5432`, `1433`, `3389`, etc.) abertas para `0.0.0.0/0` são marcadas com risco **HIGH** ou **MEDIUM**.

### 2. `create_security_group`
Provisiona um novo Security Group com políticas restritivas aplicadas antes do envio à AWS.
* **Inputs:** `name`, `description`, `vpcId`, `tags` (record), `ingressRules` (opcional), `egressRules` (opcional).
* **Bloqueio Prévio:** Se houver regras de entrada que tentem expor portas administrativas/sensíveis para a internet pública (`0.0.0.0/0`), a requisição falha localmente sem consumir custos ou API AWS.
* **Validação de Tags:** Exige tags corporativas padronizadas.

### 3. `analyze_ec2_instances`
Lista as instâncias EC2 da região ativa e extrai informações detalhadas.
* **Outputs:** Estado, IPs públicos/privados, VPC e Subnet IDs, KeyPair associado e conformidade de tags obrigatórias (`Environment`, `Owner`, `Project`).

### 4. `create_ec2_instance`
Provisiona uma nova máquina virtual EC2.
* **Inputs:** `imageId` (AMI), `instanceType`, `keyName`, `securityGroupIds` (array), `subnetId`, `tags` (record), `clientToken` (opcional).
* **Segurança:** O servidor valida a existência das tags corporativas e do Security Group antes de solicitar a criação.
* **Idempotência:** Suporta o uso de `clientToken` para evitar criação duplicada em falhas de timeout de rede.

### 5. `manage_ec2_instance`
Gerencia o estado de energia das máquinas EC2 de forma determinística.
* **Inputs:** `instanceId`, `action` (`start` | `stop` | `reboot`).
* **Comportamento:** A ferramenta bloqueia o retorno até que o estado de transição da instância termine (ex: aguarda passar de `stopping` para `stopped`).

### 6. `create_ec2_schedule`
Configura automações timezone-aware de liga/desliga de servidores baseados em expressões Cron.
* **Inputs:** `instanceId`, `cronExpressionStart`, `cronExpressionStop`, `timezone`.
* **Fluxo:** Cria a infraestrutura necessária (Scheduler EventBridge + Lambda) na AWS para automatizar o controle térmico de custos.

---

## ⚙️ Regras de Arquitetura e SaaS-First
1. **Clean Architecture:** Camada de infraestrutura do protocolo MCP (`src/index.ts`) isolada de serviços (`src/services/*`) e regras de validação.
2. **Segurança de Menor Privilégio:** Todas as ferramentas validam permissões e previnem configurações inseguras em nível de aplicação.
3. **Idempotência:** Ações críticas de escrita (`create_ec2_instance`, `create_security_group`) contêm validações ou tokens únicos para evitar duplicações.
4. **Sem Tipagens `any`:** Strict TypeScript aplicado em 100% da base do código.

---

Para detalhes avançados sobre o design do sistema e implementações de infraestrutura da AWS, consulte o arquivo [MEMORIA.md](./MEMORIA.md).
