# Entrega — La Forneria Basso PedidoPro 4.0

Este pacote contém o código-fonte consolidado do PedidoPro, com os ajustes de build anteriores e o Mega Update 04 de autonomia operacional.

## Conteúdo

- cardápio digital e montagem oficial de pizzas;
- checkout, conta e acompanhamento;
- central administrativa de pedidos e comandas;
- PDV, salão, 15 mesas, comandas e garçom;
- KDS, expedição, delivery manual e PWA do motoboy;
- CRM, fidelidade interna, cupons e comunicação manual;
- estoque restrito, compras e fornecedores;
- caixa, financeiro e relatórios;
- centro de comando, rotinas, tarefas, aprovações e notificações;
- usuários, permissões, auditoria e diagnóstico;
- perfis e fila de impressão;
- exportação operacional e contingência;
- APIs, RLS, RPCs, idempotência e Realtime;
- migrations `001` a `014`;
- pipeline de qualidade e documentação.

## Atualização de um banco existente

Caso o banco já possua as migrations `001` a `013`, execute apenas:

```text
supabase/migrations/014_autonomy_operations_and_control.sql
```

Não repita as migrations anteriores.

## Instalação nova

Execute todos os SQLs, do `001` ao `014`, um por vez e em ordem.

## Primeiro acesso após o update

1. Faça o deploy.
2. Acesse `/painel/diagnostico`.
3. Execute os testes de saúde.
4. Confira a migration mínima `014`.
5. Configure os canais e prazos da loja.
6. Execute uma rotina de abertura.
7. Teste pedido, pagamento, KDS, expedição e fechamento.

## Limites externos

Credenciais, bairros, taxas, equipamentos, terminais e contas reais devem ser preenchidos na implantação. iFood, 99Food, Rede, Pix automático, notificações, impressão física e mapa não são considerados homologados sem os respectivos fornecedores e equipamentos.
