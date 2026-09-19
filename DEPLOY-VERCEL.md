# Publicar na Vercel em ponto.fcztecnologia.com.br

## 1. Variáveis de ambiente na Vercel (Project Settings → Environment Variables)

```
VITE_PUBLIC_SITE_URL=https://ponto.fcztecnologia.com.br
VITE_SUPABASE_URL=https://mrelgmwffaxncjlcjalu.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_sEp2AI1Ll9KRzhYP1vL5gw_t8rzsehr
VITE_SUPABASE_PROJECT_ID=mrelgmwffaxncjlcjalu
SUPABASE_URL=https://mrelgmwffaxncjlcjalu.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_sEp2AI1Ll9KRzhYP1vL5gw_t8rzsehr
SUPABASE_PROJECT_ID=mrelgmwffaxncjlcjalu
```

## 2. Build

- Build command: `bun run build` (ou `npm run build`)
- O preset do Nitro muda automaticamente para `vercel` quando a variável
  `VERCEL` existe no build (ver `vite.config.ts`).

## 3. Domínio

Adicione `ponto.fcztecnologia.com.br` em Vercel → Domains e crie o registro
DNS indicado pela Vercel (normalmente `CNAME ponto → cname.vercel-dns.com`).

## 4. Autenticação (feito no painel de autenticação do backend Lovable Cloud)

- Site URL: `https://ponto.fcztecnologia.com.br`
- Redirect URLs adicionais:
  - `https://ponto.fcztecnologia.com.br`
  - `https://ponto.fcztecnologia.com.br/*`
  - manter as URLs de prévia da Lovable, para continuar testando

O app envia esse mesmo endereço nos retornos de confirmação de e-mail e no
login com Google (`authRedirectUrl()` em `src/routes/index.tsx`).

## 5. Google

Com as credenciais gerenciadas pela Lovable, basta o domínio estar na lista de
Redirect URLs acima. Se você usar um Client ID próprio do Google Cloud, inclua:

- Authorized JavaScript origins: `https://ponto.fcztecnologia.com.br`
- Authorized redirect URI: a URL de callback mostrada nas configurações do
  provedor Google no painel de autenticação.
