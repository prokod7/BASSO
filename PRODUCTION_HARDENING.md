# Hardening de Produção — La Forneria Basso

Data: 26/08/2026

## Objetivo

Esta release consolida a camada de segurança e desempenho antes da operação real, preservando os fluxos existentes de cardápio, pedidos, salão, PDV, KDS, caixa, estoque, fidelidade, expedição e delivery.

## Alterações incluídas

- remove o bypass de autenticação de produção anteriormente controlado por `NEXT_PUBLIC_DEMO_MODE`;
- mantém o modo demo exclusivamente em desenvolvimento, com opt-in server-side por `DEMO_MODE=true`;
- adiciona a migration `020_production_security_and_performance_hardening.sql`;
- revoga execução direta por `anon` e `authenticated` das funções `SECURITY DEFINER` privilegiadas;
- mantém `current_role()` e `can_manage_operation()` disponíveis somente para usuários autenticados porque são helpers intencionais das policies RLS;
- mantém o `service_role` como executor das operações privilegiadas chamadas pelas APIs server-side;
- fixa o `search_path` das funções de auditoria e numeração apontadas pelo advisor;
- otimiza as policies `profiles_self_select` e `internal_notifications_read` para evitar reavaliação de `auth.uid()` por linha;
- cria índices de suporte para foreign keys que ainda não possuem índice de cobertura;
- documenta como intencionais as tabelas internas com RLS deny-by-default e sem policies de cliente;
- adiciona teste automatizado para impedir regressão do bypass de autenticação e das permissões RPC.

## Segurança pública

Acompanhamento de pedido, rastreamento e avaliações continuam sendo acessados por rotas Next.js controladas. Essas rotas usam o cliente server-side para chamar as RPCs correspondentes e não exigem que o navegador tenha permissão direta de execução sobre as funções privilegiadas.

## Integrações externas

As integrações abaixo permanecem desligadas até existir credencial/equipamento/homologação real. Desligar uma integração incompleta é comportamento seguro de produção e não um erro do núcleo do sistema.

- iFood;
- 99Food;
- OneSignal/push;
- Pix automático;
- SmartPOS/maquininha;
- bridge de impressão física;
- rastreamento avançado quando depender de dispositivo real.

Nenhuma dessas integrações deve ser marcada como homologada somente porque a infraestrutura de código e banco existe.

## Implantação

1. validar branch de release em preview;
2. executar testes e build;
3. aplicar migration 020 no Supabase;
4. rodar advisors de segurança e performance novamente;
5. validar login, autorização por papel e fluxos críticos;
6. promover o código aprovado para `main`/produção;
7. executar smoke test pós-deploy.

## Critérios de aceite do núcleo

- produção nunca aceita bypass demo;
- RPC administrativa não pode ser chamada diretamente por `anon`;
- usuários autenticados só acessam o que suas policies/perfis permitem;
- criação pública de pedido continua recalculada e processada pelo servidor;
- acompanhamento, rastreamento e avaliação continuam funcionando via APIs públicas controladas;
- migrations permanecem sequenciais até 020;
- build de produção permanece estável.
