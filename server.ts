/**
 * Servidor Node persistente: Next.js (App Router) + Socket.IO no mesmo processo/porta,
 * mais o agendador de jobs (métricas, propostas, publicação agendada, sincronização do catálogo).
 */
import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { startJobScheduler } from "@/server/jobs/scheduler";
import { attachSocketServer } from "@/server/realtime/socket-server";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";

async function main() {
  const httpServer = createServer();
  const app = next({ dev, hostname: "localhost", port, httpServer });
  const handle = app.getRequestHandler();
  await app.prepare();

  httpServer.on("request", (req, res) => {
    void handle(req, res);
  });
  const io = attachSocketServer(httpServer);
  const stopJobs = process.env.JOBS_ENABLED === "false" ? () => {} : startJobScheduler();

  httpServer.listen(port, hostname, () => {
    console.log(`> Genshin Draft Arena em http://localhost:${port} (${dev ? "desenvolvimento" : "produção"})`);
  });

  const shutdown = (signal: string) => {
    console.log(`> ${signal} recebido, encerrando...`);
    stopJobs();
    io.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Falha ao iniciar o servidor", err);
  process.exit(1);
});
