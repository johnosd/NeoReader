---
name: play-publish
description: Publica na Google Play (via Gradle Play Publisher) o `.aab` que o skill play-release já gerou, assinou e arquivou — sobe pra track internal e, só com pedido explícito, promove pra outra track com rollout escalonado. Use quando o usuário pedir para "publicar na Play", "subir pra internal", "rodar o publishReleaseBundle", "promover pra produção" ou "aumentar o rollout". NÃO use para gerar, bumpar ou assinar o bundle nem para escrever release notes (isso é o play-release, que deve rodar antes), nem para upload manual pelo Play Console.
disable-model-invocation: true
---

# play-publish

Sobe para a Play o bundle que o `play-release` já preparou. **Não gera nem
altera nada do release** — só publica o artefato arquivado e verificado.

Plugin: Gradle Play Publisher 4.1.1 (`com.github.triplet.play`), configurado em
`android/app/build.gradle`. Track padrão: `internal`.

## Pré-requisito

`play-release` rodou até a Fase 8: existe
`release-artifacts/neoreader-<versionName>-<versionCode>/` com o `.aab`,
`SHA256SUMS.txt` e `release-notes.txt`, e o bump de versão foi **commitado**
pelo usuário. Se não, pare e mande rodar `/play-release` primeiro.

## Regras

- **Nunca** leia, imprima, copie ou commite o JSON da service account. Só o
  *caminho* é referenciado, via a propriedade `PLAY_SERVICE_ACCOUNT_JSON`.
- Nunca hardcode caminho de keystore ou senha. Signing vem de
  `~/.gradle/gradle.properties` (propriedades `NEOREADER_RELEASE_*`).
- Nunca rode `publish*` ou `promote*` antes do preflight passar **e** do
  usuário confirmar neste chat (Fase 1). Upload queima o `versionCode` pra
  sempre — não tem "desfazer".
- Se qualquer passo falhar, **pare e reporte o erro**. Sem retry com
  workaround, sem trocar de track, sem mudar `--release-status` por conta
  própria.
- Nunca faça `git push` (nem de tag) sem pedido explícito.

## Fase 0 — Preflight

Pare na primeira falha. Variáveis usadas abaixo: `$v = "<versionName>-<versionCode>"`.

**1. Versão e artefato batem.**

```powershell
Select-String -Path android\app\build.gradle -Pattern "versionCode|versionName"
Get-ChildItem release-artifacts\neoreader-$v
```

`versionName`/`versionCode` do `build.gradle` precisam ser exatamente os do
nome da pasta. Valide o hash do `.aab` arquivado contra o `SHA256SUMS.txt`:

```powershell
$dir = (Resolve-Path "release-artifacts\neoreader-$v").Path
$esperado = ((Get-Content "$dir\SHA256SUMS.txt" -Raw) -split '\s+')[0]
$real = (Get-FileHash "$dir\neoreader-$v.aab" -Algorithm SHA256).Hash.ToLower()
if ($esperado -eq $real) { "SHA256: OK" } else { "SHA256 DIVERGE — pare" }
```

