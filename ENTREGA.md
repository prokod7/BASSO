# Entrega — La Forneria Basso PedidoPro

Estado consolidado em 26/08/2026.

Este repositório contém a plataforma operacional da La Forneria Basso, construída em Next.js/TypeScript com Supabase e deploy pela Vercel.

## Núcleo disponível

- cardápio digital e montagem oficial de pizzas;
- checkout, conta e acompanhamento de pedido;
- cálculo/validação server-side de preços antes da gravação;
- central administrativa de pedidos e comandas;
- PDV;
- salão com 15 mesas, comandas, agrupamento/transferência e garçom;
- KDS, expedição e setores de produção;
- delivery manual, entregadores e estrutura de rastreamento;
- CRM de clientes;
- fidelidade interna;
- cupons;
- estoque, inventário, compras e fornecedores;
- caixa, pagamentos, financeiro e conciliação;
- rotinas de abertura/fechamento, tarefas e aprovações;
- notificações internas;
- usuários, papéis, permissões, dispositivos e auditoria;
- perfis e fila de impressão;
- diagnóstico, health checks e registro de erros;
- APIs server-side, RLS, RPCs, idempotência e Realtime;
- contingência/offline onde previsto no projeto;
- testes automatizados e quality gate.

## Banco de dados

A sequência oficial de migrations vai de `001` a `020`.

A migration mais recente é:

```text
supabase/migrations/020_production_security_and_performance_hardening.sql
```

Ela consolida:

- helpers RLS em schema privado;
- revogação de RPCs `SECURITY DEFINER` para papéis de navegador;
- privilégios mínimos para novas funções;
- correção de `search_path`;
- otimização de policies;
- índices de suporte para foreign keys;
- organização da extensão `citext` no schema `extensions`.

### Banco existente

Em um banco que já possui as migrations `001` a `019`, aplique somente a `020`.

### Instalação nova

Execute todas as migrations de `001` a `020` em ordem.

Não repita migrations já registradas em `public.system_migrations`.

## Segurança de produção

O modo demonstração não pode liberar autenticação em produção. Ele existe apenas para desenvolvimento local quando `DEMO_MODE=true` e `NODE_ENV` não é `production`.

Operações privilegiadas são executadas por rotas server-side após autenticação/autorização do funcionário. O navegador não deve executar diretamente RPCs administrativas `SECURITY DEFINER`.

Acompanhamento público de pedido, rastreamento por token e avaliações continuam acessíveis através de rotas Next.js controladas.

## Primeiro acesso após atualização

1. Confirmar que a migration `020` está registrada.
2. Acessar `/painel/diagnostico`.
3. Executar os health checks.
4. Validar login de gestor e perfis operacionais.
5. Testar pedido completo: criação → produção → expedição → conclusão.
6. Testar PDV, mesa/comanda, pagamentos e fechamento.
7. Conferir estoque, fidelidade, caixa e financeiro após os testes.
8. Confirmar que integrações desativadas aparecem como desativadas, e não como operação homologada.

## Integrações externas

A infraestrutura existe, porém os itens abaixo só podem ser marcados como prontos após credenciais, equipamento e/ou homologação real:

- iFood;
- 99Food;
- Pix automático;
- OneSignal/push;
- SmartPOS/maquininhas;
- impressão física/Print Bridge;
- rastreamento com aparelhos reais;
- mapa/coordenadas definitivas;
- bairros, taxas e zonas reais de entrega.

Esses módulos devem permanecer desligados enquanto a configuração real estiver ausente ou o health check indicar falha.

## Regra de implantação

Uma atualização só deve chegar à produção após:

- contrato estático;
- sequência de migrations;
- auditoria de botões;
- TypeScript;
- testes unitários;
- build de produção;
- preview Vercel;
- validação do banco;
- smoke test pós-deploy.
