import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PontoFácil — Controle de Ponto e Fechamento Mensal" },
      {
        name: "description",
        content:
          "Controle de ponto simples: bata o ponto com um clique, registre pontos retroativos com observação e feche o mês com totais em HH:MM e decimal. Exporte em PDF.",
      },
      { property: "og:title", content: "PontoFácil — Controle de Ponto" },
      {
        property: "og:description",
        content:
          "Bate o ponto, a gente conta as horas. Registros salvos na sua conta, ponto retroativo, observações e relatório em PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

/* ============================ Tipos ============================ */

type PunchType = "entrada" | "saida_almoco" | "retorno_almoco" | "saida";

interface PunchRecord {
  id: string;
  timestamp: number; // data+hora do registro em ms (epoch)
  type: PunchType;
  note: string | null;
  retroactive: boolean;
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

/* ====================== Lógica de cálculo de horas ====================== */
/*
 * Relógio "ligado" em Entrada/Retorno Almoço e "desligado" em
 * Saída Almoço/Saída — somamos apenas o tempo ligado.
 */
function minutesWorked(records: PunchRecord[]): number {
  const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
  let total = 0;
  let clockOn: number | null = null;

  for (const r of sorted) {
    if (r.type === "entrada" || r.type === "retorno_almoco") {
      if (clockOn === null) clockOn = r.timestamp;
    } else if (clockOn !== null) {
      total += (r.timestamp - clockOn) / 60000;
      clockOn = null;
    }
  }
  // dia em aberto (entrada sem saída): conta até agora
  if (clockOn !== null) total += (Date.now() - clockOn) / 60000;

  return Math.max(0, Math.round(total));
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

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

// valores iniciais para os campos do formulário retroativo
function todayInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/* ====================== Tela de login / cadastro ====================== */

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      else if (!data.session) setMsg("Confira seu e-mail para confirmar a conta.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError("E-mail ou senha inválidos.");
    }
    setBusy(false);
  };

  const google = async () => {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) setError("Não foi possível entrar com o Google.");
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-ink text-xl font-bold text-lemon">
            ⏱
          </div>
          <div>
            <p className="text-lg leading-none font-bold tracking-tight">PontoFácil</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink/40">
              seus pontos, na sua conta
            </p>
          </div>
        </div>
        <h1 className="text-4xl leading-[0.95] font-bold tracking-tight">
          {mode === "login" ? "Entre para bater o ponto." : "Crie sua conta."}
        </h1>
        <p className="mt-3 text-sm font-medium text-ink/60">
          Seus registros ficam salvos e sincronizados, com observações e ponto retroativo.
        </p>

        <form onSubmit={submit} className="mt-7 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="w-full rounded-2xl border-2 border-ink bg-paper px-4 py-3 font-medium outline-none focus:shadow-punch-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="sua senha"
            className="w-full rounded-2xl border-2 border-ink bg-paper px-4 py-3 font-medium outline-none focus:shadow-punch-sm"
          />
          {error && <p className="text-sm font-bold text-coral">{error}</p>}
          {msg && <p className="text-sm font-bold text-ink/70">{msg}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-2xl bg-ink px-4 py-3 text-lg font-bold text-lemon shadow-punch transition active:translate-x-1 active:translate-y-1 disabled:opacity-50"
          >
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <button
          onClick={google}
          className="mt-3 w-full cursor-pointer rounded-2xl border-2 border-ink bg-paper px-4 py-3 font-bold shadow-punch-sm transition active:translate-x-1 active:translate-y-1"
        >
          Continuar com o Google
        </button>

        <button
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
            setMsg(null);
          }}
          className="mt-5 cursor-pointer text-sm font-bold text-ink/50 underline"
        >
          {mode === "login" ? "Não tenho conta — quero criar" : "Já tenho conta — quero entrar"}
        </button>
      </div>
    </div>
  );
}

/* ============================ Componente ============================ */

