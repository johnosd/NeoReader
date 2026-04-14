# NeoReader — Setup do Ambiente (faça antes de criar o projeto)

> **Tempo estimado**: 1-2 horas (a maior parte é download)
>
> Você só precisa fazer isso UMA VEZ. Depois de pronto, nunca mais.

---

## Passo 1 — Verificar Node.js

Abra o terminal (Git Bash, PowerShell ou CMD) e rode:

```bash
node --version
npm --version
```

**Resultado esperado**: `v20.x.x` ou superior (ex: `v20.11.0`, `v22.x`).

### Se não tiver Node ou versão for menor que 20:

**Opção recomendada — usar `nvm-windows`** (gerenciador de versões):

1. Baixe: https://github.com/coreybutler/nvm-windows/releases
2. Instale o `nvm-setup.exe`
3. Feche e abra o terminal de novo
4. Rode:
   ```bash
   nvm install 20
   nvm use 20
   node --version
   ```

**Por que nvm?** Você vai trabalhar em projetos com versões diferentes ao longo da carreira. Trocar com `nvm use 18` ou `nvm use 22` evita dor de cabeça.

---

## Passo 2 — Instalar Android Studio

1. Baixe: https://developer.android.com/studio
2. Instale com as opções padrão (vai baixar ~3-5 GB)
3. Na primeira execução, ele vai perguntar sobre instalar SDK — **aceite tudo padrão**
4. Quando terminar, abra `More Actions > SDK Manager` e confirme que tem instalado:
   - **Android SDK Platform 34** (ou mais recente)
   - **Android SDK Build-Tools** (versão mais recente)
   - **Android SDK Platform-Tools**
   - **Android SDK Command-line Tools (latest)**

### Configurar variáveis de ambiente (IMPORTANTE)

No Windows, abra "Editar variáveis de ambiente do sistema" e adicione:

| Variável | Valor (caminho típico) |
|---|---|
| `ANDROID_HOME` | `C:\Users\SEU_USUARIO\AppData\Local\Android\Sdk` |
| `JAVA_HOME` | (Android Studio instala JBR — caminho tipo `C:\Program Files\Android\Android Studio\jbr`) |

E adicione ao `Path`:
- `%ANDROID_HOME%\platform-tools`
- `%ANDROID_HOME%\emulator`
- `%ANDROID_HOME%\cmdline-tools\latest\bin`

**Teste**: feche e abra o terminal, rode:
```bash
adb --version
```
Deve mostrar a versão do Android Debug Bridge. Se sim, ✅.

---

## Passo 3 — Ativar modo desenvolvedor no celular

1. **Configurações** → **Sobre o telefone**
2. Toque **7 vezes** em "Número da versão" (ou "Build number")
3. Vai aparecer "Você agora é um desenvolvedor!"
4. Volta pra Configurações → procure **Opções do desenvolvedor**
5. Ative:
   - **Depuração USB** (USB debugging)
   - **Instalar via USB** (se aparecer)

### Testar conexão

1. Conecte o celular no PC com cabo USB **que transfere dados** (cabo só de carga não funciona)
2. No celular, vai aparecer popup "Permitir depuração USB?" → marque "Sempre permitir" e OK
3. No terminal:
   ```bash
   adb devices
   ```
4. Deve aparecer algo tipo:
   ```
   List of devices attached
   ABC123XYZ    device
   ```

Se aparecer `unauthorized`, autorize o popup no celular. Se não aparecer nada, troque de cabo.

---

## Passo 4 — Editor de código

Recomendação forte: **Cursor** (https://cursor.sh) ou **VSCode** (https://code.visualstudio.com).

Se vai usar Claude Code, qualquer editor serve — Claude Code roda no terminal independente.

### Extensões úteis (VSCode/Cursor)
- **ESLint**
- **Prettier**
- **Tailwind CSS IntelliSense**
- **Error Lens** (mostra erros inline)

---

## Passo 5 — Git e GitHub

Se ainda não tem:
```bash
git --version
gh --version
```

Você já tem `gh` configurado segundo nossas conversas anteriores. Confirme com:
```bash
gh auth status
```

---

## Checklist final antes de prosseguir

Marque cada item — **só passe pra criação do projeto quando tudo estiver ✅**:

- [ ] `node --version` → v20.x ou superior
- [ ] `npm --version` → 10.x ou superior
- [ ] Android Studio aberto pelo menos uma vez (criou pasta SDK)
- [ ] `adb --version` → funciona
- [ ] `ANDROID_HOME` configurado
- [ ] Modo desenvolvedor ativo no celular
- [ ] Depuração USB ativada
- [ ] `adb devices` → mostra teu celular como `device`
- [ ] Editor instalado (Cursor/VSCode)
- [ ] Pasta onde o projeto vai morar escolhida (ex: `G:\Projetos\NeoReader` ou similar)

---

## Quando terminar

Me avisa qual o resultado de cada comando:
```bash
node --version
npm --version
adb --version
adb devices
```

Aí eu confirmo se tá tudo certo e a gente parte pra criar a estrutura do NeoReader.
