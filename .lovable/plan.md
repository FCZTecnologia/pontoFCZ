# Corrigir contas, registros e relatório PDF

## Resultado esperado
- O usuário poderá sair e entrar novamente com a mesma conta, sem precisar recriá-la.
- Cada conta continuará vendo somente suas próprias marcações, salvas no banco de dados.
- A exportação permitirá escolher uma data inicial e uma data final.
- O PDF terá uma linha por data e colunas separadas para Entrada, Saída Almoço, Retorno Almoço, Saída, Total e Observações.

## Implementação
1. **Acesso e persistência**
   - Tornar o estado de autenticação mais confiável, validando a conta ao abrir o aplicativo e tratando corretamente entrada e saída.
   - Exibir mensagens claras para conta não confirmada, credenciais incorretas e falhas temporárias.
   - Garantir que novos registros sejam gravados com o identificador da conta conectada e que leituras/exclusões permaneçam isoladas por usuário.
   - Preservar a tabela protegida e as regras de acesso já existentes; nenhuma marcação será movida ou apagada.

2. **Tabela diária na tela**
   - Apresentar uma linha por dia.
   - Exibir as horas nas colunas: Entrada, Saída Almoço, Retorno Almoço e Saída.
   - Manter total diário, observações, indicação de registro retroativo e opção de excluir cada marcação.
   - Adaptar a tabela para leitura no celular sem perder informações.

3. **Período de exportação**
   - Abrir uma janela de exportação com campos “Data inicial” e “Data final”.
   - Preencher inicialmente com o primeiro e o último dia do mês selecionado.
   - Validar datas, ordem do período e existência de registros antes de gerar o arquivo.

4. **Novo PDF tabular**
   - Gerar uma linha por data dentro do período escolhido.
   - Usar as mesmas colunas da tela e incluir total diário e observações.
   - Mostrar período, data de geração, total geral em HH:MM e total decimal.

## Validação
- Testar saída e nova entrada com a mesma conta e confirmar que os registros reaparecem.
- Testar isolamento entre contas conforme as regras do banco.
- Testar filtro válido, intervalo invertido e período sem registros.
- Gerar e inspecionar visualmente o PDF para conferir alinhamento, quebra de texto e totais.
