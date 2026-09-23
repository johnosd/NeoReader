---
name: play-release
description: Gera uma nova versão publicável do NeoReader Android para a Play Store — bumpa versionCode/versionName, levanta o que mudou desde o último release, redige as release notes nos 3 idiomas da ficha da loja (pt-BR, es-ES, en-US), roda os gates do projeto, gera o .aab assinado com bundleRelease, confere que a assinatura entrou, arquiva o bundle + mapping.txt + notas + SHA256 em release-artifacts/ e sugere o commit de bump. Use quando o usuário pedir para "gerar o aab", "criar uma nova versão pra Play Store", "preparar o release", "publicar uma atualização", "bumpar a versão do Android" ou "escrever as release notes". NÃO use para build de debug/teste em device (use npm run android:run ou o skill android-debug), nem para investigar bug que só aparece em release (isso é diagnóstico, não publicação).
---

# play-release

Executa o processo de publicação documentado em `docs/deploy-play-console.md`,
na ordem certa e com as verificações que faltam quando se segue o doc na mão
(assinatura ausente, `cap sync` esquecido, notas fora do limite do Play).

O skill **prepara** o release até o `.aab` arquivado e verificado. O upload no
Play Console é manual — não existe automação de Play Developer API neste
projeto, e o skill não tenta inventar uma.

## O que sai no fim

| Entregável | Onde |
|---|---|
| `versionCode` +1 / `versionName` patch +1 | `android/app/build.gradle` |
| Tabela de versão sincronizada | `README.md` → seção "Build Android" |
| `.aab` assinado | `android/app/build/outputs/bundle/release/app-release.aab` |
| Cópia arquivada + `mapping.txt` + `SHA256SUMS.txt` | `release-artifacts/neoreader-<versionName>-<versionCode>/` |
| Release notes pt-BR / es-ES / en-US | `release-artifacts/neoreader-<versionName>-<versionCode>/release-notes.txt` |
| Mensagem de commit sugerida | reportada ao usuário (nunca commitada sozinha) |

## Fase 0 — Preflight (antes de editar qualquer arquivo)

Três checagens. Se qualquer uma falhar, **pare e reporte** — não contorne.

**1. Árvore de trabalho e branch.**

```powershell
git status --short; git branch --show-current
```

Release normalmente sai de `main` com a árvore limpa. Se houver mudança não
commitada ou a branch for de feature, **pergunte** antes de seguir (pode ser
intencional: release de teste a partir de uma branch). Nunca faça stash/commit
por conta própria pra "limpar".

**2. Credenciais de assinatura.** Sem as 4 propriedades, o `build.gradle`
**pula a `signingConfig` em silêncio** (`if (hasReleaseSigning)`) e o Gradle
gera um `.aab` sem assinatura, que o Play rejeita no upload. Esse é o modo de
falha mais caro do processo — custa um build inteiro de R8 pra descobrir no
fim. Verifique antes:

```powershell
Select-String -Path "$env:USERPROFILE\.gradle\gradle.properties" -Pattern "NEOREADER_RELEASE_" | ForEach-Object { ($_.Line -split '=')[0] }
```

Devem aparecer as 4: `NEOREADER_RELEASE_STORE_FILE`, `_STORE_PASSWORD`,
`_KEY_ALIAS`, `_KEY_PASSWORD`. Confirme também que o arquivo apontado por
`STORE_FILE` existe. **Nunca imprima as senhas** — só o nome das chaves.

Se faltar algo: `docs/deploy-play-console.md` → seção 3 explica onde restaurar
(backup no `.env` da raiz) e o que fazer se a upload key foi perdida de vez.
Pare aqui — sem keystore não há release.

**3. Versão atual e próxima.**

```powershell
Select-String -Path android\app\build.gradle -Pattern "versionCode|versionName"
ls release-artifacts | Select-Object Name
```

Regra do projeto: `versionCode` +1 (o Play rejeita igual ou menor que o último
publicado) e `versionName` incrementa só o **patch** — `1.0.18` → `1.0.19`,
mesmo em release com feature nova. Se o usuário quiser minor/major, ele pede;
não decida isso sozinho. Confirme contra `release-artifacts/` que o número novo
não colide com um release já arquivado.

## Fase 1 — Levantar o que mudou

Não existem tags de release neste repo; a fronteira do release anterior é o
commit que introduziu o `versionCode` atual:

```powershell
$ultimo = git log -1 --format="%H" -S "versionCode <ATUAL>" -- android/app/build.gradle
git log --oneline --no-merges "$ultimo..HEAD"
```

