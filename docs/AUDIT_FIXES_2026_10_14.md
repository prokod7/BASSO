# Basso — correções da auditoria de 14/10/2026

Base: `490cd2d114efa01c500d9e60a800dadd41bb386d`. Migration: `032_audit_operation_integrity.sql`.

## Comportamento corrigido

1. Checkout público fixa estado inicial, pagamento pendente, origem e datas no servidor; a função do banco reforça a regra.
2. Snapshot aplica permissões por domínio antes de buscar dados financeiros, caixa, auditoria, campanhas e integrações.
3. Bootstrap público de usuários foi encerrado. O login não tenta reativar contas nem redefinir senhas iniciais. A gestão autenticada continua criando usuários.
4. Área do cliente consulta somente pedidos cujos tokens privados estão no aparelho. Telefone informado em novo pedido não libera histórico de terceiros. A consulta agregada de fidelidade permanece com a equipe até existir verificação de identidade.
5. Middleware foi movido para `src/middleware.ts`, validado no manifesto real. Protege páginas internas, perfis desativados e troca obrigatória de senha; as APIs mantêm sua autenticação própria. Cookies renovados são preservados em redirecionamentos.
6. Escrita direta em mesas/comandas foi revogada para os papéis do navegador; leitura e Realtime continuam sujeitos a RLS.
7. Venda interna paga em dinheiro exige caixa aberto dentro da transação. Repetir venda já gravada continua retornando seu ID original, inclusive após fechar o caixa.
8. Índice único parcial impede dois caixas abertos. Abertura também usa bloqueio transacional.
9. Inclusão, quantidade, cancelamento e restauração de itens reconciliam estoque pelo saldo dos movimentos, sem repetir baixas em retries.
10. Pedidos encerrados não aceitam edição de itens. Consumo, desconto e taxa não mudam após iniciar recebimentos; produção e observações de pedido aberto continuam disponíveis. A taxa de serviço deve ser definida antes dos pagamentos.
11. Cancelamento de comanda é transacional: valida ausência de recebimentos, cancela pedidos, reconcilia estoque e libera mesa somente se não houver outra comanda aberta. Recebimentos existentes bloqueiam cancelamento e exigem conciliação.
12. Retry de pagamento de comanda reconhece e valida a chave antes de examinar saldo/estado; retorna resultado original, inclusive após fechamento.
13. Comando padrão executa os dois diretórios de testes; todos os 147 testes passam.
14. Trigger duplicado de numeração removido, sem reiniciar sequência nem reescrever números históricos.
15. Inclusão de item, total, estoque, auditoria e fila de impressão são atômicos e usam o ID estável do item. Falha na fila reverte o lançamento. Acréscimo imprime apenas o item novo.
16. Versão esperada é conferida dentro da transação de status; conflito retorna HTTP 409.

A criação por QR também recupera a resolução segura de mesa/comanda que havia sido perdida em uma migration anterior. Alterações de desconto/taxa usam a mesma proteção transacional de itens e mantêm a restrição matemática do total no banco.

## Validação

- TypeScript aprovado e build de produção com middleware presente.
- 147 testes em 17 arquivos, incluindo 22 cenários PostgreSQL em PGlite: caixa fechado, estoque/rollback, pagamento parcial/integral/retry, cancelamento de comanda, versão e privilégios.
- Os testes são isolados, com estrutura e funções de referência sem dados de clientes. O fixture usa text no lugar de citext e não substitui teste de concorrência real em aparelhos independentes.
- 32 migrations em sequência; auditoria de 365 botões, 65 links e 20 formulários sem controles sintaticamente suspeitos.
- 91 verificações estáticas locais passaram; a de arquivos de imagem foi conferida separadamente contra a árvore Git, pois os binários não foram copiados para a análise local.

## Publicação e operação

Aplicar a migration 032 antes deste código. A mudança de assinatura da função de status mantém os quatro argumentos antigos por padrão, para compatibilidade durante a publicação. Todas as funções novas ou substituídas permanecem restritas a service_role.

A migration não corrige saldos históricos, não inventa estoque inicial, não altera senhas, não cria vendas nem habilita integrações externas. Impressão física, teste em vários aparelhos, provedor Pix, maquininha e marketplaces continuam dependendo de homologação operacional. O Print Bridge instalado na loja deve usar a versão atual para identificar explicitamente os tickets de acréscimo.
