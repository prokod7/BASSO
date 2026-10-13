# La Forneria Basso — auditoria de pré-entrega

**Auditoria:** 13/10/2026. **Entrega pretendida:** 14/10/2026. **Ambiente:** `pedidopro7/basso` / Vercel `basso` / Supabase `bseocjeghmjzrjadqnfd`.

> Este documento diferencia validação técnica de homologação operacional física. Nenhum pedido de teste foi criado para evitar alterar financeiro, estoque e mesas sem a equipe.

## Confirmado por consultas reais
- GitHub `main` estava no commit `95b95efeb66dc042a1440833e18d4a1889297ca0`; Vercel correspondente `READY`.
- Supabase com migrations até 030 antes deste patch; 74 zonas ativas de entrega, 15 mesas, 7 perfis ativos e vinculados a 7 usuários Auth.
- 74/74 tabelas do schema `public`? **Não:** foram verificadas **74 tabelas e todas com RLS ativo**; esta contagem é de tabelas, não de zonas. Há **74 zonas ativas** separadamente.
- Sem erros agregados na Vercel nos sete dias anteriores à auditoria, e sem jobs de impressão ou integrações em estado `failed` no instante da consulta.
- Pedidos históricos: 6 não excluídos; 4 cancelados, 2 concluídos; **0 pedidos nos últimos 7 dias**. Portanto o sistema não tem evidência de uso recente ponta a ponta.
- Uma comanda da **Mesa 1** segue aberta desde 24/09/2026 sem pedidos vinculados e sem pagamento; a mesa permanece ocupada. **Não fechar automaticamente sem confirmar com a operação**.
- 31 registros de estoque com saldo **zero** e `allow_negative=true`. A venda não será bloqueada por saldo zero; o controle de estoque exige inventário real.
- Sem entregador ativo; 0 promoções cadastradas.
- Features iFood, 99Food, Pix automático, Rede SmartPOS, push e Print Bridge desativadas; cliente pode usar fluxo manual onde o módulo oferecer essa opção.
- Nenhum `SECURITY DEFINER` de `public` encontrado com `EXECUTE` para `anon` ou `authenticated`. Todas as 74 tabelas consultadas em `public` estão com RLS ativo.

## Defeito corrigido neste patch (migration 031)
- A publicação `supabase_realtime` existia com **0 tabelas**; o painel dependia da reconciliação a cada 45s, atrasando as atualizações da operação.
- Migration 031 publica **18 tabelas operacionais** já protegidas com RLS. Tabelas de clientes, trilha de auditoria e destinatários de campanhas foram excluídas intencionalmente da publicação para reduzir superfície de dados.
- RPC `pedidopro_realtime_health()` expõe apenas contagens/metadados para o backend `service_role`; `anon`/`authenticated` não podem executá-la.
- Diagnóstico agora exige migration 031 e verifica publicação de 10 tabelas essenciais; antes informava operação saudável apenas por contar pedidos e exigia migration 028.

## O que continua pendente de homologação presencial

### Obrigatório para entregar a operação principal
1. **Mesa 1:** confirmar se a comanda antiga pode ser encerrada/cancelada pelo painel. Não mexer em produção sem autorização.
2. **Teste real de balcão:** abrir caixa, lançar pizza + bebida, cobrar (dinheiro com troco, Pix manual ou cartão presencial), confirmar pedido/KDS, imprimir, concluir, reconciliar caixa e saldo.
3. **Teste de salão em dois dispositivos:** garçom abre mesa, lança pizza 1/2 e adicionais, KDS prepara, marca servido, divide conta e registra pagamentos parciais; conferir fechamento e liberação da mesa.
4. **Teste do delivery próprio:** cliente escolhe cidade/bairro, taxa exata, pedido; painel recebe; cozinha imprime; expedição libera; confirmar entrega. Validar motor de pizza, cupom/promo e valores pelo servidor.
5. **Impressão 80 mm:** usar imprimir no navegador para teste imediato. Para automática, instalar Print Bridge no PC local, definir chave, impressoras e confirmar ticket real.
6. **Usuários e dispositivos:** abrir sessão de gestor, caixa, garçom e cozinha, validando ações permitidas/bloqueadas, sem compartilhar credenciais.
7. **Estoque:** informar saldo inicial verdadeiro dos 31 itens e revisar `allow_negative` após inventário.
8. **Motoboy:** cadastrar funcionário/telefone se tracking fizer parte da entrega; validar GPS, permissão no celular e verificação de retirada/entrega.
9. **Backup e contingência:** verificar recuperação do Supabase, equipamentos da loja, internet, impressão alternativa, e plano de operação manual.

### Não bloquear o fluxo próprio com integrações externas
- iFood/99Food: features desligadas; reativar apenas após homologação dos contratos e pedido de teste externo.
- Rede/Laranjinha: SDK/App2App/homologação não concluídos; receber em maquininha de maneira manual.
- Pix automático: desativado; não anunciar confirmação automática enquanto não houver webhook do provedor.
- Push, Resend/campanhas e cron: sem ativação operacional comprovada.
- Fiscal: validar o projeto/contrato fiscal separado antes de prometer emissão automática.

## Segurança e observabilidade
- Supabase Auth mostrou alerta pré-existente de **proteção contra senhas vazadas desabilitada**: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Advisor também retorna RLS sem policy em tabelas internas deliberadamente apenas server-side, e índices históricos não usados. Não remover índices sem evidências de carga.
- O registro persistido de `system_health_checks` estava desatualizado. Executar diagnóstico novamente após publicar migration 031.

## Critério de aceite
A entrega da operação **não deve ser anunciada como 100% homologada** até os testes físicos de pagamento, mesa, impressão e delivery serem confirmados. As métricas de CI (TypeScript, unit, build) e deploy READY comprovam prontidão do código, não funcionamento do hardware/integrações reais.
