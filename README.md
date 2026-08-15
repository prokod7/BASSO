# PedidoPro — La Forneria Basso

**Versão atual: 6.0.0 — Mega Update 06 (Integration Ready + 99Food contract-first).**

# La Forneria Basso — PedidoPro 6.0

Sistema omnichannel da La Forneria Basso construído a partir do Documento Mestre Final 3.1 e do cardápio oficial. O projeto reúne cardápio digital, configurador de pizzas, checkout, pedidos, PDV, salão, comandas, garçom, KDS, expedição, delivery, motoboy, CRM, fidelidade interna, estoque restrito, compras, caixa, financeiro, relatórios, comunicação, impressão, diagnóstico, contingência e administração em uma única aplicação.

## Stack

- Next.js 15, App Router, React 19 e TypeScript estrito
- Tailwind CSS, mobile first e PWA
- Supabase Auth, PostgreSQL, Realtime, RLS e funções transacionais
- Vercel para aplicação e processamento agendado quando o plano suportar
- Leaflet + OpenStreetMap para mapa e rastreamento simples
- OneSignal e Resend preparados para push/e-mail
- Bridge local Node.js para impressão setorizada
- iFood preservado; 99Food com arquitetura contract-first e webhook dedicado; Laranjinha Smart preparada sem endpoints presumidos

## Regras centrais

- Não existe borda em interface, API, impressão ou banco.
- Broto aceita somente um sabor.
- Grande meio a meio custa 50% de cada sabor; nunca usa o sabor mais caro.
- Premium não combina com Tradicional.
- Adicionais custam o valor integral, no máximo 2 do mesmo e 5 unidades por pizza.
- Estoque rastreia somente bebidas e sobremesas.
- Fidelidade é interna: delivery próprio, concluído e pago; recompensa com 10 pontos e saldo máximo de 15.
- Clientes de iFood/99Food não entram no CRM nem na fidelidade.
- O salão possui 15 mesas: 10 com 5 lugares e 5 com 2 lugares.
- WhatsApp é manual, com mensagem preenchida e ação consciente do funcionário.

## Mega Update 04

O pacote 4.0 acrescenta:

- Centro de Comando em tempo real;
- controle de loja, canais e prazos;
- rotinas guiadas de abertura e fechamento;
- tarefas, aprovações e notificações internas;
- busca global com `Ctrl/Cmd + K`;
- expedição auditável;
- compras e fornecedores com entrada transacional no estoque;
- modelos de comunicação administráveis;
- perfis de impressão;
- diagnóstico técnico e painel de migrations;
- exportação operacional assistida;
- Realtime ampliado e presença de usuários;
- pipeline de qualidade no GitHub.

Leia [`MEGA_UPDATE_04.md`](MEGA_UPDATE_04.md).

## Mega Update 06

O pacote 6.0 acrescenta webhook dedicado e diagnóstico 99Food, fila/redaction/correlação de integrações, arquitetura assíncrona para buscar detalhes do pedido, fundação de rastreio interno por turno com link do cliente separado e registro de terminais `waiter_smartpos`. A integração externa da 99Food permanece propositalmente bloqueada até a documentação oficial ser fornecida, evitando endpoints ou assinaturas inventados.

Leia [`MEGA_UPDATE_06.md`](MEGA_UPDATE_06.md).

## Modo demonstração

```bash
cp .env.example .env.local
npm install
npm run dev
```

Use:

```env
NEXT_PUBLIC_DEMO_MODE=true
```

Acesse:

- Cardápio: `http://localhost:3000`
- Painel: `http://localhost:3000/painel`
- Login: `http://localhost:3000/login`

## Produção

1. Em instalação nova, execute as migrations `001` a `016` em ordem.
2. Em banco já atualizado até `015`, execute somente `016_integration_ready_99food_tracking_smartpos.sql`.
3. Configure as variáveis de `.env.example` na Vercel.
4. Defina `NEXT_PUBLIC_DEMO_MODE=false`.
5. Faça deploy com Node.js 22.
6. Acesse `/painel/sistema` e confirme migration 016.
7. Acesse `/painel/integracoes` para saúde das integrações.
8. Para 99Food, forneça primeiro as páginas oficiais listadas em `docs/99FOOD_OFFICIAL_DOCS_NEEDED.md`; nenhuma chamada é inventada.
9. Teste turno/GPS de motoboy em aparelho real antes de ativar para clientes.
10. Ative Laranjinha Smart somente após SDK/App2App e certificação oficial.

No plano Hobby, mantenha `vercel.pro.json`. Restaure o nome `vercel.json` somente quando a cadência do cron for compatível com o plano utilizado.

O roteiro completo está em [`docs/DEPLOYMENT_RUNBOOK.md`](docs/DEPLOYMENT_RUNBOOK.md).

## Verificação local

```bash
npm run verify:static
npm run check:migrations
npm run audit:buttons
npm run typecheck
npm test
npm run build
```

O comando completo é:

```bash
npm run verify
```

O pipeline `.github/workflows/quality.yml` repete as verificações principais em cada push e pull request.

## Estrutura principal

```text
src/app/                 rotas públicas, painel e APIs
src/components/          componentes públicos, operacionais e mapas
src/data/catalog.json    cardápio oficial consolidado
src/lib/                 regras, preços, Supabase, integrações e controle
supabase/migrations/     banco, RLS, RPCs, seeds e workers
bridge/                  serviço local de impressão
scripts/                 verificação, migrations e criação de usuários
tests/                   testes automatizados
docs/                    implantação, segurança, aceite e validação
public/assets/           imagens oficiais aprovadas
```

## Ativação externa

Credenciais, tokens, endpoints, assinaturas e contratos de fornecedores não são inventados. O iFood permanece funcional; a 99Food só sai do gate de documentação após aplicação literal das páginas oficiais; rastreamento usa GPS interno; Laranjinha Smart aguarda SDK/App2App e certificação. Consulte [`docs/INTEGRATION_ACTIVATION.md`](docs/INTEGRATION_ACTIVATION.md) e [`docs/99FOOD_OFFICIAL_DOCS_NEEDED.md`](docs/99FOOD_OFFICIAL_DOCS_NEEDED.md).
