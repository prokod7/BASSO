# Mega Update 04 — Autonomia Operacional e Controle Total

Versão do aplicativo: **4.0.0**  
Migration nova para quem já instalou o Mega Update 02: **014_autonomy_operations_and_control.sql**

## Objetivo

Transformar o painel em um centro de comando capaz de conduzir a operação diária da La Forneria Basso sem acesso direto ao Supabase para tarefas comuns. Toda ação nova deste pacote usa API protegida, persistência no banco, validação, retorno de erro e auditoria quando aplicável.

## Módulos acrescentados

### Centro de comando

- situação da loja e do caixa;
- pedidos ativos, atrasados, não visualizados e não pagos;
- faturamento e ticket médio do dia no fuso de São Paulo;
- mesas, comandas, motoboys e entregas;
- estoque baixo, falhas de impressão, integrações e filas;
- tarefas, aprovações, notificações, ocorrências e usuários ativos;
- indicadores clicáveis que abrem o módulo correspondente.

### Controle avançado da loja

- abrir, pausar e fechar;
- canais ativos de delivery próprio, retirada, balcão, salão e QR Code;
- prazo de preparo e de entrega;
- pausa temporária com retorno automático;
- motivo operacional e mensagem pública;
- histórico auditável de alterações.

### Rotinas de abertura e fechamento

- modelos oficiais persistentes;
- execução diária guiada;
- itens obrigatórios e opcionais;
- conclusão, bloqueio ou justificativa de item;
- impedimento de fechar rotina com pendência obrigatória;
- resumo e auditoria.

### Coordenação da equipe

- tarefas internas com responsável, prioridade, prazo, origem e status;
- central de aprovações para ações sensíveis;
- notificações internas por usuário ou perfil;
- presença operacional baseada na última atividade autenticada;
- busca global por pedido, cliente, mesa, produto, motoboy, tarefa e financeiro.

### Expedição

- fila exclusiva de pedidos prontos;
- conferência iniciada, aprovada ou devolvida à produção;
- observações de expedição;
- responsável e horário da conferência;
- versão do pedido e auditoria.

### Compras e fornecedores

- fornecedores;
- pedidos de compra de bebidas e sobremesas;
- previsão, custo, recebimento parcial e total;
- bloqueio contra recebimento acima do pedido;
- entrada transacional no estoque;
- auditoria da compra e da movimentação.

### Comunicação

- edição dos modelos de WhatsApp existentes;
- ativação, ordenação e variáveis de mensagem;
- operação continua manual, sem chatbot ou envio automático.

### Impressão administrável

- perfis por impressora;
- fabricante, modelo, largura de 58/80 mm, colunas e conexão;
- setor, vias e impressão automática;
- estrutura do documento, destaques e ordem dos blocos;
- fila real continua dependente do Print Bridge local.

### Diagnóstico e continuidade

- saúde do banco, autenticação, Realtime, impressão, filas, migrations, imagens e integrações;
- execução manual dos testes de saúde;
- versão mínima de banco requerida;
- exportação operacional por módulos em JSON;
- registro local dos arquivos gerados;
- sem restauração automática perigosa pelo navegador.

### Qualidade e sincronização

- atualização Realtime ampliada para pedidos, itens, pagamentos, mesas, comandas, motoboys, estoque, impressão, tarefas, notificações e estado da loja;
- presença do usuário a cada minuto;
- verificador de sequência das migrations;
- auditoria de botões;
- pipeline do GitHub para TypeScript, testes e build;
- validação estática ampliada para os módulos do Mega Update 04.

## Banco de dados

A migration 014 cria ou amplia:

- `system_migrations`;
- `operational_checklist_templates`;
- `operational_checklist_runs`;
- `operational_checklist_run_items`;
- `operation_tasks`;
- `approval_requests`;
- `internal_notifications`;
- `system_health_checks`;
- `print_profiles`;
- `suppliers`;
- `purchase_orders`;
- `purchase_order_items`;
- campos de presença, preferências, expedição, loja e motoboys;
- RPCs transacionais de checklist, aprovação, expedição e recebimento de compras.

## Instalação sobre o Mega Update 02

1. Substitua os arquivos pelo pacote completo ou aplique o patch.
2. Execute somente `supabase/migrations/014_autonomy_operations_and_control.sql`.
3. Faça commit e push.
4. Aguarde o pipeline e o deploy da Vercel.
5. Entre em `/painel/diagnostico` e execute todos os testes.
6. Entre em `/painel/rotinas` e faça uma abertura de teste.
7. Revise os perfis em `/painel/impressao` antes de ativar impressão automática.

Em uma instalação nova, execute as migrations `001` a `014`, sempre em ordem.

## Integrações externas

Continuam dependentes de credenciais, equipamentos ou homologação:

- iFood;
- 99Food;
- Rede;
- Pix automático;
- OneSignal;
- Resend;
- Print Bridge;
- mapa e rastreamento.

O painel mostra o estado real dessas integrações. As alternativas manuais continuam disponíveis e não simulam sucesso.

## Limites honestos desta entrega

A central de aprovações registra, decide e audita solicitações; a execução automática da ação aprovada depende de o fluxo específico chamar a operação correspondente. A exportação gera um pacote operacional verificável, mas não restaura dados automaticamente. Integrações externas somente podem ser homologadas com credenciais e ambientes reais dos fornecedores.
