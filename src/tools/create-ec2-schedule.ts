import { z } from "zod";
import { ScheduleService } from "../services/schedule.service.js";

export const createEC2ScheduleSchema = z.object({
  instanceId: z.string().describe("ID da Instância EC2 que será ligada ou desligada (ex: i-0123456789abcdef0)"),
  startCron: z.string().optional().describe("Cron da AWS para ligar a máquina. Formato: 'cron(min hora dia-mes mes dia-semana ano)'. Exemplo dias úteis 8h da manhã: 'cron(0 8 ? * MON-FRI *)'"),
  stopCron: z.string().optional().describe("Cron da AWS para desligar a máquina. Formato: 'cron(min hora dia-mes mes dia-semana ano)'. Exemplo dias úteis 20h da noite: 'cron(0 20 ? * MON-FRI *)'"),
  timezone: z.string().describe("Timezone para avaliação do cron. Exemplo: 'America/Sao_Paulo'"),
  scheduleName: z.string().describe("Nome amigável único para o agendamento (será concatenado com -start e -stop)"),
});

export async function handleCreateEC2Schedule(args: {
  instanceId: string;
  startCron?: string;
  stopCron?: string;
  timezone: string;
  scheduleName: string;
}) {
  const service = new ScheduleService();
  const result = await service.createOrUpdateSchedule(args);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            ...result,
            message: "Agendamentos criados ou atualizados com sucesso via EventBridge Scheduler.",
          },
          null,
          2
        ),
      },
    ],
  };
}
