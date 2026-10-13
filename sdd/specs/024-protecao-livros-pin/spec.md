# Feature Specification: Proteção de livros com PIN e grupo "Protegidos" na Biblioteca

**Slug**: `024-protecao-livros-pin`

**Created**: 2026-10-12

**Status**: Convergida

**Input**: "eu como usuário quero colocar senha/pin em livros para que sejam bloqueados e só abram mediante pin correto. Poderiamos ter uma tag/categoria específica em que livros com pin fiquem agrupados, assim o pin liberaria eles"

## Escopo

### Incluído

- **PIN único do app** (numérico, 4 a 6 dígitos), criado na primeira vez que o usuário protege um livro.
- **Proteger / remover proteção de um livro**, pela folha de ações rápidas do livro na Biblioteca e pela tela de Detalhes do livro.
- **Bloqueio de verdade**: com o PIN não digitado, um livro protegido só mostra capa, título e um cadeado. Abrir, ouvir (TTS), ver detalhes, editar tags/coleção/favorito/status, remover a proteção e excluir exigem o PIN.
- **Desbloqueio coletivo**: um PIN correto libera todos os livros protegidos de uma vez.
- **Re-bloqueio ao sair do app** (segundo plano ou fechado) e ação manual "Bloquear agora".
- **Proteção contra tentativa e erro**: espera crescente após 5 PINs errados seguidos.
- **Grupo "Protegidos"** na Biblioteca: filtro fixo que reúne os livros protegidos e permite desbloqueá-los de uma vez.
- **Esqueci o PIN**: recuperação confirmando a credencial de bloqueio de tela do aparelho (padrão, PIN ou senha do Android); os livros continuam protegidos com o PIN novo.
- **Alterar PIN** e **desativar a proteção do app** (remove a proteção de todos os livros), em Configurações.
- **Seleção múltipla (feature 023)**: livros protegidos e bloqueados não podem ser marcados.

### Fora de Escopo

- **Biometria** (digital/rosto): fica como ideia futura no backlog; exigiria dependência nativa nova.
- **PIN por livro**: o modelo é um PIN único do app.
- **Livros ocultos ou grupo invisível**: livros protegidos continuam visíveis (capa e título) nas listas, só com cadeado.
- **Proteger em lote** pela seleção múltipla: só entra depois que a feature 023 estiver estável.
- **Proteger tags ou coleções inteiras**: a proteção é por livro.
- **Proteção automática** de livros novos (importação de pasta, OPDS, domínio público).
- **Criptografar o arquivo do livro**, escondê-lo de gerenciadores de arquivos ou bloquear capturas de tela.
- **Proteger o vocabulário**: palavras e frases salvas de um livro protegido continuam visíveis na tela de Vocabulário.
- **Sincronizar PIN ou proteção entre dispositivos** (Drive ou outro meio).
- **Re-bloqueio por tempo ocioso** ou ao fechar o livro: o re-bloqueio acontece só ao sair do app.
- **Bloquear o app inteiro** com PIN ao abrir (app lock).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Proteger um livro e exigir PIN para abrir (Priority: P1)

O usuário tem um livro que não quer que outras pessoas abram ao pegar o celular dele. Ele protege o livro com um PIN. Depois disso, o livro continua aparecendo na Biblioteca com cadeado, mas só abre mediante o PIN correto. Ao sair do app, tudo volta a ficar bloqueado.

**Why this priority**: é a essência do pedido ("só abram mediante pin correto"). Entrega sozinha a barreira de privacidade completa: criar PIN, proteger, bloquear todas as vias de acesso e re-bloquear.

**Independent Test**: sem nenhum PIN criado, proteger um livro pela folha de ações rápidas (criando o PIN 1234), tocar no livro e ver o pedido de PIN; digitar 1234 e ver o livro abrir; mandar o app para segundo plano, voltar e confirmar que o livro voltou a pedir o PIN.

**Acceptance Scenarios**:

