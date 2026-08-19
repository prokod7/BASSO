# Validação — Mega Update 07

## Resultado estático

- Parser TypeScript/TSX: **212 arquivos / 0 erros de sintaxe**.
- Migrations: **17 em sequência**, 001 → 017.
- Verificador do projeto: **96/96 aprovado**.
- Auditor de UI: **281 botões, 61 links, 19 formulários, 0 controles suspeitos**.
- iFood: adaptador preservado byte a byte em relação ao Mega Update 06 corrigido.

## Testes estruturais adicionados

`tests/production-final.test.ts` cobre por contrato:

- sequência atômica de número do pedido;
- isolamento de demo/local em produção;
- caixa/financeiro/estoque server-first;
- idempotência do checkout;
- bloqueio de delivery sem cobertura configurada;
- checklist persistente da expedição;
- preservação do adaptador iFood.

## Build local

`npm install --ignore-scripts --no-audit --no-fund` foi iniciado, mas excedeu o limite do ambiente sem produzir `node_modules`. Portanto o build Next.js completo não foi falsamente marcado como aprovado.

A validação final de dependências deve ocorrer no GitHub Actions/Vercel com:

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Teste operacional recomendado após deploy

1. criar pedido próprio pelo celular;
2. atualizar página durante checkout e confirmar que carrinho permanece;
3. enviar o pedido e confirmar apenas um registro;
4. abrir o mesmo pedido em dois navegadores;
5. iniciar produção no KDS;
6. marcar checklist de expedição em um computador e atualizar em outro;
7. liberar pedido;
8. atribuir motoboy e iniciar turno;
9. concluir entrega e confirmar encerramento do tracking do cliente;
10. encerrar turno e confirmar término do tracking interno;
11. abrir/fechar caixa;
12. ajustar estoque e atualizar página;
13. criar e pausar cupom;
14. consultar auditoria;
15. conferir `/painel/diagnostico` sem alerta de migration pendente.
