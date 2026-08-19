# PedidoPro — La Forneria Basso

**Versão atual: 5.0.0 — Mega Update 05 (maturidade operacional e autonomia).**

# La Forneria Basso — PedidoPro 4.0

Sistema omnichannel da La Forneria Basso construído a partir do Documento Mestre Final 3.1 e do cardápio oficial. O projeto reúne cardápio digital, configurador de pizzas, checkout, pedidos, PDV, salão, comandas, garçom, KDS, expedição, delivery, motoboy, CRM, fidelidade interna, estoque restrito, compras, caixa, financeiro, relatórios, comunicação, impressão, diagnóstico, contingência e administração em uma única aplicação.

## Mega Update 07 — Production Final

A versão 7.0 endurece o PedidoPro para operação real: elimina fallback demo em produção, torna caixa/financeiro/estoque/cupons/KDS/salão/motoboy/campanhas server-first, adiciona numeração atômica de pedidos, checkout com quote autoritativa e retry idempotente, checklist persistente de expedição e melhorias de carrinho/busca/status da loja.

Após as migrations anteriores, execute também:

```text
supabase/migrations/017_production_final_hardening.sql
```

A versão exige banco na migration 017. A 99Food continua bloqueada por contrato oficial até a documentação técnica ser fornecida; Rede/Laranjinha continua aguardando SDK/App2App e homologação. Veja `MEGA_UPDATE_07.md` e `docs/MEGA_UPDATE_07_VALIDATION.md`.

## Stack

- Next.js 15, App Router, React 19 e TypeScript estrito
- Tailwind CSS, mobile first e PWA
- Supabase Auth, PostgreSQL, Realtime, RLS e funções transacionais
- Vercel para aplicação e processamento agendado quando o plano suportar
- Leaflet + OpenStreetMap para mapa e rastreamento simples
- OneSignal e Resend preparados para push/e-mail
- Bridge local Node.js para impressão setorizada
- Adaptadores de iFood, 99Food e Rede preparados para credenciais e homologação

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

1. Crie o projeto Supabase.
2. Em instalação nova, execute as migrations `001` a `014` em ordem.
3. Em banco já atualizado até `013`, execute somente `014_autonomy_operations_and_control.sql`.
4. Configure as variáveis de `.env.example` na Vercel.
5. Defina `NEXT_PUBLIC_DEMO_MODE=false`.
6. Crie os usuários iniciais com `npm run seed:users` ou pelo bootstrap controlado.
7. Faça deploy com Node.js 22.
8. Acesse `/painel/diagnostico` e confirme migration 014 e saúde do banco.
9. Configure operação, usuários, bairros, estoque inicial e impressão.
10. Homologue separadamente cada integração externa.

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

Credenciais, tokens, webhooks, URLs definitivas, modelos de terminal, bairros, taxas e nomes reais não são inventados no código. iFood, 99Food, Rede, Pix automático, OneSignal, Resend, Print Bridge e rastreamento só ficam operacionais após configuração e homologação. Consulte [`docs/INTEGRATION_ACTIVATION.md`](docs/INTEGRATION_ACTIVATION.md).
