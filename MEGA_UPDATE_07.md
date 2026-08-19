# Mega Update 07 — Production Final / Basso Operations 1.0

Esta versão transforma o PedidoPro da La Forneria Basso de uma base híbrida de demonstração/operação em uma versão preparada para operação real, com prioridade em persistência, concorrência, idempotência, controle do administrador, segurança de checkout e experiência mobile.

## Objetivo

O critério desta versão não é "o botão aparece". Uma função crítica só é considerada operacional quando percorre o fluxo:

`UI → API → validação servidor → PostgreSQL/Supabase → auditoria → refresh → outro dispositivo → recuperação de erro`.

O modo demonstração continua disponível quando `NEXT_PUBLIC_DEMO_MODE=true`, porém não é fonte de dados ou fallback silencioso quando `NEXT_PUBLIC_DEMO_MODE=false`.

## Principais mudanças

### 1. Produção sem fallback falso

- `demo-store` inicia vazio em produção.
- localStorage operacional só é lido/escrito no modo demonstração.
- falha do backend não injeta pedidos, caixa, estoque ou métricas fictícias.
- componentes críticos de produção usam APIs e aguardam confirmação do servidor.
- erro, loading, offline e reconexão têm estados explícitos.

### 2. Numeração atômica de pedidos

A migration `017_production_final_hardening.sql` cria `order_number_seq` e um trigger PostgreSQL que se torna a única autoridade do número interno do PedidoPro.

Isso elimina colisões quando dois celulares, PDV, QR Code ou marketplace criam pedidos simultaneamente. O número enviado pelo navegador passa a ser apenas provisório; o banco define o número final.

### 3. Checkout endurecido

- cotação autoritativa via `/api/quote` antes da confirmação;
- subtotal, desconto, entrega e total exibidos a partir do servidor;
- cupom de produção não depende do estado demo;
- delivery próprio é bloqueado quando bairros/taxas ainda não estão configurados;
- forma dinheiro valida troco contra o total final;
- chave de idempotência é preservada durante retry;
- retry de timeout não cria um novo pedido lógico;
- quando a API responde com um pedido já criado, o checkout usa o ID e número reais retornados pelo servidor;
- carrinho só é limpo após sucesso confirmado.

### 4. Carrinho e experiência de compra

- carrinho continua persistido no dispositivo;
- composição da pizza aparece no carrinho;
- sabores, adicionais, retiradas e observações ficam visíveis;
- pizza pode ser editada sem reconstruir a compra do zero;
- item pode ser duplicado;
- limpar carrinho exige confirmação;
- CTA mobile mostra o subtotal atual;
- busca pública agora ignora acentos/diacríticos;
- status da loja é revalidado a cada 30 segundos;
- horário local continua visível quando a API de status estiver temporariamente indisponível;
- horário informa próxima abertura corretamente depois do fechamento.

### 5. Caixa

- abertura, fechamento, sangria, suprimento e ajustes passam pelo backend em produção;
- nenhuma movimentação crítica é considerada concluída antes do servidor responder;
- fechamento mostra valor declarado e diferença;
- histórico é recarregado do banco;
- erros preservam os dados do formulário.

### 6. Financeiro

- lançamentos são carregados da API real;
- novo lançamento é persistido antes de aparecer como concluído;
- baixa e cancelamento são server-first;
- exportação CSV preservada;
- modo demo permanece isolado.

### 7. Estoque

- estoque de bebidas/sobremesas é carregado do Supabase;
- ajuste requer motivo;
- idempotency key é enviada ao backend;
- quantidade só é tratada como salva depois da resposta do servidor;
- tela recarrega o saldo autoritativo após ajuste.

### 8. Cupons

- criação e ativação/pausa são reais em produção;
- percentual máximo de 100%;
- limite de uso, pedido mínimo, início, fim e canais;
- canais do formulário administrativo priorizam canais próprios;
- limite não pode ser reduzido abaixo dos usos existentes;
- todas as regras finais são revalidadas no servidor no momento do pedido.

### 9. KDS

- status de produção em modo produção é alterado via API;
- cozinha/bar não simulam confirmação que depende de outro perfil;
- recebidos aguardam confirmação;
- confirmados avançam para preparo;
- preparo avança para pronto;
- um único `AudioContext` é reutilizado para alertas;
- impressão continua server-backed;
- Realtime/snapshot atualiza outros terminais.

