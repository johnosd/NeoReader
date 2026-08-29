# Deploy no Google Play Console

Processo pra publicar uma nova versão do NeoReader Android na Play Store.
Cobre da atualização de versão até o upload do `.aab` assinado.

## 1. Bumpar a versão

Edite `android/app/build.gradle`:

```groovy
versionCode 19        // +1 sempre, é o identificador interno pro Play
versionName "1.0.15"  // convenção do projeto: incrementa só o patch
                       // (ex: 1.0.14 -> 1.0.15), mesmo em releases com
                       // feature nova — ver histórico de commits
                       // "chore: bump android release version"
```

Atualize também a tabela em `README.md` → seção **"Build Android"** (`versionName`/`versionCode`) pra manter a doc em sincronia.

`versionCode` **precisa** ser estritamente maior que o da última versão publicada — o Play rejeita upload com `versionCode` igual ou menor.

## 2. Gerar o bundle assinado

```bash
npm run build
npx cap sync android
cd android
./gradlew.bat :app:bundleRelease   # PowerShell/Windows
# ou ./gradlew :app:bundleRelease  # bash
cd ..
```

Saída: `android/app/build/outputs/bundle/release/app-release.aab`.

Esse é o arquivo que sobe no Play Console — build de release já sai com
`minifyEnabled true` + `shrinkResources true` (R8/ProGuard), então o
primeiro build depois de mudanças grandes pode levar alguns minutos.

### Arquivar o release (convenção do projeto)

Guarde uma cópia em `release-artifacts/` (fora do Git — pasta local),
seguindo o padrão dos releases anteriores:

```bash
mkdir -p "release-artifacts/neoreader-<versionName>-<versionCode>"
cp android/app/build/outputs/bundle/release/app-release.aab \
   "release-artifacts/neoreader-<versionName>-<versionCode>/neoreader-<versionName>-<versionCode>.aab"
cp android/app/build/outputs/mapping/release/mapping.txt \
   "release-artifacts/neoreader-<versionName>-<versionCode>/mapping-<versionName>-<versionCode>.txt"
cd "release-artifacts/neoreader-<versionName>-<versionCode>"
sha256sum "neoreader-<versionName>-<versionCode>.aab" > SHA256SUMS.txt
```

O `mapping.txt` é o mapa de deofuscação do ProGuard/R8 — sem ele, crash
reports no Play Console (Android Vitals) aparecem com nomes de
classe/método ofuscados, ilegíveis. Vale subir ele também no Play Console
(Release → detalhes do release → "Deobfuscation files"), embora o upload
do `.aab` já costume associar automaticamente se gerados na mesma build.

## 3. Assinatura — como funciona neste projeto

O NeoReader usa **Play App Signing**: o Google guarda a chave de
assinatura *final* (a que efetivamente assina o que chega no celular do
usuário) — confirmável em Play Console → **Protected with Play** →
**Play Store protection** → item **"Protect app signing key"** deve
mostrar "Releases signed by Play".

Você só precisa da **upload key** — uma chave intermediária, usada só pra
provar ao Play que o upload é seu. Ela é lida por `android/app/build.gradle`
via 4 variáveis:

```
NEOREADER_RELEASE_STORE_FILE
NEOREADER_RELEASE_STORE_PASSWORD
NEOREADER_RELEASE_KEY_ALIAS
NEOREADER_RELEASE_KEY_PASSWORD
```

**Onde elas vivem** (nunca no repositório — `*.keystore`/`*.jks` estão no
`.gitignore` de propósito):

1. **Principal**: `C:\Users\<usuário>\.gradle\gradle.properties` (arquivo
   global do Gradle, fora de qualquer projeto) — é daí que o `gradlew`
   lê de verdade via `project.findProperty(...)`. Se esse arquivo não
   existir/não tiver as 4 chaves, o build de release sai sem assinatura
   válida.
2. **Backup**: `.env` na raiz do projeto (gitignored) guarda uma cópia dos
   mesmos 4 valores, só pra não perder de vista onde procurar caso o
   arquivo global suma (ex: reinstalação do Windows, troca de máquina).
   **Isso é só documentação/backup** — copiar pra `.env` não faz o
   `gradlew` funcionar sozinho, porque o Vite (que lê `.env`) e o Gradle
   (que lê `~/.gradle/gradle.properties`) são processos completamente
   separados. Se `~/.gradle/gradle.properties` sumir, restaure copiando os
   4 valores de volta pra lá antes de rodar `bundleRelease`.
3. A keystore em si (o arquivo `.keystore`/`.jks` apontado por
   `NEOREADER_RELEASE_STORE_FILE`) também não está no repo — fica só no
   caminho indicado por essa variável.

### Se perder a upload key (arquivo `.keystore`/senha)

1. Confira se o valor de `NEOREADER_RELEASE_STORE_FILE` no `.env` (backup)
   aponta pra um caminho onde o arquivo ainda existe — às vezes só o
   `~/.gradle/gradle.properties` que sumiu, não o arquivo em si.
2. Procure em backups locais, outro computador, gerenciador de senhas —
   qualquer keystore cujo fingerprint bata com o que o Play Console mostra
   em **Protected with Play → Play Store protection → Manage Play app
   signing → "Upload key certificate"** serve (confira com
   `keytool -list -v -keystore <arquivo> -alias <alias>`, campo `SHA256:`).
3. Se realmente não tiver mais nenhuma cópia: em **Manage Play app
   signing**, tem a opção **"Request upload key reset"**. Isso troca só a
   upload key — a chave de assinatura final (a que os usuários já
   instalados dependem) não muda, então instalações existentes não são
   afetadas. O ponto negativo é o tempo: o pedido passa por revisão do
   Google antes de aprovar, não é instantâneo — **planeje com folga**, não
   dá pra contar com isso no dia de um deploy urgente.

## 4. Upload no Play Console

1. [play.google.com/console](https://play.google.com/console) → selecione
   o NeoReader.
2. Menu lateral → **Test and release** → escolha a track (Internal
   testing, Closed testing, Open testing, ou Production).
3. **Create new release** → suba o `app-release.aab`.
4. Preencha as notas de release (release notes) — obrigatório por idioma
   configurado na ficha da loja.
5. Revise os avisos automáticos do Play (permissões novas, tamanho,
   políticas) antes de confirmar.
6. **Review release** → **Start rollout**.

Releases em tracks de teste (internal/closed/open) ficam disponíveis quase
na hora pros testers cadastrados. Em produção, o rollout pode ser
percentual (staged rollout) — controle isso na mesma tela se quiser subir
gradualmente em vez de 100% de uma vez.

## Checklist rápido

- [ ] `versionCode`/`versionName` bumpados em `android/app/build.gradle`
- [ ] Tabela de versão do `README.md` atualizada
- [ ] `npm run lint && npm test && npm run build` limpos
- [ ] `npx cap sync android` rodado com o build mais recente
- [ ] `gradlew :app:bundleRelease` gerou o `.aab` sem erro
- [ ] Cópia arquivada em `release-artifacts/`
- [ ] `.aab` enviado na track certa do Play Console, com release notes
