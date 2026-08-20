# PedidoPro Print Bridge — Basso

A Vercel não consegue acessar uma impressora USB dentro da pizzaria. O Print Bridge roda no computador Windows da Basso, busca `print_jobs` no PedidoPro e envia o ticket para a fila real do Windows.

## Instalação

1. Instale o driver das duas impressoras no Windows e confirme que uma página de teste do próprio Windows sai corretamente.
2. Abra PowerShell na pasta do projeto e rode `powershell -ExecutionPolicy Bypass -File bridge/list-printers.ps1`.
3. Copie `bridge/config.example.json` para `bridge/config.json`.
4. Configure em `config.json` os nomes **exatos** retornados pelo Windows para `cozinha` (Epson) e `counter` (térmica chinesa). Se não existir impressora de bar, remova a entrada `bar`.
5. Configure uma chave forte `PRINT_BRIDGE_KEY` na Vercel e coloque exatamente o mesmo valor em `apiKey` do `config.json` local.
6. Inicie com `bridge/start-bridge.cmd` ou `node bridge/print-bridge.mjs bridge/config.json`.
7. No painel PedidoPro, abra **Impressão**. O status deve mudar para **Online** após o heartbeat.
8. Use **Testar** em cada perfil. Só depois que o papel sair fisicamente ative `auto_print` no perfil desejado.

## Diagnóstico

- `Online`: bridge enviou heartbeat nos últimos 60 segundos.
- `Offline/Pendente`: o servidor e a fila existem, mas o computador local não está conectado.
- Job `queued`: aguarda bridge.
- Job `processing`: bridge reivindicou o trabalho.
- Job `done`: o comando de impressão local terminou sem erro.
- Job `failed`: consulte `last_error`, corrija driver/nome/conexão e reprocese.

Os jobs históricos anteriores ao MU08 são cancelados pela migration 018 para impedir que pedidos antigos sejam impressos em massa na primeira ativação.
