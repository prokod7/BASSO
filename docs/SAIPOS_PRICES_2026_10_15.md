# Preços e bebidas conferidos na Saipos — 15/10/2026

Fonte: https://laforneriabasso.saipos.com/home/pizza-brotoqbsbcr — seletores ativos da lista geral, não categorias desativadas nem promoções. Alterações autorizadas pelo cliente na conversa.

A migration 034 atualiza 33 preços de pizza grande e 31 de broto, mais Coca-Cola e Coca-Cola Zero de 1 L para R$12,00. Escarola e Chocolate não têm reajuste na broto. Salame broto passa a R$38,50, inclusive redução em relação ao cadastro anterior. Atum Sólido com Cream Cheese usa R$75,00/R$47,50 e Seis Queijos R$73,00/R$46,50, conforme lista ativa.

Novos produtos: Vinho Semi Seco R$45,00; Suco de Uva Integral 1 L R$30,00; Heineken Zero Long Neck R$11,00. Não foram inferidos volume ou marca onde a fonte não identifica. Os produtos novos ficam sem rastreio de estoque até configuração no painel.

O catálogo base recebe os mesmos valores. A migration não altera descrições, disponibilidade ou composição de ofertas. Não remove Aliche, Aliche com Mozzarella ou Sprite Zero pela ausência na Saipos. Produtos novos existentes não são sobrescritos; mudança concorrente de preço interrompe o bloco inteiro para nova conferência. Reexecução não aumenta versões quando o preço já está correto.

Validação: teste PostgreSQL isolado (PGlite) sobre definições reais do esquema e seed anterior, conferindo 33/31 reajustes, catálogo, inserções, reexecução, rollback em conflito e preservação de disponibilidade/combos/tamanho sem reajuste.

Publicação pendente: a conexão Supabase retorna "You do not have permission to perform this action" para o projeto Basso bseocjeghmjzrjadqnfd. Aplicar migrations 033 e 034, verificar preços no banco e menu público e publicar o código somente após restabelecer acesso ao projeto correto. Nenhum preço de produção foi alterado nesta entrega.
