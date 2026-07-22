# Configurações

Tela onde o tenant **consulta** (sem poder editar) o estado das chaves de API
dos provedores de IA usadas pela sua conta. Cada tenant continua com sua
própria chave por trás dos panos (modelo BYOK — bring your own key, uma conta
por cliente em cada provedor), mas conectar ou trocar essa chave é uma ação
que só a equipe interna faz, pelo painel administrativo — não pela tela de
Configurações do tenant.

Há um cartão para cada um dos 3 provedores:

1. **Provedor de avatar / vídeo** — ex.: HeyGen ou D-ID. Gera o vídeo final do
   avatar (usado no passo 5 de Criar vídeo e no treino do avatar).
2. **Provedor de clonagem de voz** — ex.: ElevenLabs. Clona a voz do avatar a
   partir da gravação de referência (usado em Configurar avatar).
3. **Provedor de IA para geração de roteiro** — ex.: Anthropic. Gera um
   rascunho de roteiro a partir de um prompt (usado no passo 2 de Criar
   vídeo). **É essa mesma chave que alimenta o copiloto de IA do app** — não é
   preciso configurar nada separado para o copiloto funcionar.

## O que a tela mostra

Cada cartão exibe, somente para leitura: o provedor/vendor selecionado, os
últimos dígitos da chave salva (se houver) e o indicador **conectado**/
**desconectado** no canto superior direito. Não há mais um botão de salvar
nem de testar conexão nessa tela — se o tenant pedir para trocar a chave ou o
provedor, a orientação é acionar o suporte, não procurar um campo editável
aqui.

## Por que isso importa para o resto do app

- Sem a chave de **roteiro** conectada: a geração de roteiro por IA (passo 2
  de Criar vídeo) e o **copiloto** não funcionam — o copiloto mostra uma
  mensagem pedindo para conectar a chave (pelo suporte) antes de conversar.
- Sem a chave de **avatar/vídeo**: a geração do vídeo final não usa um
  provedor real.
- Sem a chave de **voz**: a clonagem de voz não usa um provedor real.