1. **Given** que ainda não existe PIN, **When** o usuário escolhe "Proteger com PIN" num livro, **Then** o app pede para criar um PIN de 4 a 6 dígitos e confirmá-lo digitando de novo; só depois disso o livro fica protegido.
2. **Given** a criação do PIN aberta, **When** os dois PINs digitados são diferentes ou têm menos de 4 dígitos, **Then** o app avisa o problema, não cria o PIN e o livro continua sem proteção.
3. **Given** que já existe PIN e o app está bloqueado, **When** o usuário protege outro livro, **Then** o livro é protegido sem pedir PIN (proteger só adiciona restrição).
4. **Given** um livro protegido, **When** ele aparece na Biblioteca (lista ou grade), na Home ("continuar lendo") ou nos resultados de busca, **Then** mostra capa, título e um cadeado, e nada além disso.
5. **Given** um livro protegido e bloqueado, **When** o usuário toca nele, **Then** aparece o pedido de PIN. **And** com o PIN correto o livro abre e todos os outros livros protegidos ficam desbloqueados.
6. **Given** um livro protegido e bloqueado, **When** o usuário tenta uma ação sobre ele (abrir Detalhes, ouvir, editar tags/coleção, favoritar, mudar status, remover proteção ou excluir), **Then** o app pede o PIN antes; com o PIN correto, a ação escolhida segue; ao cancelar, nada muda.
7. **Given** o PIN errado digitado, **When** o usuário confirma, **Then** o campo é limpo, aparece "PIN incorreto" e o livro continua bloqueado.
8. **Given** livros desbloqueados, **When** o app vai para segundo plano ou é fechado, **Then** ao voltar todos os livros protegidos estão bloqueados de novo.
9. **Given** livros desbloqueados, **When** o usuário toca em "Bloquear agora", **Then** todos os livros protegidos voltam a ficar bloqueados na hora.
10. **Given** um livro protegido e desbloqueado, **When** o usuário escolhe "Remover proteção", **Then** o livro volta a se comportar como um livro comum, sem cadeado.

---

### User Story 2 - Esqueci o PIN, alterar e desativar (Priority: P2)

O usuário esqueceu o PIN, ou quer trocá-lo, ou não quer mais proteção nenhuma. Ele consegue resolver sem perder livros, progresso ou anotações.

**Why this priority**: sem recuperação, esquecer o PIN trancaria o usuário fora dos próprios livros, o que é inaceitável num leitor local-first. Por isso a P2 DEVE ir junto com a P1 numa publicação (ver Assumptions).

**Independent Test**: com o PIN 1234 criado e dois livros protegidos, tocar em "Esqueci o PIN", digitar o padrão/PIN de tela do aparelho e definir 5678. Os dois livros continuam protegidos e abrem com 5678.

**Acceptance Scenarios**:

1. **Given** o pedido de PIN aberto no Android, **When** o usuário toca em "Esqueci o PIN", **Then** o app abre a tela do sistema que pede a credencial de bloqueio de tela do aparelho (padrão, PIN ou senha).
2. **Given** a credencial do aparelho confirmada com sucesso, **When** o usuário define e confirma um PIN novo, **Then** o PIN antigo deixa de valer, o novo passa a valer, e todos os livros que estavam protegidos continuam protegidos.
3. **Given** a confirmação cancelada ou errada, **When** o fluxo termina, **Then** o PIN antigo continua valendo e nada muda.
4. **Given** um aparelho sem bloqueio de tela configurado, **When** o usuário toca em "Esqueci o PIN", **Then** o app avisa que não há como confirmar a identidade nesse aparelho e só redefine o PIN depois de uma confirmação explícita do usuário.
5. **Given** o app rodando na web (sem credencial de aparelho), **When** o usuário toca em "Esqueci o PIN", **Then** o app pede para confirmar a conta Google logada digitando a senha; sem conexão, explica que a confirmação exige conexão.
6. **Given** o usuário em Configurações, mesmo com os livros já desbloqueados, **When** escolhe "Alterar PIN", **Then** o app pede o PIN atual, depois o novo PIN duas vezes, e só então troca; os livros continuam protegidos.
7. **Given** o usuário em Configurações, mesmo com os livros já desbloqueados, **When** escolhe "Desativar proteção" e confirma com o PIN atual, **Then** o PIN é apagado, todos os livros deixam de ser protegidos e o grupo "Protegidos" some.

---

### User Story 3 - Grupo "Protegidos" na Biblioteca (Priority: P3)

O usuário quer ver todos os livros protegidos juntos e liberá-los com um único PIN, sem precisar tocar livro por livro.

