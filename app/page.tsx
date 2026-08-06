"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

interface Delegation {
  id: string;
  name: string;
  flag: string;
  zone: "left" | "bottom" | "right";
  display_order: number;
}

interface UserSession {
  username: string;
  role: "admin" | "mesa" | "coordinacion";
}

interface Participation {
  id: string;
  delegation_id: string;
  user_role: string;
  context: string;
  base_score: number;
  role_weight: number;
  context_multiplier: number;
  has_bonus: boolean;
  observation?: string | null;
  created_at: string;
  day: number;
}

interface VoteSession {
  id: string;
  title: string;
  type: "simple" | "cualificada";
  status: "activa" | "cerrada";
  day: number;
  created_at: string;
}

interface VoteRecord {
  id?: string;
  session_id: string;
  delegation_id: string;
  vote: "favor" | "contra" | "abstencion";
}


const OFFICIAL_DELEGATIONS: Delegation[] = [
  { id: "1", name: "Bahrein", flag: "🇧🇭", zone: "left", display_order: 1 },
  { id: "2", name: "China", flag: "🇨🇳", zone: "left", display_order: 2 },
  { id: "3", name: "Colombia", flag: "🇨🇴", zone: "left", display_order: 3 },
  { id: "4", name: "Dinamarca", flag: "🇩🇰", zone: "left", display_order: 4 },
  { id: "5", name: "Estados Unidos", flag: "🇺🇸", zone: "left", display_order: 5 },
  { id: "6", name: "Federación Rusa", flag: "🇷🇺", zone: "left", display_order: 6 },
  { id: "7", name: "Francia", flag: "🇫🇷", zone: "bottom", display_order: 7 },
  { id: "8", name: "Grecia", flag: "🇬🇷", zone: "bottom", display_order: 8 },
  { id: "9", name: "Letonia", flag: "🇱🇻", zone: "bottom", display_order: 9 },
  { id: "10", name: "Liberia", flag: "🇱🇷", zone: "right", display_order: 10 },
  { id: "11", name: "Panamá", flag: "🇵🇦", zone: "right", display_order: 11 },
  { id: "12", name: "Pakistán", flag: "🇵🇰", zone: "right", display_order: 12 },
  { id: "13", name: "Reino Unido", flag: "🇬🇧", zone: "right", display_order: 13 },
  { id: "14", name: "República Democrática del Congo", flag: "🇨🇩", zone: "right", display_order: 14 },
  { id: "15", name: "Somalia", flag: "🇸🇴", zone: "right", display_order: 15 },
];

const CHART_COLORS = [
  "#a12843", "#69acaf", "#d1c54c", "#39fc60", "#f43f5e",
  "#38bdf8", "#a855f7", "#fb923c", "#4ade80", "#e879f9",
  "#2dd4bf", "#facc15", "#fb7185", "#818cf8", "#34d399"
];

const CONTEXT_OPTIONS = [
  "Discurso normal",
  "Derecho a réplica",
  "Moción",
  "Resolución",
  "Cuarto intermedio",
  "Tópico sorpresa",
  "Sesión oficial",
];

const CONTEXT_MULTIPLIERS: Record<string, number> = {
  "Discurso normal": 1.0,
  "Derecho a réplica": 1.1,
  Moción: 0.8,
  Resolución: 1.5,
  "Cuarto intermedio": 0.9,
  "Tópico sorpresa": 1.6,
  "Sesión oficial": 1.2,
};

const ROLE_WEIGHTS: Record<string, number> = {
  admin: 1.0,
  coordinacion: 0.75,
  mesa: 0.25,
};