Leia os commits e, quando o assunto não for óbvio pelo título, abra o diff dos
relevantes. Separe em duas listas:

- **Visível pro usuário** — vira release note.
- **Interno** (refactor, teste, doc, CI, bump de dependência) — não vira nota,
  no máximo entra agregado como "melhorias de estabilidade" se houver correção
  de crash de verdade no meio.

Se o intervalo vier vazio ou só com commits internos, diga isso e pergunte se
ainda faz sentido publicar.

## Fase 2 — Redigir as release notes e aprovar

Escreva as notas **antes** de buildar — é a parte que precisa de julgamento e
o build leva minutos (R8 + shrink); não faz sentido descobrir no fim que o
texto muda.

Formato do arquivo (idêntico aos releases anteriores — veja
`release-artifacts/neoreader-1.0.18-22/release-notes.txt`):

```
<pt-BR>
Nesta atualização:

• Novo: <mudança visível, em uma linha>
• <mudança visível>
</pt-BR>

<es-ES>
En esta actualización:

• Novedad: <...>
</es-ES>

<en-US>
In this update:

• New: <...>
</en-US>
```

Regras:

- **Limite do Play: 500 caracteres por idioma**, incluindo as quebras de linha
  (as tags `<pt-BR>` não contam). Confira antes de entregar:
  ```powershell
  (Get-Content <arquivo> -Raw) -split '<[a-z]{2}-[A-Z]{2}>' |
    ForEach-Object { ($_ -replace '</[a-z]{2}-[A-Z]{2}>','').Trim() } |
    Where-Object { $_ } | ForEach-Object { $_.Length }
  ```
  Saem 3 números, um por idioma (referência: o release 1.0.18-22 tem
  380 / 435 / 337).
- **Linguagem de usuário, não de dev.** "destaque trechos com toque longo",
  não "implementa highlights via Range API". Sem nome de arquivo, de classe,
  de lib ou número de issue.
- Só o que o usuário percebe abrindo o app. Feature atrás de flag desligada
  não entra.
- `• Novo:` / `• Novedad:` / `• New:` só no que é realmente novo; melhoria de
  algo existente vai sem prefixo.
- Os três idiomas dizem **a mesma coisa** — es-ES e en-US são tradução do
  pt-BR, não versões com escopo diferente.
- Nunca invente item que não está no `git log`/diff da Fase 1.

Mostre o texto dos 3 blocos ao usuário e **espere aprovação** antes da Fase 3.
Ele conhece o público da loja melhor que o diff.

## Fase 3 — Bump de versão

Com as notas aprovadas, edite:

1. `android/app/build.gradle` — `versionCode` e `versionName` no `defaultConfig`.
2. `README.md` → seção "Build Android", linhas `versionName` / `versionCode` da
   tabela "Dados atuais do projeto Android".

Os dois sempre juntos: o README é a única cópia versionada dessa informação e
dessincronizar é o erro clássico aqui.

## Fase 4 — Gates do projeto

```powershell
npm run lint
npm test
npm run build
```

Os três limpos, sem exceção (Regra de ouro 5 do `CLAUDE.md`). `npm run build`
já roda `tsc -b`, então o type-check está coberto.

> Se precisar rodar o type-check isolado: `npx tsc --noEmit` sozinho é
> **no-op silencioso** — o `tsconfig.json` da raiz só tem `references`. Use
> `npx tsc -p tsconfig.app.json --noEmit`.

Falhou algum? Pare, corrija (ou reporte, se a correção for fora de escopo) e
só então siga. Nunca gere `.aab` com gate vermelho.

## Fase 5 — Gerar o `.aab`

```powershell
npx cap sync android
cd android; .\gradlew.bat :app:bundleRelease; cd ..
```

`npm run build` da Fase 4 gerou o `dist/` novo; o `cap sync` é o que copia esse
`dist/` pra `android/app/src/main/assets/public`. **Pular o sync empacota o web
bundle antigo** — o `.aab` sai válido, assinado, com o código de ontem. Se por
qualquer motivo você mexeu em `src/` depois da Fase 4, rode `npm run build` de
novo antes do sync.

O primeiro build depois de mudança grande leva alguns minutos (R8 +
`shrinkResources`). Use timeout generoso na chamada do Gradle.

## Fase 6 — Verificar a assinatura

