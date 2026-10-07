'use strict';

// Explanations describe the instrumented Qwen3 adapter, not inferred meanings
// of individual channels. Numerical examples below are explicitly educational.
const glossary = [
 ['Modelo e texto','LLM / modelo de linguagem','modelo qwen parâmetros',
  'Rede neural treinada para calcular possíveis continuações de uma sequência de tokens. Aqui usamos o Qwen3-0.6B; “0.6B” indica aproximadamente 0,6 bilhão de parâmetros.',
  'Na tela: a resposta é construída por escolhas sucessivas de tokens. O modelo não consulta automaticamente a internet.'],
 ['Modelo e texto','Parâmetro / peso aprendido','pesos treinamento',
  'Número ajustado durante o treinamento e usado nos cálculos do modelo. Os parâmetros permanecem fixos durante esta geração.',
  'Não confunda pesos aprendidos com pesos de atenção: os de atenção são calculados a cada entrada. Os pontos 3D não mostram parâmetros.'],
 ['Modelo e texto','Inferência / geração autorregressiva','forward resposta execução',
  'Inferência é executar o modelo já treinado. A geração é autorregressiva porque cada token escolhido passa a fazer parte do contexto usado para escolher o seguinte.',
  'Isso não é um novo treinamento: as ativações mudam, mas os parâmetros não são atualizados.'],
 ['Modelo e texto','Token / tokenização','tokenizer palavra id vocabulário',
  'Token é uma unidade de texto do vocabulário do modelo: pode ser uma palavra, parte dela, pontuação ou um marcador especial. O tokenizer converte texto em IDs de tokens e decodifica IDs de volta em texto.',
  'Exemplo didático: uma palavra pode aparecer dividida em vários botões na faixa inferior. Essa divisão depende do tokenizer, não de sílabas.'],
 ['Modelo e texto','ID / vocabulário','identificador token',
  'O ID é o número que identifica um token no vocabulário, o conjunto de tokens que o modelo pode usar. O mesmo token pode aparecer várias vezes com o mesmo ID.',
  'ID não é posição: um token de ID 123 pode estar nas posições 4, 10 e 20 do contexto.'],
 ['Modelo e texto','Token bruto / marcador especial','Ġ Ċ espaço eos sistema chat',
  'A forma interna de um token pode conter símbolos que não aparecem no texto final. Nesta interface, Ġ é exibido como espaço e Ċ como ↵ nos botões. O token bruto pode ser consultado passando o mouse sobre eles.',
  'Marcadores de chat delimitam papéis e mensagens; EOS indica fim da geração. Alguns marcadores são removidos na decodificação do texto, mas continuam existindo nas posições e na atenção.'],
 ['Modelo e texto','Prompt / contexto','entrada sistema pergunta janela',
  'Prompt é a entrada inicial completa: instruções de sistema, sua pergunta e formatação do chat. Contexto é a sequência disponível naquele passo, incluindo os tokens já gerados.',
  'Por isso, a primeira posição gerada não costuma ser 0. O limite de 256 tokens de entrada inclui a formatação, não apenas sua pergunta.'],
 ['Modelo e texto','Think / raciocínio','thinking resposta fase orçamento',
  'Opção do modelo para gerar tokens de raciocínio antes da resposta. Eles são produzidos pelo mesmo mecanismo e consomem o mesmo orçamento de saída.',
  'Com um limite curto, a geração pode terminar antes da resposta final. O texto de raciocínio não é uma leitura completa nem uma garantia de fidelidade dos cálculos internos.'],
 ['Passos e posições','Passo / posição','índice index base zero',
  'Passo é uma escolha de próximo token. Posição é o lugar de um token na sequência completa. Na tela, passos começam em 1; posições, camadas, cabeças e grupos começam em 0.',
  'Exemplo didático: com 49 tokens no prompt (posições 0–48), o passo 1 escolhe o token da posição 49. No JSON exportado, o campo step começa em 0.'],
 ['Passos e posições','Posição processada → token escolhido','captura predição próximo',
  'A captura pertence à última posição processada, cujo cálculo foi usado para escolher o token seguinte. O token recém-escolhido ainda não passou pelas camadas naquele passo.',
  'Exemplo didático: posição processada 48 → token escolhido na posição 49. Ao clicar no token 49, você vê o cálculo que o escolheu, não a ativação dele após ser processado.'],
 ['Passos e posições','Forward / prefill / decode','passagem primeira cache',
  'Forward é uma passagem pelo modelo. O prefill é a primeira passagem, que processa o prompt inteiro. No decode deste aplicativo, cada passagem seguinte processa um novo token usando o cache.',
  'Os pontos mostram apenas a última posição processada de cada passagem, inclusive no prefill. “Decode” também pode designar a conversão dos IDs em texto; aqui o tempo de decode se refere aos passos após o prefill.'],
 ['Passos e posições','Cache KV','key value memória reutilização',
  'Memória que guarda as chaves (K) e os valores (V) de posições anteriores para reutilizá-los na atenção. Evita recalcular o prompt inteiro em cada passo.',
  'O contexto continua crescendo mesmo quando apenas um token entra no novo forward. O cache consome memória da GPU.'],
 ['Passos e posições','Ao vivo / passo selecionado','replay histórico resposta completa',
  'Ao vivo acompanha automaticamente o último passo recebido. Clicar em um token ou usar as setas seleciona um passo histórico e desliga esse acompanhamento.',
  'Gráfico, probabilidades e atenção seguem o passo selecionado. A resposta completa permanece visível e pode continuar crescendo enquanto você examina o passado.'],
 ['Ativações e gráfico','Camada / bloco decoder','layer L transformer',
  'Etapa de transformação dos vetores do modelo, usando atenção e outras operações. Os blocos são aplicados em sequência. O Qwen3-0.6B tem 28 blocos; capturamos as saídas de 0, 5, 11, 16, 22 e 27.',
  'L27 significa camada de índice 27, a 28ª. Nem todas as camadas aparecem no gráfico. A última saída capturada fica antes da normalização final externa ao bloco.'],
 ['Ativações e gráfico','Ativação / vetor / tensor','hidden estado oculto números',
  'Ativação é um valor intermediário produzido durante a execução. Um vetor é uma lista de números; um tensor organiza números em uma ou mais dimensões, como lote, posição e canal.',
  'Aqui capturamos o vetor de saída de cada bloco selecionado para a última posição processada. Não são os pesos fixos do modelo.'],
 ['Ativações e gráfico','Canal / dimensão oculta','hidden size 1024 coordenada',
  'Canal é uma coordenada do vetor de ativação. A dimensão oculta (hidden size) é o número dessas coordenadas: 1.024 neste Qwen3-0.6B.',
  'Um canal não recebe automaticamente um significado como “gramática” ou “overfitting”. Esta captura não identifica conceitos individuais nos canais.'],
 ['Ativações e gráfico','Grupo de canais / ponto','bin G faixa 64',
  'Agrupamento contíguo feito por este visualizador para resumir o vetor. Dividimos 1.024 canais em 16 grupos de 64. Cada ponto representa um grupo em uma camada.',
  'Exemplo: G0 = canais 0–63; G15 = 960–1023. Grupo não é cabeça de atenção nem uma divisão semântica descoberta no modelo.'],
 ['Ativações e gráfico','RMS / magnitude','raiz média quadrática root mean square valor',
  'RMS é a raiz da média dos quadrados: RMS(x) = √((x₁² + … + xₙ²) / n). Resume a magnitude dos valores, sem que sinais positivos e negativos se anulem.',
  'Exemplo didático, não medição: para [3, −4], RMS = √((9 + 16)/2) ≈ 3,536. Um RMS alto não significa maior importância, confiança ou melhor compreensão. Vetores diferentes podem ter o mesmo RMS.'],
 ['Ativações e gráfico','RMS do grupo × RMS da camada','agregação média grupos',
  'O RMS do grupo usa apenas seus canais. O RMS da camada usa todos os canais do vetor na posição capturada. Ambos são medidos na mesma saída do bloco.',
  'O RMS da camada não é, em geral, a média simples dos RMS dos grupos. Ao comparar, mantenha a mesma camada e o mesmo grupo.'],
 ['Ativações e gráfico','Escala / cor / tamanho / 3D','rotação esquema representação raio',
  'Cor e raio dos pontos são calculados a partir do RMS, usando como escala o maior RMS de grupo recebido na captura. Essa escala é compartilhada entre passos e pode crescer ao vivo.',
  'Posições 3D, anéis e rotação são ilustrativos. Distância entre pontos não é distância semântica; não há conexões ou pesos medidos desenhados. Um ponto pode mudar de tamanho quando a escala muda, sem mudar seu RMS.'],
 ['Atenção','Atenção / peso de atenção','attention distribuição contribuição',
  'Mecanismo que combina informações de posições do contexto usando pesos calculados naquele passo. Cada peso multiplica um vetor de valor (V); não é uma medida isolada da influência final no texto.',
  'Um peso de 20% significa ponderação 0,20 naquela distribuição. Não significa “20% da causa da resposta”. A atenção é apenas parte do cálculo.'],
 ['Atenção','Cabeça de atenção','head múltiplas paralelas',
  'Uma das operações de atenção realizadas em paralelo dentro de uma camada, com projeções próprias. Diferentes cabeças podem produzir distribuições diferentes sobre o mesmo contexto.',
  'A tela mostra uma cabeça de uma camada escolhidas antes da geração. “Cabeça 0” não é “grupo 0”: cabeças fazem parte do modelo; grupos de canais são resumos do visualizador. Não atribuímos funções semânticas fixas às cabeças.'],
 ['Atenção','Consulta (Q), chave (K) e valor (V)','query key value',
  'São vetores calculados a partir das representações do modelo. A consulta da posição atual é comparada com as chaves disponíveis para obter pesos; esses pesos combinam os vetores de valor.',
  'Analogia didática: Q descreve o que procurar, K como encontrar e V o conteúdo a combinar. São operações numéricas, não perguntas conscientes.'],
 ['Atenção','Consulta / posições do contexto / máscara causal','query posição keys futuro',
  'A consulta exibida é a da última posição processada. As chaves correspondem às posições acessíveis do contexto. A máscara causal impede uma posição de consultar tokens futuros.',
  'No passo que escolhe a posição 49, a atenção pode acessar até a posição 48, inclusive ela mesma. A posição 49 ainda não está nessa distribuição.'],
 ['Atenção','Top 12 / massa restante','soma atenção outras posições',
  'O painel mostra os 12 maiores pesos da cabeça selecionada. Massa restante é a soma dos pesos de todas as outras posições, não um conjunto de valores desconhecidos.',
  'A soma completa fica próxima de 100%, com possíveis arredondamentos numéricos. A comparação e a exportação guardam a distribuição completa dessa cabeça, não de todas as cabeças.'],
 ['Probabilidades','Logit / softmax','pontuação distribuição normalização',
  'Logits são pontuações para cada token do vocabulário; não são porcentagens. O softmax converte essas pontuações em probabilidades positivas cuja soma é aproximadamente 1.',
  'Fórmula: pᵢ = exp(zᵢ) / Σⱼ exp(zⱼ). A probabilidade é de continuação segundo o modelo, não de a afirmação ser verdadeira.'],
 ['Probabilidades','Probabilidade bruta / top 5','alternativas próximo token',
  'A interface mostra o softmax dos logits antes de aplicar temperatura: as cinco maiores probabilidades e a probabilidade do token escolhido.',
  'As cinco alternativas podem somar menos de 100%, pois existem outros tokens no vocabulário. Exibir top 5 não significa restringir a geração a esses cinco.'],
 ['Probabilidades','Temperatura / amostragem / greedy','aleatoriedade escolha argmax',
  'Com temperatura maior que 0, o aplicativo aplica softmax(logits / temperatura) e sorteia um token dessa distribuição. Temperaturas menores concentram mais a distribuição; maiores a tornam mais espalhada. Com 0, escolhe o maior logit (greedy).',
  'O escolhido pode não ser o primeiro do top 5. Os números na tela continuam sendo as probabilidades brutas. Não usamos filtros top-k ou top-p na geração deste aplicativo.'],
 ['Probabilidades','Semente / reprodutibilidade','seed 42 determinismo',
  'A semente inicializa o gerador de números pseudoaleatórios usado na amostragem. O padrão deste aplicativo é 42.',
  'Ela ajuda a repetir resultados nas mesmas condições, mas não garante saídas idênticas entre hardwares, versões ou métodos de cálculo diferentes.'],
 ['Comparação e limites','Referência A / passo B / delta (Δ)','diferença comparação',
  'A é o passo fixado como referência; B é o passo selecionado nos tokens. Cada delta é calculado como valor de B menos valor de A, para o mesmo grupo ou posição.',
  'Exemplo didático: RMS A = 2 e RMS B = 3 dão Δ = +1. Isso indica aumento de magnitude, não melhoria ou descoberta de um conceito.'],
 ['Comparação e limites','Porcentagem / ponto percentual (p.p.)','percentual diferença probabilidade',
  'Porcentagem expressa uma fração de 100. Ponto percentual mede a diferença direta entre duas porcentagens.',
  'Exemplo didático: de 20% para 30%, o aumento é 10 pontos percentuais, ou 50% em termos relativos. A comparação de atenção e probabilidades usa pontos percentuais.'],
 ['Comparação e limites','Fora do contexto / não armazenada','ausente zero faltante',
  '“Fora do contexto” significa que a posição ainda não existia naquele passo de atenção. “Não armazenada” significa que a probabilidade não estava no top 5 nem era a do token escolhido naquele passo.',
  'Nenhum desses casos significa zero. Sem os dois valores, a interface não calcula um delta numérico.'],
 ['Comparação e limites','Limite de tokens / EOS / resposta parcial','fim parada interrupção length',
  'A execução termina ao atingir o orçamento de tokens, produzir um token de fim (EOS) ou ser interrompida. EOS é uma escolha do modelo; o limite é uma configuração do aplicativo.',
  '“Limite de tokens” pode indicar uma frase cortada. “Resposta completa” na interface significa todo o texto recebido, não garantia de que o modelo concluiu seu raciocínio ou a resposta.'],
 ['Desempenho e captura','GPU / CUDA / CPU','dispositivo processamento',
  'GPU executa muitas operações numéricas em paralelo; CUDA é a plataforma usada pelo PyTorch para operar na GPU NVIDIA. CPU é o processador principal do computador.',
  'O cabeçalho informa onde o modelo está rodando. A interface do navegador desenha os dados recebidos; não é ela que executa o Qwen.'],
 ['Desempenho e captura','VRAM / MiB / memória alocada e reservada','pico memória gpu',
  'VRAM é a memória da GPU. MiB significa 1.048.576 bytes. Memória alocada é ocupada por tensores; reservada inclui espaço mantido pelo alocador PyTorch para reutilização. Pico é o maior valor registrado na execução.',
  'A medição inclui os pesos carregados e os tensores do cálculo. Não representa toda a memória do driver, da placa ou de outros processos.'],
 ['Desempenho e captura','Precisão / dtype / BF16 / FP16 / FP32','bfloat16 float16 float32 arredondamento',
  'dtype é o formato numérico dos tensores. BF16 e FP16 usam 16 bits por valor; FP32 usa 32. Eles diferem na faixa e precisão dos números representáveis.',
  'Menos bits podem economizar memória, mas introduzem arredondamentos. Converter ativações para FP32 antes do RMS não recupera precisão já perdida no cálculo anterior.'],
 ['Desempenho e captura','Captura / hook / instrumentação','medição observação saída',
  'Captura é o registro dos dados da execução. Hooks são funções acionadas na saída dos blocos para medir ativações. Instrumentação inclui esses hooks, extração de atenção, probabilidades e cópias de dados.',
  'Essas operações têm custo de tempo e memória. Medimos o modelo com instrumentação; não estimamos sua velocidade sem ela.'],
 ['Desempenho e captura','Backend eager / captura de atenção','sdpa matrizes ligada desligada',
  'Backend é a implementação usada para executar uma operação. Aqui o modo eager calcula explicitamente as matrizes de atenção. Ligada, a captura retém e extrai dados para a tela.',
  'Desligar a captura evita reter e retornar essas matrizes, mas mantém o cálculo eager. Não equivale a trocar para um backend otimizado como SDPA.'],
 ['Desempenho e captura','Latência / tempo instrumentado / streaming','ms segundos generation_ms instrumented_ms',
  'Latência é tempo de espera ou processamento. O tempo mostrado soma os passos sincronizados com a GPU: inclui cálculo, hooks, extração e decodificação; exclui carga do modelo e espera do streaming. Streaming é o envio progressivo dos passos à interface.',
  'Na exportação, generation_ms é essa soma; instrumented_ms é o tempo de parede do laço e pode incluir espera do consumidor. ms significa milissegundo: 1.000 ms = 1 s.'],
 ['Desempenho e captura','Exportação / JSON / medido × ilustrativo','arquivo dados exemplo',
  'Exportar salva um arquivo JSON com metadados, prompt tokenizado, capturas por passo e medidas. Ele registra números da execução; as coordenadas 3D são apenas uma forma de apresentá-los.',
  'Os exemplos numéricos deste glossário são didáticos, não medições da sua captura. Os valores nos painéis de dados vêm do modelo real.'],
];