export default function MUNApp() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [delegations, setDelegations] = useState<Delegation[]>(OFFICIAL_DELEGATIONS);
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [selectedDelegation, setSelectedDelegation] = useState<Delegation | null>(null);
  const [score, setScore] = useState<number>(7);
  const [context, setContext] = useState<string>("Discurso normal");
  const [observation, setObservation] = useState<string>("");
  const [currentDay, setCurrentDay] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"sala" | "ranking" | "historial" | "votacion">("sala");
  const [milestoneTitle, setMilestoneTitle] = useState("");

  // Sesión activa y lista de votos de la sesión actual
  const [activeVoteSession, setActiveVoteSession] = useState<VoteSession | null>(null);
  const [currentVotes, setCurrentVotes] = useState<Record<string, "favor" | "contra" | "abstencion">>({});

  // Formulario para crear votación
  const [newVoteTitle, setNewVoteTitle] = useState("");
  const [newVoteType, setNewVoteType] = useState<"simple" | "cualificada">("simple");

  // Banner de feedback (reemplazo de alert)
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pastSessions, setPastSessions] = useState<any[]>([]);

  const showFeedback = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Edición / Eliminación
  const [editingParticipation, setEditingParticipation] = useState<Participation | null>(null);
  const [editScore, setEditScore] = useState<number>(7);
  const [editContext, setEditContext] = useState<string>("Discurso normal");
  const [editObservation, setEditObservation] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filtros
  const [filterDelegation, setFilterDelegation] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");

  // Países visibles en las gráficas
  const [selectedChartCountries, setSelectedChartCountries] = useState<string[]>(
    OFFICIAL_DELEGATIONS.slice(0, 5).map((d) => d.id)
  );

  // Ordenamiento del Ranking
  const [sortColumn, setSortColumn] = useState<"count" | "avg" | "totalScore">("totalScore");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (column: "count" | "avg" | "totalScore") => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  useEffect(() => {
    async function fetchData() {
      const { data: delData } = await supabase
        .from("delegations")
        .select("*")
        .order("display_order", { ascending: true });

      if (delData && delData.length > 0) {
        setDelegations(delData);
      }

      const { data: partData } = await supabase
        .from("participations")
        .select("*")
        .order("created_at", { ascending: false });
      if (partData) setParticipations(partData);
    }
    fetchData();
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", usernameInput.trim())
      .eq("password", passwordInput.trim())
      .single();

    if (error || !data) {
      if (usernameInput === "admin" && passwordInput === "admin26") {
        setUser({ username: "admin", role: "admin" });
      } else if (usernameInput === "mesa" && passwordInput === "mesacs") {
        setUser({ username: "mesa", role: "mesa" });
      } else if (usernameInput === "observador" && passwordInput === "voluntariocs") {
        setUser({ username: "observador", role: "coordinacion" });
      } else {
        setLoginError("Usuario o contraseña incorrectos");
      }
    } else {
      setUser({ username: data.username, role: data.role as any });
    }
  };

  const handleCreateSession = async () => {
    if (!newVoteTitle.trim()) return;

    const { data, error } = await supabase
      .from("vote_sessions")
      .insert([{ title: newVoteTitle, type: newVoteType, day: currentDay, status: "activa" }])
      .select()
      .single();

    if (!error && data) {
      setActiveVoteSession(data);
      setCurrentVotes({});
      setNewVoteTitle("");
      showFeedback("✅ Votación iniciada exitosamente");
    }
  };

  const handleQuickVote = async (delegationId: string, voteType: "favor" | "contra" | "abstencion") => {
    if (!activeVoteSession) return;

    // Actualización optimista en interfaz (para que responda al instante)
    setCurrentVotes((prev) => ({ ...prev, [delegationId]: voteType }));

    const { error } = await supabase.from("votes").upsert(
      [
        {
          session_id: activeVoteSession.id,
          delegation_id: delegationId,
          vote: voteType,
        },
      ],
      { onConflict: "session_id,delegation_id" }
    );

    if (error) {
      showFeedback("❌ Error al guardar voto");
    }
  };

  const handleCloseSession = async () => {
    if (!activeVoteSession) return;

    await supabase
      .from("vote_sessions")
      .update({ status: "cerrada" })
      .eq("id", activeVoteSession.id);

    setActiveVoteSession(null);
    setCurrentVotes({});
    showFeedback("🔒 Votación finalizada");
    
    // Recargamos el historial
    fetchPastSessions();
  };

  const handleDeleteSession = async (sessionId: string) => {
    // Eliminamos la sesión (gracias al 'on delete cascade' de la BBDD, los votos asociados se borran solos)
    const { error } = await supabase
      .from("vote_sessions")
      .delete()
      .eq("id", sessionId);

    if (!error) {
      showFeedback("🗑️ Votación eliminada");
      fetchPastSessions();
    } else {
      showFeedback("❌ Error al eliminar votación");
    }
  };

  const fetchPastSessions = async () => {
    // Traemos las sesiones cerradas con sus votos asociados
    const { data, error } = await supabase
      .from("vote_sessions")
      .select(`
        *,
        votes (*)
      `)
      .eq("status", "cerrada")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setPastSessions(data);
    }
  };

  // Cargar historial al montar el componente o cuando cambie activeTab a 'votacion'
  useEffect(() => {
    if (activeTab === "votacion") {
      fetchPastSessions();
    }
  }, [activeTab, activeVoteSession]);

  const handleSave = async () => {
    if (!selectedDelegation || !user) return;
    setLoading(true);

    const contextMultiplier = CONTEXT_MULTIPLIERS[context] || 1.0;
    const roleWeight = ROLE_WEIGHTS[user.role] || 0.25;

    const newRecord = {
      delegation_id: selectedDelegation.id,
      user_role: user.role,
      context,
      base_score: score,
      role_weight: roleWeight,
      context_multiplier: contextMultiplier,
      has_bonus: false,
      observation: observation || null,
      day: currentDay,
    };

    const { data, error } = await supabase
      .from("participations")
      .insert([newRecord])
      .select();

    if (!error && data) {
      setParticipations((prev) => [data[0], ...prev]);
    }

    setLoading(false);
    setSelectedDelegation(null);
    setObservation("");
    setScore(7);
  };

  const handleUpdate = async () => {
    if (!editingParticipation) return;
    setLoading(true);

    const contextMultiplier = CONTEXT_MULTIPLIERS[editContext] || 1.0;

    const updatedData = {
      context: editContext,
      base_score: editScore,
      context_multiplier: contextMultiplier,
      observation: editObservation || null,
    };

    const { error } = await supabase
      .from("participations")
      .update(updatedData)
      .eq("id", editingParticipation.id);

    if (!error) {
      setParticipations((prev) =>
        prev.map((p) =>
          p.id === editingParticipation.id ? { ...p, ...updatedData } : p
        )
      );
    }

    setLoading(false);
    setEditingParticipation(null);
  };

  const confirmDelete = async () => {
    if (!deletingId || user?.role !== "admin") return;
    setLoading(true);

    const { error } = await supabase
      .from("participations")
      .delete()
      .eq("id", deletingId);

    if (!error) {
      setParticipations((prev) => prev.filter((p) => p.id !== deletingId));
    } else {
      alert("Ocurrió un error al intentar eliminar el registro.");
    }

    setLoading(false);
    setDeletingId(null);
  };

  const toggleBonus = async (partId: string, currentStatus: boolean) => {
    if (user?.role !== "admin") return;

    const { error } = await supabase
      .from("participations")
      .update({ has_bonus: !currentStatus })
      .eq("id", partId);

    if (!error) {
      setParticipations((prev) =>
        prev.map((p) => (p.id === partId ? { ...p, has_bonus: !currentStatus } : p))
      );
    }
  };

  const createMilestone = async () => {
    if (!milestoneTitle.trim() || user?.role !== "admin") return;

    await supabase.from("milestones").insert([
      { title: milestoneTitle, snapshot: rankingData },
    ]);

    alert("Hito guardado con éxito");
    setMilestoneTitle("");
  };

  const exportCSV = () => {
    let csv = "Delegación,Score Total,Intervenciones,Promedio\n";
    rankingData.forEach((row) => {
      csv += `"${row.name}",${row.totalScore.toFixed(2)},${row.count},${row.avg.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "ranking_consejo_seguridad.csv";
    link.click();
  };

  const rankingData = delegations
    .map((del) => {
      const delParts = participations.filter((p) => p.delegation_id === del.id);
      const totalScore = delParts.reduce((acc, p) => {
        const bonus = p.has_bonus ? 1.5 : 1.0;
        return acc + p.base_score * p.context_multiplier * bonus * p.role_weight;
      }, 0);

      const count = delParts.length;
      const avg = count > 0 ? totalScore / count : 0;

      return { ...del, totalScore, count, avg };
    })
    .sort((a, b) => {
      const multiplier = sortDirection === "asc" ? 1 : -1;
      return (a[sortColumn] - b[sortColumn]) * multiplier;
    });

  const chartDays = [1, 2, 3];
  const chartData = chartDays.map((d) => {
    const row: Record<string, any> = { dayLabel: `Día ${d}` };

    delegations.forEach((del) => {
      if (selectedChartCountries.includes(del.id)) {
        const partsUntilDay = participations.filter(
          (p) => p.delegation_id === del.id && (p.day || 1) <= d
        );

        const dayScore = partsUntilDay.reduce((acc, p) => {
          const bonus = p.has_bonus ? 1.5 : 1.0;
          return acc + p.base_score * p.context_multiplier * bonus * p.role_weight;
        }, 0);

        row[del.name] = Number(dayScore.toFixed(2));
      }
    });

    return row;
  });

  const maxInterventions = Math.max(...rankingData.map((r) => r.count), 1);
  const maxTotalScore = Math.max(...rankingData.map((r) => r.totalScore), 1);
  const maxAvg = Math.max(...rankingData.map((r) => r.avg), 10);

  const radarCategories = ["Intervenciones", "Puntos Totales", "Promedio"];
  const radarData = radarCategories.map((category) => {
    const item: Record<string, any> = { metric: category };
    rankingData.forEach((del) => {
      if (selectedChartCountries.includes(del.id)) {
        if (category === "Intervenciones") {
          item[del.name] = Number(((del.count / maxInterventions) * 100).toFixed(1));
        } else if (category === "Puntos Totales") {
          item[del.name] = Number(((del.totalScore / maxTotalScore) * 100).toFixed(1));
        } else if (category === "Promedio") {
          item[del.name] = Number(((del.avg / maxAvg) * 100).toFixed(1));
        }
      }
    });
    return item;
  });

  const toggleCountryChart = (id: string) => {
    setSelectedChartCountries((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const filteredParticipations = participations.filter((p) => {
    if (user?.role !== "admin" && p.user_role !== user?.role) {
      return false;
    }
    const matchDel = filterDelegation === "all" || p.delegation_id === filterDelegation;
    const matchRole = filterRole === "all" || p.user_role === filterRole;
    return matchDel && matchRole;
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b0f17] text-white flex items-center justify-center p-4">
        <div className="bg-[#131926] border border-[#1e293b] rounded-2xl p-8 w-full max-w-sm shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#a12843]" />
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-white tracking-tight">
              UM <span className="text-[#a12843]">Consejo de Seguridad</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">Ingresá tus credenciales de acceso</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Usuario</label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="ej: mesa, admin"
                className="w-full bg-[#1b2436] border border-[#2d3a52] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#a12843] transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Contraseña</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#1b2436] border border-[#2d3a52] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#a12843] transition-colors"
                required
              />
            </div>

            {loginError && <p className="text-rose-400 text-xs font-medium text-center">{loginError}</p>}

            <button
              type="submit"
              className="w-full bg-[#a12843] hover:bg-[#851e34] text-white py-3 rounded-lg text-sm font-bold tracking-wide transition-all active:scale-98 shadow-lg shadow-[#a12843]/20"
            >
              Ingresar al Sistema
            </button>
          </form>
        </div>
      </div>
    );
  }

  const leftZone = delegations.filter((d) => d.zone === "left");
  const bottomZone = delegations.filter((d) => d.zone === "bottom");
  const rightZone = delegations.filter((d) => d.zone === "right");

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white p-4 pb-20">
      {/* Header Navegación */}
      <div className="max-w-4xl mx-auto flex flex-wrap justify-between items-center mb-6 bg-[#131926] p-3.5 rounded-2xl border border-[#1e293b] gap-3 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-8 bg-[#a12843] rounded-full" />
          <div>
            <h1 className="text-base font-black text-white leading-tight">Consejo de Seguridad</h1>
            <p className="text-[11px] text-[#69acaf] font-medium">Sistema de Evaluación</p>
          </div>
        </div>

        <div className="flex bg-[#0b0f17] p-1 rounded-xl border border-[#1e293b] gap-1">
          <button
            onClick={() => setActiveTab("sala")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "sala"
                ? "bg-[#a12843] text-white shadow-md shadow-[#a12843]/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Órgano
          </button>

          {user.role === "admin" && (
            <button
              onClick={() => setActiveTab("ranking")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "ranking"
                  ? "bg-[#a12843] text-white shadow-md shadow-[#a12843]/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🏆 Ranking & Gráficas
            </button>
          )}

          <button
            onClick={() => setActiveTab("votacion")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "votacion"
                ? "bg-[#a12843] text-white shadow-md shadow-[#a12843]/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            🗳️ Votación Rápida
          </button>

          <button
            onClick={() => setActiveTab("historial")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "historial"
                ? "bg-[#a12843] text-white shadow-md shadow-[#a12843]/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            📜 Historial
          </button>
        </div>

        <div className="flex items-center gap-2 bg-[#1b2436] px-3 py-1.5 rounded-xl border border-[#2d3a52]">
          <span className="text-xs text-slate-300 font-medium">Jornada:</span>
          <select
            value={currentDay}
            disabled={user.role !== "admin"}
            onChange={(e) => setCurrentDay(Number(e.target.value))}
            className={`bg-transparent text-[#69acaf] text-xs font-bold focus:outline-none ${
              user.role === "admin" ? "cursor-pointer" : "cursor-not-allowed opacity-75"
            }`}
          >
            <option value={1} className="bg-[#131926] text-white">Día 1</option>
            <option value={2} className="bg-[#131926] text-white">Día 2</option>
            <option value={3} className="bg-[#131926] text-white">Día 3</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs bg-[#1b2436] text-[#d1c54c] font-semibold px-3 py-1.5 rounded-xl border border-[#2d3a52] capitalize">
            👤 {user.username}
          </span>
          <button onClick={() => setUser(null)} className="text-xs text-rose-400 hover:underline font-medium">
            Salir
          </button>
        </div>
      </div>

     {/* VISTA 1: SALA EN U */}
    {activeTab === "sala" && (
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {/* Columna Izquierda: Ahora muestra las delegaciones del área derecha */}
          <div className="flex flex-col gap-2">
            {rightZone.reverse().map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDelegation(d)}
                className="p-3 bg-[#131926] border border-[#1e293b] rounded-xl hover:border-[#69acaf] hover:bg-[#1b2436] text-left flex items-center justify-between active:scale-95 transition-all shadow-md group"
              >
                <span className="font-bold text-xs sm:text-sm text-slate-200 group-hover:text-white">
                  {d.name}
                </span>
                <span className="text-2xl">{d.flag}</span>
              </button>
            ))}
          </div>

          {/* Centro: Mesa de Presidencia */}
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-[#1e293b] rounded-2xl bg-[#131926]/40 p-4 text-center text-slate-400 text-xs font-semibold">
            <span className="text-slate-300">🏛️ MESA DE PRESIDENCIA</span>
            <span className="text-[11px] text-[#69acaf] font-bold mt-2 bg-[#69acaf]/10 px-2.5 py-1 rounded-full border border-[#69acaf]/30">
              Evaluando en Jornada {currentDay}
            </span>
          </div>

          {/* Columna Derecha: Ahora muestra las delegaciones de la izquierda (iniciando con Bahrein) */}
          <div className="flex flex-col gap-2">
            {leftZone.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDelegation(d)}
                className="p-3 bg-[#131926] border border-[#1e293b] rounded-xl hover:border-[#69acaf] hover:bg-[#1b2436] text-left flex items-center justify-between active:scale-95 transition-all shadow-md group"
              >
                <span className="font-bold text-xs sm:text-sm text-slate-200 group-hover:text-white">
                  {d.name}
                </span>
                <span className="text-2xl">{d.flag}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Fila Inferior: Orden invertido */}
        <div className="max-w-md mx-auto grid grid-cols-3 gap-2">
          {[...bottomZone].reverse().map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDelegation(d)}
              className="p-3 bg-[#131926] border border-[#1e293b] rounded-xl hover:border-[#69acaf] hover:bg-[#1b2436] text-center flex flex-col items-center justify-center active:scale-95 transition-all shadow-md group"
            >
              <span className="text-2xl mb-1">{d.flag}</span>
              <span className="font-bold text-xs text-slate-200 group-hover:text-white">{d.name}</span>
            </button>
          ))}
        </div>
      </div>
    )}

      {/* VISTA 2: RANKING & GRÁFICAS */}
      {activeTab === "ranking" && user.role === "admin" && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex justify-between items-center bg-[#131926] p-4 rounded-2xl border border-[#1e293b]">
            <div>
              <h2 className="text-lg font-black text-white">🏆 Ranking General en Tiempo Real</h2>
              <p className="text-xs text-slate-400">Puntajes acumulados, intervenciones y promedios por delegación</p>
            </div>
            <button
              onClick={exportCSV}
              className="px-4 py-2 bg-[#39fc60] hover:bg-[#2ee053] text-[#0b0f17] font-black rounded-xl text-xs transition-all shadow-lg shadow-[#39fc60]/10"
            >
              📥 Exportar CSV
            </button>
          </div>

          <div className="bg-[#131926] p-4 rounded-2xl border border-[#1e293b] flex gap-2">
            <input
              type="text"
              placeholder="Título del Hito Snapshot (ej: Fin Día 1)..."
              value={milestoneTitle}
              onChange={(e) => setMilestoneTitle(e.target.value)}
              className="flex-1 bg-[#1b2436] border border-[#2d3a52] rounded-xl p-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#a12843]"
            />
            <button
              onClick={createMilestone}
              className="px-4 py-2 bg-[#a12843] hover:bg-[#851e34] text-white rounded-xl text-xs font-bold transition-all"
            >
              📸 Guardar Hito
            </button>
          </div>

          <div className="bg-[#131926] rounded-2xl border border-[#1e293b] overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#1b2436] text-slate-300 font-bold border-b border-[#1e293b]">
                <tr>
                  <th className="p-3.5 w-12 text-center text-slate-500">#</th>
                  <th className="p-3.5">Delegación</th>
                  <th className="p-3.5 cursor-pointer select-none hover:text-[#69acaf]" onClick={() => handleSort("count")}>
                    Intervenciones {sortColumn === "count" ? (sortDirection === "desc" ? "▼" : "▲") : "↕"}
                  </th>
                  <th className="p-3.5 cursor-pointer select-none hover:text-[#69acaf]" onClick={() => handleSort("avg")}>
                    Promedio {sortColumn === "avg" ? (sortDirection === "desc" ? "▼" : "▲") : "↕"}
                  </th>
                  <th className="p-3.5 text-right cursor-pointer select-none hover:text-[#39fc60]" onClick={() => handleSort("totalScore")}>
                    Score Total {sortColumn === "totalScore" ? (sortDirection === "desc" ? "▼" : "▲") : "↕"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b]">
                {rankingData.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-[#1b2436]/70 transition-colors">
                    <td className="p-3.5 text-center font-black text-slate-400">{idx + 1}</td>
                    <td className="p-3.5 font-bold flex items-center gap-2 text-white">
                      <span className="text-lg">{item.flag}</span> {item.name}
                    </td>
                    <td className={`p-3.5 font-semibold ${sortColumn === "count" ? "text-[#69acaf] font-black" : "text-slate-300"}`}>
                      {item.count}
                    </td>
                    <td className={`p-3.5 font-semibold ${sortColumn === "avg" ? "text-[#69acaf] font-black" : "text-slate-300"}`}>
                      {item.avg.toFixed(2)}
                    </td>
                    <td className={`p-3.5 text-right font-black text-sm ${sortColumn === "totalScore" ? "text-[#39fc60]" : "text-slate-200"}`}>
                      {item.totalScore.toFixed(2)} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-[#131926] rounded-2xl border border-[#1e293b] space-y-2">
            <span className="text-xs text-slate-300 font-bold block">
              🌐 Seleccioná los países a comparar en las gráficas:
            </span>
            <div className="flex flex-wrap gap-1.5 p-2 bg-[#0b0f17] rounded-xl border border-[#1e293b] max-h-32 overflow-y-auto">
              {delegations.map((d, idx) => {
                const isSelected = selectedChartCountries.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => toggleCountryChart(d.id)}
                    style={{ borderColor: isSelected ? CHART_COLORS[idx % CHART_COLORS.length] : undefined }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 transition-all ${
                      isSelected
                        ? "bg-[#1b2436] text-white"
                        : "bg-[#131926]/50 text-slate-500 border-[#1e293b] hover:text-slate-300"
                    }`}
                  >
                    <span>{d.flag}</span>
                    <span>{d.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-[#131926] p-5 rounded-2xl border border-[#1e293b] space-y-4">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#39fc60]" />
              🕸️ Comparativa Multidimensional (Intervenciones vs Puntos Totales vs Promedio)
            </h3>
            <p className="text-xs text-slate-400">Valores normalizados (0-100%) para la métrica máxima alcanzada.</p>

            <div className="h-80 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                  <PolarGrid stroke="#1e293b" />
                  <PolarAngleAxis dataKey="metric" stroke="#94a3b8" fontSize={12} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#475569" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#131926",
                      borderColor: "#2d3a52",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "#fff",
                    }}
                    formatter={(value: any) => [`${value}%`, "Desempeño relativo"]}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                  {delegations.map((d, idx) => {
                    if (!selectedChartCountries.includes(d.id)) return null;
                    const color = CHART_COLORS[idx % CHART_COLORS.length];
                    return (
                      <Radar
                        key={d.id}
                        name={d.name}
                        dataKey={d.name}
                        stroke={color}
                        fill={color}
                        fillOpacity={0.2}
                      />
                    );
                  })}
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[#131926] p-5 rounded-2xl border border-[#1e293b] space-y-4">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#69acaf]" />
              📈 Progresión Diaria del Debate (Día 1 vs Día 2 vs Día 3)
            </h3>

            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="dayLabel" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#131926",
                      borderColor: "#2d3a52",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "#fff",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                  {delegations.map((d, idx) => {
                    if (!selectedChartCountries.includes(d.id)) return null;
                    return (
                      <Line
                        key={d.id}
                        type="monotone"
                        dataKey={d.name}
                        stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* VISTA 3: HISTORIAL */}
      {activeTab === "historial" && (
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3 bg-[#131926] p-4 rounded-2xl border border-[#1e293b]">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                📜 Historial de Intervenciones
              </h2>
              <p className="text-xs text-slate-400">
                Registrados {filteredParticipations.length} evento(s)
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={filterDelegation}
                onChange={(e) => setFilterDelegation(e.target.value)}
                className="bg-[#1b2436] border border-[#2d3a52] rounded-xl p-2 text-xs text-white focus:outline-none"
              >
                <option value="all">🌐 Todas las Delegaciones</option>
                {delegations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.flag} {d.name}
                  </option>
                ))}
              </select>

              {user.role === "admin" && (
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="bg-[#1b2436] border border-[#2d3a52] rounded-xl p-2 text-xs text-white focus:outline-none"
                >
                  <option value="all">👤 Todos los Evaluadores</option>
                  <option value="admin">Admin</option>
                  <option value="coordinacion">Coordinación</option>
                  <option value="mesa">Mesa</option>
                </select>
              )}
            </div>
          </div>

          <div className="bg-[#131926] rounded-2xl border border-[#1e293b] overflow-hidden shadow-xl">
            {filteredParticipations.length === 0 ? (
              <div className="text-center p-8 text-slate-500 text-xs font-semibold">
                No hay intervenciones registradas para el filtro seleccionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1b2436]/80 text-slate-300 font-bold border-b border-[#1e293b]">
                    <tr>
                      <th className="p-3.5">Jornada</th>
                      <th className="p-3.5">Delegación</th>
                      <th className="p-3.5">Contexto</th>
                      <th className="p-3.5 text-center">Nota Base</th>
                      <th className="p-3.5">Evaluador</th>
                      <th className="p-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e293b]">
                    {filteredParticipations.map((p) => {
                      const del = delegations.find((d) => d.id === p.delegation_id);
                      const isOwner = p.user_role === user.role;
                      const canEdit = user.role === "admin" || isOwner;

                      return (
                        <tr key={p.id} className="hover:bg-[#1b2436]/50 transition-colors">
                          <td className="p-3.5 font-bold text-[#69acaf] whitespace-nowrap">
                            Día {p.day || 1}
                          </td>
                          <td className="p-3.5 font-bold text-white whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{del?.flag}</span>
                              <span>{del?.name}</span>
                              {p.has_bonus && (
                                <span className="text-[10px] bg-[#d1c54c]/20 text-[#d1c54c] border border-[#d1c54c]/40 font-bold px-1.5 py-0.5 rounded">
                                  ⭐
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-300">
                            <div>{p.context}</div>
                            {p.observation && (
                              <div className="text-[11px] text-slate-400 italic mt-0.5">
                                "{p.observation}"
                              </div>
                            )}
                          </td>
                          <td className="p-3.5 text-center font-black text-white whitespace-nowrap">
                            <span className="text-sm">{p.base_score}</span>
                            <span className="text-slate-500 font-normal text-xs"> / 10</span>
                          </td>
                          <td className="p-3.5 text-slate-300 capitalize whitespace-nowrap">
                            {p.user_role}
                          </td>
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {user.role === "admin" && (
                                <button
                                  onClick={() => toggleBonus(p.id, p.has_bonus)}
                                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                                    p.has_bonus
                                      ? "bg-[#d1c54c] text-[#0b0f17] border-[#d1c54c]"
                                      : "bg-[#1b2436] text-slate-400 border-[#2d3a52] hover:text-white"
                                  }`}
                                >
                                  ⭐
                                </button>
                              )}

                              {canEdit && (
                                <button
                                  onClick={() => {
                                    setEditingParticipation(p);
                                    setEditScore(p.base_score);
                                    setEditContext(p.context);
                                    setEditObservation(p.observation || "");
                                  }}
                                  className="text-[#69acaf] hover:underline font-semibold text-xs"
                                >
                                  Editar
                                </button>
                              )}

                              {user.role === "admin" && (
                                <button
                                  onClick={() => setDeletingId(p.id)}
                                  className="text-rose-400 hover:underline font-semibold text-xs ml-1"
                                >
                                  Eliminar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VISTA 4: VOTACIÓN RÁPIDA */}
      {activeTab === "votacion" && (
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Banner de Feedback (Sustituto de alert) */}
          {statusMessage && (
            <div className="bg-[#a12843]/20 border border-[#a12843] text-white px-4 py-2 rounded-xl text-xs font-bold text-center">
              {statusMessage}
            </div>
          )}

          {/* Panel de Control: Crear o Finalizar Votación */}
          {!activeVoteSession ? (
            <div className="bg-[#131926] p-4 rounded-2xl border border-[#1e293b] space-y-3">
              <h3 className="text-sm font-black text-white">Iniciar Nueva Sesión de Votación</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Título o Moción (ej: Moción de Resolución 1.1)..."
                  value={newVoteTitle}
                  onChange={(e) => setNewVoteTitle(e.target.value)}
                  className="flex-1 bg-[#1b2436] border border-[#2d3a52] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#a12843]"
                />
                <select
                  value={newVoteType}
                  onChange={(e: any) => setNewVoteType(e.target.value)}
                  className="bg-[#1b2436] border border-[#2d3a52] rounded-xl p-2.5 text-xs text-white focus:outline-none"
                >
                  <option value="simple">Forma</option>
                  <option value="cualificada">Fondo</option>
                </select>
                <button
                  onClick={handleCreateSession}
                  className="bg-[#69acaf] hover:bg-[#528f92] text-slate-900 font-bold px-4 py-2.5 rounded-xl text-xs transition-all"
                >
                  Abrir Votación
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#131926] p-4 rounded-2xl border border-[#69acaf]/40 flex justify-between items-center">
              <div>
                <span className="text-[10px] bg-[#69acaf]/20 text-[#69acaf] font-bold px-2 py-0.5 rounded-md border border-[#69acaf]/30 uppercase">
                  Votación Activa ({activeVoteSession.type})
                </span>
                <h2 className="text-base font-black text-white mt-1">{activeVoteSession.title}</h2>
              </div>
              <button
                onClick={handleCloseSession}
                className="bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 border border-rose-500/30 px-3 py-2 rounded-xl text-xs font-bold transition-all"
              >
                🔒 Finalizar Votación
              </button>
            </div>
          )}

          {/* Tarjetas con Botones Rápidos por País */}
          {activeVoteSession && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {delegations.map((d) => {
                const currentVote = currentVotes[d.id];
                return (
                  <div
                    key={d.id}
                    className="bg-[#131926] border border-[#1e293b] rounded-xl p-3 text-center space-y-2 shadow-md"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-lg">{d.flag}</span>
                      <span className="text-xs font-bold text-white truncate">{d.name}</span>
                    </div>

                    {/* Los 3 Botones Rápidos */}
                    <div className="grid grid-cols-3 gap-1 pt-1">
                      <button
                        onClick={() => handleQuickVote(d.id, "favor")}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                          currentVote === "favor"
                            ? "bg-[#39fc60] text-slate-950 font-black shadow-md shadow-[#39fc60]/20"
                            : "bg-[#1b2436] text-emerald-400 hover:bg-[#39fc60]/20"
                        }`}
                      >
                        🟢
                      </button>
                      <button
                        onClick={() => handleQuickVote(d.id, "contra")}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                          currentVote === "contra"
                            ? "bg-rose-500 text-white font-black shadow-md shadow-rose-500/20"
                            : "bg-[#1b2436] text-rose-400 hover:bg-rose-500/20"
                        }`}
                      >
                        🔴
                      </button>
                      <button
                        onClick={() => handleQuickVote(d.id, "abstencion")}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                          currentVote === "abstencion"
                            ? "bg-[#d1c54c] text-slate-950 font-black shadow-md shadow-[#d1c54c]/20"
                            : "bg-[#1b2436] text-yellow-300 hover:bg-[#d1c54c]/20"
                        }`}
                      >
                        ⚪
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* SECCIÓN: HISTORIAL DE VOTACIONES PASADAS */}
          <div className="mt-8 pt-6 border-t border-[#1e293b] space-y-3">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <span>📜</span> Historial de Votaciones
            </h3>

            {pastSessions.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No hay votaciones registradas todavía.</p>
            ) : (
              <div className="space-y-3">
                {pastSessions.map((session) => {
                  const votesList: VoteRecord[] = session.votes || [];
                  const favor = votesList.filter((v) => v.vote === "favor").length;
                  const contra = votesList.filter((v) => v.vote === "contra").length;
                  const abstencion = votesList.filter((v) => v.vote === "abstencion").length;

                  return (
                    <details
                      key={session.id}
                      className="group bg-[#131926] border border-[#1e293b] rounded-xl overflow-hidden transition-all"
                    >
                      {/* Cabecera / Resumen del Registro */}
                      <summary className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none hover:bg-[#1b2436]/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 group-open:rotate-90 transition-transform">►</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">{session.title}</span>
                              <span className="text-[10px] bg-[#1b2436] text-slate-400 px-2 py-0.5 rounded border border-[#2d3a52] font-semibold">
                                {session.type === "simple" ? "Votación de Forma" : "Votación de Fondo"}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500">Día {session.day}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto">
                          {/* Conteo total resumido */}
                          <div className="flex items-center gap-2.5 bg-[#1b2436] px-3 py-1 rounded-lg border border-[#2d3a52] text-xs font-bold">
                            <span className="text-emerald-400">🟢 {favor}</span>
                            <span className="text-rose-400">🔴 {contra}</span>
                            <span className="text-yellow-300">⚪ {abstencion}</span>
                          </div>

                          {/* Botón de eliminar solo visible si es Admin */}
                          {user.role === "admin" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Evita abrir/cerrar el acordeón al hacer clic
                                handleDeleteSession(session.id);
                              }}
                              className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs transition-colors"
                              title="Eliminar registro"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </summary>

                      {/* Detalle Desplegable: Voto individual por país */}
                      <div className="px-4 pb-4 pt-2 border-t border-[#1e293b] bg-[#0b0f19]/40">
                        <p className="text-[11px] font-bold text-slate-400 mb-2">Detalle de votación por delegación:</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                          {delegations.map((d) => {
                            const countryVote = votesList.find((v) => v.delegation_id === d.id)?.vote;

                            return (
                              <div
                                key={d.id}
                                className="bg-[#131926] border border-[#1e293b] p-2 rounded-lg flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <span>{d.flag}</span>
                                  <span className="text-[11px] font-medium text-slate-200 truncate">{d.name}</span>
                                </div>

                                {/* Estado del voto */}
                                {countryVote === "favor" && <span className="text-emerald-400 font-bold">🟢</span>}
                                {countryVote === "contra" && <span className="text-rose-400 font-bold">🔴</span>}
                                {countryVote === "abstencion" && <span className="text-yellow-300 font-bold">⚪</span>}
                                {!countryVote && <span className="text-slate-600 text-[10px] italic">—</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR EVALUACIÓN */}
      {selectedDelegation && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#131926] border border-[#1e293b] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-[#1e293b] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-3xl">{selectedDelegation.flag}</span>
                <div>
                  <h3 className="font-black text-lg text-white leading-tight">{selectedDelegation.name}</h3>
                  <p className="text-xs text-slate-400">Evaluando intervención (Jornada {currentDay})</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDelegation(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Contexto de Participación</label>
                <select
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  className="w-full bg-[#1b2436] border border-[#2d3a52] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#a12843]"
                >
                  {CONTEXT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-300">Puntaje Base (1-10)</label>
                  <span className="text-sm font-black text-[#69acaf]">{score} pts</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={score}
                  onChange={(e) => setScore(Number(e.target.value))}
                  className="w-full accent-[#a12843] cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Observaciones (Opcional)</label>
                <textarea
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Detalles clave o argumentos dados..."
                  rows={3}
                  className="w-full bg-[#1b2436] border border-[#2d3a52] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#a12843] placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSelectedDelegation(null)}
                className="flex-1 bg-[#1b2436] hover:bg-[#2d3a52] text-slate-300 py-3 rounded-xl text-xs font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                disabled={loading}
                onClick={handleSave}
                className="flex-1 bg-[#a12843] hover:bg-[#851e34] text-white py-3 rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#a12843]/20 disabled:opacity-50"
              >
                {loading ? "Guardando..." : "Guardar Evaluación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR EVALUACIÓN */}
      {editingParticipation && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#131926] border border-[#1e293b] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-[#1e293b] pb-3">
              <h3 className="font-black text-lg text-white">✏️ Editar Registro</h3>
              <button
                onClick={() => setEditingParticipation(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Contexto</label>
                <select
                  value={editContext}
                  onChange={(e) => setEditContext(e.target.value)}
                  className="w-full bg-[#1b2436] border border-[#2d3a52] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#a12843]"
                >
                  {CONTEXT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-300">Puntaje Base</label>
                  <span className="text-sm font-black text-[#69acaf]">{editScore} pts</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={editScore}
                  onChange={(e) => setEditScore(Number(e.target.value))}
                  className="w-full accent-[#a12843] cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Observaciones</label>
                <textarea
                  value={editObservation}
                  onChange={(e) => setEditObservation(e.target.value)}
                  rows={3}
                  className="w-full bg-[#1b2436] border border-[#2d3a52] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#a12843]"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setEditingParticipation(null)}
                className="flex-1 bg-[#1b2436] hover:bg-[#2d3a52] text-slate-300 py-3 rounded-xl text-xs font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                disabled={loading}
                onClick={handleUpdate}
                className="flex-1 bg-[#69acaf] hover:bg-[#528d90] text-[#0b0f17] py-3 rounded-xl text-xs font-bold transition-all shadow-lg disabled:opacity-50"
              >
                {loading ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ELIMINACIÓN SEGURA */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#131926] border border-rose-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto text-rose-500 text-2xl font-bold">
              ⚠️
            </div>
            <div>
              <h3 className="font-black text-lg text-white">¿Confirmar Eliminación?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Esta acción no se puede deshacer. La evaluación será eliminada permanentemente del sistema.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 bg-[#1b2436] hover:bg-[#2d3a52] text-slate-300 py-2.5 rounded-xl text-xs font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                disabled={loading}
                onClick={confirmDelete}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              >
                {loading ? "Eliminando..." : "Sí, Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}