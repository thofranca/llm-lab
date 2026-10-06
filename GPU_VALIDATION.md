# Validação local — 6 de outubro de 2026

Qwen/Qwen3-0.6B real, NVIDIA GeForce RTX 3050 Laptop GPU (6 GiB),
CUDA, BF16, PyTorch 2.7.1+cu128 e Transformers 4.57.1.

## Integridade das capturas

`validate_gpu.py` passou em oito passos, usando hooks independentes sobre os
tensores da mesma passagem do modelo. Verificou todos os 96 grupos das camadas
0, 5, 11, 16, 22 e 27 em cada passo, seus RMS e faixas de canais; top 5 e
probabilidade do token greedy contra o softmax dos logits; distribuição completa
da cabeça 3 na camada 27, tokens e pesos do top 12, massa restante e soma da atenção.
A soma admite arredondamento de BF16 (tolerância absoluta 0,01).

O prompt contém 49 tokens: passo interno 0 (passo 1 na tela) processa posições
0–48, mede a posição 48 e escolhe o token na posição 49. O passo seguinte processa
apenas a posição 49 com cache KV, mede essa posição e escolhe a posição 50.
Essa associação foi conferida em todos os oito passos contra os IDs efetivamente
fornecidos ao forward e o comprimento da máscara. A captura não representa a
ativação do token recém-escolhido. A validação usa a mesma passagem; não é uma
comparação com outra implementação de inferência.

## Custo da captura de atenção

Prompt: “Explique overfitting em uma frase.” Think desligado, temperatura 0,
semente 42, 32 tokens de saída. Pesos já carregados; aquecimento de quatro tokens
por modo. Três repetições por modo, na ordem desligada/ligada/ligada/desligada/
desligada/ligada. Cache do alocador esvaziado antes de cada repetição.
Os IDs gerados foram idênticos nas seis execuções. Atenção do benchmark: camada 0,
cabeça 0. Hooks de validação removidos antes do benchmark; captura de ativações
permanece ligada. Backend **eager em ambos os modos**.

| Medida (mediana) | Atenção desligada | Atenção ligada |
|---|---:|---:|
| Soma dos passos instrumentados | 1.261,340 ms | 1.300,326 ms |
| Prefill | 39,742 ms | 44,915 ms |
| Decode (31 passos) | 1.222,259 ms | 1.255,409 ms |
| Pico de tensores CUDA alocados | 1.166,2 MiB | 1.168,2 MiB |
| Pico de memória reservada pelo PyTorch | 1.188,0 MiB | 1.188,0 MiB |

Diferença das medianas: +38,986 ms (aproximadamente 3,1%) e +2,0 MiB alocados.
Tempos variaram de 1.202,092 a 1.291,104 ms sem atenção e de 1.224,556 a
1.367,854 ms com atenção; há sobreposição. Esta amostra pequena não demonstra
um custo fixo de 3,1%. Não extrapolar para contextos longos ou outros backends.

Tempo medido com sincronização CUDA por passo, incluindo forward, hooks, cópias,
extração e decodificação; exclui carga, transporte HTTP e espera do consumidor.
Não representa inferência sem instrumentação. `instrumented_ms` continua sendo
o tempo de parede do laço e pode incluir espera do streaming; `generation_ms`
é a soma dos passos. VRAM alocada/reservada é do alocador PyTorch, não toda a
memória da placa, driver ou outros processos. O modo eager calcula atenção
mesmo com captura desligada; desligar evita reter/retornar suas matrizes.

## Reprodução e interface

Execute `.venv/Scripts/python.exe validate_gpu.py` com pesos no cache e GPU livre.
O resultado detalhado, incluindo captura real e cada repetição, fica em
`recordings/gpu-validation.json` (ignorado pelo Git).

O inspetor permite clicar num ponto ou selecionar camada/grupo por teclado,
consultar canais inclusivos e RMS sem arredondamento de exibição. A comparação
usa referência A fixa e passo B selecionado, mostrando RMS A/B/Δ para todos os
grupos. Atenção compara todas as posições; posições ainda fora do contexto são
identificadas. Probabilidades comparam a união dos top 5 e tokens escolhidos;
valores não armazenados ficam explícitos, nunca são substituídos por zero.
Posição 3D e rotação são esquemáticas; cor e raio representam o RMS medido.

Maior erro absoluto dos RMS de grupo contra o cálculo de referência em CPU:
0,000003814697265625 (diferença de redução numérica CPU/GPU dentro da tolerância).
Probabilidades e pesos de atenção coincidiram exatamente com as cópias de
referência da mesma passagem.

Verificações adicionais concluídas: 7 testes pytest; sintaxe JavaScript;
Chrome headless em 1280×900 e 390×844, com captura GPU salva. O teste de navegador
confere os 96 grupos, deltas nulos ao comparar um passo consigo mesmo, seleção
por clique, canais 960–1023 do grupo 15, persistência da seleção entre passos,
contexto ausente na atenção, exportação v2, reinício e ausência de overflow
horizontal da página/erros JavaScript. Imagens em `recordings/ui-desktop.png`
e `recordings/ui-mobile.png`. O navegador reproduz a captura salva; não mede
desempenho de geração nem faz uma nova inferência.
