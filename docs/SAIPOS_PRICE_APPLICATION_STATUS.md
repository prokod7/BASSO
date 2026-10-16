# Estado da aplicação de preços Saipos

Os dados da migration 034_saipos_prices_and_beverages.sql foram aplicados ao projeto Basso bseocjeghmjzrjadqnfd pela conexão BASSO usando execute_sql (operação somente de dados). Foram conferidos os 33 sabores e as cinco bebidas na API pública de produção https://basso-seven.vercel.app/api/menu/public?channel=pickup: nenhuma divergência de preço, todas as cinco bebidas ativas.

A migration 033 NÃO foi aplicada. Duas chamadas apply_migration retornaram Invalid or expired requestState; consulta a system_migrations confirmou ausência da versão 033. Não publicar o código desta PR antes de aplicar e verificar 033. O código da 034 é idempotente para os valores já aplicados.

Os registros anteriores que dizem que os preços não foram aplicados descrevem o estado anterior à liberação da conexão BASSO. A publicação de componentes de combos, autonomia e comandas permanece pendente.
