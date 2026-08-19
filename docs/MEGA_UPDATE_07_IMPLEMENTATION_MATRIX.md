# Matriz de implementação — Mega Update 07

Esta matriz relaciona o escopo final de 500 otimizações aos blocos efetivamente tratados nesta versão.

| Bloco do escopo | Resultado no MU07 |
|---|---|
| 1–50 Fundação/produção | Hardening de demo, API helper, Error Boundaries, estados de conexão, migration/version check, idempotência e concorrência |
| 51–120 Cardápio | Busca sem acentos, status revalidado, horário/next opening, manutenção do layout mobile-first e estrutura de categorias |
| 121–160 Pizza Builder | Regras existentes preservadas, busca sem acentos, edição da pizza a partir do carrinho e resumo de composição |
| 161–200 Carrinho | Detalhes da montagem, editar, duplicar, limpar com confirmação, persistência local e CTA final melhorado |
| 201–270 Checkout | Quote autoritativa, cupom real, cobertura, cash/troco, retry idempotente, ID final do servidor e limpeza pós-sucesso |
| 271–300 Pós-compra | Infraestrutura existente de pedido/token/tracking preservada; nenhuma redução de segurança |
| 301–330 Dashboard | Dados reais preservados, API padronizada e instrução de migration atualizada |
| 331–440 Pedidos/comanda | Fluxos server-backed existentes preservados; numeração concorrente agora é autoritativa no banco |
| 441–475 KDS | Mutação server-first, estados operacionais coerentes e áudio reutilizável |
| 476–500 Expedição | Checklist persistente, validação servidor/banco, prontidão dos itens e auditoria |
| Caixa/financeiro/estoque | Migrados para confirmação real do backend |
| Cupons | CRUD essencial real e validações |
| Salão | Ações críticas server-first |
| Motoboy | Turno/GPS/status server-first |
| Campanhas | Ações reais e recarga autoritativa |
| Integrações | iFood preservado; 99Food e Rede continuam contract-first, sem endpoints inventados |

## Critérios não simulados

Recursos dependentes de fornecedores externos permanecem claramente marcados como pendentes até existir contrato oficial/documentação/credenciais. Em especial:

- protocolo HTTP oficial da 99Food;
- SDK/App2App e homologação da Laranjinha Smart;
- gateway de Pix automático não escolhido.

Esses itens não foram "marcados como prontos" apenas para fechar checklist.