**2. Assinatura entrou no bundle arquivado.** O Gradle não falha sem signing;
confira no artefato (mesma checagem da Fase 6 do `play-release`):

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead("$dir\neoreader-$v.aab")
$zip.Entries | Where-Object { $_.FullName -like 'META-INF/*' } | Select-Object -ExpandProperty FullName
$zip.Dispose()
```

Precisa ter `MANIFEST.MF` **e** um par `<ALIAS>.SF` + `<ALIAS>.RSA` (o nome
do alias vem truncado em 8 caracteres, ex.: `NEOREADE.SF`). Só o
`MANIFEST.MF` = sem assinatura: a Play rejeita. Volte pro `play-release`.

**3. Bump commitado e branch.**

```powershell
git status --short -- android/app/build.gradle README.md
git branch --show-current
```

A primeira saída tem que vir **vazia** (bump já commitado — senão a tag da
Fase 4 apontaria pra um commit sem a versão). Se a branch não for `main`,
**pergunte** antes de seguir; pode ser release de teste intencional.

**4. Credencial da Play.** A propriedade vive em
`~/.gradle/gradle.properties` (o Gradle **não lê** o `.env`). Confira só que
a chave existe e que o arquivo apontado existe — **sem abrir o JSON**:

```powershell
$gp = "$env:USERPROFILE\.gradle\gradle.properties"
$l = Select-String -Path $gp -Pattern '^PLAY_SERVICE_ACCOUNT_JSON=' | Select-Object -First 1
if ($l) {
  $p = ($l.Line -split '=', 2)[1].Trim()
  "propriedade definida; arquivo existe: $(Test-Path -LiteralPath $p -PathType Leaf)"
} elseif ($env:PLAY_SERVICE_ACCOUNT_JSON) {
  "via variavel de ambiente; arquivo existe: $(Test-Path -LiteralPath $env:PLAY_SERVICE_ACCOUNT_JSON -PathType Leaf)"
} else { "NAO definida" }
```

Sem credencial o `build.gradle` simplesmente não a configura e a task falha
na publicação — melhor descobrir aqui. Nunca imprima o conteúdo do arquivo.

**5. Release notes para o GPP.** A fonte da verdade continua sendo o
`release-notes.txt` arquivado (formato com tags `<pt-BR>`/`<es-ES>`/`<en-US>`,
já aprovado no `play-release`). O GPP lê de
`android/app/src/main/play/release-notes/<idioma>/default.txt`, então
**gere** essa pasta a partir do arquivo — ela é derivada e está no
`.gitignore`. Sem ela, o GPP reaproveitaria as notas da release anterior.

```powershell
$src  = Get-Content "$dir\release-notes.txt" -Raw -Encoding UTF8
$dest = "android\app\src\main\play\release-notes"
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }   # evita idioma velho sobrando
$utf8 = New-Object System.Text.UTF8Encoding($false)          # UTF-8 sem BOM
foreach ($m in [regex]::Matches($src, '(?s)<(?<loc>[a-z]{2}-[A-Z]{2})>(?<txt>.*?)</\k<loc>>')) {
  $loc = $m.Groups['loc'].Value
  $txt = ($m.Groups['txt'].Value -replace "`r`n", "`n").Trim()
  if ($txt.Length -gt 500) { throw "$loc tem $($txt.Length) caracteres (limite da Play: 500)" }
  New-Item -ItemType Directory -Force "$dest\$loc" | Out-Null
  [IO.File]::WriteAllText("$dest\$loc\default.txt", $txt, $utf8)
  "{0}: {1} caracteres" -f $loc, $txt.Length
}
git check-ignore -q android/app/src/main/play/release-notes/pt-BR/default.txt; "ignorado pelo git: $($LASTEXITCODE -eq 0)"
```

Esperado: 3 idiomas (pt-BR, es-ES, en-US), todos ≤ 500, e "ignorado pelo git:
True". Se vier `False`, pare — o `.gitignore` perdeu a regra e as notas
derivadas iriam parar em commit.

## Fase 1 — Confirmação (obrigatória)

Mostre ao usuário, em lista curta, e **espere um "sim" explícito**:

- `applicationId`: `com.johnny.neoreader`
- `versionName` / `versionCode`
- Track de destino (`internal`) e SHA256 do bundle
- Idiomas das release notes e nº de caracteres de cada um
- Aviso: o `versionCode` fica consumido na Play depois do upload

Pergunte também: **é a primeira publicação via GPP?** Se for (ou se a
credencial/permissão mudou há pouco), comece pelo ensaio da Fase 2a.

## Fase 2 — Publicar na internal

Os comandos rodam de `android/`. Usamos `--artifact-dir` para subir
**exatamente o `.aab` que foi verificado e arquivado** (hash conferido na
Fase 0), em vez de deixar o Gradle rebuildar e produzir outro arquivo.
O caminho precisa ser **absoluto** (o Gradle resolve relativo a `android/app`).

### 2a. Ensaio (`--no-commit`) — primeira vez ou credencial nova

```powershell
cd android
.\gradlew.bat :app:publishReleaseBundle --artifact-dir "$dir" --track internal --no-commit
cd ..
```

`--no-commit` faz o upload para um *edit* da Play API e o **descarta** no
fim: valida credencial, permissão do app, `applicationId` e `versionCode`
sem lançar nada. Reporte o resultado e peça OK para a publicação real.

### 2b. Publicação real

```powershell
cd android
.\gradlew.bat :app:publishReleaseBundle --artifact-dir "$dir" --track internal --rerun
cd ..
```

`--rerun` é necessário: logo após um ensaio, o Gradle pode marcar a task como
`UP-TO-DATE` e **não subir nada**. Se a saída mostrar `UP-TO-DATE`, nada foi
publicado — rode de novo com `--rerun`, não conclua que deu certo.

Timeout generoso na chamada (upload de ~20 MB + processamento).

Reporte: `versionName`, `versionCode`, track e que o upload terminou sem erro.

### Erros comuns

| Erro | Causa provável |
|---|---|
| 403 | Service account sem permissão no app (Play Console → Users and permissions → Release apps) ou permissão ainda propagando (pode levar horas). |
| 404 / package not found | `applicationId` errado, ou o app ainda não teve o primeiro upload manual. |
| "Google Play Android Developer API has not been used" | API desativada no projeto do Google Cloud da service account. |
| `versionCode` already used / "greater than or equal" | Bundle com versão já consumida. Volte ao `play-release` e bumpe — nunca force `--resolution-strategy ignore`. |
| "Only releases with status draft may be created on draft app" | App nunca completou o setup de publicação. Só com OK do usuário: repetir com `--release-status draft`. |
| Erro de idioma nas release notes | Idioma sem ficha ativada no Play Console. Remover o idioma do `release-notes.txt` ou ativá-lo na loja. |

## Fase 3 — Limpeza e verificação manual

Apague a pasta derivada para não deixar notas velhas valendo na próxima
publicação manual do Gradle:

```powershell
Remove-Item android\app\src\main\play\release-notes -Recurse -Force
```

Lembre ao usuário que o processamento da Play leva alguns minutos: conferir em
Play Console → NeoReader → **Testing → Internal testing** que o release
aparece com o `versionCode` esperado.

## Fase 4 — Tag (só se o usuário quiser)

Pergunte se quer criar `v<versionName>+<versionCode>`. **Nunca automático.**
Antes, confirme que o `HEAD` contém a versão publicada:

```powershell
git show HEAD:android/app/build.gradle | Select-String "versionCode|versionName"
```

`git push` da tag só com pedido explícito, separado.

## Fase 5 — Promoção (só por pedido explícito)

1. Diga exatamente o que vai acontecer: track de origem → destino,
   `versionName`, `versionCode`, fração do rollout.
2. Espere confirmação **neste chat**.
3. Rode:

```powershell
cd android
.\gradlew.bat :app:promoteReleaseArtifact --from-track internal --promote-track production --release-status inProgress --user-fraction 0.1
cd ..
```

Rollout escalonado de 10% por padrão; 100% só se o usuário pedir. O
`--release-status inProgress` fica explícito de propósito — não dependa do
default do plugin. Promover leva **a release que está hoje na track de
origem**: confirme que ela é a esperada antes.

Para aumentar o rollout depois: mesma task com `--update production
--release-status inProgress --user-fraction <fração>`; para concluir em 100%,
`--release-status completed`. Confirme as opções com
`.\gradlew.bat :app:help --task promoteReleaseArtifact` se a versão do plugin
mudou.

## Relatório final

Lista curta: versão, track, status (ensaio ou publicado), e próximos passos
manuais — acompanhar o processamento na Play Console, e, após promoção,
Android vitals / taxa de crash antes de aumentar o rollout.

## Notas

- Nomes de task dependem da versão do plugin (hoje 4.1.1). Se uma task não for
  encontrada: `.\gradlew.bat :app:tasks --all | Select-String -Pattern "publish|promote"`.
- Ficha da loja, Data Safety e declarações de conteúdo continuam manuais no
  Play Console.
- O JSON da service account hoje está em `.secrets/` na raiz (ignorado pelo
  Git). Worktrees em `.claude/worktrees/` não o terão — rode a publicação
  sempre na árvore principal ou aponte a propriedade para um caminho fora do
  repo.
