# Mega Update 08 — Operação Final Basso

Consolidação dos ajustes operacionais finais sobre o Mega Update 07.

## Regras e experiência de compra
- Adicional de pizza pergunta se vale para a pizza inteira ou somente uma metade. Quando aplicado em metade, o cliente escolhe a metade/sabor e paga 50% do valor do adicional.
- Grande meio a meio aceita sabores de qualquer categoria; Premium/Tradicional/Doce são filtros de navegação e não bloqueios de combinação.
- Combos compatíveis aceitam Grande meio a meio e adicionais por inteira/metade; novos combos podem ser cadastrados com dias e horários de disponibilidade.
- Salsa removida do sabor Salame.
- Água Tônica Schweppes lata desativada.
- Del Valle 290 ml separado em Uva, Pêssego, Goiaba e Maracujá.
- Área privada do cliente exibe pedidos próprios e fidelidade usando token de acesso do pedido, sem expor histórico por telefone.

## Operação interna
- PDV permite registrar delivery recebido por WhatsApp/telefone/balcão e pesquisar a base própria de clientes.
- Comandas passam a ter taxa de serviço de 10% por padrão e opção de retirar/reaplicar antes do fechamento.
- Caixa impede sangria acima do dinheiro esperado disponível.
- Motoboy em turno pode escolher qual pedido próprio já pronto assumir, mantendo uma entrega ativa por vez.
- KDS inclui modo monitor/tela cheia e mostra onde cada adicional deve ser aplicado.
- Pedidos do iFood usam destaque vermelho; 99Food, amarelo; o código externo é mostrado quando disponível.
- Kanban de pedidos aceita drag-and-drop entre etapas válidas e continua submetendo a transição ao backend para validação e auditoria.

## Impressão
- Print Bridge ganhou heartbeat, teste de impressão, listagem de impressoras Windows e scripts de inicialização.
- O painel mostra estado Online/Offline/Pendente e permite gerar trabalho de teste.
- Jobs históricos antigos são cancelados na migration 018 antes da ativação do bridge, evitando impressão retroativa acidental.
- A impressão física só é considerada operacional após instalar/configurar o agente local, `PRINT_BRIDGE_KEY`, nome exato das impressoras e confirmar uma folha real em cada equipamento.

## Banco
Migration: `supabase/migrations/018_final_operation_patch.sql`.

Ela adiciona origem do pedido, taxa de serviço, novas RPCs de comanda/caixa/motoboy, ajustes de catálogo, regras do combo e preparação segura do Print Bridge.

## Integrações externas
O MU08 não inventa contratos de terceiros. A 99Food permanece condicionada à documentação oficial do contrato HTTP já definida no projeto, e Rede/Laranjinha permanece condicionada ao SDK/App2App e homologação oficiais.
