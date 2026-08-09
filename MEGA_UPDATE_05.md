# PedidoPro — La Forneria Basso — Mega Update 05

## Objetivo

Aumentar maturidade operacional, autonomia do gestor, prevenção de erros concorrentes e capacidade de diagnóstico sem depender do Supabase para tarefas comuns.

## Entregas implementadas

### Central de atenção operacional

Nova rota `/painel/atencao` reúne em uma fila única:

- pedidos novos não visualizados;
- pedidos atrasados;
- pagamentos pendentes;
- pedidos delivery prontos sem motoboy;
- mesas abertas por longo período;
- estoque abaixo do mínimo ou zerado;
- falhas de impressão;
- aprovações pendentes;
- ocorrências abertas;
- operações offline/sincronização pendente;
- caixa fechado.

A fila é classificada por gravidade e atualiza automaticamente.

### Controle de concorrência de pedidos

A migration 015 cria `order_edit_locks` e RPCs para reservar/liberar a edição de uma comanda. A Central da Comanda passa a renovar o lock enquanto está aberta e informa quando outro operador está editando o pedido.

Além do lock, a alteração de status aceita `expectedVersion` e retorna conflito HTTP 409 se o pedido tiver sido atualizado em outro dispositivo.

### Motor de transições de pedido

Foi criado `src/lib/operational-state.ts` com matriz de transições por etapa, canal e perfil. O backend agora rejeita saltos e transições incompatíveis e exige motivo em cancelamentos, reaberturas e retornos de etapa.

### Feature flags

Nova administração em `/painel/sistema` para ativar ou desativar recursos sem editar código. Integrações externas ficam identificadas como dependentes de configuração e permanecem desligadas por padrão.

### Snapshots de configuração

O gestor pode salvar snapshots de configurações operacionais antes de mudanças grandes e restaurá-los posteriormente. A restauração registra auditoria.

### Inventário físico assistido

Nova rota `/painel/inventario`:

- cria fotografia do saldo atual;
- registra contagem física;
- calcula divergências;
- exige contagem completa antes da conclusão;
- aplica ajustes transacionalmente;
- registra movimentação e auditoria.

Continua limitado a bebidas e sobremesas rastreadas pelo estoque.

### Segurança de contas

- usuários novos recebem `must_change_password=true`;
- redefinição de senha pelo gestor também força nova troca;
- nova tela `/trocar-senha` para troca pelo próprio funcionário;
- registro de `password_changed_at`;
- presença registra dispositivo aproximado (navegador/sistema);
- login não exibe mais detalhes técnicos de Vercel/ENV.

### Ajuda rápida

Nova rota `/painel/ajuda` com procedimentos de pedidos, PDV, salão, KDS, delivery, caixa, impressão e usuários.

### Atalhos administrativos

- `Ctrl/Cmd + K`: busca global;
- `G` + `P`: pedidos;
- `G` + `D`: PDV;
- `G` + `S`: salão;
- `G` + `K`: KDS;
- `G` + `A`: atenção operacional.

Atalhos são ignorados enquanto o funcionário digita em campos ou formulários.

### Sobre esta instalação

Nova rota `/painel/sistema` exibe:

- PedidoPro 5.0.0;
- cliente;
- ambiente;
- versão da migration instalada;
- feature flags;
- snapshots de configuração.

## Migration 015

Execute apenas:

`supabase/migrations/015_operational_maturity_and_reliability.sql`

Ela adiciona:

- campos de segurança/perfil;
- tags e bloqueio administrativo de clientes como base futura;
- feature flags;
- locks de edição;
- snapshots;
- inventário assistido;
- eventos de erro estruturados;
- infraestrutura para mudanças programadas do catálogo;
- RPCs de lock e inventário;
- políticas RLS e grants correspondentes.

## O que não foi simulado

Este update não finge que iFood, 99Food, Pix automático, rastreamento avançado ou Print Bridge estão conectados. Os feature flags dessas integrações iniciam desligados e devem ser ativados somente depois das credenciais/homologação reais.

A tabela de mudanças programadas do catálogo foi criada como fundação de banco, mas a interface de agendamento de preço/disponibilidade ainda não foi conectada neste pacote. Ela não aparece ao operador como função pronta.

## Validação

Foram executados localmente:

- verificação sequencial das 15 migrations;
- auditoria estática de botões/links/formulários;
- 77 verificações estruturais do projeto;
- parsing/transpilação sintática de 182 arquivos TypeScript/TSX.

O `npm install` não concluiu neste ambiente porque o registro npm interno não possui `@supabase/ssr@^0.6.1`. Portanto o `next build` completo precisa ser confirmado pela Vercel/GitHub após o push.
