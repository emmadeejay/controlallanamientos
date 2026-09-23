'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, FileCheck2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  descargarInformeSemanalPdf,
  type ConsolidacionInformeSemanal,
} from '@/lib/informe-semanal-pdf';

type ResumenSuperintendencia = {
  estado?: string;
};

type Props = {
  semanaInicio: string;
  resumen: ResumenSuperintendencia[];
  puedeConsolidar: boolean;
};

function normalizarConsolidacion(valor: unknown): ConsolidacionInformeSemanal | null {
  const fila = Array.isArray(valor) ? valor[0] : valor;
  if (!fila || typeof fila !== 'object') return null;
  return fila as ConsolidacionInformeSemanal;
}

export default function InformeSemanalControls({
  semanaInicio,
  resumen,
  puedeConsolidar,
}: Props) {
  const [consolidacion, setConsolidacion] = useState<ConsolidacionInformeSemanal | null>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  const faltantes = useMemo(
    () => resumen.filter((item) => !['finalizado', 'bloqueado'].includes(String(item.estado))).length,
    [resumen],
  );

  useEffect(() => {
    void cargarConsolidacion();
  }, [semanaInicio]);

  async function cargarConsolidacion() {
    setCargando(true);
    const { data, error: consultaError } = await supabase.rpc(
      'obtener_consolidacion_allanamientos',
      { p_semana_inicio: semanaInicio },
    );

    if (consultaError) {
      setError('Aplicá la Fase 02.5 en Supabase para habilitar los informes consolidados.');
      setConsolidacion(null);
    } else {
      setError('');
      setConsolidacion(normalizarConsolidacion(data));
    }
    setCargando(false);
  }

  async function consolidar() {
    if (faltantes > 0 || procesando) return;
    if (!confirm('¿Confirmás la consolidación oficial de esta semana? El informe quedará versionado y auditado.')) {
      return;
    }

    setProcesando(true);
    setError('');
    const { data, error: consolidacionError } = await supabase.rpc(
      'consolidar_semana_allanamientos',
      {
        p_semana_inicio: semanaInicio,
        p_referencia_documental: null,
      },
    );

    if (consolidacionError) {
      setError(consolidacionError.message || 'No se pudo consolidar la semana.');
    } else {
      setConsolidacion(normalizarConsolidacion(data));
    }
    setProcesando(false);
  }

  async function descargar() {
    if (!consolidacion || procesando) return;
    setProcesando(true);
    setError('');

    const { error: auditoriaError } = await supabase.rpc(
      'registrar_descarga_informe_allanamientos',
      { p_consolidacion_id: consolidacion.id },
    );

    if (auditoriaError) {
      setError(auditoriaError.message || 'No se pudo autorizar la descarga del informe.');
      setProcesando(false);
      return;
    }

    try {
      await descargarInformeSemanalPdf(consolidacion);
    } catch (errorPdf) {
      console.error('No se pudo generar el PDF consolidado.', errorPdf);
      setError('No se pudo generar el PDF consolidado.');
    } finally {
      setProcesando(false);
    }
  }

  if (cargando) {
    return <Loader2 className="w-4 h-4 text-slate-400 animate-spin" aria-label="Consultando consolidación" />;
  }

  return (
    <div
      className="flex flex-col items-end gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      {consolidacion ? (
        <button
          type="button"
          onClick={descargar}
          disabled={procesando}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20 disabled:opacity-50"
        >
          {procesando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Descargar PDF oficial v{consolidacion.version}
        </button>
      ) : puedeConsolidar ? (
        <button
          type="button"
          onClick={consolidar}
          disabled={procesando || faltantes > 0}
          title={faltantes > 0 ? `Faltan ${faltantes} rendiciones` : 'Consolidar informe semanal'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
        >
          {procesando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck2 className="w-3.5 h-3.5" />}
          {faltantes > 0 ? `Faltan ${faltantes} rendiciones` : 'Consolidar semana'}
        </button>
      ) : faltantes === 0 ? (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" /> Lista para consolidación
        </span>
      ) : null}

      {error && <span className="max-w-sm text-right text-[10px] text-amber-300">{error}</span>}
    </div>
  );
}
