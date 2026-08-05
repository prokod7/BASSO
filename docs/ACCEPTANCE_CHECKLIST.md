# Checklist de aceite funcional

## Cardápio e pizza

- [ ] Nenhum preço ou produto de mockup aparece sem existir no cardápio oficial.
- [ ] Não há borda em tela, API, banco, impressão ou pedido.
- [ ] Broto bloqueia segundo sabor em cliente, PDV, garçom, QR e API.
- [ ] Grande meio a meio soma 50% de cada sabor.
- [ ] Ingredientes removíveis mudam por sabor e por metade.
- [ ] Adicionais funcionam em toda pizza, com preço integral, máximo 2 iguais e 5 unidades totais.
- [ ] Produto sem imagem mantém o layout sem placeholder enganoso.
- [ ] Quantidades oficiais: 42/11/11 pizzas, 29 bebidas, 20 adicionais, combo e sobremesa.
- [ ] Premium + Tradicional é bloqueado.
- [ ] Doce + salgado funciona quando compatível.

## Pedidos e canais

- [ ] Delivery, retirada, balcão, salão, QR, iFood e 99Food entram na central.
- [ ] Retirada/salão não exibem “Saiu para entrega”.
- [ ] Pedido é reprecificado no servidor antes da gravação.
- [ ] Repetição da mesma chave não duplica pedido.
- [ ] Cupom para no limite total e respeita canal, mínimo e período.
- [ ] Token público não acessa outro pedido.
- [ ] Avaliação só é aceita após conclusão.

## Salão, garçom e pagamentos

- [ ] Mesas 1–15, sendo 10 de 5 lugares e 5 de 2.
- [ ] Várias comandas por mesa.
- [ ] Transferência de itens/comandas e junção/separação preservam histórico.
- [ ] Pagamentos parciais e múltiplos fecham valores corretamente.
- [ ] QR identifica mesa/comanda e evita envio duplicado.
- [ ] Garçom não acessa financeiro ou administração.
- [ ] Rede registra aprovação, recusa, cancelamento, estorno, terminal e autorização.

## Cozinha, impressão e offline

- [ ] Impressão separa setores e destaca observações, retiradas e adicionais.
- [ ] Falha gera retentativa; reimpressão é marcada.
- [ ] KDS e bar atualizam em tempo real.
- [ ] Alertas sonoros distinguem origem/setor quando configurado.
- [ ] Operação offline entra na fila local e sincroniza sem duplicar.
- [ ] Falha de energia é tratada como dependência física de nobreak/equipamentos.

## Delivery e rastreamento

- [ ] Endereço fora da cobertura é bloqueado, salvo liberação autorizada.
- [ ] Motoboy recebe a entrega atribuída no PWA.
- [ ] Iniciar muda para “Saiu para entrega” e começa GPS.
- [ ] Painel mostra loja, motoboy e destinos ativos.
- [ ] Cliente vê somente seu pedido e posição aproximada.
- [ ] GPS desatualizado exibe horário antigo, não posição como atual.
- [ ] Concluir encerra rastreamento e libera o motoboy.
- [ ] Não há cálculo/otimização de rota nem API paga obrigatória.

## CRM, fidelidade, estoque e caixa

- [ ] iFood/99Food não criam perfil de CRM nem fidelidade.
- [ ] Só delivery próprio concluído e pago soma ponto.
- [ ] Saldo máximo é 15; resgate consome 10 e mantém excedente.
- [ ] Recompensa só permite Grande Mozzarella/Calabresa Tradicional.
- [ ] Fidelidade não aparece publicamente.
- [ ] Estoque baixa apenas bebidas e sobremesas.
- [ ] Estoque insuficiente bloqueia venda quando saldo negativo não é permitido.
- [ ] Abertura, sangria, suprimento e fechamento registram operador e divergência.
- [ ] Relatórios batem com pedidos, pagamentos, cancelamentos e caixas.

## Segurança e implantação

- [ ] Sete logins iniciais criados com perfis corretos.
- [ ] Ações sensíveis exigem permissão e motivo.
- [ ] Auditoria não pode ser alterada/excluída pela aplicação.
- [ ] Webhook repetido não duplica pedido/pagamento.
- [ ] PWA instala em celular e usa identidade da marca.
- [ ] Layout funciona em celular, tablet e desktop.
- [ ] Credenciais, bairros, taxas, terminais e impressoras reais foram preenchidos.
