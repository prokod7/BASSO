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

## Continuação pelo código, sem login — 17/10/2026

A pedido do usuário, esta etapa não utilizou sessão autenticada nem fez transações de teste em produção.

Correções adicionais:

- Central de pedidos: o atalho `?filter=delayed` agora aplica um filtro visível e removível. Dashboard e central usam o mesmo prazo: previsão de preparo, quando disponível, ou 60 minutos desde a criação. O filtro é reavaliado a cada 30 segundos e exclui pedidos encerrados.
- A receber: desconta pagamentos parciais dos pedidos, exclui cancelados e contabiliza cada comanda aberta uma única vez, com serviço e pagamentos da comanda. O snapshot busca os pagamentos dos pedidos parciais sem comanda e preserva taxa de serviço de 0%. Uma falha na consulta das comandas/pagamentos necessários não produz saldo inventado.
- Salão: Receber permanece disponível quando só resta a taxa de serviço. As opções de vale, rejeitadas pela API de comandas e restritas ao PDV, foram retiradas desse seletor.
- Impressão: Reprocessar zera as tentativas esgotadas, verifica existência e estado do trabalho, recusa pedidos cancelados/arquivados e usa atualização condicional para detectar concorrência. Trabalhos já na fila/em processamento não são duplicados por esse botão.
- Impressão: o aviso de teste com Bridge offline permanece após atualizar a fila. A prévia respeita a ordem configurada dos blocos; desativar destaque não apaga retiradas/observações. As setas de ordenação receberam nomes acessíveis.
- CRM: erros de carregamento não exibem clientes locais como dados de produção. Respostas antigas são ignoradas depois da troca de filtro. Erro de exportação CSV permanece na tela; carregamento e exportação possuem bloqueio de botão.

Validação desta etapa: 336 testes em 28 arquivos, incluindo 17 novos cenários de totais, API, componentes e downloads simulados. Os testes exercitam o atalho de atrasados e seu CSV filtrado, recebimento de serviço restante, aviso de impressão, reordenação da prévia, conflitos da fila, falhas/respostas antigas do CRM e solicitação de CSV de relatórios com nome/período corretos. A suíte anterior continua cobrindo erro de exportação de relatórios e os contratos das rotas.

Limites mantidos: downloads foram verificados em DOM de testes, sem comprovar salvamento em Chrome/Safari reais. Não houve teste físico de impressora nem processamento real de pagamento nesta etapa. O indicador A receber continua limitado aos pedidos presentes no snapshot operacional (250 recentes mais os vinculados a comandas abertas); não substitui o contas a receber histórico. Não se afirma que todas as variantes de todos os botões foram executadas em produção.


## Conclusão direta e Kanban — 17/10/2026

Conferido o relato trazido de outro chat: a conclusão sem baixa automática já existia na migration 037, mas a API ainda restringia perfis/motoboy e o banco ainda exigia motivo ao saltar etapas. O Kanban não tinha alça separada, seletor móvel, botão de conclusão nem controle de versão na requisição.

Implementado:

- Todos os oito perfis autenticados e ativos do painel podem concluir qualquer etapa ativa diretamente, inclusive visualizador e motoboy, sem `orders.edit`, motivo, código de entrega ou pagamento. Sessões inválidas/inativas continuam bloqueadas. Pedidos cancelados devem ser reabertos antes. A navegação de Pedidos também fica disponível ao motoboy.
- Migration 039 remove o requisito de justificativa para conclusão e preserva o autor/horário em histórico e auditoria, as transações, o controle de versão e a separação financeira. A função continua restrita ao servidor, sem acesso direto de anon/authenticated. Cancelamento e retorno de etapas mantêm suas regras.
- Kanban: alça separada do botão de abrir, colunas com contadores e destaque de destino, rolagem horizontal e seletor Mover para, conclusão verde em um toque, Salvando, confirmação e erro acessível. O card só muda após resposta de sucesso; falha/conflito solicita nova sincronização. Respostas e snapshots com versões antigas não sobrescrevem versão confirmada.
- Detalhe da comanda também possui conclusão direta. A conclusão usa a versão do pedido em vez de depender da trava temporária de edição. Mensagens da operação são preservadas no recarregamento imediato.
- O modo demonstração deixa de marcar como pago ao concluir. Destaque de atrasados dos cards usa a mesma regra do painel.

Validação: 374 testes em 30 arquivos, incluindo testes da API com autenticação/perfis, transações PostgreSQL isoladas e interação do Kanban em DOM de testes. Os testes verificam pagamento pendente/parcial, inexistência de novos recebimentos/caixa, autor no histórico/auditoria, concorrência, restrições de sessão e ausência de permissão direta à função SQL.

Esta validação não utiliza login em produção, não conclui pedidos reais e não comprova gestos em um iPhone físico. O fluxo separado de comprovação de entrega por código no aplicativo do motoboy permanece disponível; a conclusão operacional pelo painel não depende dele.

## Ruído da notificação de pedidos — 17/10/2026

O áudio embutido é Opus mono de 4,35 s, cerca de 6 kbps, com taxa de origem declarada de 8 kHz. A análise não detectou saturação digital (pico aproximado de -8,9 dBFS). A compressão limita a qualidade, mas não basta para atribuir a ela todo ruído relatado. O MP3 original não foi localizado entre os arquivos disponíveis.

Havia duas fontes simultâneas: a campainha global e um oscilador de 620 Hz no KDS, sem envelope de entrada/saída. Além disso, o painel reiniciava a campainha em andamento quando chegava outro pedido. Painel e KDS agora compartilham um único reprodutor da mesma campainha, sem sobreposição nem reinício durante reprodução. A busca/troca de setor do KDS não dispara avisos para pedidos já conhecidos. Desativar/reativar o som continua disponível; bloqueio de autoplay não interrompe o recebimento de pedidos.

Foram acrescentados testes para solicitações simultâneas, reprodução em andamento, término, autoplay bloqueado, filtro/setor da cozinha e controle de som. Não foi alterado o conteúdo da campainha nem se afirma recuperar qualidade perdida na compressão. Para melhorar o próprio arquivo é necessário reenviar o MP3 original. Não houve teste nos alto-falantes do aparelho do usuário.
