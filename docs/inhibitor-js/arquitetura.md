# Arquitetura e contratos

- `packages/core`: tipos públicos, validação e ciclo de vida; sem leitura do DOM na avaliação do módulo.
- `packages/browser`: `createEnvironmentCollector()` e `createBehaviorCollector(options)`; somente agregados de ambiente e interação.
- `packages/transport`: `BoundedQueue<T>`, `HttpTransport`; sem leitura do DOM.
- `packages/inhibitor`: `Inhibitor` compõe os coletores e transporte; única entrada npm.
- `apps/playground`: consome somente `inhibitor-js`.

`SessionSnapshot` tem schema `1.0`; IDs são efêmeros por `start()`. Os IDs de coletores padrão são `environment` e `behavior`. Plugins recebem `CollectorContext`, sem acesso a dados brutos pelo core. O host obtém a base legal de coleta e chama `start` explicitamente.

Não há banco, servidor nem credencial: este projeto é uma biblioteca de navegador. A referência a schema, rotas e seed na skill de apps não se aplica.