O Gradle **não falha** quando a `signingConfig` não foi aplicada — confira no
artefato, não no log:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$aab = (Resolve-Path android\app\build\outputs\bundle\release\app-release.aab).Path
$zip = [IO.Compression.ZipFile]::OpenRead($aab)
$zip.Entries | Where-Object { $_.FullName -like 'META-INF/*' } | Select-Object -ExpandProperty FullName
$zip.Dispose()
```

Assinado = existem `META-INF/MANIFEST.MF` **e** um par `<ALIAS>.SF` +
`<ALIAS>.RSA`. Só o `MANIFEST.MF` significa bundle sem assinatura: volte pra
Fase 0.2, resolva a keystore e rode `bundleRelease` de novo.

Confira também a data do arquivo (`ls ...\app-release.aab`) pra garantir que é
o build de agora, não um sobrando de release anterior.

E confirme que o bump da Fase 3 realmente entrou no bundle — o manifesto de
`base/` é protobuf, mas o `versionName` fica lá como string legível:

```powershell
$zip = [IO.Compression.ZipFile]::OpenRead($aab)
$entry = $zip.Entries | Where-Object { $_.FullName -eq 'base/manifest/AndroidManifest.xml' }
$sr = New-Object IO.StreamReader($entry.Open()); $raw = $sr.ReadToEnd(); $sr.Close(); $zip.Dispose()
if ($raw -match '<versionName novo, escapado>') { "versionName no bundle: OK" } else { "ATENCAO: versao errada no bundle" }
```

Pega o caso de o Gradle ter reaproveitado saída em cache de um build anterior
ao bump.

## Fase 7 — Arquivar

```powershell
$v = "<versionName>-<versionCode>"
$dir = "release-artifacts\neoreader-$v"
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item android\app\build\outputs\bundle\release\app-release.aab "$dir\neoreader-$v.aab"
Copy-Item android\app\build\outputs\mapping\release\mapping.txt "$dir\mapping-$v.txt"
$h = (Get-FileHash "$dir\neoreader-$v.aab" -Algorithm SHA256).Hash.ToLower()
"$h *neoreader-$v.aab" | Out-File "$dir\SHA256SUMS.txt" -Encoding utf8 -NoNewline
```

Escreva também o `release-notes.txt` aprovado na Fase 2 dentro dessa pasta.

O `mapping.txt` é o mapa de deofuscação do R8 — sem ele, os crashes no Android
Vitals chegam com nomes ofuscados e ilegíveis. `release-artifacts/` está no
`.gitignore` de propósito (AAB de ~20 MB + mapping de ~33 MB): é arquivo local,
**nunca** entra em commit.

## Fase 8 — Commit e instruções de upload

Sugira o commit no padrão histórico do projeto — **nunca commite sozinho**:

```
chore: bump android release version
```

(arquivos: `android/app/build.gradle` + `README.md`; se houve correção de
código nesta mesma leva, ela é commit separado, antes.)

Depois reporte ao usuário, em uma lista curta:

1. Versão gerada (`versionName` / `versionCode`) e o **caminho absoluto do
   `.aab` arquivado**, sozinho num bloco de código pra dar pra copiar e colar
   direto no seletor de arquivo do Play Console:

   ```
   C:\Users\<usuário>\...\release-artifacts\neoreader-<versionName>-<versionCode>\neoreader-<versionName>-<versionCode>.aab
   ```

   Sempre o arquivo, nunca só a pasta, e sempre o caminho completo — o do
   `release-artifacts/`, não o de `android/app/build/outputs/` (esse é
   sobrescrito no próximo build).
2. Resultado dos gates e da verificação de assinatura.
3. Passos do upload: [Play Console](https://play.google.com/console) → NeoReader
   → **Test and release** → track (Internal / Closed / Open / Production) →
   **Create new release** → subir o `.aab` → colar as release notes → **Review
   release** → **Start rollout**.
4. Lembrete: o editor de release notes do Play aceita o arquivo inteiro com as
   tags `<pt-BR>`/`<es-ES>`/`<en-US>` de uma vez; se estiver editando idioma
   por idioma, cole só o conteúdo do bloco correspondente.

Detalhes de Play App Signing, upload key e recuperação de chave perdida estão
em `docs/deploy-play-console.md` — aponte pra lá em vez de repetir aqui.

## Guardrails

- Nunca gera `.aab` sem confirmar as 4 propriedades de assinatura antes.
- Nunca pula `npx cap sync android` entre o `npm run build` e o `bundleRelease`.
- Nunca reutiliza ou diminui `versionCode`; nunca sobrescreve uma pasta
  existente em `release-artifacts/`.
- Nunca escreve release note de algo que não está no diff do intervalo.
- Nunca commita o bump por conta própria nem adiciona `release-artifacts/` ao Git.
- Nunca imprime senhas/caminho de keystore com credencial no output.
- Se um gate falhar ou a assinatura não entrar, para e reporta — release
  pela metade não é entregável.
