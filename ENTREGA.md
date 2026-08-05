# Entrega — La Forneria Basso PedidoPro 3.1

Este pacote contém o código-fonte completo da aplicação PedidoPro da La Forneria Basso, incluindo:

- cardápio digital, montagem de pizzas, carrinho, checkout, conta e acompanhamento;
- painel de pedidos, PDV, salão, 15 mesas, comandas, garçom, KDS e delivery;
- PWA do motoboy, localização temporária e acompanhamento por link privado;
- CRM, fidelidade interna, cupons, estoque restrito, caixa, financeiro e relatórios;
- APIs, webhooks, filas, auditoria, permissões, RLS, segurança e contingência offline;
- migrações e seeds do Supabase;
- adaptadores de iFood, 99Food, Rede, push, e-mail e WhatsApp manual;
- bridge local para impressão setorizada;
- cardápio oficial e assets aprovados;
- testes automatizados, verificador estático e documentação de implantação.

## Início rápido em demonstração

```bash
cp .env.example .env.local
npm install
npm run dev
```

Deixe `NEXT_PUBLIC_DEMO_MODE=true` para validar os fluxos sem Supabase.

## Produção

Consulte, nesta ordem:

1. `README.md`
2. `docs/DEPLOYMENT_RUNBOOK.md`
3. `docs/INTEGRATION_ACTIVATION.md`
4. `docs/SECURITY_AND_LGPD.md`
5. `docs/ACCEPTANCE_CHECKLIST.md`

As credenciais, bairros, taxas, equipamentos, terminais e contas reais devem ser preenchidos na implantação. Esses dados não foram inventados no código.
