# Auditoria de conformidade — 2026-11-06

| Escopo | Estado | Evidência e limite |
|---|---|---|
| M0 fundação | Implementado para desenvolvimento local | pnpm workspace, TypeScript strict, build ESM + tipos, lint, 43 testes e CI. TypeDoc e URL de repositório dependem da publicação do projeto. |
| M1 MVP | Implementado com ressalvas | Facade, coletores, fila, playground e 6 E2E verdes em Chromium/Firefox/WebKit. Os cenários de offline e endpoint inválido estão nos testes unitários de transporte; ainda não há matriz E2E completa de falhas. |
| M2 produção | Parcial | Validação, abort, timeout, retry, sampling e pacote instalável. Falta prerelease npm, fixture Next.js e gate de desempenho em hardware dedicado. |
| M3 pesquisa | Não iniciado | Automação, Worker, touch e adapters de consentimento exigem avaliação de utilidade e privacidade. |
| M4 v1.0 | Não iniciado | Versão estável, publicação, docs hospedadas e release com proveniência dependem de repositório e credenciais reais. |

## Critérios de aceite do MVP

| # | Estado | Evidência |
|---|---|---|
| 1 | Implementado | `pnpm test:package` instala tarball limpo em consumidor temporário, resolve tipos e importa em Node. |
| 2 | Implementado | Testes de facade provam zero listeners e fetch antes de `start`; E2E verifica zero POST no playground. |
| 3 | Implementado nos testes locais | Testes cobrem stop/dispose, reinício, flush entre sessões e 100 ciclos com contagem igual de listeners adicionados/removidos. |
| 4 | Implementado para coletores embutidos | Testes descartam inputs, inclusive Shadow DOM fechado; payload não inclui key/value/coordenadas. Plugins próprios precisam de revisão. |
| 5 | Implementado no fluxo principal | 6 E2E passam em Chromium, Firefox e WebKit. A matriz de falhas avançadas ainda não foi exercitada em todos. |
| 6 | Parcial | Relatórios reproduzíveis para os três engines e gate de bundle existem. Falta trace de 30 s em hardware de referência e medição de heap. |
| 7 | Implementado para tarball local | `pnpm test:package` verifica lista de arquivos, licença, README e ausência de mapas/testes/fontes. Publicação não foi feita. |

Falhas reais encontradas e corrigidas: descarte indevido de instância pelo StrictMode do playground, ausência de tratamento de rejeição de adapter, reutilização de flush entre sessões e contagem de eventos em input de Shadow DOM fechado. A lista de alvos de interação ficou conservadora por privacidade.
