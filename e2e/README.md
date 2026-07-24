# Testes E2E (Playwright)

Suíte de **fumaça** — cobre os fluxos críticos, não é cobertura exaustiva de
todas as telas. Dá pra crescer conforme necessário.

## Antes de rodar

Os testes logam de verdade contra o Supabase configurado no `.env` do
projeto (mesma instância que o app usa) — não existe um "Supabase de teste"
separado. Por isso:

1. **Crie uma conta dedicada para os testes** (não reaproveite sua conta
   pessoal — os testes criam e cancelam Ordens de Serviço de verdade no
   banco). Cadastre pela própria tela de login do app.
2. **Promova essa conta a `gestor`** no SQL Editor do Supabase:
   ```sql
   update public.profiles set role = 'gestor' where email = 'seu-email-de-teste@exemplo.com';
   ```
   (gestor consegue exercitar tanto o fluxo de relatório quanto o de
   manutenção sem esbarrar em RLS.)
3. Exporte as credenciais como variáveis de ambiente antes de rodar:
   ```bash
   export E2E_TEST_EMAIL="seu-email-de-teste@exemplo.com"
   export E2E_TEST_PASSWORD="sua-senha-de-teste"
   ```
   No PowerShell: `$env:E2E_TEST_EMAIL = "..."`.

Sem essas variáveis, os specs que precisam de login autenticado são pulados
automaticamente (`test.skip`) — só o teste de credencial inválida roda sem
configuração nenhuma.

## Rodando

```bash
npm run test:e2e          # roda tudo (sobe o `npm run dev` sozinho)
npm run test:e2e -- --ui  # modo interativo, útil pra debugar
```

## Specs

- `auth.spec.ts` — login com credenciais inválidas (erro) e válidas (chega
  no Dashboard).
- `manutencao-fluxo.spec.ts` — cria uma OS de manutenção pelo wizard e
  confere que aparece na lista.
- `relatorio-export.spec.ts` — cria uma ordem de relatório, anexa uma foto,
  exporta em PDF e confere que a tela de coleta vira somente-leitura
  ("Relatório finalizado") depois disso.
