# Decisões de implementação

### D01 · Entrega local antes de publicação

O repositório entrega uma SDK instalável e verificável localmente. Publicar no npm e implantar a demonstração exigem titularidade e credenciais externas.

**Descartado:** presumir disponibilidade do nome npm e publicar sem verificar propriedade.

### D02 · Facade ESM com pacotes internos privados

`inhibitor-js` é a única entrada pública; os pacotes de domínio são privados. O build da facade empacota o código interno e os tipos.

**Descartado:** publicar quatro pacotes e assumir custo de manutenção de versões sem consumidores conhecidos.

### D03 · Consentimento manual e obrigatório

`start({ consent: true })` é a única ativação. `initialize()` pode validar configuração, mas não coleta sinais.

**Descartado:** inferir consentimento de banners, eventos ou estado armazenado.

### D04 · Coleta agregada no processo principal

Contadores e histogramas fixos bastam para o MVP. Um Worker só será considerado após medição de ganho líquido.

**Descartado:** adicionar mensagens e código de Worker antes de haver evidência de benefício.

### D05 · Indicadores de automação fora do MVP

A opção aceita apenas `false`; nenhuma classificação de pessoa ou bot é produzida sem avaliação de privacidade e falsos positivos.

**Descartado:** incluir heurísticas não calibradas como sinal de risco.

### D06 · Sem persistência e sem envio padrão

As agregações e a fila vivem apenas em memória. Transporte exige `enabled: true` e endpoint HTTPS válido (localhost é exceção de desenvolvimento).

**Descartado:** fila em storage, que prolongaria retenção e criaria identificador durável.

### D07 · Sem gate rígido de performance até medir

O build mede tamanho, e benchmarks registram ambiente e distribuição. A meta de 15 KiB gzip será tratada como alvo até haver base reproduzível.

**Descartado:** declarar orçamento aprovado com base em uma máquina e uma execução.
