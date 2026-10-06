# LLM Lab — visualização de dados internos reais

Projeto independente do chatbot agrícola. Tem FastAPI próprio, ambiente Python próprio e repositório Git local próprio. Não importa nenhum código do projeto anterior e não depende do Ollama.

## Começar no Windows / Git Bash

Pré-requisito: Python **3.11 ou 3.12**, Git e driver NVIDIA funcionando. Use uma pasta nova, fora da pasta do chatbot. Extraia o ZIP e abra um terminal na pasta `llm-lab`.

```bash
py -3.12 setup_project.py
./.venv/Scripts/python.exe run.py
```

Se tiver Python 3.11, substitua `-3.12` por `-3.11`. No PowerShell, execute `.\.venv\Scripts\python.exe run.py`. Não é necessário ativar a venv; os comandos chamam seu Python diretamente.

Abra **http://127.0.0.1:8010**. Comece com a pergunta padrão, 32 tokens, Think desligado e atenção ligada. A primeira geração baixa o modelo do Hugging Face. O download exige internet; depois os arquivos ficam no cache local. O instalador também baixa dependências, incluindo PyTorch, e pode consumir vários GB em disco. Os pesos não vêm no ZIP.

O instalador cria `.venv`, instala PyTorch 2.7.1 com CUDA 12.8 e as dependências fixadas, copia `.env.example` para `.env` apenas se ainda não existir e executa `doctor.py`. A venv que usei para validar em Linux não é transportável para Windows, por isso não é incluída no ZIP: ela será criada no teu computador.

Para diagnóstico:

```bash
./.venv/Scripts/python.exe doctor.py
```

O campo CUDA mostrado pelo `nvidia-smi` é a capacidade do driver; não precisa coincidir com a versão CUDA empacotada no PyTorch. Se `GPU acessível` for falso, o modo `auto` usa CPU e ficará mais lento. Para instalar deliberadamente em CPU: `py -3.12 setup_project.py --cpu`.

## Modelo inicial e memória

O modelo padrão é **Qwen/Qwen3-0.6B**, um modelo treinado de 0,6 bilhão de parâmetros com Think. Ele tem 28 blocos decoder. Capturamos os blocos **0, 5, 11, 16, 22 e 27**, a partir da configuração real carregada.

A escolha é para iniciar a instrumentação em 16 GB de RAM e 6 GB de VRAM com margem maior. Seus pesos em 16 bits são da ordem de 1,2 GB; isso não é uma estimativa do pico total, que também inclui cache, atenção e buffers. A validação na GPU e as medições estão em [GPU_VALIDATION.md](GPU_VALIDATION.md).

**O Gemma E4B não foi conectado a este adaptador.** O arquivo Q4_K_M usado pelo Ollama não é carregado por este projeto. Adaptar Gemma será uma etapa separada: seu empacotamento, estrutura de camadas e custo de memória exigem validação. Não substitua o identificador por `gemma4:e4b` esperando compatibilidade automática.

No `.env`, `LLMLAB_MODEL_ID` pode apontar para outro checkpoint Qwen3 denso, sujeito à memória disponível. `LLMLAB_DEVICE` aceita `auto`, `cuda` e `cpu`. O código rejeita outras arquiteturas explicitamente. Não usa `trust_remote_code=True` nem quantização neste primeiro modelo pequeno. Evite manter o Gemma carregado no Ollama ao testar, para liberar VRAM.

## O que aparece na tela

1. **Ativações:** um hook lê o vetor de saída de cada bloco selecionado, na última posição processada. Cada ponto representa o RMS de um grupo contíguo de canais. Com hidden size 1024, são 16 grupos de 64 canais. A quantidade de canais vem da configuração real.
2. **Atenção:** as 12 maiores contribuições da última consulta em uma camada/cabeça escolhida antes da geração. A distribuição inclui tokens de sistema e marcadores do chat. As porcentagens vêm da matriz real; o restante aparece separadamente.
3. **Próximo token:** cinco maiores probabilidades do softmax dos logits brutos, antes da temperatura. O token escolhido pode não ser o primeiro por causa da amostragem.
4. **Passos:** clique num token ou mova a barra para inspecionar a captura correspondente. Desative acompanhamento ao vivo para ficar num passo enquanto a geração continua. A resposta mostrada acompanha o passo selecionado.
5. **Inspecionar e comparar:** clique num ponto ou selecione camada/grupo para consultar a faixa exata de canais e o RMS. Escolha uma referência A para comparar com o passo B da barra: RMS por grupo, atenção por posição e probabilidades armazenadas. Valores ausentes não são tratados como zero.
6. **Exportar:** baixa `captura-llm.json`, no formato `llm-lab-v2`, contendo metadados, faixas de canais, prompt tokenizado, atenção completa da cabeça selecionada e medidas de cada passo. Não importa arquivos para replay nesta versão.

