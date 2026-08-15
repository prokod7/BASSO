# Roteiro de implantação — PedidoPro 6.0

## 1. Pré-requisitos

- Node.js 22 ou superior
- repositório GitHub
- projeto Vercel
- projeto Supabase/PostgreSQL
- domínio HTTPS
- computador local para o Print Bridge quando a impressão for ativada
- acesso administrativo aos fornecedores das integrações

## 2. Banco de dados

### Instalação nova

No SQL Editor do Supabase, execute os 16 arquivos de `supabase/migrations`, um por vez e em ordem, de `001_core_schema.sql` até `016_integration_ready_99food_tracking_smartpos.sql`.

### Banco já atualizado até 015

Execute somente:

```text
016_integration_ready_99food_tracking_smartpos.sql
```

Não repita migrations já instaladas.

### Conferências

- tabela `system_migrations` com versão 16;
- `integration_events` com correlação/identificador externo;
- `driver_shifts` criado;
- `driver_locations.order_id` opcional para rastreio interno durante o turno;
- `tracking_tokens.customer_visible` criado;
- `registered_devices` criado para SmartPOS;
- RLS e RPCs da migration 016 disponíveis.

## 3. Variáveis de ambiente

Copie `.env.example` para `.env.local`. Em produção:

```env
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SITE_URL=https://seu-dominio.com.br
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SERVICE_ROLE
```

Nunca exponha `SUPABASE_SERVICE_ROLE_KEY`, segredos de webhook, tokens ou `PRINT_BRIDGE_KEY` em variáveis `NEXT_PUBLIC_*`.

As integrações não configuradas podem permanecer sem variáveis. Não use valores fictícios.

## 4. Contas iniciais

Execute localmente:

```bash
INITIAL_USER_PASSWORD='uma-senha-temporaria-forte' npm run seed:users
```

O script cria ou sincroniza:

- Gestor
- Atendente 1, 2 e 3
- Garçom 1, 2 e 3

Troque a senha e substitua nomes genéricos pelos funcionários reais.

## 5. Realtime

Habilite Realtime pelo menos para:

- `orders`
- `order_items`
- `payments`
- `restaurant_tables`
- `tabs`
- `drivers`
- `inventory_items`
- `print_jobs`
- `operation_tasks`
- `internal_notifications`
- `store_runtime_status`

Sem Realtime, o sistema continua consultável, mas perde atualização instantânea entre dispositivos.

## 6. Parâmetros de implantação

Antes da abertura real, cadastre:

- horários e canais;
- bairros, taxas e pedido mínimo;
- tempos de preparo e entrega;
- coordenadas da pizzaria quando o mapa for ativado;
- chave Pix e método de conferência;
- estoque inicial de bebidas e sobremesas;
- motoboys e veículos;
- impressoras, setores, largura, conexão e vias;
- usuários, permissões e limites de dispositivos;
- modelos de WhatsApp;
- credenciais externas quando disponíveis.

## 7. Verificação antes do deploy

```bash
npm install --no-audit --no-fund
npm run verify:static
npm run check:migrations
npm run audit:buttons
npm run typecheck
npm test
npm run build
```

Ou:

```bash
npm run verify
```

O repositório inclui `.github/workflows/quality.yml` para repetir as verificações no GitHub.

## 8. Deploy Vercel

1. envie o conteúdo do projeto para o GitHub;
2. importe o repositório na Vercel;
3. confirme que `package.json` está na Root Directory;
4. use Node.js 22;
5. configure as variáveis;
6. faça o deploy;
7. conecte o domínio;
8. faça novo deploy após alterar `NEXT_PUBLIC_SITE_URL`;
9. acesse `/painel/diagnostico` e execute todos os testes.

No plano Hobby, mantenha `vercel.pro.json`. O cron não será ativado. Quando o plano e a cadência forem compatíveis, renomeie para `vercel.json`, configure `CRON_SECRET` e teste `/api/cron/process-queues`.

## 9. Primeiro teste operacional

1. abra o caixa;
2. acesse `/painel/rotinas` e inicie a abertura;
3. configure canais e prazos no controle da loja;
4. abra a loja;
5. faça um pedido próprio;
6. confirme o pedido;
7. envie ao KDS;
8. conclua produção e expedição;
9. registre pagamento;
10. conclua retirada ou delivery;
11. confira caixa, estoque, auditoria e relatório;
12. execute a rotina de fechamento.

## 10. Impressão local

1. copie `bridge/config.example.json` para `bridge/config.json`;
2. defina a mesma chave em `PRINT_BRIDGE_KEY` e no arquivo local;
3. configure impressoras por TCP/9100 ou fila do sistema;
4. teste primeiro com saída em arquivo;
5. execute `node bridge/print-bridge.mjs bridge/config.json`;
6. configure inicialização automática;
7. valide cozinha, balcão, reimpressão e falha.

A fila não deve ser considerada homologada até haver confirmação do equipamento real.

## 11. Homologação mínima

- pedido delivery, retirada, balcão, salão e QR;
- Broto com segundo sabor bloqueado;
- Grande meio a meio calculado corretamente;
- Premium + Tradicional bloqueado;
- adicionais nos limites;
- edição de pedido com auditoria;
- pagamento parcial e total;
- mesa e comanda com divisão;
- KDS e expedição;
- entrega manual sem mapa;
- compra com recebimento parcial e total;
- estoque baixo e esgotado;
- abertura e fechamento;
- tarefa, aprovação e notificação;
- exportação operacional;
- usuário sem permissão tentando ação protegida;
- integração externa mostrando estado não configurado, sem falso sucesso.

## 12. Go-live

- faça backup;
- remova dados de teste;
- carregue estoque inicial;
- configure usuários reais;
- teste caixa completo;
- treine cada perfil;
- mantenha contingência manual;
- acompanhe diagnóstico e auditoria no primeiro turno.
