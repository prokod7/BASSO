# Robô de atendimento no WhatsApp — La Forneria Basso

Mesma estrutura do robô da Bella Duda, adaptada ao cardápio e às regras da Basso. Vem **desligado** em duas camadas: a variável `WHATSAPP_BOT_ENABLED` na Vercel e o botão em **Painel → WhatsApp → Configurar robô**. Nenhuma chave vai para o navegador.

## O que muda em relação à Bella Duda

| Bella Duda | Basso |
|---|---|
| Pergunta a borda (catupiry, cheddar, recheadas) | **Não pergunta borda**: toda pizza sai com a borda tradicional da casa. Se o cliente pedir borda recheada, explica com gentileza e oferece o adicional (ex.: Catupiry) |
| Adicionais simples | Adicional na **pizza inteira ou só em uma metade** do meio a meio (metade cobra 50%). Se o cliente não disser onde, o robô pergunta |
| — | Pergunta a **massa** uma vez (tradicional ou integral, as duas de longa fermentação), se as duas estiverem ativas |
| Pizza doce / esfiha doce como sobremesa | Oferece o **Pudim no Copo Americano** (Tradicional ou Frutas Vermelhas) |
| Refrigerante como complemento | Para o perfil premium, sugere também **vinho** |
| Pizza doce | Pergunta **cortada ou sem cortar**; a base Creme de Avelã Zero só é oferecida se o cliente pedir opção zero |
| Tom animado com vários emojis | Tom acolhedor e elegante, no máximo 1 emoji discreto |
| VR/VA | Pix, dinheiro, crédito, débito, vale-refeição (todas as bandeiras) e vale-alimentação (todas, exceto Alelo), iguais ao checkout do site |
| Laboratório cria pedidos de teste | Laboratório **só confere** o pedido (recalcula preço); nada entra em Pedidos, Caixa, cozinha ou relatórios |

## Como funciona

- O cardápio enviado à IA é o **mesmo do site** (`loadRuntimeMenu`): preços, sabores, adicionais, bebidas, sobremesas, combos, disponibilidade por canal/horário e estoque, tudo editável no painel. Cada item tem um código curto; o servidor traduz e recalcula tudo. Código que não existe mais é rejeitado.
- Preço, promoções do dia, cupom e taxa do bairro vêm de `quoteCommercialTerms`, a mesma cotação do checkout.
- O pedido confirmado é gravado pelo **mesmo caminho do checkout do site** (`create_order_transaction`, número do dia, token de acompanhamento e fila de impressão), com origem `whatsapp`. A chave de idempotência do resumo impede pedido duplicado.
- Bairros: reconhecidos do jeito que o cliente escreve (sem acento, sem "Jardim/Vila", s/z, pequenos erros) entre os bairros cadastrados em **Delivery**. A cidade vem do bairro; só é perguntada se o bairro existir em duas cidades. O robô não pede CEP.
- Confirmação: o cliente responde "sim" (ou toca em *Confirmar pedido*). Qualquer alteração antes disso gera novo resumo.
- **Pix**: depois do "sim", o robô manda a chave (de Configurações) e espera o comprovante. A IA só lê o comprovante; quem decide é o código (valor exato, chave ou nome do recebedor, data). O pedido entra com a observação "comprovante conferido pela IA" e **pagamento pendente** até a equipe confirmar no banco. Depois de 3 comprovantes inválidos, chama a equipe.
- Aviso automático ao cliente quando o pedido **sai para entrega** ou fica **pronto para retirada** (só dentro da janela de 24 h do WhatsApp).
- Mensagens seguidas: a primeira mensagem da conversa é respondida na hora; depois o robô espera o cliente parar de digitar (15 s, máximo 90 s) e responde tudo junto.
- Atendente responde pelo celular ou pelo painel → o robô sai daquela conversa. "Devolver ao robô" faz o robô reler a conversa (24 h, inclusive o que o atendente escreveu) e responder o que o cliente mandou depois da última mensagem da loja.
- Lembrete: quem some sem pedir recebe o link do cardápio uma vez (5 min, ajustável).
- Recuperação sem agendador: o painel aberto na loja chama `/api/whatsapp/kick` a cada minuto e retoma mensagens paradas. Mantenha o painel aberto no computador da loja durante o expediente.

## Ativação

1. Banco: migration `043_whatsapp_bot.sql` (já aplicada no Supabase da Basso).
2. Número: conectar o número da Basso no Dualhook (coexistência) e desligar respostas automáticas de outros sistemas.
3. Vercel → Environment Variables (Production), depois redeploy:

| Variável | Conteúdo |
|---|---|
| `OPENAI_API_KEY` | Chave de projeto com faturamento |
| `OPENAI_WHATSAPP_MODEL` | Modelo da Responses API com function calling e visão |
| `OPENAI_TRANSCRIPTION_MODEL` | Opcional; padrão `gpt-4o-mini-transcribe` |
| `OPENAI_REASONING_EFFORT` | Opcional; só para modelos com raciocínio |
| `OPENAI_MAX_OUTPUT_TOKENS` | Opcional; padrão 2000 |
| `DUALHOOK_API_KEY` | Chave `dh_live_` da conexão |
| `WHATSAPP_PHONE_NUMBER_ID` | ID Meta do número |
| `WHATSAPP_WABA_ID` | ID da conta WhatsApp |
| `WHATSAPP_WEBHOOK_SECRET` | Segredo aleatório com 32+ caracteres (vai na URL) |
| `WHATSAPP_VERIFY_TOKEN` | Segredo da verificação GET |
| `APP_URL` | Opcional; link do cardápio (padrão `https://basso-pedido-pro.vercel.app`) |
| `WHATSAPP_MENU_FILES` | Opcional; URLs públicas (JPEG/PNG/PDF) separadas por vírgula, enviadas depois do link |
| `CRON_SECRET` | Opcional; só para agendador externo em `/api/whatsapp/worker` |
| `WHATSAPP_BOT_ENABLED` | `false` até homologar; `true` libera o botão de ligar |

4. Webhook no Dualhook: `https://SEU-DOMINIO/api/whatsapp/webhook/SEGREDO`, assinando `messages` e `smb_message_echoes`. Não publique essa URL.
5. Em **Painel → WhatsApp → Configurar robô**, confira o nome do recebedor do Pix (como aparece no comprovante).
6. Teste no **Laboratório** (precisa só de `OPENAI_API_KEY` e `OPENAI_WHATSAPP_MODEL`).

## Homologação antes de ligar

- Pizza inteira e meio a meio; Broto salgada meio a meio; Broto doce (só 1 sabor).
- Adicional na pizza inteira e só em uma metade; remover ingrediente de uma metade.
- Pedido de borda recheada (deve explicar e oferecer o adicional).
- Massa integral; pizza doce cortada/sem cortar; base Avelã Zero.
- Combo; bebida; pudim oferecido como sobremesa.
- Retirada e entrega (bairro abreviado, bairro em duas cidades, bairro fora da área).
- Dinheiro com troco; cartão; Pix com comprovante certo, valor errado e conta errada.
- Loja fechada; "cadê meu pedido?"; pedido de atendente.
- Conferir que o resumo bate com o checkout do site, que o pedido aparece uma única vez no painel e que a comanda imprime.
- Reenviar o mesmo webhook, repetir a confirmação, responder pelo celular e verificar a pausa; devolver ao robô pelo painel.

Sem chaves e número, os testes automatizados comprovam regras, preços e banco; não comprovam chamadas reais da OpenAI, entrega no WhatsApp nem impressão física.
