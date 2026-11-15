# Atualizações da operação — 15/11/2026

- WhatsApp: mantém a oferta única de sobremesa e remove ofertas proativas de bebidas. Bebidas solicitadas pelo cliente e escolhas obrigatórias de combos continuam disponíveis.
- Atendimento humano: chamado sonoro e faixa persistente em todas as seções do painel de gestores/atendentes. Consulta a cada 8 segundos e repete som a cada 30 segundos enquanto houver chamado não lido. Navegadores que bloquearem áudio mostram o botão para ativá-lo. Abrir a conversa marca o chamado como lido.
- Numeração: retorna ao contador diário, com virada à meia-noite em America/Sao_Paulo. IDs, números permanentes e números visíveis históricos não são alterados. No dia da implantação, continua do último número já emitido; o próximo dia começa em 1.
- Site: botão específico para salvar os textos. Banco mescla textos e fotos sob bloqueio da linha, evitando perda de configurações por gravações concorrentes. A página pública consulta dados atuais a cada 15 segundos e ao recuperar foco.
- Broto: dois sabores doces ou um doce com um salgado. Dois salgados são bloqueados no seletor, no cálculo do servidor e no trigger do banco. Grande mantém as combinações existentes.
- Motoboys: perfil criado/alterado em Usuários e Acessos cria/sincroniza o cadastro operacional na mesma transação. A conta acessa seu próprio motoboy e entregas atribuídas; pode escolher entregas prontas ainda sem atribuição.
- Autorização: após trocar a senha temporária, o motoboy lê os termos, confirma o nome e aceita expressamente. Registro imutável por conta/versão, com horário do banco. Middleware e APIs exigem aceite da versão ativa. Uma nova versão exige novo aceite.
- Impressão: adicionais agrupados abaixo do sabor, no formato `1x (Milho — Mussarela)`, `2x (Catupiry — Calabresa)` ou `1x (Bacon — Pizza inteira)`. O mesmo formatador atende comanda do navegador e ponte de impressão. Nomes persistidos na seleção são usados também para itens personalizados.

## Implantação

Aplicar `supabase/migrations/20261115055506_basso_requested_updates.sql` antes de publicar o código. A migração não altera pedidos/itens históricos nem o conteúdo atual do site. Manter a nova estrutura no banco em eventual rollback do código; mudanças são aditivas.

## Nova versão dos termos

Documentos existentes não aceitam edição do texto/título/versão. Em uma transação administrativa, desativar o documento ativo e inserir outro com nova versão, título e texto aprovados pela pizzaria. O índice permite um documento ativo. Aceites anteriores permanecem consultáveis. O motoboy recebe a versão vigente do banco, e o registro de aceite verifica essa mesma versão no momento da confirmação.

## Validação

Testes PostgreSQL isolados cobrem regras de broto ao inserir/editar itens, números diários e simultaneidade, criação/sincronização do motoboy, aceite idempotente por conta, reaceite por versão e mesclagem de fotos/textos. Testes de interface cobrem seleção da broto, alerta sonoro/visual e envio de aceite. Testes de autorização impedem operação sem aceite e alteração de entregas de outro motoboy. A impressão física e o áudio no aparelho da loja precisam ser conferidos no equipamento de operação.
