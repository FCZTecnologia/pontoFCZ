# Ponto Certo

Atue como um Desenvolvedor Web Sênior. Preciso que você crie um aplicativo web simples de controle de ponto trabalhado (focado no fechamento mensal). O aplicativo deve ser uma Single Page Application (SPA) responsiva, moderna e fácil de usar.

Funcionalidades Principais:

Botão Principal "Bater Ponto":

Deve haver um botão grande e destacado para bater o ponto.

No momento EXATO em que o usuário clicar neste botão, o sistema deve capturar e salvar a data e a hora atual.

Imediatamente após o clique, deve abrir um Modal/Popup na tela.

Modal de Seleção de Tipo de Ponto:

O modal deve perguntar: "Qual é o tipo de registro?" e oferecer 4 botões:

Entrada

Saída Almoço

Retorno Almoço

Saída

Ao clicar em uma dessas opções, o registro é salvo com o tipo selecionado e a hora capturada no passo 1.

Exibição e Ordenação:

Os registros devem aparecer em uma tabela logo abaixo, agrupados por dia e ordenados cronologicamente (do mais antigo para o mais recente dentro do dia).

O sistema deve armazenar os dados no localStorage do navegador para que o usuário não perca as anotações ao atualizar a página.

Cálculo de Horas:

Para cada dia, calcule o total de horas trabalhadas (ex: Saída - Entrada, descontando o tempo de almoço).

Mostre um totalizador geral do mês atual com duas informações:

Total em formato HH:MM (exemplo: 160:30)

Total em formato Decimal (exemplo: 160.50)

Exportação:

Um botão "Exportar Relatório em PDF".

Ao clicar, o aplicativo deve gerar um arquivo PDF contendo a tabela com todos os registros do mês selecionado e os totais calculados (use uma biblioteca como html2pdf.js ou jspdf).

Requisitos Técnicos e de Design:

Utilize HTML, CSS e JavaScript puros (ou React, se preferir), sem necessidade de backend complexo ou banco de dados em nuvem.

Use um framework de CSS leve, como Tailwind CSS ou Bootstrap, para deixar a interface bonita, limpa (minimalista) e responsiva (funcionando bem no celular).

Inclua comentários no código explicando as partes principais, especialmente a lógica de cálculo de horas e de geração do PDF.

Por favor, gere o código completo (HTML, CSS e JS) em arquivos separados ou em um único arquivo bem estruturado para que eu possa testar imediatamente no meu navegador.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pontofcz.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ac4a4a88-6375-4a40-befa-ddcb7ea5da9a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