### 10. Salão e comandas

- abrir comanda, transferir, pagar, agrupar/separar mesas e alterar estado passam pelas APIs reais;
- ações aguardam confirmação do servidor;
- refresh operacional ocorre após sucesso;
- não existe mutação local otimista como autoridade em produção.

### 11. Motoboy

- início/fim de turno via API;
- GPS via rota protegida;
- envio de posição tem throttle e impede requisições concorrentes;
- início da entrega e conclusão passam pela máquina de status do pedido;
- conclusão não marca pagamento como pago artificialmente;
- tracking do cliente é encerrado ao concluir;
- tracking interno continua enquanto o turno estiver ativo.

### 12. Expedição persistente

A migration 017 adiciona `orders.expedition_checklist`.

- cada check é salvo no banco;
- atualizar a página não apaga a conferência;
- outro computador enxerga a conferência;
- liberação é validada no PostgreSQL;
- o servidor exige os quatro pontos obrigatórios;
- o servidor verifica se todos os itens de produção estão prontos;
- devolução exige motivo;
- alterações geram auditoria.

### 13. Campanhas

- criação, execução e cancelamento usam APIs reais;
- lista é recarregada do banco após mutação;
- dados de marketplace continuam fora da base própria de relacionamento conforme regra do projeto.

### 14. Auditoria

- nova API de consulta de auditoria;
- filtros por ator, entidade, ação e busca;
- exportação CSV;
- alterações críticas da migration 017 também geram eventos de auditoria.

### 15. Resiliência e UX global

Foram adicionados:

- `src/app/error.tsx`
- `src/app/loading.tsx`
- `src/app/not-found.tsx`
- `src/app/painel/error.tsx`
- `src/app/painel/loading.tsx`

O `OperationalHydrator` passa a distinguir `loading`, `online`, `offline` e `error`, efetuar refresh seguro e revalidar o snapshot operacional após reconexão.

### 16. Diagnóstico e versão

- app: `7.0.0`;
- migration mínima: `017`;
- painel mostra PedidoPro 7.0;
- diagnóstico alerta banco desatualizado;
- dashboard deixa de orientar migration antiga.

## Integrações preservadas

### iFood

O arquivo `src/lib/integrations/ifood.ts` não foi alterado. O SHA-256 do adaptador no Mega Update 06 e no Mega Update 07 é o mesmo:

`b4e3ab7c9815afdd673a28dd1d708f8b8caeae51e4a8464edbb9c4de8a455e22`

### 99Food

A arquitetura criada no Mega Update 06 foi preservada. Endpoints, assinatura, autenticação e payloads externos continuam bloqueados pelo contrato oficial enquanto a documentação oficial não for fornecida. Nenhum endpoint foi inventado neste update.

### Rede / Laranjinha Smart

A fundação de SmartPOS/app do garçom permanece pronta. Pagamento integrado continua aguardando SDK/App2App e homologação oficial da Rede/Itaú.

## Migration obrigatória

Executar uma única migration nova após as anteriores:

`supabase/migrations/017_production_final_hardening.sql`

Não repita migrations anteriores que já tenham sido aplicadas.

## Validações desta entrega

- 17 migrations em sequência;
- 96/96 verificações estáticas internas aprovadas;
- 212 arquivos TypeScript/TSX analisados por parser;
- 0 erros de sintaxe;
- auditoria de 281 botões, 61 links e 19 formulários;
- 0 controles suspeitos pelo auditor estático;
- adaptador iFood com SHA-256 idêntico ao Mega Update 06 corrigido.

### Limite do ambiente

O `npm install` foi tentado nesta sessão e expirou por indisponibilidade de acesso ao registro npm. Por isso, `tsc --noEmit`, Vitest e `next build` completos dependentes de `node_modules` devem ser executados no GitHub Actions/Vercel. Não é correto declarar o build de produção como aprovado localmente sem as dependências.

## Ordem de implantação

1. Subir o código do Mega Update 07.
2. Rodar `017_production_final_hardening.sql` no Supabase.
3. Confirmar as ENV já existentes.
4. Fazer deploy no Vercel.
5. Conferir `/painel/diagnostico`.
6. Testar um pedido próprio completo.
7. Testar PDV.
8. Testar salão/comanda.
9. Testar KDS e expedição.
10. Testar caixa/financeiro/estoque.
11. Só depois iniciar homologação Sandbox da 99Food.
