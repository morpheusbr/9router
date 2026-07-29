"use client";

import React, { useEffect, useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell 
} from 'recharts';

// Funções utilitárias
const formatCompact = (num) => {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

export default function RtkAnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/rtk/gain');
      const json = await res.json();
      if (json.success) setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh a cada 5 segundos
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 bg-[#0a0a0c] text-red-500 h-screen">
        Erro ao carregar dados do RTK. Verifique se o banco history.db existe.
      </div>
    );
  }

  const { stats, topCommands, history } = data;
  
  // Calcular eficiência global
  const efficiency = stats.inputTokens > 0 
    ? ((stats.savedTokens / stats.inputTokens) * 100).toFixed(1) 
    : 0;

  // Preparar dados do histórico para o gráfico de área
  const chartData = history.slice().reverse().map(h => ({
    time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    saved: h.saved_tokens,
    savingsPct: h.savings_pct
  }));

  // Paleta de cores moderna
  const COLORS = ['#00E5FF', '#00B4D8', '#48CAE4', '#90E0EF', '#CAF0F8'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0c] to-[#12121a] p-8 text-white font-sans overflow-y-auto pb-24">
      
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
            RTK Analytics Live
          </h1>
          <p className="text-gray-400 mt-2 text-sm">Monitoramento em Tempo Real de Economia de Tokens</p>
        </div>
        <div className="flex items-center space-x-2 bg-white/5 px-4 py-2 rounded-full border border-white/10 shadow-[0_0_15px_rgba(0,229,255,0.15)]">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
          <span className="text-sm font-medium text-green-400">Live Connection</span>
        </div>
      </div>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
        <div className="bg-white/[0.02] backdrop-blur-md border border-white/10 rounded-2xl p-6 relative overflow-hidden group hover:bg-white/[0.04] transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-cyan-500/20"></div>
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Total Economizado</h3>
          <p className="text-5xl font-bold mt-2 text-cyan-400">
            {formatCompact(stats.savedTokens)}
          </p>
          <p className="text-sm text-cyan-500/70 mt-2">Tokens cortados da fatura</p>
        </div>

        <div className="bg-white/[0.02] backdrop-blur-md border border-white/10 rounded-2xl p-6 relative overflow-hidden group hover:bg-white/[0.04] transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-purple-500/20"></div>
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Eficiência Global</h3>
          <p className="text-5xl font-bold mt-2 text-purple-400">
            {efficiency}%
          </p>
          <p className="text-sm text-purple-500/70 mt-2">Taxa média de redução</p>
        </div>

        <div className="bg-white/[0.02] backdrop-blur-md border border-white/10 rounded-2xl p-6 relative overflow-hidden group hover:bg-white/[0.04] transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-green-500/20"></div>
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Total de Comandos</h3>
          <p className="text-5xl font-bold mt-2 text-green-400">
            {stats.totalCommands.toLocaleString()}
          </p>
          <p className="text-sm text-green-500/70 mt-2">Ações proxy processadas</p>
        </div>

        <div className="bg-white/[0.02] backdrop-blur-md border border-white/10 rounded-2xl p-6 relative overflow-hidden group hover:bg-white/[0.04] transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-orange-500/20"></div>
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Tempo Gasto</h3>
          <p className="text-5xl font-bold mt-2 text-orange-400">
            {formatCompact(stats.totalExecTimeMs / 1000)}s
          </p>
          <p className="text-sm text-orange-500/70 mt-2">Overhead acumulado</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
          <h3 className="text-lg font-semibold mb-6 flex items-center text-gray-200">
            <span className="w-1.5 h-6 bg-cyan-500 rounded-full mr-3"></span>
            Fluxo de Economia em Tempo Real
          </h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSaved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#00E5FF" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" tick={{fontSize: 12}} tickMargin={10} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{fontSize: 12}} tickFormatter={formatCompact} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(10, 10, 12, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#00E5FF' }}
                />
                <Area type="monotone" dataKey="saved" stroke="#00E5FF" strokeWidth={3} fillOpacity={1} fill="url(#colorSaved)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Commands List */}
        <div className="bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col">
          <h3 className="text-lg font-semibold mb-6 flex items-center text-gray-200">
            <span className="w-1.5 h-6 bg-purple-500 rounded-full mr-3"></span>
            Comandos mais Econômicos
          </h3>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
            {topCommands.map((cmd, idx) => (
              <div key={idx} className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-xl p-4 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-mono text-sm text-cyan-200 truncate pr-4" title={cmd.original_cmd}>
                    {cmd.original_cmd.length > 25 ? cmd.original_cmd.substring(0,25)+'...' : cmd.original_cmd}
                  </div>
                  <div className="text-xs bg-white/10 px-2 py-1 rounded-md text-gray-300">
                    {cmd.count}x
                  </div>
                </div>
                
                <div className="flex justify-between items-end mt-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Economia</div>
                    <div className="text-lg font-semibold text-white">{formatCompact(cmd.saved)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500 mb-1">Redução</div>
                    <div className="text-sm font-medium text-green-400">-{cmd.avg_pct.toFixed(1)}%</div>
                  </div>
                </div>
                
                {/* Mini progress bar */}
                <div className="w-full bg-white/5 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-500" style={{ width: `${Math.min(100, cmd.avg_pct)}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
    </div>
  );
}
