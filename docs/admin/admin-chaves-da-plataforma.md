# Painel admin — Chaves da plataforma

Fica na aba **APIs**, acima das integrações por tenant. É a tela das chaves que
a eckko.ai paga: as que atendem o copiloto do cliente, o copiloto público, o
copiloto interno, os embeddings, e as contas de vídeo e voz da plataforma.

Só o time interno enxerga esta tela. Não existe equivalente para o cliente.

## O que cada linha mostra

- **Nome e para que serve** — qual caminho do produto consome aquela chave.
  Algumas ainda não têm consumidor no código: ficam guardadas e validáveis, e
  a linha diz isso.
- **Estado** — configurada ou ausente.
- **Origem** — gravada por este painel, ou vinda do ambiente do servidor.
- **Últimos 4 caracteres** — só para chave gravada pelo painel, e são os 4
  últimos da chave de verdade. Servem para responder "é a nova ou a antiga que
  está aí?" sem precisar ver o valor.
- **Quem gravou e quando**.
- **Resultado da última validação, com data.**

## Gravar

O campo é de escrita apenas. **Nenhuma rota devolve o valor guardado — nem
para você.** Dá para substituir, nunca para ler de volta. Se a chave se
perdeu, o caminho é gerar outra no fornecedor e gravar a nova.

Gravar passa a valer na requisição seguinte, sem reiniciar o servidor. E apaga
o resultado da validação anterior de propósito: manter um "validada em tal
data" ao lado de uma chave que ninguém testou parece confirmação, e é pior que
não ter carimbo nenhum.

Toda gravação fica registrada com quem fez e quando — sem o valor.

## Validar

O botão faz **uma** chamada, sempre de leitura. Nunca gera vídeo, áudio nem
texto. Só roda quando você clica: abrir a tela não fala com fornecedor nenhum.

Para o HeyGen, a validação também traz a **cota restante**, que aparece na
tela. A unidade não é declarada pelo fornecedor; o que se sabe por medição é
que um vídeo de pouco mais de 30 segundos consumiu cerca de metade de uma cota
de 189 unidades. Trate como ordem de grandeza, não como número exato.

Para as demais, a validação diz apenas se o fornecedor aceitou a chave. Quando
não há como ler saldo, a linha explica o motivo em vez de esconder o botão.

## Se uma chave ruim travar o acesso

Existe uma variável de ambiente que inverte a precedência e faz o ambiente do
servidor voltar a vencer o painel. Serve exatamente para o caso de uma chave
errada gravada pela tela deixar o sistema sem resposta. Enquanto ela estiver
ativa, a tela avisa em vermelho — porque, nesse estado, gravar pela tela não
tem efeito, e descobrir isso por tentativa e erro custaria caro.

O nome da variável está no `.env.example` do projeto, junto das demais.

## O que esta tela não faz

Não muda quem paga a geração de vídeo e de voz. Hoje esse caminho continua
usando a credencial gravada para cada cliente; as chaves de vídeo e voz da
plataforma ficam aqui apenas guardadas e validáveis. Trocar isso muda a conta
de quem, e é decisão de negócio, não de tela.
