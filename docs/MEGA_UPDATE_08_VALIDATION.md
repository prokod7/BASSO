# Validação — Mega Update 08

## Executado neste ambiente
- Migrations locais: 001–018 em sequência.
- Verificação estrutural: 96/96 checks aprovados.
- Auditoria de controles: 79 TSX/JSX, 297 botões, 62 links, 19 formulários e 0 controles suspeitos.
- Parser TypeScript (`transpileModule`): 218 arquivos TS/TSX, 0 erros de sintaxe.
- Migration 018 aplicada no Supabase Basso e conferida por consulta pós-migração.

## Limitação de validação local
O ambiente não possui `node_modules`; portanto `tsc --noEmit`, `vitest` e `next build` não podem produzir uma validação semântica/empacotamento confiável localmente. O build do GitHub Actions/Vercel após o push é a validação definitiva das dependências.

## Impressão física
A fila e o Print Bridge estão preparados, mas impressão física depende do agente local rodando no computador da pizzaria, mesma `PRINT_BRIDGE_KEY`, nomes reais das filas do Windows e teste em papel. Não considerar impressão física validada antes desse teste.
