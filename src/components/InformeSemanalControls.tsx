'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, FileCheck2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  descargarInformeSemanalPdf,
  type ConsolidacionInformeSemanal,
} from '@/lib/informe-semanal-pdf';
import InstitutionalDialog from '@/components/InstitutionalDialog';

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
  const [confirmandoConsolidacion, setConfirmandoConsolidacion] = useState(false);

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
      setConfirmandoConsolidacion(false);
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
          className="cop-action-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] disabled:opacity-50"
        >
          {procesando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Descargar PDF oficial v{consolidacion.version}
        </button>
      ) : puedeConsolidar ? (
        <button
          type="button"
          onClick={() => setConfirmandoConsolidacion(true)}
          disabled={procesando || faltantes > 0}
          title={faltantes > 0 ? `Faltan ${faltantes} rendiciones` : 'Consolidar informe semanal'}
          className="cop-action-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
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

      <InstitutionalDialog
        open={confirmandoConsolidacion}
        title="Consolidar informe semanal"
        description="La semana quedará consolidada oficialmente, versionada y registrada en la auditoría. Verificá los datos antes de continuar."
        tone="warning"
        confirmLabel="Consolidar semana"
        loading={procesando}
        onCancel={() => setConfirmandoConsolidacion(false)}
        onConfirm={consolidar}
      >
        <div className="border-l-2 border-[#c4a35a] bg-[#050e1c] px-3 py-2 text-xs text-slate-400">
          Período iniciado el <span className="font-mono text-slate-200">{semanaInicio}</span> · Todas las rendiciones se encuentran finalizadas.
        </div>
        {error && (
          <div className="border border-red-800/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </InstitutionalDialog>
    </div>
  );
}
