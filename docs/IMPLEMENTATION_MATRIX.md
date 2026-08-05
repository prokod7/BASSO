# Matriz de implementação — Documento Mestre 3.1

| Área | Implementação principal | Persistência / segurança | Ativação necessária |
|---|---|---|---|
| Identidade e operação | Marca, CNPJ, endereço, horário, telefone e canais oficiais | `business_settings`, `catalog.json` | Confirmar domínio e coordenadas exatas |
| Cardápio oficial | 42 Tradicionais, 11 Premium, 11 Doces, 29 bebidas, 20 adicionais, combo e 2 variações de pudim | Seeds SQL e catálogo versionado | Alterações futuras pelo painel/API |
| Configurador de pizza | Grande/Broto, massas, 1 ou 2 sabores, retiradas por metade, adicionais, observação | Validação duplicada no cliente, servidor e constraints SQL | Nenhuma para regras atuais |
| Carrinho e checkout | Edição, quantidade, cupom, endereço estruturado, geolocalização, Pix, dinheiro e cartões | Reprecificação autoritativa, idempotência e token privado | Bairros, taxas, pedido mínimo, chave/gateway Pix |
| Cardápio PWA | Home, busca, categorias, banners, favoritos, histórico local e repetição | Service worker e armazenamento por dispositivo | Domínio HTTPS e ícones já inclusos |
| Acompanhamento | Status por canal, link privado, mapa e avaliação pós-conclusão | Tokens com hash, expiração e isolamento por pedido | Coordenadas da loja e motoboys reais |
| PDV e balcão | Venda rápida, busca, carrinho, cliente, canal, pagamento e impressão | API de pedidos, caixa, pagamentos e auditoria | Impressoras, terminais e permissões reais |
| Salão e comandas | 15 mesas, capacidades, status, múltiplas comandas, QR e estrutura de divisão | Tabelas, tabs, alocações, pagamentos parciais e RPCs | QR físico e treinamento operacional |
| Aplicativo do garçom | PWA responsivo, mesas, lançamentos, pagamentos e alertas | Perfis `waiter`, RLS, fila offline e auditoria | Terminais Rede homologados |
| Cozinha / KDS | Filas por setor, status, cronômetros, alertas, observações, retiradas e adicionais | Histórico de status e impressão setorizada | Monitores/tablets e sons escolhidos |
| Delivery | Pedidos, zonas, taxas, entregadores, atribuição e status | Endereço + coordenadas, regras de cobertura e auditoria | Lista oficial de bairros e valores |
| Motoboy / rastreamento | PWA, iniciar/finalizar, GPS durante entrega, mapa e última atualização | Token temporário, localização curta, revogação ao concluir | Consentimento operacional e celulares com GPS |
| iFood e 99Food | Adaptadores, webhooks, mapeamentos, eventos, aceite/status e conciliação estrutural | Deduplicação, `SKIP LOCKED`, retentativa e dead letter | Credenciais, URLs e homologação contratual |
| Rede | Cobrança/cancelamento/estorno e webhook de retorno | Registro de TID, terminal, autorização, conciliação e auditoria | Modelo, terminais, credenciais e homologação Rede |
| CRM | Clientes próprios, histórico, ticket, frequência, preferências e segmentos | Marketplace excluído por regra e esquema | Consentimentos e dados reais |
| Fidelidade interna | Livro razão, saldo máximo 15, resgate autorizado e sabores permitidos | RPC transacional, auditoria e nenhuma exibição pública | Definir quem possui permissão de resgate |
| Cupons | Código, percentual/fixo, limite total, mínimo, canais e período | Lock de linha, uso único por pedido e constraint de limite | Cupons reais além do exemplo 10OFF |
| Estoque | Bebidas e sobremesas, entradas, ajustes, perdas, baixas e mínimo | Movimentos idempotentes e bloqueio de saldo negativo | Quantidades iniciais e mínimos reais |
| Caixa e financeiro | Abertura, fechamento, sangria, suprimento, pagamentos e conciliação | Sessões, movimentos, operador e auditoria | Plano de contas e saldos iniciais |
| Relatórios | Vendas, canais, pagamentos, produtos, clientes, produção e delivery | Consultas a pedidos/pagamentos/eventos | Período e critérios contábeis finais |
| Campanhas | Push/e-mail, modelos, agendamento, consentimentos e métricas | Filas com retentativa; WhatsApp manual excluído | OneSignal, Resend, remetente e opt-ins |
| Impressão | Fila, setores, reimpressão, falhas e bridge local | Claim atômico, chave do bridge e retentativa exponencial | IP/nome/modelo de cada impressora |
| Usuários | 1 gestor, 3 atendentes e 3 garçons iniciais | Supabase Auth, perfis, RLS e menor privilégio | Nomes reais e senha inicial segura |
| Continuidade | PWA, snapshot local, IndexedDB, replay idempotente e status offline | `sync_queue`, chaves de operação e prevenção de duplicidade | Nobreak, rede local e plano físico |
| Auditoria e LGPD | Ações sensíveis, origem, dispositivo, motivo, termos e privacidade | Log imutável, RLS, hashes e retenção curta de GPS | Política jurídica final e prazos de retenção |
