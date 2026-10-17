# Auditoria funcional da Basso — 17/10/2026

## Escopo e evidência

O objetivo foi seguir os controles da interface até a API e o banco e corrigir falhas comprovadas. A auditoria não tratou a simples presença de um onClick como prova de funcionamento.

| Camada | Conferência executada | Resultado |
| --- | --- | --- |
| Controles no código | 375 botões, 75 links e 20 formulários; ações declaradas e botões implícitos dentro de formulários | Nenhum controle sem ligação de ação; nenhum onClick com submit implícito identificado |
| Páginas do painel | 37 páginas montadas em testes de componentes, com atualização e backend indisponível | Sem quebra da renderização |
| Tratamento de falha real | Mesmas 37 páginas com NEXT_PUBLIC_DEMO_MODE=false e API retornando erro | Sem quebra da renderização |
| Abertura/configuração | Controles iniciais selecionados por função (novo, editar, configurar, prévia e seleção), remontando cada tela antes de cada ação | Cenários automatizados aprovados; não equivale a clicar todas as variantes de cada botão |
| Cliente e mobile | 15 páginas: cardápio, checkout vazio, conta, meus pedidos, acompanhamento, mesa, avaliação, impressão, garçom, login, troca de senha e páginas institucionais/offline | Estados iniciais, indisponibilidade e parâmetros de teste sem quebra da renderização |
| Carrinho | Aumentar quantidade, duplicar, remover, total e link para checkout | Aprovado |
| UI → API | 174 URLs/verbos identificáveis no código, incluindo métodos condicionais; precedência de rotas estáticas sobre dinâmicas | Nenhuma incompatibilidade encontrada |
| API → funções SQL | 60 chamadas comparadas com 73 funções públicas atuais da Basso | Nomes e parâmetros compatíveis |
| API → consultas | 212 seleções comparadas às tabelas e colunas atuais | Sem tabela/coluna raiz ausente |
| Regressões e transações | 319 testes em 25 arquivos, incluindo testes de componentes, APIs e PostgreSQL isolado | Aprovado |
| Compilação | TypeScript, build de produção, 92 verificações estáticas, 38 migrations e auditoria de controles | Aprovado |

As conferências do banco nesta auditoria foram somente leitura. Nenhum pagamento, venda, movimentação de caixa, envio de mensagem, mudança de acesso ou exclusão de registros reais foi realizado.

## Falhas corrigidas

1. **Pré-conta**: o botão chamava window.print() no painel inteiro. Agora abre documento de pré-conta separado com mesa, comanda, itens, detalhes por sabor, serviço, valor pago e saldo. Texto é escapado e bloqueio de pop-up gera mensagem. Não registra pagamento nem encerra a mesa.
2. **Período dos relatórios**: limites usavam meia-noite UTC. Agora o dia da operação é America/Sao_Paulo, incluindo vendas até 02:59:59.999Z do dia UTC seguinte. A agregação diária e o período padrão do cliente usam o mesmo fuso. Intervalos invertidos e datas inexistentes são rejeitados.
3. **Indicadores por item**: itens cancelados na produção eram contados; adicionais de duas pizzas podiam ser contados uma única vez. Agora cancelados são excluídos e os adicionais são multiplicados pela quantidade do item.
4. **Relatórios indisponíveis**: em produção, a tela podia preencher gráficos com dados locais/de demonstração após erro da API. Agora mostra estado indisponível e bloqueia exportação/impressão até existir relatório válido. Respostas antigas não substituem o período mais recente.
5. **Exportar CSV**: erro na API podia levar o usuário a uma página JSON. Agora o download é solicitado por fetch, o erro aparece no painel e o botão fica ocupado durante a solicitação.
6. **Inventário**: o recarregamento apagava a confirmação de conclusão. Mensagem preservada; salvar outra linha/concluir permanece bloqueado enquanto existe solicitação em curso na própria tela.
7. **Snapshots**: recarregar apagava as mensagens de criação/restauração. A confirmação permanece visível depois da atualização.

## Prevenção

`npm run audit:routes` e o novo passo UI API contracts no GitHub Actions verificam rotas/métodos em futuras alterações. Os testes em `panel-controls.test.ts`, `report-period-prebill.test.ts` e `reports-route.test.ts` reproduzem os casos acima. As dependências de teste jsdom e Testing Library são exclusivas de desenvolvimento e estão fixadas no lockfile.

## Limites explícitos

- O navegador de auditoria alcançou a autenticação da Vercel antes do painel e não possuía sessão de operador da Basso. Não foi reduzida a proteção de acesso. Os cliques autenticados em produção não foram executados de ponta a ponta.
- O navegador remoto não alcançou o servidor local de testes; os cenários de interface foram executados por testes de componentes em DOM isolado, com respostas de API controladas. Isso não substitui teste visual em Safari/Chrome reais.
- 375 é o número de botões mapeados no código, não uma afirmação de 375 cliques comprovados em produção. Variantes condicionais, permissões por perfil e dados específicos ainda exigem homologação autenticada.
- Impressoras físicas/Print Bridge instalado, GPS, permissões de notificações, maquininha, pagamentos externos, WhatsApp, iFood e 99Food dependem de equipamento, credenciais e/ou homologação. Nenhuma transação externa foi disparada para teste.
- A pré-conta usa o snapshot operacional da mesa exibida, como o próprio painel. O recebimento continua validado pelo servidor, independentemente do papel impresso.

## Complemento com sessão de gestor — 17/10/2026

O login seguro foi concluído no domínio principal cadastrado `basso-seven.vercel.app`, que expõe a autenticação própria da Basso. Nenhuma proteção foi desativada. O domínio alternativo `basso-pedido-pro.vercel.app` levou à autenticação da Vercel.

- Navegação pelas 36 entradas do menu: as 26 telas de coordenação, relacionamento, gestão e administração foram inspecionadas depois de “Dados sincronizados”; as demais tiveram inspeção inicial ou testes específicos abaixo. Isso não significa executar todos os botões nem todos os estados.
- Salão: criada a comanda vazia `TESTE AUDITORIA CODEX` na mesa 15; confirmada a mesa ocupada e a comanda vinculada; executado “Fechar mesa”; confirmada a mesa livre e sem comandas abertas. Nenhum item ou pagamento foi registrado.
- PDV: aberto Alho e Óleo; percorridas montagem, retirada de azeitonas pretas, adicional Bacon na pizza inteira e revisão. O resumo mostrou a retirada no sabor correto e o adicional com localização; total passou de R$ 60,00 para R$ 70,00. Item adicionado somente à venda local; a venda não foi finalizada.
- Cardápio: abertura real de “Nova categoria”, com criação desabilitada enquanto o nome estava vazio. A inspeção encontrou links de promoções/configurações aninhados no botão “Novo produto”. Corrigido o agrupamento; acrescentada regressão contra controles interativos aninhados nas páginas do painel. Os modais locais de cadastro passam a ter rolagem limitada à tela e botão de fechar identificado.
- Relatórios: dados do período padrão carregaram; alteração do início para o dia corrente e atualização chegaram ao estado de carregamento. A conclusão do novo período e o download CSV não foram confirmados.
- O diagnóstico visível informou que o Print Bridge local aguarda conexão real. Nenhum trabalho foi enviado às impressoras.

Uma restrição do navegador após a autenticação interrompeu a inspeção durante o teste de relatórios. A tentativa permitida de retomar a aba também foi recusada. Não houve nova entrada de credenciais ou tentativa de contornar a proteção. Não foi possível capturar comprovante visual final nem concluir os cliques restantes. As verificações automatizadas continuam sendo evidência separada dos testes reais acima.
