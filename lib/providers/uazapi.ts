export type UazapiConfig = {
  baseUrl: string;
  token: string;
};

export type NormalizedGroupEvent = {
  type: "participant_joined" | "participant_left" | "unknown";
  groupId?: string;
  participantId?: string;
  phone?: string | null;
  lid?: string | null;
  raw: unknown;
};

type SendTextInput = {
  number: string;
  text: string;
  delay?: number;
  linkPreview?: boolean;
};

type SendMediaInput = {
  number: string;
  text?: string;
  file: string;
  type?: "image" | "video" | "audio" | "ptt" | "document" | "sticker";
  delay?: number;
  docName?: string;
};

export class UazapiProvider {
  constructor(private config: UazapiConfig) {}

  private headers() {
    return {
      "Content-Type": "application/json",
      token: this.config.token,
    };
  }

  private async request(path: string, init: RequestInit) {
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...this.headers(),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });

    const text = await res.text();
    let body: unknown = text;

    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Mantém texto bruto para diagnóstico.
    }

    if (!res.ok) {
      throw new Error(`UAZAPI request failed: ${res.status} ${typeof body === "string" ? body : JSON.stringify(body)}`);
    }

    return body;
  }

  async listGroups(force = false) {
    return this.request(`/group/list?force=${force ? "true" : "false"}`, {
      method: "GET",
    });
  }

  async sendText(input: SendTextInput) {
    return this.request("/send/text", {
      method: "POST",
      body: JSON.stringify({
        number: input.number,
        text: input.text,
        linkPreview: input.linkPreview ?? false,
        replyid: "",
        mentions: "",
        readchat: true,
        delay: input.delay ?? 0,
      }),
    });
  }

  async sendMedia(input: SendMediaInput) {
    return this.request("/send/media", {
      method: "POST",
      body: JSON.stringify({
        number: input.number,
        text: input.text ?? "",
        type: input.type ?? "image",
        file: input.file,
        docName: input.docName ?? "",
        replyid: "",
        mentions: "",
        readchat: true,
        delay: input.delay ?? 0,
      }),
    });
  }

  normalizeWebhook(payload: any): NormalizedGroupEvent {
    const event = String(payload?.event ?? payload?.type ?? "").toLowerCase();
    const participantId =
      payload?.participant ??
      payload?.data?.participant ??
      payload?.data?.participants?.[0] ??
      payload?.sender ??
      null;

    const groupId =
      payload?.groupId ??
      payload?.chatId ??
      payload?.data?.groupId ??
      payload?.data?.id ??
      null;

    const value = typeof participantId === "string" ? participantId : null;
    const phone = value?.includes("@s.whatsapp.net") ? value.split("@")[0] : null;
    const lid = value?.includes("@lid") ? value : null;

    let type: NormalizedGroupEvent["type"] = "unknown";
    if (event.includes("add") || event.includes("join")) type = "participant_joined";
    if (event.includes("remove") || event.includes("leave")) type = "participant_left";

    return { type, groupId: groupId ?? undefined, participantId: value ?? undefined, phone, lid, raw: payload };
  }
}