**Why this priority**: organização e conveniência. A proteção já funciona sem o grupo (P1), mas o grupo dá a visão agrupada e o atalho de desbloqueio que o usuário pediu.

**Independent Test**: com 3 livros protegidos entre 10, abrir o filtro "Protegidos" e ver só esses 3, todos com cadeado; tocar em "Desbloquear", digitar o PIN e ver os 3 sem cadeado; sair do app, voltar e ver os cadeados de novo.

**Acceptance Scenarios**:

1. **Given** pelo menos um livro protegido, **When** o usuário vê os filtros da Biblioteca, **Then** existe um filtro fixo "Protegidos" com cadeado, junto aos filtros existentes.
2. **Given** nenhum livro protegido, **When** o usuário vê os filtros, **Then** o filtro "Protegidos" não aparece.
3. **Given** o filtro "Protegidos" ativo e bloqueado, **When** o usuário toca em "Desbloquear" e digita o PIN correto, **Then** todos os livros protegidos ficam desbloqueados (cadeado aberto) e passam a poder ser abertos e alterados sem novo PIN.
4. **Given** o filtro "Protegidos" ativo e desbloqueado, **When** o usuário toca em "Bloquear agora", **Then** os livros voltam a ficar bloqueados.
5. **Given** a seleção múltipla da Biblioteca e livros protegidos **bloqueados**, **When** o usuário faz long-press ou toca num deles em modo de seleção, **Then** o livro não é marcado e aparece o aviso "Desbloqueie para selecionar".
6. **Given** a seleção múltipla e livros protegidos **desbloqueados**, **When** o usuário os marca, **Then** eles se comportam como qualquer outro livro nas ações em lote.
7. **Given** um livro protegido que também tem tags e coleção, **When** o usuário usa os filtros de tag e de coleção, **Then** o livro aparece normalmente neles (com cadeado), além de aparecer em "Protegidos".

---

### Edge Cases

