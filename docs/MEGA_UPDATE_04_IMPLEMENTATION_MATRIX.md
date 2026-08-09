# Matriz de implementação — Mega Update 04

| Área | Estado neste pacote | Persistência | Dependência externa |
|---|---|---:|---:|
| Centro de comando | Implementado | Supabase | Não |
| Controle da loja e canais | Implementado | Supabase + auditoria | Não |
| Abertura e fechamento guiados | Implementado | Supabase + RPC | Não |
| Tarefas internas | Implementado | Supabase | Não |
| Aprovações | Registro e decisão implementados | Supabase + RPC | Não |
| Notificações internas | Implementado | Supabase + Realtime | Não |
| Busca global | Implementado | Supabase | Não |
| Presença de usuários | Implementado | Supabase | Não |
| Expedição | Implementado | Supabase + RPC | Não |
| Compras e fornecedores | Implementado | Supabase + RPC | Não |
| Entrada de compra no estoque | Implementado de forma transacional | Supabase + RPC | Não |
| Modelos de WhatsApp | Implementado | Supabase | WhatsApp continua manual |
| Perfis de impressão | Implementado | Supabase | Equipamento/Print Bridge |
| Diagnóstico | Implementado | Supabase | Testes externos dependem das credenciais |
| Painel de migrations | Implementado | Supabase | Não |
| Exportação operacional | Implementado | Download JSON | Não |
| Restauração automática | Não incluída por segurança | — | Procedimento controlado |
| Realtime ampliado | Implementado no cliente | Supabase Realtime | Realtime deve estar habilitado |
| Pipeline GitHub | Implementado | GitHub Actions | Registro npm disponível |
| iFood | Estrutura existente | Logs/filas | Credenciais e homologação |
| 99Food | Estrutura existente | Logs/filas | Credenciais e homologação |
| Rede | Estrutura existente | Logs/conciliação | Credenciais/terminal/homologação |
| Pix automático | Estrutura preparada | Configuração | Gateway/API |
| Push/e-mail | Estrutura preparada | Filas | OneSignal/Resend |
| Impressão física | Fila e perfis preparados | Supabase + bridge | Impressora e agente local |
| Mapa/rastreamento | Estrutura existente | Supabase | GPS, coordenadas e ativação |

## Observações

- A aprovação registra a decisão e a auditoria; a ação específica precisa consumir essa aprovação no fluxo correspondente.
- A exportação operacional é limitada para proteção de desempenho e não inclui senhas, segredos ou dados de cartão.
- O sistema preserva operação manual quando integrações externas não estão ativas.
