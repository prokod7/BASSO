# La Forneria Basso — PedidoPro 3.1

Sistema omnichannel da La Forneria Basso construído a partir do Documento Mestre Final 3.1 e dos arquivos oficiais de cardápio, identidade e imagens. O projeto reúne cardápio digital, configurador de pizzas, checkout, PDV, salão, comandas, garçom, KDS, delivery, motoboy, CRM, fidelidade interna, estoque restrito, caixa, financeiro, relatórios, integrações, impressão e contingência em uma única aplicação.

## Stack

- Next.js 15 com App Router, React 19 e TypeScript estrito
- Tailwind CSS, mobile first e PWA
- Supabase Auth, PostgreSQL, Realtime, RLS e funções transacionais
- Vercel para aplicação e cron de filas
- Leaflet + OpenStreetMap para mapa e rastreamento simples
- OneSignal e Resend preparados para push/e-mail
- Bridge local Node.js para impressão setorizada
- Adaptadores de iFood, 99Food e Rede com webhook, idempotência, filas, logs e retentativas

## Regras centrais implementadas

- Não existe borda: não há componente público, payload aceito ou cobrança; o banco também rejeita campos de borda.
- Broto aceita somente um sabor em interface, API e banco.
- Grande meio a meio custa 50% de cada sabor, em centavos; nunca usa o sabor mais caro.
- Premium não combina com Tradicional; doce e salgado podem combinar quando não violam a matriz.
- Adicionais custam o valor integral, no máximo 2 do mesmo e 5 unidades por pizza.
- Estoque rastreia somente bebidas e sobremesas.
- Fidelidade é exclusivamente interna: delivery próprio, concluído e pago; 10 pontos por recompensa, saldo máximo 15, somente Grande de Mozzarella ou Calabresa Tradicional.
- Clientes de iFood/99Food não criam perfil de CRM nem saldo de fidelidade.
- 15 mesas: 10 com 5 lugares e 5 com 2 lugares.
- WhatsApp é manual, usando links e mensagens preenchidas; não há chatbot ou disparo automático.

## Modo demonstração

O projeto inicia sem backend quando `NEXT_PUBLIC_DEMO_MODE=true`. Pedidos, mesas, estoque, caixa, entregadores e auditoria usam armazenamento local sincronizado entre abas. Isso permite validar UX e fluxos sem credenciais.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Acesse:

- Cardápio: `http://localhost:3000`
- Painel: `http://localhost:3000/painel`
- Login: `http://localhost:3000/login`

## Produção

1. Crie o projeto Supabase e execute, em ordem, todas as migrações de `supabase/migrations`.
2. Configure as variáveis de `.env.example` na Vercel.
3. Defina `NEXT_PUBLIC_DEMO_MODE=false`.
4. Cadastre temporariamente `INITIAL_USER_PASSWORD` (mínimo de 12 caracteres). No primeiro login, o sistema cria e sincroniza automaticamente as sete contas. Como alternativa, execute `npm run seed:users`.
5. Cadastre bairros, taxas, pedido mínimo, equipamentos, credenciais e terminais nos parâmetros de implantação.
6. Faça deploy na Vercel e configure o domínio. No plano Hobby, mantenha `vercel.pro.json`; restaure o nome `vercel.json` apenas quando utilizar um plano/cadência compatível com o cron.
7. Instale o bridge de impressão no computador da pizzaria.
8. Homologue cada integração externa no ambiente liberado pelo fornecedor.

O roteiro completo está em [`docs/DEPLOYMENT_RUNBOOK.md`](docs/DEPLOYMENT_RUNBOOK.md).

## Verificação

```bash
npm run verify:static
npm run typecheck
npm run test
npm run build
```

`verify:static` não depende de rede e confere cardápio, quantidades, assets, telas, PWA, regras críticas, migrações, RLS, idempotência, filas, impressão e ausência de segredos evidentes. O relatório gerado fica em [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md).

## Estrutura principal

```text
src/app/                 rotas públicas, painel e APIs
src/components/          componentes públicos, operacionais e mapas
src/data/catalog.json    cardápio oficial consolidado
src/lib/                 regras, preços, Supabase, integrações e filas
supabase/migrations/     banco, RLS, RPCs, seeds e workers
bridge/                  serviço local de impressão
scripts/                 verificação e criação de usuários
docs/                    implantação, segurança e homologação
public/assets/           somente imagens oficiais aprovadas
```

## Ativação externa

Credenciais, tokens, webhooks, URLs definitivas, modelos de terminal, bairros, taxas e nomes reais dos usuários não constavam como valores finais na documentação. Toda a estrutura existe para recebê-los, mas iFood, 99Food, Rede, OneSignal, e-mail e impressoras só ficam operacionais após configuração e homologação do respectivo fornecedor. Consulte [`docs/INTEGRATION_ACTIVATION.md`](docs/INTEGRATION_ACTIVATION.md).
