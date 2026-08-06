# MEGA UPDATE 02 — Centro de Controle Administrativo e Operacional

Este pacote transforma o painel da La Forneria Basso em uma central de operação persistente no Supabase. A prioridade deste update é permitir que a equipe administre pedidos, comandas, pagamentos, produção, delivery, cardápio, usuários, loja, impressão e auditoria sem editar registros diretamente no banco.

## Migração obrigatória

Quem já executou as migrações `001` até `012` deve executar somente:

```text
supabase/migrations/013_admin_control_center.sql
```

A migração adiciona controle de prioridade e previsão dos pedidos, notas internas, ocorrências, comunicação auditável, estado operacional da loja, edição transacional de itens, pagamentos manuais transacionais, status controlado, liberação de motoboy e revogação de rastreamento ao concluir.

Não repita as migrações `001` a `012` em um banco já implantado.

## Principais entregas

### Central da comanda

A tela de pedidos ganhou uma central lateral com seis áreas:

- Resumo: cliente, endereço, prioridade, previsão, observações, taxa, desconto, motoboy e status.
- Itens: quantidades, produção, cancelamento, restauração, observações e inclusão de itens pelo PDV.
- Pagamento: recebimento manual parcial ou integral e saldo pendente.
- Comunicação: modelos de WhatsApp manual, telefone e registro de abertura.
- Ocorrências: notas internas, problemas, gravidade, resolução e histórico.
- Histórico: linha do tempo, auditoria de status e fila de impressão.

Alterações sensíveis exigem motivo. Pedidos concluídos exigem pagamento integral.

### Gestão de pedidos

- Kanban, lista e cards.
- Indicadores operacionais e atrasos.
- Filtros por status, canal, modalidade, pagamento, prioridade e período.
- Exportação CSV.
- Busca por pedido, cliente, telefone, mesa e endereço.
- Status adaptados ao canal.
- Abertura da comanda sem perder o contexto da lista.

### Administração do cardápio

- Edição de sabores, produtos e adicionais.
- Preços Grande e Broto.
- Descrições, ingredientes, alergênicos, variações e imagens oficiais.
- Canais disponíveis, destaques e disponibilidade.
- Histórico/versionamento de preço pela API.
- Regras fixas de Broto, meio a meio, compatibilidade e ausência de borda preservadas.

### Delivery

- Painel funcional mesmo sem mapa.
- Pedidos prontos, não atribuídos e em entrega.
- Atribuição de motoboy.
- Navegação externa pelo endereço.
- Telefone e WhatsApp manual.
- Início e conclusão da entrega.
- Liberação do motoboy ao concluir.
- Mapa opcional quando existirem coordenadas.

### Cozinha e impressão

- KDS por setor e prioridade.
- Cronômetros e indicação de atraso.
- Alertas sonoros configuráveis.
- Fila real de impressão.
- Retentativa e reimpressão.
- Estado explícito quando o Print Bridge não estiver conectado.

### Usuários e permissões

- Criação e bloqueio de contas.
- Perfil base.
- Limite de dispositivos.
- Redefinição de senha.
- Matriz de permissões específicas.
- Restrições adicionais aplicadas pelo backend quando a permissão é explicitamente desativada.
- Registro das mudanças na auditoria.

### Controle da loja

A barra superior permite:

- abrir a loja;
- pausar pedidos com motivo;
- fechar a loja;
- mostrar o estado real no cardápio público;
- impedir novos pedidos quando o recebimento estiver pausado ou fechado.

### Auditoria

- Filtros por usuário, ação, módulo, entidade e período.
- Exportação.
- Antes e depois das alterações.
- Motivo, origem e horário.
- Histórico de status, pagamentos, itens, usuários, cardápio e loja.

## Integrações externas

As telas e estruturas permanecem preparadas, mas não simulam sucesso. Continuam dependentes de credenciais e homologação:

- iFood;
- 99Food;
- Rede;
- Pix automático;
- OneSignal;
- Resend;
- Print Bridge local;
- rastreamento com coordenadas reais.

O restante da operação não depende dessas integrações para funcionar.

## Aplicação do patch

1. Faça backup do repositório e do banco.
2. Extraia o patch na raiz do projeto.
3. Aceite a substituição dos arquivos.
4. Execute `013_admin_control_center.sql` no SQL Editor do Supabase.
5. Faça commit e push.
6. Na Vercel, execute um novo deploy sem reutilizar o cache do build.
7. Entre no painel e abra a loja pela barra superior.

## Validação

Comandos disponíveis:

```bash
npm run verify:static
npm run audit:buttons
npm run typecheck
npm run test
npm run build
```

`verify:static` valida dados oficiais, migrações, regras críticas, rotas e arquivos. `audit:buttons` percorre a árvore TSX e falha quando encontra botão, link ou formulário sem ação explícita.
