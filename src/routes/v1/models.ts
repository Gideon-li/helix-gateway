import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight } from "@/lib/gateway/http";
import { handleModels } from "@/lib/gateway/proxy";

export const Route = createFileRoute("/v1/models")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      GET: ({ request }) => handleModels(request),
    },
  },
});
