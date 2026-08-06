# Auditoria de controles interativos

A auditoria estática foi executada com:

```bash
npm run audit:buttons
```

Resultado deste pacote:

- 56 arquivos TSX/JSX inspecionados;
- 165 botões verificados;
- 49 links verificados;
- 10 formulários verificados;
- 0 controles suspeitos.

Critérios:

- botão precisa ter `onClick`, `formAction`, `type="submit"` ou `type="reset"`;
- link precisa ter `href` ou `onClick`;
- formulário precisa ter `onSubmit` ou `action`.

Este teste detecta controles sem ligação explícita. A homologação em navegador continua necessária para confirmar permissões, respostas de API, equipamentos e integrações externas.
