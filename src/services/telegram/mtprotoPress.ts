/**
 * mtprotoPress.ts — presses @L_10_BOT's "بحث اليوتوب صوت" channel button
 * server-side via a Telegram user session (MTProto), so the audio-search
 * window opens without any human click.
 *
 * Session material (api_id/hash/auth key) lives in Neon system_config
 * under `tg_user_session`; Bot API sessions cannot see or press other
 * bots' buttons — only a user account can.
 */

import { query } from "@apis/neon";

const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || "-1004310944763";
const BUTTON_TEXT = "بحث اليوتوب";

interface TgSession {
  apiId: number;
  apiHash: string;
  dcId: number;
  server: string;
  port: number;
  authKeyHex: string;
}

async function getSessionConfig(): Promise<TgSession | null> {
  try {
    const res = await query<any>(
      "SELECT value FROM system_config WHERE key = 'tg_user_session' LIMIT 1"
    );
    if (res.rows.length === 0) return null;
    return JSON.parse(res.rows[0].value) as TgSession;
  } catch {
    return null;
  }
}

/**
 * Find the newest @L_10_BOT menu message in the channel and press its
 * audio-search button. Returns true when the click was accepted
 * (BOT_RESPONSE_TIMEOUT counts as accepted — the bot edits the menu
 * asynchronously and the production webhook records the window).
 */
export async function autoPressAudioButton(maxWaitMs = 15000): Promise<boolean> {
  const cfg = await getSessionConfig();
  if (!cfg?.authKeyHex) {
    console.warn("[MTProto] tg_user_session not configured");
    return false;
  }

  const { TelegramClient, Api } = await import("telegram");
  const { MemorySession } = await import("telegram/sessions");
  const { AuthKey } = await import("telegram/crypto/AuthKey");

  const session = new MemorySession();
  session.setDC(cfg.dcId, cfg.server, cfg.port);
  const authKey = new AuthKey();
  await authKey.setKey(Buffer.from(cfg.authKeyHex, "hex"));
  session.setAuthKey(authKey, cfg.dcId);

  const client = new TelegramClient(session, cfg.apiId, cfg.apiHash, {
    connectionRetries: 1,
    autoReconnect: false,
  });

  try {
    await client.connect();

    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const messages = await client.getMessages(CHANNEL_ID, { limit: 10 });
      let target: { msgId: number; data: Buffer } | null = null as any;
      for (const m of messages) {
        const rows: any[] = (m as any).replyMarkup?.rows || [];
        for (const row of rows) {
          for (const btn of row.buttons || []) {
            if ((btn.text || "").toString().includes(BUTTON_TEXT) && btn.data) {
              target = { msgId: Number(m.id), data: btn.data };
            }
          }
        }
        if (target) break;
      }

      if (target) {
        const pressedMsgId = target.msgId;
        const pressedData = target.data;
        const inputPeer = await client.getInputEntity(CHANNEL_ID);
        try {
          await client.invoke(
            new Api.messages.GetBotCallbackAnswer({
              peer: inputPeer as any,
              msgId: pressedMsgId,
              data: pressedData,
            })
          );
          console.log(`[MTProto] ✅ pressed audio button on msg ${pressedMsgId}`);
        } catch (err: any) {
          if (err?.errorMessage === "BOT_RESPONSE_TIMEOUT" || err?.code === 400) {
            console.log(`[MTProto] ✅ pressed audio button on msg ${pressedMsgId} (bot silent-reply timeout — normal)`);
          } else {
            console.warn(`[MTProto] press failed on msg ${pressedMsgId}:`, err?.errorMessage || err?.message);
            return false;
          }
        }
        return true;
      }

      await new Promise((r) => setTimeout(r, 1500));
    }
    console.warn("[MTProto] no audio-search menu found in channel");
    return false;
  } catch (err: any) {
    console.warn("[MTProto] connection/flow error:", err?.message);
    return false;
  } finally {
    try {
      await client.disconnect();
    } catch {}
  }
}
