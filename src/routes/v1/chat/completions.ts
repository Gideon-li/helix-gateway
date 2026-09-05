import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight } from "@/lib/gateway/http";
import { handleChatCompletions } from "@/lib/gateway/proxy";

export const Route = createFileRoute("/v1/chat/completions")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: ({ request }) => handleChatCompletions(request),
    },
  },
});
