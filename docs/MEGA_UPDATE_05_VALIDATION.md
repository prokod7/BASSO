# Validação — Mega Update 05

## Resultado local

- Migrations: **15 em sequência**, de `001_core_schema.sql` a `015_operational_maturity_and_reliability.sql`.
- Auditoria de componentes: **72 arquivos TSX/JSX**.
- Botões: **256 verificados**.
- Links: **59 verificados**.
- Formulários: **19 verificados**.
- Controles suspeitos: **0**.
- Verificação estrutural: **77/77 aprovada**.
- Parsing TypeScript/TSX: **182 arquivos**, **0 erro de sintaxe**.

## Limite desta validação

Não foi possível instalar dependências no ambiente de execução porque o registro npm interno retornou `404` para `@supabase/ssr@^0.6.1`. Por isso, não foi possível executar `next build` com as dependências reais. O build de produção deve ser validado pelo pipeline do GitHub/Vercel.

## Checklist após deploy

1. Executar migration 015.
2. Deploy do patch.
3. Login como gestor.
4. Abrir `/painel/sistema` e confirmar banco `015`.
5. Abrir `/painel/atencao`.
6. Abrir dois navegadores no mesmo pedido e conferir o lock de edição.
7. Criar um snapshot de configuração.
8. Abrir `/painel/inventario` e testar uma contagem controlada.
9. Criar usuário temporário e confirmar troca obrigatória de senha.
10. Testar atalhos `Ctrl+K`, `G+P`, `G+D`, `G+S`, `G+K`, `G+A`.
