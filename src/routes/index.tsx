import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PontoFácil — Controle de Ponto e Fechamento Mensal" },
      {
        name: "description",
        content:
          "Controle de ponto simples: bata o ponto com um clique, acompanhe registros por dia e feche o mês com totais em HH:MM e decimal. Exporte o relatório em PDF.",
      },
      { property: "og:title", content: "PontoFácil — Controle de Ponto" },
      {
        property: "og:description",
        content:
          "Bate o ponto, a gente conta as horas. Registros por dia, total do mês e relatório em PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

/* ============================ Tipos ============================ */

// Os 4 tipos de batida de ponto disponíveis no modal
type PunchType = "entrada" | "saida_almoco" | "retorno_almoco" | "saida";

interface PunchRecord {
  id: string; // id único (para remoção)
  timestamp: number; // data+hora exata do clique, em ms (epoch)
  type: PunchType;
}

const TYPE_META: Record<
  PunchType,
  { label: string; emoji: string; dot: string; chip: string }
> = {
  entrada: { label: "Entrada", emoji: "🟢", dot: "bg-mint", chip: "bg-sky text-paper" },
  saida_almoco: { label: "Saída Almoço", emoji: "🥗", dot: "bg-lemon", chip: "bg-lemon text-ink" },
  retorno_almoco: { label: "Retorno Almoço", emoji: "🔁", dot: "bg-sky", chip: "bg-mint text-ink" },
  saida: { label: "Saída", emoji: "👋", dot: "bg-coral", chip: "bg-coral text-paper" },
};

const STORAGE_KEY = "pontofacil:records";

/* ====================== Persistência (localStorage) ====================== */

function loadRecords(): PunchRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PunchRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecords(records: PunchRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/* ====================== Lógica de cálculo de horas ====================== */
/*
 * Como calculamos as horas de um dia:
 * 1) Ordenamos os registros do dia cronologicamente.
 * 2) Somamos os intervalos de trabalho:
 *    - Entrada → Saída Almoço  (manhã)
 *    - Retorno Almoço → Saída  (tarde)
 *    - Se não houver almoço: Entrada → Saída
 *    O algoritmo é genérico: um relógio "ligado" em Entrada/Retorno Almoço
 *    e "desligado" em Saída Almoço/Saída, acumulando o tempo ligado.
 */

function minutesWorked(records: PunchRecord[]): number {
  const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
  let total = 0;
  let clockOn: number | null = null; // timestamp de quando o trabalho começou

  for (const r of sorted) {
    if (r.type === "entrada" || r.type === "retorno_almoco") {
      if (clockOn === null) clockOn = r.timestamp; // liga o relógio
    } else {
      // saida_almoco ou saida: desliga o relógio e soma o intervalo
      if (clockOn !== null) {
        total += (r.timestamp - clockOn) / 60000;
        clockOn = null;
      }
    }
  }
  // Se o dia ainda está "em aberto" (bateu entrada mas não saída),
  // conta até agora para dar feedback em tempo real.
  if (clockOn !== null) total += (Date.now() - clockOn) / 60000;

  return Math.max(0, Math.round(total));
}

// Converte minutos em "HH:MM" (horas podem passar de 24 — ex: 160:30)
function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

// Converte minutos em decimal com 2 casas (ex: 160.50)
function toDecimal(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function fmtDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${weekday} · ${day}`;
}

/* ============================ Componente ============================ */

function Index() {
  // Registros carregados do localStorage na primeira renderização
  const [records, setRecords] = useState<PunchRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Relógio ao vivo (atualiza a cada segundo)
  const [now, setNow] = useState(() => Date.now());

  // Quando o usuário clica em "Bater Ponto", guardamos o timestamp EXATO
  // do clique e abrimos o modal para escolher o tipo.
  const [pendingPunch, setPendingPunch] = useState<number | null>(null);

  // Mês exibido nos totais/tabela (formato "YYYY-MM")
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    setRecords(loadRecords());
    setHydrated(true);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Persiste a cada mudança
  useEffect(() => {
    if (hydrated) saveRecords(records);
  }, [records, hydrated]);

  // Passo 1: captura a hora exata e abre o modal
  const handlePunch = useCallback(() => {
    setPendingPunch(Date.now());
  }, []);

  // Passo 2: o usuário escolheu o tipo no modal — salva o registro
  const handleChooseType = useCallback(
    (type: PunchType) => {
      if (pendingPunch === null) return;
      setRecords((prev) => [
        ...prev,
        { id: crypto.randomUUID(), timestamp: pendingPunch, type },
      ]);
      setPendingPunch(null);
    },
    [pendingPunch],
  );

  const handleDelete = useCallback((id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // Registros do mês selecionado, agrupados por dia (dia mais recente primeiro,
  // e dentro do dia do mais antigo para o mais recente)
  const groupedDays = useMemo(() => {
    const inMonth = records.filter((r) => fmtDayKey(r.timestamp).startsWith(month));
    const byDay = new Map<string, PunchRecord[]>();
    for (const r of inMonth) {
      const key = fmtDayKey(r.timestamp);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0])) // dias: recente → antigo
      .map(([dayKey, recs]) => {
        const sorted = recs.sort((a, b) => a.timestamp - b.timestamp); // cronológico
        return { dayKey, records: sorted, minutes: minutesWorked(sorted) };
      });
  }, [records, month]);

  // Totalizador do mês (soma dos minutos de todos os dias)
  const monthMinutes = useMemo(
    () => groupedDays.reduce((acc, d) => acc + d.minutes, 0),
    [groupedDays],
  );

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const raw = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
    // capitaliza só a primeira letra ("setembro de 2026" → "Setembro de 2026")
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [month]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  /* ================== Geração do PDF (jsPDF + autotable) ================== */
  /*
   * Montamos uma tabela simples: uma linha por registro (Dia | Tipo | Hora)
   * mais uma linha de subtotal por dia, e ao final os totais do mês em
   * HH:MM e decimal. Tudo desenhado pelo jsPDF — sem depender de print do navegador.
   */
  const exportPdf = useCallback(() => {
    const doc = new jsPDF();
    const [y, m] = month.split("-").map(Number) as [number, number];
    const monthName = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });

    doc.setFontSize(18);
    doc.text("PontoFácil — Relatório de Ponto", 14, 20);
    doc.setFontSize(11);
    doc.text(`Mês de referência: ${monthName}`, 14, 28);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 34);

    // Linhas da tabela: registros cronológicos + subtotal por dia
    const body: string[][] = [];
    // dias em ordem cronológica no PDF (antigo → recente)
    const daysAsc = [...groupedDays].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
    for (const day of daysAsc) {
      for (const r of day.records) {
        body.push([
          new Date(r.timestamp).toLocaleDateString("pt-BR"),
          TYPE_META[r.type].label,
          fmtTime(r.timestamp),
          "",
        ]);
      }
      body.push(["", `Total do dia (${fmtDayLabel(day.dayKey)})`, "", toHHMM(day.minutes)]);
    }

    autoTable(doc, {
      startY: 40,
      head: [["Data", "Tipo", "Hora", "Total dia"]],
      body,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [23, 21, 31], textColor: [255, 210, 63] },
      // Destaque visual nas linhas de subtotal
      didParseCell: (data) => {
        if (data.section === "body" && String((data.row.raw as string[])[1]).startsWith("Total do dia")) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [255, 210, 63];
        }
      },
    });

    // Totais do mês abaixo da tabela
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY;
    doc.setFontSize(13);
    doc.text(`Total do mês: ${toHHMM(monthMinutes)} (HH:MM)`, 14, finalY + 12);
    doc.text(`Equivalente decimal: ${toDecimal(monthMinutes)} horas`, 14, finalY + 20);

    doc.save(`relatorio-ponto-${month}.pdf`);
  }, [groupedDays, month, monthMinutes]);

  const nowDate = new Date(now);
  const todayChip = nowDate
    .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
    .replace(".", "");

  return (
    <div className="min-h-screen bg-paper text-ink selection:bg-lemon selection:text-ink">
      {/* Header */}
      <header className="mx-auto max-w-5xl px-5 pt-8 sm:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-ink text-xl font-bold text-lemon">
              ⏱
            </div>
            <div>
              <p className="text-lg leading-none font-bold tracking-tight">PontoFácil</p>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink/40">
                fechamento mensal
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-mint px-4 py-2 text-sm font-bold text-ink shadow-punch-sm">
            <span className="size-2 animate-pulse rounded-full bg-ink"></span>
            Ao vivo ·{" "}
            {nowDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </header>

      {/* Título */}
      <section className="mx-auto max-w-5xl px-5 pt-10 sm:px-8">
        <p className="inline-block rounded-full bg-ink px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-lemon">
          {todayChip} · {monthLabel}
        </p>
        <h1 className="mt-4 text-5xl leading-[0.92] font-bold tracking-tight sm:text-7xl">
          Bate o ponto.
          <br />
          <span className="text-coral">A gente conta</span> as horas.
        </h1>
        <p className="mt-4 max-w-md text-base font-medium text-ink/60">
          Um clique, um registro. Nada de planilhas, nada de "depois eu anoto".
        </p>
      </section>

      {/* Botão principal — captura o timestamp EXATO do clique */}
      <section className="mx-auto max-w-5xl px-5 pt-10 sm:px-8">
        <div className="relative">
          <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-[2.5rem] bg-coral"></div>
          <button
            onClick={handlePunch}
            className="relative w-full cursor-pointer rounded-[2.5rem] bg-ink px-8 py-10 text-center shadow-punch transition active:translate-x-1 active:translate-y-1"
          >
            <span className="block text-3xl font-bold tracking-tight text-paper sm:text-5xl">
              👋 BATER PONTO
            </span>
            <span className="mt-2 block text-sm font-medium text-lemon/80">
              captura a hora exata no clique
            </span>
          </button>
        </div>
      </section>

      {/* Totalizadores do mês */}
      <section className="mx-auto max-w-5xl px-5 pt-10 sm:px-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold capitalize">{monthLabel}</h2>
          <div className="flex gap-2">
            <button
              onClick={() => shiftMonth(-1)}
              aria-label="Mês anterior"
              className="grid size-9 cursor-pointer place-items-center rounded-full border-2 border-ink bg-paper font-bold shadow-punch-sm transition active:translate-x-0.5 active:translate-y-0.5"
            >
              ←
            </button>
            <button
              onClick={() => shiftMonth(1)}
              aria-label="Próximo mês"
              className="grid size-9 cursor-pointer place-items-center rounded-full border-2 border-ink bg-paper font-bold shadow-punch-sm transition active:translate-x-0.5 active:translate-y-0.5"
            >
              →
            </button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl bg-ink p-6 text-paper shadow-punch">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-lemon">
              total do mês
            </p>
            <p className="mt-2 font-mono text-4xl font-bold">{toHHMM(monthMinutes)}</p>
            <p className="text-sm text-paper/60">horas · formato HH:MM</p>
          </div>
          <div className="rounded-3xl bg-lilac p-6 text-ink shadow-punch">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink/60">
              equivalente
            </p>
            <p className="mt-2 font-mono text-4xl font-bold">{toDecimal(monthMinutes)}</p>
            <p className="text-sm text-ink/60">horas · formato decimal</p>
          </div>
          <div className="rounded-3xl border-2 border-ink bg-paper p-6 shadow-punch">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink/40">
              dias trabalhados
            </p>
            <p className="mt-2 font-mono text-4xl font-bold">{groupedDays.length}</p>
            <p className="text-sm text-ink/50">dias com registro no mês</p>
          </div>
        </div>
      </section>

      {/* Tabela de registros agrupada por dia */}
      <section className="mx-auto max-w-5xl px-5 pt-10 pb-16 sm:px-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Registros do mês</h2>
          <button
            onClick={exportPdf}
            disabled={groupedDays.length === 0}
            className="cursor-pointer rounded-full border-2 border-ink bg-lemon px-4 py-2 text-sm font-bold shadow-punch-sm transition active:translate-x-1 active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⬇ Exportar PDF
          </button>
        </div>

        {groupedDays.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-ink/30 p-10 text-center">
            <p className="text-lg font-bold">Nenhum registro neste mês</p>
            <p className="mt-1 text-sm font-medium text-ink/50">
              Bata o ponto acima para começar.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border-2 border-ink shadow-punch">
            {/* Cabeçalho da tabela */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-ink px-5 py-3 text-[11px] font-bold uppercase tracking-[0.15em] text-lemon sm:grid-cols-[1.4fr_1fr_1fr_auto]">
              <span>Tipo</span>
              <span>Hora</span>
              <span className="hidden sm:block">Dia</span>
              <span className="text-right">Ações</span>
            </div>

            {groupedDays.map((day, di) => (
              <div key={day.dayKey}>
                {/* Faixa de agrupamento do dia, com o total calculado */}
                <div
                  className={`flex items-center justify-between px-5 py-2 text-[11px] font-bold uppercase tracking-[0.15em] text-ink/70 ${
                    di % 2 === 0 ? "bg-lemon/40" : "bg-mint/40"
                  }`}
                >
                  <span>{fmtDayLabel(day.dayKey)}</span>
                  <span className="font-mono">total {toHHMM(day.minutes)}</span>
                </div>
                {day.records.map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t-2 border-ink/10 px-5 py-4 sm:grid-cols-[1.4fr_1fr_1fr_auto]"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <span
                        className={`size-2.5 rounded-full ${TYPE_META[r.type].dot}`}
                      ></span>
                      {TYPE_META[r.type].label}
                    </span>
                    <span className="font-mono font-bold">{fmtTime(r.timestamp)}</span>
                    <span className="hidden text-sm font-bold text-ink/60 sm:block">
                      {new Date(r.timestamp).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                    <button
                      onClick={() => handleDelete(r.id)}
                      aria-label="Excluir registro"
                      className="cursor-pointer justify-self-end rounded-full border border-ink/20 px-2 py-0.5 text-xs font-bold text-ink/40 transition hover:border-coral hover:text-coral"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-center text-xs font-medium text-ink/40">
          dados salvos no navegador · localStorage
        </p>
      </section>

      {/* Modal: seleção do tipo de registro */}
      {pendingPunch !== null && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"
          onClick={() => setPendingPunch(null)}
        >
          <div
            className="w-full max-w-2xl rounded-3xl border-2 border-ink bg-paper p-6 shadow-punch-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold">Qual é o tipo de registro?</h2>
            <p className="text-sm font-medium text-ink/50">
              registrado às <span className="font-mono font-bold">{fmtTime(pendingPunch)}</span>{" "}
              — escolha uma opção
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(Object.keys(TYPE_META) as PunchType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => handleChooseType(type)}
                  className={`cursor-pointer rounded-2xl border-2 border-ink px-4 py-5 text-left shadow-punch-sm transition active:translate-x-1 active:translate-y-1 ${TYPE_META[type].chip}`}
                >
                  <span className="text-2xl">{TYPE_META[type].emoji}</span>
                  <span className="mt-2 block text-lg font-bold leading-tight">
                    {TYPE_META[type].label}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPendingPunch(null)}
              className="mt-5 w-full cursor-pointer rounded-full border-2 border-ink/20 py-2 text-sm font-bold text-ink/50 transition hover:border-ink hover:text-ink"
            >
              Cancelar (descarta este registro)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