A primeira passagem processa o prompt inteiro. As seguintes usam cache KV e processam um token. A captura na posição N foi usada para **prever o token N+1**; não é a ativação do novo token ainda não processado. A interface mostra ambas as posições.

A última camada é medida na saída do bloco decoder, antes da normalização final externa ao bloco. Cada execução usa uma semente local fixa, 42, e temperatura configurável. Temperatura zero escolhe o maior logit. Não aplicamos top-k/top-p; resultados podem diferir dos aplicativos de chat.

## Medições e limites

- RMS = raiz da média dos quadrados: mede magnitude, não importância ou significado.
- O posicionamento dos pontos em 3D e a rotação são ilustrativos. Seus tamanhos e cores são controlados pelos RMS medidos. Não desenhamos conexões como se fossem pesos medidos.
- A escala usa a maior medida de grupo recebida em toda a captura. Ela pode aumentar durante a geração, inclusive ao inspecionar passos anteriores.
- Atenção é uma parte do cálculo, não uma explicação causal completa.
- Probabilidade de token não mede veracidade.
- Think produz tokens pelo mesmo mecanismo e usa o mesmo limite de geração. Pode acabar o orçamento antes de uma resposta final. O texto decodificado pode incluir marcadores de thinking.
- Limites iniciais: 256 tokens de entrada, incluindo sistema/formatação; 32 de saída por padrão, até 128. Não truncamos silenciosamente a pergunta; entradas maiores retornam erro.
- A implementação `eager` materializa atenção. Temporariamente são calculadas as matrizes de todas as camadas; só uma cabeça/camada é enviada à tela. Desligar a captura evita reter e retornar essas matrizes, mas mantém o cálculo eager; não equivale a usar SDPA.
- Hooks, cópias para CPU e transmissão aumentam a latência. Os tempos não representam a velocidade de inferência sem instrumentação.
- `generation_ms` soma os passos sincronizados, sem carga e espera do streaming. `instrumented_ms` mede o laço inteiro, incluindo esperas. Também exportamos pico de memória reservada pelo PyTorch.
- Pico de VRAM é `max_memory_allocated` do PyTorch, referente aos tensores; não representa toda a memória reservada ou de outros processos.
- Só uma captura pode usar o modelo por vez. Interromper solicita cancelamento; carregamento/forward em andamento termina antes de liberar o modelo.
- A API é servida apenas em `127.0.0.1`. Não há contas, serviço externo de inferência ou publicação.

## Organização

| Arquivo | Função |
|---|---|
| `app/engine.py` | Carregamento, hooks, geração e extração de atenção/probabilidades |
| `app/main.py` | FastAPI, streaming e controle de concorrência |
| `app/static/` | Interface e visualização 3D |
| `setup_project.py` | Criação da venv e instalação no Windows |
| `doctor.py` | Diagnóstico de Python/PyTorch/GPU |
| `run.py` | Servidor na porta 8010 |
| `tests/` | Verificação numérica e da API |

## Git

O pacote inclui um repositório **local**, branch `main`, com um commit inicial e sem remoto. Ao extrair, confira:

```bash
git status
git log --oneline -1
```

A venv, `.env`, caches e gravações estão excluídos do Git. Não foi criado nem publicado um repositório no GitHub. Para conectar depois, crie um repositório vazio na tua conta e use o endereço real dele em `git remote add origin ...`, seguido de `git push -u origin main`.

## Testes

```bash
./.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
./.venv/Scripts/python.exe -m pytest -q
```

Os testes numéricos usam um Qwen3 minúsculo com pesos aleatórios, sem baixar pesos treinados. Verificam RMS contra os tensores da mesma passagem, atenção e posições com cache KV, escolha greedy, Think, limpeza de hooks em cancelamento, validação HTTP e liberação do lock. Isso valida a instrumentação, não a qualidade das respostas do modelo treinado. Não há dados sintéticos no caminho de execução normal.

A captura real com Qwen3-0.6B foi validada na GPU. Consulte [GPU_VALIDATION.md](GPU_VALIDATION.md) para protocolo, resultados e limites; reproduza com `.venv/Scripts/python.exe validate_gpu.py`.

## Referências

- https://huggingface.co/Qwen/Qwen3-0.6B
- https://huggingface.co/docs/transformers/v4.57.1/model_doc/qwen3
- https://pytorch.org/get-started/previous-versions/

A interface foi verificada no Chrome em desktop (1280 px) e celular (390 px), usando a captura real salva pelo diagnóstico GPU: seleção de pontos/canais, passos, comparação A/B, exportação v2 e reinício de captura. Reproduza com `.venv/Scripts/python.exe check_ui.py` (dependência opcional `playwright` e Chrome instalado). O teste de interface reproduz dados salvos; não executa uma nova inferência.