function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [records, setRecords] = useState<PunchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Relógio ao vivo (só depois da hidratação, para não divergir do HTML do servidor)
  const [now, setNow] = useState<number | null>(null);

  // Modal do ponto atual: guarda o timestamp EXATO do clique + observação
  const [pendingPunch, setPendingPunch] = useState<number | null>(null);
  const [pendingType, setPendingType] = useState<PunchType | null>(null);
  const [pendingNote, setPendingNote] = useState("");

  // Modal do ponto retroativo
  const [retroOpen, setRetroOpen] = useState(false);
  const [retroDate, setRetroDate] = useState("");
  const [retroTime, setRetroTime] = useState("08:00");
  const [retroType, setRetroType] = useState<PunchType>("entrada");
  const [retroNote, setRetroNote] = useState("");
  const [retroError, setRetroError] = useState<string | null>(null);

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  /* ---------------------------- Sessão ---------------------------- */
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  /* ------------------- Carrega registros do banco ------------------- */
  const fetchRecords = useCallback(async () => {
    const { data, error } = await supabase
      .from("punch_records")
      .select("id, punched_at, type, note, is_retroactive")
      .order("punched_at", { ascending: true });
    if (!error && data) {
      setRecords(
        data.map((r) => ({
          id: r.id,
          timestamp: new Date(r.punched_at).getTime(),
          type: r.type as PunchType,
          note: r.note,
          retroactive: r.is_retroactive,
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session) {
      setLoading(true);
      void fetchRecords();
    } else {
      setRecords([]);
      setLoading(false);
    }
  }, [session, fetchRecords]);

  /* --------------------------- Ações --------------------------- */

  // Passo 1: captura a hora exata do clique e abre o modal
  const handlePunch = useCallback(() => {
    setPendingPunch(Date.now());
    setPendingType(null);
    setPendingNote("");
  }, []);

  // Passo 2: salva no banco com tipo escolhido e observação opcional
  const savePunch = useCallback(
    async (type: PunchType) => {
      if (pendingPunch === null) return;
      const at = new Date(pendingPunch).toISOString();
      setPendingPunch(null);
      setPendingType(null);
      const note = pendingNote.trim();
      setPendingNote("");
      await supabase.from("punch_records").insert({
        punched_at: at,
        type,
        note: note.length > 0 ? note.slice(0, 500) : null,
        is_retroactive: false,
      });
      await fetchRecords();
    },
    [pendingPunch, pendingNote, fetchRecords],
  );

  // Ponto retroativo: usuário informa data, hora, período e observação
  const saveRetro = useCallback(async () => {
    setRetroError(null);
    if (!retroDate || !retroTime) {
      setRetroError("Informe a data e a hora do registro.");
      return;
    }
    const [y, m, d] = retroDate.split("-").map(Number) as [number, number, number];
    const [hh, mm] = retroTime.split(":").map(Number) as [number, number];
    const when = new Date(y, m - 1, d, hh, mm, 0, 0);
    if (Number.isNaN(when.getTime())) {
      setRetroError("Data ou hora inválida.");
      return;
    }
    const note = retroNote.trim();
    await supabase.from("punch_records").insert({
      punched_at: when.toISOString(),
      type: retroType,
      note: note.length > 0 ? note.slice(0, 500) : null,
      is_retroactive: true,
    });
    setRetroOpen(false);
    setRetroNote("");
    // mostra o mês do registro criado
    setMonth(`${y}-${String(m).padStart(2, "0")}`);
    await fetchRecords();
  }, [retroDate, retroTime, retroType, retroNote, fetchRecords]);

  const handleDelete = useCallback(
    async (id: string) => {
      setRecords((prev) => prev.filter((r) => r.id !== id));
      await supabase.from("punch_records").delete().eq("id", id);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setRecords([]);
  }, []);

  /* ------------------- Agrupamentos e totais ------------------- */

  const groupedDays = useMemo(() => {
    const inMonth = records.filter((r) => fmtDayKey(r.timestamp).startsWith(month));
    const byDay = new Map<string, PunchRecord[]>();
    for (const r of inMonth) {
      const key = fmtDayKey(r.timestamp);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dayKey, recs]) => {
        const sorted = recs.sort((a, b) => a.timestamp - b.timestamp);
        return { dayKey, records: sorted, minutes: minutesWorked(sorted) };
      });
  }, [records, month]);

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
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [month]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  /* ================== Geração do PDF (jsPDF + autotable) ================== */
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

    // Uma linha por registro (Data | Tipo | Hora | Observação) + subtotal por dia
    const body: string[][] = [];
    const daysAsc = [...groupedDays].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
    for (const day of daysAsc) {
      for (const r of day.records) {
        body.push([
          new Date(r.timestamp).toLocaleDateString("pt-BR"),
          TYPE_META[r.type].label + (r.retroactive ? " (retroativo)" : ""),
          fmtTime(r.timestamp),
          r.note ?? "",
          "",
        ]);
      }
      body.push(["", `Total do dia (${fmtDayLabel(day.dayKey)})`, "", "", toHHMM(day.minutes)]);
    }

    autoTable(doc, {
      startY: 40,
      head: [["Data", "Tipo", "Hora", "Observação", "Total dia"]],
      body,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [23, 21, 31], textColor: [255, 210, 63] },
      didParseCell: (data) => {
        if (
          data.section === "body" &&
          String((data.row.raw as string[])[1]).startsWith("Total do dia")
        ) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [255, 210, 63];
        }
      },
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY;
    doc.setFontSize(13);
    doc.text(`Total do mês: ${toHHMM(monthMinutes)} (HH:MM)`, 14, finalY + 12);
    doc.text(`Equivalente decimal: ${toDecimal(monthMinutes)} horas`, 14, finalY + 20);

    doc.save(`relatorio-ponto-${month}.pdf`);
  }, [groupedDays, month, monthMinutes]);

  /* --------------------------- Render --------------------------- */

  if (!authReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper text-ink">
        <p className="text-lg font-bold">Carregando…</p>
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  const nowDate = now === null ? null : new Date(now);
  const todayChip = nowDate
    ? nowDate
        .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
        .replace(".", "")
    : "";

  return (
    <div className="min-h-screen bg-paper text-ink selection:bg-lemon selection:text-ink">
      {/* Header */}
      <header className="mx-auto max-w-5xl px-5 pt-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-ink text-xl font-bold text-lemon">
              ⏱
            </div>
            <div>
              <p className="text-lg leading-none font-bold tracking-tight">PontoFácil</p>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink/40">
                {session.user.email ?? "minha conta"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {nowDate && (
              <div className="flex items-center gap-2 rounded-full bg-mint px-4 py-2 text-sm font-bold text-ink shadow-punch-sm">
                <span className="size-2 animate-pulse rounded-full bg-ink"></span>
                Ao vivo ·{" "}
                {nowDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
            <button
              onClick={signOut}
              className="cursor-pointer rounded-full border-2 border-ink bg-paper px-4 py-2 text-sm font-bold shadow-punch-sm transition active:translate-x-0.5 active:translate-y-0.5"
            >
              Sair
            </button>
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
          Um clique, um registro — salvo na sua conta, com observação e ponto retroativo.
        </p>
      </section>

      {/* Botão principal */}
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
        <button
          onClick={() => {
            setRetroOpen(true);
            setRetroError(null);
            if (!retroDate) setRetroDate(todayInputValue());
          }}
          className="mt-4 w-full cursor-pointer rounded-2xl border-2 border-ink bg-lilac px-6 py-4 text-lg font-bold shadow-punch transition active:translate-x-1 active:translate-y-1"
        >
          🗓 Registrar ponto retroativo
        </button>
      </section>

      {/* Totalizadores do mês */}
      <section className="mx-auto max-w-5xl px-5 pt-10 sm:px-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">{monthLabel}</h2>
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

      {/* Tabela de registros */}
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

        {loading ? (
          <div className="rounded-3xl border-2 border-dashed border-ink/30 p-10 text-center">
            <p className="text-lg font-bold">Carregando registros…</p>
          </div>
        ) : groupedDays.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-ink/30 p-10 text-center">
            <p className="text-lg font-bold">Nenhum registro neste mês</p>
            <p className="mt-1 text-sm font-medium text-ink/50">
              Bata o ponto acima ou registre um ponto retroativo.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border-2 border-ink shadow-punch">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-ink px-5 py-3 text-[11px] font-bold uppercase tracking-[0.15em] text-lemon sm:grid-cols-[1.4fr_1fr_1fr_auto]">
              <span>Tipo</span>
              <span>Hora</span>
              <span className="hidden sm:block">Dia</span>
              <span className="text-right">Ações</span>
            </div>

            {groupedDays.map((day, di) => (
              <div key={day.dayKey}>
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
                    className="border-t-2 border-ink/10 px-5 py-4"
                  >
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                      <span className="flex items-center gap-2 font-semibold">
                        <span
                          className={`size-2.5 rounded-full ${TYPE_META[r.type].dot}`}
                        ></span>
                        {TYPE_META[r.type].label}
                        {r.retroactive && (
                          <span className="rounded-full bg-lilac px-2 py-0.5 text-[10px] font-bold uppercase">
                            retroativo
                          </span>
                        )}
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
                    {r.note && (
                      <p className="mt-1 text-sm font-medium text-ink/60">📝 {r.note}</p>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-center text-xs font-medium text-ink/40">
          registros salvos com segurança na sua conta
        </p>
      </section>

      {/* Modal: ponto atual (tipo + observação) */}
      {pendingPunch !== null && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/50 p-4"
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
                  onClick={() => setPendingType(type)}
                  className={`cursor-pointer rounded-2xl border-2 px-4 py-5 text-left shadow-punch-sm transition active:translate-x-1 active:translate-y-1 ${
                    pendingType === type ? "border-ink ring-4 ring-ink/20" : "border-ink"
                  } ${TYPE_META[type].chip}`}
                >
                  <span className="text-2xl">{TYPE_META[type].emoji}</span>
                  <span className="mt-2 block text-lg font-bold leading-tight">
                    {TYPE_META[type].label}
                  </span>
                </button>
              ))}
            </div>

            <label className="mt-5 block text-xs font-bold uppercase tracking-[0.15em] text-ink/50">
              Observação (opcional)
            </label>
            <textarea
              value={pendingNote}
              onChange={(e) => setPendingNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Ex.: saída antecipada para consulta médica"
              className="mt-1 w-full rounded-2xl border-2 border-ink bg-paper px-4 py-3 font-medium outline-none focus:shadow-punch-sm"
            />

            <button
              onClick={() => pendingType && void savePunch(pendingType)}
              disabled={!pendingType}
              className="mt-4 w-full cursor-pointer rounded-2xl bg-ink py-3 text-lg font-bold text-lemon shadow-punch transition active:translate-x-1 active:translate-y-1 disabled:opacity-40"
            >
              Salvar registro
            </button>
            <button
              onClick={() => setPendingPunch(null)}
              className="mt-3 w-full cursor-pointer rounded-full border-2 border-ink/20 py-2 text-sm font-bold text-ink/50 transition hover:border-ink hover:text-ink"
            >
              Cancelar (descarta este registro)
            </button>
          </div>
        </div>
      )}

      {/* Modal: ponto retroativo (data + hora + período + observação) */}
      {retroOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/50 p-4"
          onClick={() => setRetroOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border-2 border-ink bg-paper p-6 shadow-punch-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold">Ponto retroativo</h2>
            <p className="text-sm font-medium text-ink/50">
              informe a data, a hora e o período do registro
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.15em] text-ink/50">
                  Data
                </label>
                <input
                  type="date"
                  value={retroDate}
                  onChange={(e) => setRetroDate(e.target.value)}
                  className="mt-1 w-full rounded-2xl border-2 border-ink bg-paper px-4 py-3 font-medium outline-none focus:shadow-punch-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.15em] text-ink/50">
                  Hora
                </label>
                <input
                  type="time"
                  value={retroTime}
                  onChange={(e) => setRetroTime(e.target.value)}
                  className="mt-1 w-full rounded-2xl border-2 border-ink bg-paper px-4 py-3 font-mono font-bold outline-none focus:shadow-punch-sm"
                />
              </div>
            </div>

            <label className="mt-4 block text-xs font-bold uppercase tracking-[0.15em] text-ink/50">
              Período
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(TYPE_META) as PunchType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setRetroType(type)}
                  className={`cursor-pointer rounded-2xl border-2 border-ink px-3 py-3 text-sm font-bold shadow-punch-sm transition active:translate-x-0.5 active:translate-y-0.5 ${
                    retroType === type ? TYPE_META[type].chip : "bg-paper text-ink"
                  }`}
                >
                  {TYPE_META[type].label}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-xs font-bold uppercase tracking-[0.15em] text-ink/50">
              Observação (opcional)
            </label>
            <textarea
              value={retroNote}
              onChange={(e) => setRetroNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Ex.: esqueci de bater na hora"
              className="mt-1 w-full rounded-2xl border-2 border-ink bg-paper px-4 py-3 font-medium outline-none focus:shadow-punch-sm"
            />

            {retroError && <p className="mt-3 text-sm font-bold text-coral">{retroError}</p>}

            <button
              onClick={() => void saveRetro()}
              className="mt-4 w-full cursor-pointer rounded-2xl bg-ink py-3 text-lg font-bold text-lemon shadow-punch transition active:translate-x-1 active:translate-y-1"
            >
              Salvar ponto retroativo
            </button>
            <button
              onClick={() => setRetroOpen(false)}
              className="mt-3 w-full cursor-pointer rounded-full border-2 border-ink/20 py-2 text-sm font-bold text-ink/50 transition hover:border-ink hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
