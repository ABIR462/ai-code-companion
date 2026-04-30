import * as Ably from "ably";
import { appEnv, isAblyConfigured } from "@/lib/env";

let client: Ably.Realtime | null = null;

export function getAblyClient(clientId: string): Ably.Realtime {
  if (!isAblyConfigured) {
    throw new Error("Ably not configured — set VITE_ABLY_API_KEY in .env");
  }
  if (client && (client as any).options?.clientId === clientId) return client;
  if (client) {
    try { client.close(); } catch {}
  }
  client = new Ably.Realtime({
    key: appEnv.ably.apiKey,
    clientId,
    echoMessages: false,
  });
  return client;
}

export function disconnectAbly() {
  if (client) {
    try { client.close(); } catch {}
    client = null;
  }
}

export const ROOMS = [
  { id: "lobby",     label: "lobby",     description: "General hangout for the Matrixbook crew" },
  { id: "builds",    label: "builds",    description: "Share what you built in the IDE" },
  { id: "supernova", label: "supernova", description: "Drop your AI images and prompts" },
  { id: "help",      label: "help",      description: "Ask questions, get unstuck" },
] as const;

export type RoomId = (typeof ROOMS)[number]["id"];
export const ROOM_CHANNEL = (id: string) => `matrixbook:room:${id}`;