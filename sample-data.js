/**
 * Eldorado Pesca Manager - Dados Iniciais de Demonstração
 * Inclui os dados reais da 107ª Ação Eldorado Pesca fornecidos pelo usuário.
 */

const INITIAL_SAMPLE_DATA = {
  // Configurações Globais da Loja
  settings: {
    storeName: "ELDORADO PESCA LTDA",
    pixKey: "42999162340",
    phone: "42 9 9916-2340",
    instagram: "@lojaeldoradopesca",
    eduardoDailyRate: 100.00, // Valor padrão da diária inteira (R$)
    eduardoHalfRate: 50.00,   // Valor padrão de meio período (R$)
  },

  // Rifas / Ações
  raffles: [
    {
      id: "rifa-107",
      number: "107°",
      title: "107° AÇÃO ELDORADO PESCA",
      subtitle: "AÇÃO RÁPIDA",
      pricePerNumber: 25.00,
      totalNumbers: 60,
      reservationTimeoutHours: 2,
      pixKey: "42999162340",
      pixOwner: "ELDORADO PESCA LTDA",
      shippingNote: "Frete a parte - Envio para todo o Brasil.",
      liveDrawNote: "Sorteio ao vivo no Instagram @lojaeldoradopesca",
      privateContact: "42 9 99162340",
      rules: "OS NUMEROS SÓ FICARÃO DISPONIVEIS ATÉ 2 HORAS APÓS O FECHAMENTO DA AÇÃO, SE NÃO HOUVER PAGAMENTO VAMOS DISPONIBILIZAR NOVAMENTE PARA OS DEMAIS.\nNÃO COPIAR E COLAR, APENAS FALAR O NÚMERO.\nSorteio será quando o último número for pago, avisarei aqui no grupo.",
      prizes: [
        { position: 1, description: "SHIMANO CURADO 200 DIREITA R$ 2200,00 OU 1000,00 EM VALE COMPRAS", winnerNumber: null, winnerName: null },
        { position: 2, description: "BONÉ SAPOZILLA", winnerNumber: null, winnerName: null },
        { position: 3, description: "BONÉ BEAST SHAD", winnerNumber: null, winnerName: null }
      ],
      createdAt: "2026-08-27T10:00:00.000Z",
      status: "active", // active, completed, cancelled
      numbers: [
        { num: 1, name: "", status: "available", reservedAt: null },
        { num: 2, name: "", status: "available", reservedAt: null },
        { num: 3, name: "", status: "available", reservedAt: null },
        { num: 4, name: "", status: "available", reservedAt: null },
        { num: 5, name: "", status: "available", reservedAt: null },
        { num: 6, name: "", status: "available", reservedAt: null },
        { num: 7, name: "VINICIUS F", status: "reserved", reservedAt: "2026-08-27T11:00:00.000Z" },
        { num: 8, name: "JÚNIOR JJ", status: "paid", reservedAt: "2026-08-27T10:30:00.000Z" },
        { num: 9, name: "FELIPE ROCHA", status: "reserved", reservedAt: "2026-08-27T11:15:00.000Z" },
        { num: 10, name: "ÉDSON", status: "reserved", reservedAt: "2026-08-27T11:20:00.000Z" },
        { num: 11, name: "ANDRÉ ARESI", status: "reserved", reservedAt: "2026-08-27T11:25:00.000Z" },
        { num: 12, name: "JUNIOR JJ", status: "paid", reservedAt: "2026-08-27T10:30:00.000Z" },
        { num: 13, name: "LENON", status: "reserved", reservedAt: "2026-08-27T11:30:00.000Z" },
        { num: 14, name: "ADIMARINS", status: "paid", reservedAt: "2026-08-27T10:45:00.000Z" },
        { num: 15, name: "VINICIUS F", status: "reserved", reservedAt: "2026-08-27T11:00:00.000Z" },
        { num: 16, name: "VAGNER M", status: "paid", reservedAt: "2026-08-27T10:50:00.000Z" },
        { num: 17, name: "JOÃO C", status: "paid", reservedAt: "2026-08-27T10:55:00.000Z" },
        { num: 18, name: "ANDERSON CARNEIRO", status: "paid", reservedAt: "2026-08-27T11:05:00.000Z" },
        { num: 19, name: "CARLOS C", status: "paid", reservedAt: "2026-08-27T11:10:00.000Z" },
        { num: 20, name: "CÉSAR T", status: "reserved", reservedAt: "2026-08-27T11:40:00.000Z" },
        { num: 21, name: "EDUARDO F", status: "paid", reservedAt: "2026-08-27T11:12:00.000Z" },
        { num: 22, name: "EDILSON", status: "reserved", reservedAt: "2026-08-27T11:45:00.000Z" },
        { num: 23, name: "JOÃO C", status: "paid", reservedAt: "2026-08-27T10:55:00.000Z" },
        { num: 24, name: "HENRIQUE", status: "paid", reservedAt: "2026-08-27T11:18:00.000Z" },
        { num: 25, name: "EVERTON K", status: "paid", reservedAt: "2026-08-27T11:22:00.000Z" },
        { num: 26, name: "ANDERSON B", status: "paid", reservedAt: "2026-08-27T11:28:00.000Z" },
        { num: 27, name: "ALESSANDRO WISOSKI", status: "reserved", reservedAt: "2026-08-27T11:50:00.000Z" },
        { num: 28, name: "DIGGO", status: "paid", reservedAt: "2026-08-27T11:35:00.000Z" },
        { num: 29, name: "JOÃO VICTOR", status: "paid", reservedAt: "2026-08-27T11:38:00.000Z" },
        { num: 30, name: "RAI", status: "reserved", reservedAt: "2026-08-27T11:55:00.000Z" },
        { num: 31, name: "ANDERSON B", status: "paid", reservedAt: "2026-08-27T11:28:00.000Z" },
        { num: 32, name: "LUIZ ALBERTH", status: "reserved", reservedAt: "2026-08-27T12:00:00.000Z" },
        { num: 33, name: "JOSIAS", status: "paid", reservedAt: "2026-08-27T11:42:00.000Z" },
        { num: 34, name: "CLEBINHO", status: "paid", reservedAt: "2026-08-27T11:44:00.000Z" },
        { num: 35, name: "EDILSON", status: "reserved", reservedAt: "2026-08-27T11:45:00.000Z" },
        { num: 36, name: "ANDRÉ ARESI", status: "reserved", reservedAt: "2026-08-27T11:25:00.000Z" },
        { num: 37, name: "NATANAEL", status: "reserved", reservedAt: "2026-08-27T12:10:00.000Z" },
        { num: 38, name: "CLEBINHO", status: "paid", reservedAt: "2026-08-27T11:44:00.000Z" },
        { num: 39, name: "EDUARDO F", status: "paid", reservedAt: "2026-08-27T11:12:00.000Z" },
        { num: 40, name: "ÉDSON", status: "reserved", reservedAt: "2026-08-27T11:20:00.000Z" },
        { num: 41, name: "", status: "available", reservedAt: null },
        { num: 42, name: "LUCAS", status: "reserved", reservedAt: "2026-08-27T12:15:00.000Z" },
        { num: 43, name: "", status: "available", reservedAt: null },
        { num: 44, name: "", status: "available", reservedAt: null },
        { num: 45, name: "DIGGO", status: "paid", reservedAt: "2026-08-27T11:35:00.000Z" },
        { num: 46, name: "HENRIQUE K", status: "paid", reservedAt: "2026-08-27T11:48:00.000Z" },
        { num: 47, name: "ZÁ", status: "paid", reservedAt: "2026-08-27T11:52:00.000Z" },
        { num: 48, name: "", status: "available", reservedAt: null },
        { num: 49, name: "LUCIANO", status: "reserved", reservedAt: "2026-08-27T12:20:00.000Z" },
        { num: 50, name: "JOÃO VICTOR", status: "paid", reservedAt: "2026-08-27T11:38:00.000Z" },
        { num: 51, name: "MATHEUS MACHADO", status: "paid", reservedAt: "2026-08-27T11:58:00.000Z" },
        { num: 52, name: "", status: "available", reservedAt: null },
        { num: 53, name: "YGOR K", status: "paid", reservedAt: "2026-08-27T12:02:00.000Z" },
        { num: 54, name: "VAGNER M", status: "reserved", reservedAt: "2026-08-27T12:25:00.000Z" },
        { num: 55, name: "ANDERSON B", status: "paid", reservedAt: "2026-08-27T11:28:00.000Z" },
        { num: 56, name: "", status: "available", reservedAt: null },
        { num: 57, name: "", status: "available", reservedAt: null },
        { num: 58, name: "DIGGO", status: "paid", reservedAt: "2026-08-27T11:35:00.000Z" },
        { num: 59, name: "ANDERSON B", status: "paid", reservedAt: "2026-08-27T11:28:00.000Z" },
        { num: 60, name: "DIGGO", status: "paid", reservedAt: "2026-08-27T11:35:00.000Z" }
      ]
    }
  ],

  // Prêmios Físicos e Vales-Compras (Adeus Caderno!)
  valesAndPrizes: [
    {
      id: "vp-rai-105",
      customerName: "RAI",
      customerPhone: "42 9 9933-4455",
      type: "dual_choice",
      raffleRef: "105° AÇÃO ELDORADO PESCA (Cota #40)",
      dateWon: "2026-08-10",
      initialAmount: 450.00,
      currentBalance: 450.00,
      description: "1º Lugar - DIÁRIA PRA DUAS PESSOAS + COMBUSTÍVEL OU VALE COMPRAS DE 450,00 NA LOJA (Cota #40)",
      status: "pending_choice",
      deliveredAt: null,
      transactions: [],
      notes: "Ganhador da 105° Ação pendente de escolha (Diária de Pesca ou Vale-Compras)"
    },
    {
      id: "vp-1",
      customerName: "João Carlos Silva",
      customerPhone: "42998881122",
      type: "vale_compras", // "vale_compras" ou "premio_fisico"
      raffleRef: "106° Ação Eldorado",
      dateWon: "2026-08-10",
      initialAmount: 1000.00,
      currentBalance: 630.00,
      description: "1º Prêmio - Opção Vale Compras R$ 1.000",
      status: "active", // "active", "completed", "cancelled"
      transactions: [
        {
          id: "tx-1",
          date: "2026-08-12",
          item: "Linha Multifilamento YGK X8 40lb (150m)",
          amount: 190.00,
          remainingBalance: 810.00,
          registeredBy: "Loja"
        },
        {
          id: "tx-2",
          date: "2026-08-20",
          item: "2x Iscas Artificiais Nelson Nakamura Zig Zarinha",
          amount: 180.00,
          remainingBalance: 630.00,
          registeredBy: "Loja"
        }
      ]
    },
    {
      id: "vp-2",
      customerName: "Marcos Vinicius Ribeiro",
      customerPhone: "42991234567",
      type: "premio_fisico",
      raffleRef: "105° Ação Eldorado",
      dateWon: "2026-08-01",
      initialAmount: 0,
      currentBalance: 0,
      description: "Carretilha Shimano SLX 151 HG Esquerda",
      status: "pending_pickup", // "pending_pickup", "delivered"
      deliveredAt: null,
      notes: "Avisou que viria buscar no sábado da pescaria, mas ainda não apareceu na loja."
    },
    {
      id: "vp-3",
      customerName: "Lucas Oliveira",
      customerPhone: "42984445566",
      type: "premio_fisico",
      raffleRef: "105° Ação Eldorado",
      dateWon: "2026-08-01",
      initialAmount: 0,
      currentBalance: 0,
      description: "Boné Beast Shad Oficial",
      status: "delivered",
      deliveredAt: "2026-08-05",
      notes: "Entregue em mãos na loja."
    }
  ],

  // Ponto e Diárias do Funcionário Eduardo
  eduardoWorkDays: [
    {
      date: "2026-08-03",
      type: "full", // "full" (1.0), "half" (0.5), "off" (0.0)
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Atendimento de balcão e conferência de carretilhas."
    },
    {
      date: "2026-08-04",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Dia normal de trabalho."
    },
    {
      date: "2026-08-05",
      type: "half",
      hoursWeight: 0.5,
      amountDue: 50.00,
      notes: "Trabalhou somente à tarde (13h às 18h)."
    },
    {
      date: "2026-08-06",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Organização de estoque de iscas."
    },
    {
      date: "2026-08-07",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Embalagem e envio dos pacotes do correio."
    },
    {
      date: "2026-08-08",
      type: "half",
      hoursWeight: 0.5,
      amountDue: 50.00,
      notes: "Sábado de manhã (08h às 12h)."
    },
    {
      date: "2026-08-10",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Dia normal."
    },
    {
      date: "2026-08-11",
      type: "half",
      hoursWeight: 0.5,
      amountDue: 50.00,
      notes: "Precisou sair mais cedo para consulta médica."
    },
    {
      date: "2026-08-12",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Atendimento no balcão."
    },
    {
      date: "2026-08-13",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Dia normal."
    },
    {
      date: "2026-08-14",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Separação de pedidos da rifa."
    },
    {
      date: "2026-08-15",
      type: "half",
      hoursWeight: 0.5,
      amountDue: 50.00,
      notes: "Sábado pela manhã."
    },
    {
      date: "2026-08-17",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Dia completo."
    },
    {
      date: "2026-08-18",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Dia completo."
    },
    {
      date: "2026-08-19",
      type: "half",
      hoursWeight: 0.5,
      amountDue: 50.00,
      notes: "Apenas período da tarde."
    },
    {
      date: "2026-08-20",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Dia completo."
    },
    {
      date: "2026-08-21",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Dia completo."
    },
    {
      date: "2026-08-22",
      type: "half",
      hoursWeight: 0.5,
      amountDue: 50.00,
      notes: "Sábado manhã."
    },
    {
      date: "2026-08-24",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Dia completo."
    },
    {
      date: "2026-08-25",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Dia completo."
    },
    {
      date: "2026-08-26",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Dia completo."
    },
    {
      date: "2026-08-27",
      type: "full",
      hoursWeight: 1.0,
      amountDue: 100.00,
      notes: "Hoje: trabalhou o dia todo."
    }
  ],

  // Agenda de Pesca Esportiva & Diárias do Eldorado Lake (Guia Thiago Witeck)
  fishingBookings: [],

  // Locação Independente do Rancho Eldorado Lake (Hospedagem & Grupos)
  ranchoBookings: []
};