- **PIN errado repetido**: após 5 erros seguidos, o campo trava por 30 s; a cada nova rodada de 5 erros, a espera dobra (30 s, 1 min, 2 min...). A contagem regressiva é visível e uma tentativa de PIN durante a espera não é aceita.
- **Fechar o app durante a espera**: a espera continua valendo ao reabrir; fechar o app não zera o contador.
- **PIN correto zera os erros**: um desbloqueio bem-sucedido reinicia a contagem de erros e a duração da espera.
- **Livro aberto no leitor ao voltar do segundo plano**: o conteúdo é ocultado e o app pede o PIN antes de mostrá-lo. Um áudio TTS em andamento não é interrompido pelo re-bloqueio, mas ouvir de novo a partir de outra entrada exige o PIN.
- **Tela do aparelho apaga ou bloqueia com o TTS tocando**: conta como sair do app, então o livro re-bloqueia, mas o áudio continua. Ao reabrir o app o PIN é pedido (sem tolerância).
- **Controles do TTS na notificação e na tela de bloqueio** (play, pausar, próximo, anterior): continuam funcionando com o livro re-bloqueado, sem PIN. Eles só atuam sobre a sessão de áudio que o dono já iniciou; abrir ou ver o livro continua exigindo o PIN.
- **Abrir por fora do app um arquivo já importado e protegido** (intent "abrir com"): o import rejeita duplicata com a mensagem "Este livro já está na biblioteca" e não reabre o livro existente, então esse caminho não chega ao conteúdo. Se algum caminho futuro abrir o livro direto, o bloqueio por rota continua valendo.
- **Livro protegido com arquivo ausente** (`missingFile`) ou externo: a proteção funciona do mesmo modo; o PIN é pedido antes de qualquer mensagem sobre o arquivo.
- **Excluir livro protegido**: exige PIN; ao excluir, o livro some e deixa de contar no grupo "Protegidos". Se era o último, o filtro "Protegidos" some.
- **Reimportar um livro já importado e protegido**: o import rejeita a duplicata e não altera o livro existente, que permanece protegido e sem duplicar.
- **Cancelar o pedido de PIN** (fechar o painel ou voltar do Android): nada muda e o usuário permanece onde estava.
- **Recuperação com o app indo para segundo plano**: a tela do sistema que pede a credencial do aparelho pausa o app. O re-bloqueio resultante não pode fechar o fluxo de recuperação em andamento.
- **Troca de conta Google no app**: a proteção e o PIN seguem a mesma regra de isolamento dos demais dados locais da conta; livros e PIN de outra conta não aparecem.
- **Relógio do aparelho alterado**: o app não se defende de adulteração do relógio para encurtar a espera (limite aceito, ver Assumptions).
- **Rotação e redimensionamento da tela**: o pedido de PIN mantém o que foi digitado ou reinicia limpo, mas nunca expõe o PIN.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE manter um único PIN do app, numérico, com 4 a 6 dígitos.
- **FR-002**: Ao criar ou alterar o PIN, o sistema DEVE exigir que o usuário o digite duas vezes e DEVE rejeitar PINs diferentes, curtos demais, longos demais ou não numéricos.
- **FR-003**: Se não existe PIN, a ação "Proteger com PIN" DEVE conduzir à criação do PIN antes de proteger o livro. Se o usuário cancelar, o livro DEVE continuar sem proteção.
- **FR-004**: A ação "Proteger com PIN" / "Remover proteção" DEVE estar disponível na folha de ações rápidas do livro na Biblioteca e na tela de Detalhes do livro.
- **FR-005**: Proteger um livro quando já existe PIN NÃO DEVE pedir o PIN. Remover a proteção de um livro DEVE exigir o PIN (ou estar desbloqueado).
- **FR-006**: Livros protegidos DEVEM continuar aparecendo nas listas (Biblioteca em lista e grade, Home, resultados de busca) com capa, título e indicador de cadeado, sem expor nada além disso enquanto bloqueados.
- **FR-007**: Com o PIN não digitado, o sistema DEVE exigir o PIN antes de qualquer interação com um livro protegido além de vê-lo na lista: abrir/ler, ouvir (TTS), abrir Detalhes, editar tags, coleção, favorito ou status, remover a proteção e excluir. Após o PIN correto, a ação pretendida DEVE prosseguir.
- **FR-008**: Um PIN correto DEVE desbloquear todos os livros protegidos de uma vez. O desbloqueio NÃO DEVE ser persistido em disco: ao iniciar o app, todos os livros protegidos DEVEM estar bloqueados.
- **FR-009**: Os livros protegidos DEVEM voltar a ficar bloqueados quando o app vai para segundo plano ou é fechado, e por ação manual "Bloquear agora" disponível enquanto estiver desbloqueado.
- **FR-010**: Se um livro protegido estiver aberto no leitor quando o app voltar do segundo plano, o sistema DEVE ocultar o conteúdo e pedir o PIN. A reprodução de áudio TTS em andamento NÃO DEVE ser interrompida pelo re-bloqueio.
- **FR-011**: Após 5 PINs errados seguidos, o sistema DEVE bloquear novas tentativas por 30 s, dobrando a espera a cada nova rodada de 5 erros (com teto de 1 hora), mostrar a contagem regressiva e manter esse estado mesmo que o app seja fechado e reaberto. Um PIN correto DEVE zerar a contagem.
- **FR-012**: O PIN NÃO DEVE ser armazenado nem registrado em texto legível (nem em logs, nem em diagnósticos) e DEVE ser exibido mascarado enquanto digitado.
- **FR-013**: "Esqueci o PIN" DEVE exigir prova de que quem pede é o dono do aparelho: no Android, a credencial de bloqueio de tela do sistema; num aparelho sem bloqueio de tela, aviso de que não há como confirmar e confirmação explícita do usuário; na web, a confirmação da conta Google logada com senha. Se confirmada, o usuário DEVE poder definir um novo PIN, mantendo todos os livros protegidos. Se cancelada, errada, sem conexão (web) ou com outra conta, o PIN anterior DEVE continuar valendo.
- **FR-014**: Configurações DEVE oferecer "Alterar PIN" e "Desativar proteção". Ambos DEVEM pedir o PIN atual **sempre**, mesmo com os livros já desbloqueados; "Desativar proteção" também DEVE pedir confirmação, apagar o PIN e remover a proteção de todos os livros.
- **FR-015**: A Biblioteca DEVE oferecer um filtro fixo "Protegidos" listando só os livros protegidos, visível apenas quando existir ao menos um. Ele NÃO DEVE ser uma tag editável nem poder ser renomeado ou excluído pelo usuário.
- **FR-016**: Com o filtro "Protegidos" ativo e bloqueado, o sistema DEVE oferecer "Desbloquear", que pede o PIN uma única vez e libera todos os livros protegidos.
- **FR-017**: Na seleção múltipla da Biblioteca, livros protegidos e bloqueados NÃO DEVEM poder ser marcados (nem por long-press nem por toque); o sistema DEVE avisar "Desbloqueie para selecionar". Quando desbloqueados, DEVEM se comportar como os demais.
- **FR-018**: A proteção de um livro DEVE ser independente de suas tags e coleção: o livro DEVE continuar aparecendo nos filtros de tag e coleção a que pertence, com cadeado.
- **FR-019**: O PIN, a proteção dos livros e o contador de tentativas DEVEM ser locais ao dispositivo e NÃO DEVEM ser sincronizados com o Drive nem enviados a nenhum serviço externo.
- **FR-020**: O comportamento de livros não protegidos NÃO DEVE mudar (mesmo número de toques para abrir, nenhum cadeado, nenhum pedido de PIN).
- **FR-021**: Todos os textos novos DEVEM existir nos 3 idiomas da interface (pt-BR, en, es), com pluralização correta quando houver contagem.
- **FR-022**: O cadeado, o teclado numérico e as ações novas DEVEM ter rótulos acessíveis que informem o estado ("protegido, bloqueado" / "protegido, desbloqueado") e o campo de PIN DEVE ser operável por leitor de tela.

