/**
 * Helper that the Next.js backend uses to push real-time events to the
 * Socket.io mini-service. The mini-service then broadcasts to every
 * connected kitchen-display client.
 *
 * We POST to the internal `/broadcast` endpoint exposed by the
 * kitchen-service mini-service (port 3003). Requests are fire-and-forget
 * — if the mini-service is down, the kitchen display simply won't get
 * the live update; orders are still persisted in SQLite so a refresh
 * recovers state.
 */

const KITCHEN_SERVICE_URL =
  process.env.KITCHEN_SERVICE_URL ?? "http://localhost:3003";

export async function broadcastKitchenEvent(event: string, payload: unknown) {
  try {
    await fetch(`${KITCHEN_SERVICE_URL}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload }),
    });
  } catch (err) {
    // Don't fail the request — kitchen display is best-effort.
    console.warn(`[kitchen-events] broadcast failed for ${event}:`, err);
  }
}
