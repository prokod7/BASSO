# Mega Update 06 — validação

## Resultado estrutural

- migrations: **16 em sequência**, de `001_core_schema.sql` a `016_integration_ready_99food_tracking_smartpos.sql`;
- verificação estática: **87/87 aprovada**;
- auditoria de UI: **73 arquivos TSX/JSX**, **264 botões**, **59 links**, **19 formulários**, **0 controles suspeitos**;
- parser TypeScript/TSX: **211 arquivos**, **0 erro sintático**;
- adaptador iFood: SHA-256 da base Mega Update 05 e desta versão **idêntico** (`b4e3ab7c9815afdd673a28dd1d708f8b8caeae51e4a8464edbb9c4de8a455e22`).

## 99Food

A rota exata `POST /api/integrations/99food/webhook` foi criada e liberada do middleware de autenticação do painel. A própria rota exige a futura validação oficial da autenticidade do webhook antes de enfileirar qualquer evento.

O código antigo que presumiu endpoints/headers da 99Food foi removido. A integração está `contract-first`: credenciais, fila, idempotência, logs, correlação, tela, retry e arquitetura de consulta assíncrona do pedido estão prontas; chamadas externas reais permanecem bloqueadas até os trechos oficiais listados em `99FOOD_OFFICIAL_DOCS_NEEDED.md` serem fornecidos.

## Rastreamento

A migration 016 cria turno do motoboy separado do token do cliente. O `order_id` da telemetria passa a ser opcional durante turno ativo, permitindo que a pizzaria continue acompanhando o motoboy depois de uma entrega. O token do cliente é revogado/ocultado quando o pedido conclui ou cancela.

## SmartPOS

A base registra dispositivos `waiter_smartpos`, prepara metadados de transação/NSU e adiciona modo de terminal à tela do garçom. Nenhuma API Rede/Laranjinha é presumida; pagamentos permanecem bloqueados até SDK/App2App e certificação oficiais.

## Limitação do ambiente de validação

A instalação de dependências (`npm install`) não terminou neste ambiente sem acesso funcional ao registro npm. Por consequência:

- `npm test` não pôde executar porque `vitest` não está instalado;
- `npm run build` não pôde executar porque `next` não está instalado;
- `npm run typecheck` encontra módulos/tipos ausentes por falta de `node_modules`.

Portanto, **não é correto afirmar que o Next build completo passou aqui**. A Vercel/GitHub Actions deve executar o gate final com as dependências reais. O parser local e os validadores estruturais acima passaram.
