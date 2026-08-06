# Validação do Mega Update 02

## Verificações concluídas no pacote

- sintaxe analisada em todos os arquivos TypeScript e TSX: sem erro sintático;
- 61 de 61 verificações estáticas aprovadas;
- 165 botões, 49 links e 10 formulários auditados: nenhum controle suspeito;
- migração `013_admin_control_center.sql` incluída;
- APIs de pedido, itens, pagamentos, comunicação, impressão e estado da loja presentes;
- regras de pizza preservadas;
- nenhum segredo evidente versionado;
- cron de filas preservado como `vercel.pro.json` para não impedir o deploy no plano Hobby.

## Limite do ambiente de geração

O registro npm disponível neste ambiente não possui os pacotes públicos usados pelo projeto, incluindo React, Next.js e `@supabase/ssr`. Por isso, o `npm install`, o `next build` e os testes Vitest não puderam ser executados aqui.

O build final deve ser confirmado pela Vercel após aplicar o patch. O pacote foi submetido a análise sintática e verificações estáticas antes da compactação.

## Homologação operacional necessária

- executar a migração 013;
- abrir/pausar/fechar a loja;
- criar, editar, pagar, imprimir, cancelar e concluir pedidos;
- operar PDV, salão, KDS e delivery em dois dispositivos simultâneos;
- conferir permissões de gestor, atendente, garçom, cozinha e financeiro;
- testar o Print Bridge com as impressoras reais;
- homologar separadamente iFood, 99Food, Rede, notificações e rastreamento.
