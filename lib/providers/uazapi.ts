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

export class UazapiProvider {
  constructor(private config: UazapiConfig) {}

  private headers() {
    return {
      "Content-Type": "application/json",
      token: this.config.token,
    };
  }

  async listGroups(force = false) {
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/group/list?force=${force ? "true" : "false"}`, {
      method: "GET",
      headers: this.headers(),
      cache: "no-store",
    });

    const text = await res.text();
    let body: unknown = text;

    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Mantém texto bruto para facilitar diagnóstico.
    }

    if (!res.ok) {
      throw new Error(`UAZAPI listGroups failed: ${res.status} ${typeof body === "string" ? body : JSON.stringify(body)}`);
    }

    return body;
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
