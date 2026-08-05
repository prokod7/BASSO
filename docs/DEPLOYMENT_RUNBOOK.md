# Roteiro de implantação

## 1. Pré-requisitos

- Node.js 22 ou superior
- Conta Vercel
- Projeto Supabase com PostgreSQL
- Domínio próprio
- Computador local para o bridge de impressão
- Acesso administrativo aos fornecedores que serão integrados

## 2. Banco de dados

No SQL Editor do Supabase, execute os arquivos em ordem:

1. `001_core_schema.sql`
2. `002_official_catalog_seed.sql`
3. `003_operational_functions.sql`
4. `004_integrations_and_public_access.sql`
5. `005_workers_and_queue_claims.sql`
6. `006_reviews_and_customer_experience.sql`

Depois, confirme:

- 64 sabores, 20 adicionais, 29 bebidas e 2 sobremesas;
- 15 mesas nas capacidades aprovadas;
- inventário somente para bebidas e sobremesas;
- RLS habilitado nas tabelas protegidas;
- funções RPC disponíveis;
- Realtime habilitado para `orders`, `restaurant_tables`, `drivers` e `inventory_items`.

## 3. Variáveis de ambiente

Copie `.env.example` e preencha os valores. Em produção:

```env
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SITE_URL=https://seu-dominio.com.br
```

Nunca exponha `SUPABASE_SERVICE_ROLE_KEY`, segredos de webhook, tokens dos gateways ou `PRINT_BRIDGE_KEY` em variáveis `NEXT_PUBLIC_*`.

## 4. Contas iniciais

Execute localmente, sem registrar a senha no Git:

```bash
INITIAL_USER_PASSWORD='uma-senha-temporaria-forte' npm run seed:users
```

O script cria ou sincroniza:

- Gestor
- Atendente 1, 2 e 3
- Garçom 1, 2 e 3

Troque a senha após o primeiro acesso e substitua nomes genéricos pelos funcionários reais.

## 5. Parâmetros de implantação

Cadastre antes da abertura:

- bairros/zonas, taxas, mínimos e eventual distância máxima;
- coordenadas exatas da pizzaria;
- chave Pix e método de conferência;
- impressoras, setores, IPs e papel;
- motoboys, telefones e veículos;
- terminais Rede;
- credenciais, URLs e segredos de iFood/99Food;
- OneSignal, e-mail e remetente;
- consentimentos e modelos iniciais;
- pedido mínimo, agendamento, capacidade e horários;
- usuários reais e permissões.

A falta temporária desses valores não exige mudança de código; os módulos já contêm estrutura, logs e diagnósticos.

## 6. Deploy Vercel

```bash
npm install
npm run verify
```

Depois:

1. envie o repositório ao GitHub;
2. importe na Vercel;
3. configure todas as variáveis;
4. defina Node.js 22;
5. faça o deploy;
6. conecte o domínio;
7. valide HTTPS e instalação PWA;
8. confirme que o cron `/api/cron/process-queues` recebe `CRON_SECRET`.

O cron está configurado a cada 5 minutos. Ajuste o plano da Vercel ou use um agendador externo confiável se o plano não suportar essa frequência.

## 7. Impressão local

1. Copie `bridge/config.example.json` para `bridge/config.json`.
2. Defina a mesma chave em `PRINT_BRIDGE_KEY` na Vercel e no arquivo local.
3. Configure impressoras por TCP/9100 ou fila do sistema.
4. Teste primeiro com `type: "file"`.
5. Execute `node bridge/print-bridge.mjs bridge/config.json`.
6. Cadastre inicialização automática e reinício em falha.
7. Teste cozinha, bar, balcão, reimpressão e indisponibilidade.

## 8. Homologação mínima

- Pedido próprio delivery, retirada e QR de mesa.
- Broto com tentativa de segundo sabor bloqueada.
- Grande meio a meio com cálculo conhecido.
- Premium + Tradicional bloqueado.
- Adicionais no limite e acima do limite.
- Cupom no último uso e após esgotar.
- Bebida com estoque suficiente e insuficiente.
- Pedido iFood/99Food duplicado pelo mesmo webhook.
- Rede aprovada, recusada, cancelada e estornada.
- Impressora offline e reprocessamento.
- Operação offline e sincronização sem duplicar.
- Rastreamento iniciado, GPS desatualizado e baixa concluída.
- Fidelidade com 9, 10 e 15 pontos, sem exibição pública.
- Garçom tentando acessar financeiro/administração.

Use `docs/ACCEPTANCE_CHECKLIST.md` para o aceite completo.

## 9. Go-live

- Faça backup do banco e das configurações.
- Zere dados de demonstração.
- Carregue estoque inicial real.
- Abra um caixa de teste e feche-o.
- Realize pedidos de R$ 0,01 somente em sandbox dos provedores.
- Treine gestor, atendentes, garçons, cozinha e motoboys.
- Mantenha operação paralela curta e plano manual de contingência.
