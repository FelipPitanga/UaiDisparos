# UaiDisparos

MVP próprio para gestão de instâncias, grupos, leads, campanhas e eventos de WhatsApp.

## Rodar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`.

## Estrutura

- `app/` — interface e rotas da API.
- `lib/providers/uazapi.ts` — camada isolada da UAZAPI.
- `lib/supabase/` — clientes do Supabase.
- `supabase/schema.sql` — schema inicial.
- `/api/webhooks/uazapi` — endpoint para eventos da UAZAPI.

## Estado atual

A interface roda com dados mockados. A integração real foi deixada isolada para conectar as credenciais e validar o payload real da UAZAPI antes de automatizar qualquer fluxo.

## Segurança e operação

O projeto inclui estrutura para:
- consentimento/opt-in;
- lista de supressão;
- logs;
- fila de processamento;
- limites por instância;
- pausa global.

Não há lógica para burlar mecanismos anti-spam ou limites da plataforma.
