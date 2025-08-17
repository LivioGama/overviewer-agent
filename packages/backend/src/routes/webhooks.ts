import { FastifyInstance } from "fastify";
import { webhookService } from "../services/webhook.js";

export async function webhookRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/webhooks/github",
    {
      schema: {
        headers: {
          type: "object",
          properties: {
            "x-github-event": { type: "string" },
            "x-hub-signature-256": { type: "string" },
            "x-github-delivery": { type: "string" },
          },
          required: ["x-github-event", "x-hub-signature-256"],
        },
      },
    },
    async (request, reply) => {
      const eventName = request.headers["x-github-event"] as string;
      const signature = request.headers["x-hub-signature-256"] as string;
      const deliveryId = request.headers["x-github-delivery"] as string;

      if (!eventName || !signature) {
        return reply.code(400).send({ error: "Missing required headers" });
      }

      const body = JSON.stringify(request.body);
      const result = await webhookService.handleWebhook(
        eventName,
        request.body,
        signature,
        body,
      );

      if (!result.success) {
        fastify.log.error(
          `Webhook processing failed: ${result.message} - Event: ${eventName}, Delivery: ${deliveryId}`,
        );
        return reply.code(400).send({ error: result.message });
      }

      fastify.log.info(
        `Webhook processed successfully: ${result.message} - Event: ${eventName}, Delivery: ${deliveryId}`,
      );

      return reply.code(200).send({ success: true, message: result.message });
    },
  );

  fastify.get("/webhooks/health", async (_, reply) => {
    return reply.code(200).send({
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
  });
}