### Key Entities *(include if feature involves data)*

- **PIN do app**: credencial numérica única de 4 a 6 dígitos, guardada de forma que não possa ser lida de volta. Pertence ao usuário da conta atual, neste dispositivo.
- **Proteção do livro**: marcação (protegido / não protegido) em cada livro. Independente de tags, coleção, favorito e status.
- **Estado de desbloqueio**: indicador efêmero (bloqueado / desbloqueado) válido só durante o uso do app; nunca persistido.
- **Controle de tentativas**: número de erros seguidos e instante em que novas tentativas voltam a ser aceitas; persiste entre execuções do app.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário sem PIN consegue criar o PIN e proteger o primeiro livro em menos de 30 s.
- **SC-002**: Desbloquear e abrir um livro protegido leva menos de 10 s para um usuário que sabe o PIN, e o livro abre em menos de 1 s depois do último dígito correto.
- **SC-003**: Em 100% das entradas que levam a um livro protegido bloqueado (lista, grade, Home, busca, Detalhes, leitor, seleção múltipla), o conteúdo ou a ação sobre o livro só ocorre depois do PIN correto.
- **SC-004**: Depois de 5 PINs errados seguidos, 0 tentativas são aceitas durante a espera, mesmo depois de fechar e reabrir o app.
- **SC-005**: Um usuário que esqueceu o PIN volta a ter acesso aos seus livros protegidos em menos de 1 min, sem perder nenhum livro, progresso ou anotação.
- **SC-006**: Livros não protegidos abrem com o mesmo número de toques de antes (0 regressões no fluxo de abrir livro).

## Assumptions

