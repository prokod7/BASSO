# Atualização 01 — Cardápio por categoria/tamanho e acesso administrativo

## O que foi corrigido

### Cardápio público

As pizzas não são mais exibidas como dezenas de sabores soltos na página inicial.

Agora cada seção apresenta somente dois pontos de entrada:

- Pizza Grande
- Pizza Broto

Isso foi aplicado a:

- Mais pedidas
- Pizzas Tradicionais
- Pizzas Premium
- Pizzas Doces

Ao abrir um card, o tamanho fica definido e o cliente escolhe os sabores dentro do configurador. A Pizza Broto continua tecnicamente bloqueada para segundo sabor. A Pizza Grande mantém a regra de 50% + 50% e a incompatibilidade entre Premium e Tradicional.

A busca continua funcionando sem espalhar os sabores na home: ela mostra somente as categorias/tamanhos que possuem sabores correspondentes.

### Administração

O primeiro acesso agora pode ser preparado diretamente pela tela de login.

1. Na Vercel, cadastre temporariamente:

```env
INITIAL_USER_PASSWORD=uma-senha-forte-com-12-ou-mais-caracteres
```

2. Faça um redeploy.
3. Acesse `/login`.
4. Entre com:

```text
gestor@laforneriabasso.com.br
```

5. Use a mesma senha cadastrada em `INITIAL_USER_PASSWORD`.

Se as contas ainda não existirem, o sistema cria e sincroniza automaticamente:

- Gestor
- Atendente 1
- Atendente 2
- Atendente 3
- Garçom 1
- Garçom 2
- Garçom 3

Depois do primeiro acesso bem-sucedido, remova `INITIAL_USER_PASSWORD` da Vercel e faça outro redeploy.

O painel também ganhou:

- botão de sair;
- identificação do usuário autenticado;
- estado visível de sincronização;
- aviso claro quando o perfil, sessão ou banco não puderem ser carregados.

## Banco de dados

Esta atualização não adiciona uma nova migração SQL. Os 12 arquivos `001` a `012` continuam sendo a base necessária.

## Cron no plano gratuito

O cron foi preservado em `vercel.pro.json`, mas está desativado para a Vercel Hobby. Isso não interfere no cardápio, login, painel, PDV, salão, KDS ou pedidos próprios. Para ativá-lo futuramente, renomeie para `vercel.json` quando usar uma configuração compatível.

## Validação executada

- 51 de 51 verificações estáticas aprovadas;
- análise sintática dos arquivos alterados aprovada;
- o build completo não pôde ser executado neste ambiente porque o registro npm interno não disponibilizou `@supabase/ssr` (erro 404). O build final deve ser confirmado pela Vercel após o upload.
