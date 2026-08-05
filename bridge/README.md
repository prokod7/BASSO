# PedidoPro Print Bridge

Executa na rede local da pizzaria e consome a fila segura de impressão do sistema. Suporta impressoras TCP/9100, fila do sistema operacional e modo `file` para homologação sem papel.

1. Copie `config.example.json` para `config.json`.
2. Configure a mesma chave em `PRINT_BRIDGE_KEY` na Vercel e em `apiKey` local.
3. Ajuste IPs, portas e nomes das impressoras.
4. Execute com Node 22: `node bridge/print-bridge.mjs bridge/config.json`.
5. Para iniciar com o Windows, cadastre o comando no Agendador de Tarefas com reinício automático.

O bridge confirma sucesso ou falha, e o servidor aplica retentativas exponenciais. Reimpressões permanecem identificadas no banco e na impressão.