- A proteção é uma barreira de **privacidade casual no app**: impede que outra pessoa abra, ouça ou altere o livro dentro do NeoReader. Ela NÃO criptografa o arquivo, que continua acessível por gerenciadores de arquivos do aparelho.
- O PIN vive junto com os dados locais da conta logada e segue a regra existente de isolamento por usuário; não há PIN global compartilhado entre contas.
- Livros protegidos continuam com título e capa visíveis por escolha do usuário (visibilidade "livros visíveis com cadeado"). O título e a capa também podem aparecer na notificação de mídia do TTS.
- "Sair do app" para fins de re-bloqueio inclui qualquer ida para segundo plano (trocar de app, bloquear a tela), sem período de tolerância.
- A espera por tentativas erradas usa o relógio do aparelho; adulterar o relógio para encurtá-la é um limite aceito desta versão.
- O teto de 1 hora na espera por tentativas erradas é uma decisão do planejamento (sdd-plan, 2026-10-12): sem teto, a espera cresceria sem limite prático depois de poucas rodadas.
- "Nada além de capa, título e cadeado" (FR-006) vale para o que o cartão/linha do livro mostra: autor, progresso, status, tags, favorito, formato e aviso de arquivo ausente ficam ocultos enquanto bloqueado. A pertinência do livro a filtros de tag, coleção e "Protegidos" (FR-018) não é escondida, por escolha do usuário de manter os livros visíveis.
- O filtro "Protegidos" é um filtro fixo da Biblioteca (como "Favoritos"), não uma tag do usuário. Se fosse uma tag comum, o usuário poderia tirá-la sem o PIN e a proteção cairia.
- Como esquecer o PIN sem recuperação trancaria o usuário fora dos livros, a P2 (recuperação e gerenciamento do PIN) DEVE ser publicada junto com a P1, mesmo tendo prioridade menor na ordem de implementação.
- A recuperação usa a credencial de bloqueio de tela do Android porque confirmar a conta Google no aparelho é só um toque no seletor de contas e deixaria qualquer pessoa com o celular desbloqueado redefinir o PIN (decisão do usuário após o `sdd-plan`, 2026-10-12). Isso protege contra quem pegou o celular **desbloqueado e não conhece a senha de tela**; quem conhece a senha de tela do aparelho redefine o PIN, e a spec aceita esse limite.
- O mecanismo de credencial de aparelho é API da plataforma Android: não adiciona dependência. O Android pode oferecer biometria dentro da tela do sistema; isso não é uma funcionalidade do app e não muda o escopo ("biometria" continua fora).
- A feature 023 (seleção múltipla) ainda está em execução; a regra FR-017 deve ser aplicada sobre o estado dela no momento da implementação.
- A feature exige mudança de schema de dados (marcação de proteção por livro e controle de tentativas), que será definida no `sdd-plan`.

## Clarifications

### Sessão 2026-10-12

- Q: PIN único do app ou PIN por livro? → A: PIN único do app.
- Q: Antes do PIN, o que o usuário vê dos livros protegidos? → A: Livros visíveis com cadeado (capa e título), sem esconder; o grupo "Protegidos" funciona como filtro.
- Q: Quando os livros voltam a ficar bloqueados após o desbloqueio? → A: Ao sair do app (segundo plano ou fechado), com "Bloquear agora" manual; áudio TTS em andamento não é interrompido.
- Q: O que fazer se o usuário esquecer o PIN? → A: Recuperar confirmando a conta Google; define novo PIN e os livros continuam protegidos. **(Substituída pela revisão abaixo.)**
- Q: O que o usuário pode fazer num livro protegido sem digitar o PIN? → A: Só ver capa e título; abrir, ouvir, Detalhes, tags/coleção, favorito/status, remover proteção e excluir exigem PIN.
- Q: Onde o usuário pode proteger/desproteger um livro nesta versão? → A: Folha de ações rápidas do livro e tela de Detalhes (sem ação em lote).
- Q: Formato do PIN e tentativas erradas? → A: 4 a 6 dígitos numéricos; após 5 erros seguidos, espera de 30 s dobrando a cada nova rodada.
- Q: Biometria entra nesta versão? → A: Não, fica fora (ideia futura).
- Q: Livros protegidos na seleção múltipla (feature 023) com o grupo bloqueado? → A: Não podem ser marcados; aviso "Desbloqueie para selecionar".

### Revisão após o sdd-plan (2026-10-12)

- Q: Com o TTS tocando e a tela do aparelho apagando, como o re-bloqueio se comporta? → A: O áudio segue (confirmado no código: o leitor não pausa o TTS em segundo plano) e o PIN é pedido ao voltar ao app, sem tolerância.
- Q: Os controles do TTS na notificação/tela de bloqueio funcionam com o livro re-bloqueado? → A: Sim, todos (play, pausar, próximo, anterior). Limite aceito: quem está com o aparelho pode retomar ou pular o áudio, mas não vê o texto nem abre o livro.
- Q: No Android, confirmar a conta Google é só um toque; como o "Esqueci o PIN" deve funcionar? → A: Credencial de bloqueio de tela do aparelho. Aparelho sem bloqueio de tela: aviso e confirmação explícita. Web: conta Google com senha.