const glossarySearch = document.getElementById('glossarySearch');
const glossaryCategory = document.getElementById('glossaryCategory');
const normalizeTerm = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
for(const category of new Set(glossary.map(entry=>entry[0]))){
 const option=document.createElement('option');option.value=category;option.textContent=category;glossaryCategory.append(option);
}
function renderGlossary(){
 const query=normalizeTerm(glossarySearch.value.trim());
 const terms=query.split(/\s+/).filter(Boolean);
 const matches=glossary.filter(entry=>(!glossaryCategory.value||entry[0]===glossaryCategory.value)&&terms.every(term=>normalizeTerm(entry.join(' ')).includes(term)));
 const list=document.getElementById('glossaryEntries');list.replaceChildren();
 document.getElementById('glossaryCount').textContent=`${matches.length} de ${glossary.length} conceitos${matches.length?' · toque em um termo para ler':' · tente outro termo ou categoria'}`;
 for(const [category,title,,definition,note] of matches){
  const detail=document.createElement('details');detail.className='glossaryEntry';detail.open=Boolean(query);
  const summary=document.createElement('summary');summary.textContent=title;
  const tag=document.createElement('span');tag.className='glossaryTag';tag.textContent=category;
  const text=document.createElement('p');text.textContent=definition;
  const example=document.createElement('p');example.className='glossaryNote';example.textContent=note;
  detail.append(summary,tag,text,example);list.append(detail);
 }
}
glossarySearch.addEventListener('input',renderGlossary);
glossaryCategory.addEventListener('change',renderGlossary);
document.getElementById('glossaryClear').onclick=()=>{glossarySearch.value='';glossaryCategory.value='';renderGlossary();glossarySearch.focus()};
for(const button of document.querySelectorAll('[data-glossary]'))button.onclick=()=>{
 activateTab(document.getElementById('tab-glossary'));
 if(matchMedia('(max-width:760px)').matches)document.querySelector('.detailsCard').classList.add('mobileOpen');
 glossaryCategory.value='';glossarySearch.value=button.dataset.glossary;renderGlossary();glossarySearch.focus();
 document.querySelector('.detailBody').scrollTop=0;
};
renderGlossary();
