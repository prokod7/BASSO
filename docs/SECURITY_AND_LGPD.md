# Segurança, privacidade e LGPD

## Controles técnicos

- Supabase Auth para equipe e perfis por função.
- RLS e RPCs de segurança para acesso operacional.
- Service Role somente no servidor.
- Webhooks com assinatura e identificador idempotente.
- Chaves de idempotência em criação de pedido, estoque e sincronização.
- Auditoria imutável de ações sensíveis.
- Tokens públicos armazenados somente como hash e com validade/revogação.
- Dados de cartão e CVV não são armazenados.
- GPS do motoboy somente durante entrega ativa; retenção curta.
- Clientes de marketplace isolados do CRM, campanhas e fidelidade.
- Segredos fora do repositório e de variáveis públicas.
- Filas com claim atômico, retentativa exponencial e dead letter/cancelamento.

## Dados do cliente

O sistema coleta o necessário para pedido e entrega: nome, telefone, endereço, referência, coordenadas opcionais, itens, pagamento e histórico. Consentimentos de marketing são separados por canal. A conta pública por dispositivo usa links privados de pedido, sem consulta global por telefone.

## Retenção sugerida

A política definitiva deve ser revisada juridicamente. Como base operacional:

- localização detalhada do motoboy: histórico curto de até 24 horas;
- última posição: somente enquanto necessária à entrega e diagnóstico;
- tokens de rastreamento: revogados ao concluir;
- tokens de pedido: validade configurada e revogação disponível;
- logs técnicos: payload sanitizado, sem segredos;
- auditoria financeira: conforme obrigações legais e contábeis;
- campanhas: preservar consentimento, opt-out e prova de envio.

## Rotina antes do go-live

- revisar termos e política de privacidade com responsável jurídico;
- documentar base legal e retenção por entidade;
- definir canal para solicitação de acesso/correção/exclusão;
- testar restauração de backup;
- rotacionar chaves e segredos;
- habilitar MFA para administradores do Supabase, Vercel e fornecedores;
- limitar acesso ao computador do bridge e à rede das impressoras.
