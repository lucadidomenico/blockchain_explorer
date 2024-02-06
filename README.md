## CDK Architecture

![Architecure](./architecture.png)

## READ API

- balance in ETH di un certo indirizzo (api gateway)
- recuperare prezzo attuale in USD di ETH
- lista transazioni fatte o ricevute da un certo indirizzo ordinate by execution date (db)
- dettagli di una singola transazione by hash (db)

## Requisiti (sono tutti gratuiti)

- Alchemy API Key (per connettersi ad Ethereum): [https://www.alchemy.com/](https://www.alchemy.com/)
  - Tutorial (solo parte 1 per prendere API Key): [https://docs.alchemy.com/docs/alchemy-quickstart-guide#1key-create-an-alchemy-key](https://docs.alchemy.com/docs/alchemy-quickstart-guide#1key-create-an-alchemy-key)
- AWS Account (Free Tier): [https://aws.amazon.com/it/free/](https://aws.amazon.com/it/free/)
- AWS CDK: [https://aws.amazon.com/it/getting-started/guides/setup-cdk/module-two/](https://aws.amazon.com/it/getting-started/guides/setup-cdk/module-two/)
- AWS Console: [https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
