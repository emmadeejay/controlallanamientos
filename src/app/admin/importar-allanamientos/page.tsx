'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  SearchCheck,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { obtenerRangoSemanaRendida } from '@/lib/allanamientos';
import {
  descargarPlantillaHistorica,
  procesarPlantillaHistorica,
  sha256Archivo,
  type FilaImportacionHistorica,
  type RevisionImportacionHistorica,
  type SuperintendenciaImportacion,
} from '@/lib/importacion-historica';

type LoteReciente = {
  id: string;
  archivo_nombre: string;
  semana_inicio: string;
  semana_fin: string;
  estado: string;
  filas_importadas: number;
  filas_con_advertencia: number;
  creado_at: string;
};

const FILAS_POR_PAGINA = 25;

function sumarDias(fechaIso: string, dias: number): string {
  const fecha = new Date(`${fechaIso}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function esLunes(fechaIso: string): boolean {
  return new Date(`${fechaIso}T12:00:00Z`).getUTCDay() === 1;
}

function formatearFechaCorta(fechaIso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${fechaIso}T12:00:00Z`));
}

export default function ImportacionHistoricaPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const semanaMaxima = obtenerRangoSemanaRendida().inicio;
  const semanasDisponibles = useMemo(() => {
    const semanas: string[] = [];
    let lunes = '2026-06-01';

    while (lunes <= semanaMaxima) {
      semanas.push(lunes);
      lunes = sumarDias(lunes, 7);
    }

    return semanas;
  }, [semanaMaxima]);

  const [superintendencias, setSuperintendencias] = useState<SuperintendenciaImportacion[]>([]);
  const [lotes, setLotes] = useState<LoteReciente[]>([]);
  const [semanaInicio, setSemanaInicio] = useState('2026-06-01');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoHash, setArchivoHash] = useState('');
  const [filas, setFilas] = useState<FilaImportacionHistorica[]>([]);
  const [revisiones, setRevisiones] = useState<RevisionImportacionHistorica[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loteCreado, setLoteCreado] = useState<string | null>(null);
  const [confirmarAdvertencias, setConfirmarAdvertencias] = useState(false);
  const [motivoAdvertencias, setMotivoAdvertencias] = useState('');
  const [pagina, setPagina] = useState(1);
  const [loteAnular, setLoteAnular] = useState<LoteReciente | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [mensajeGestion, setMensajeGestion] = useState<string | null>(null);

  useEffect(() => {
    async function cargarCatalogos() {
      const [{ data: supers, error: supersError }, { data: lotesData, error: lotesError }] =
        await Promise.all([
          supabase.from('superintendencias').select('id, nombre').order('nombre'),
          supabase
            .from('importaciones_allanamientos')
            .select(
              'id, archivo_nombre, semana_inicio, semana_fin, estado, filas_importadas, filas_con_advertencia, creado_at',
            )
            .order('creado_at', { ascending: false })
            .limit(8),
        ]);

      if (supersError) {
        setError('No se pudo cargar el padrón de superintendencias.');
        return;
      }
      setSuperintendencias((supers ?? []) as SuperintendenciaImportacion[]);

      if (!lotesError) setLotes((lotesData ?? []) as LoteReciente[]);
    }

    cargarCatalogos();
  }, [supabase]);

  const resumen = useMemo(() => {
    const aptas = revisiones.filter((revision) => revision.estado === 'apto').length;
    const advertencias = revisiones.filter(
      (revision) => revision.estado === 'advertencia',
    ).length;
    const errores = revisiones.filter((revision) => revision.estado === 'error').length;
    return { aptas, advertencias, errores };
  }, [revisiones]);

  const revisionesPagina = revisiones.slice(
    (pagina - 1) * FILAS_POR_PAGINA,
    pagina * FILAS_POR_PAGINA,
  );
  const paginas = Math.max(1, Math.ceil(revisiones.length / FILAS_POR_PAGINA));
  const puedeImportar =
    revisiones.length > 0 &&
    resumen.errores === 0 &&
    (resumen.advertencias === 0 ||
      (confirmarAdvertencias && motivoAdvertencias.trim().length >= 8));

  function limpiarRevision() {
    setRevisiones([]);
    setFilas([]);
    setArchivoHash('');
    setLoteCreado(null);
    setConfirmarAdvertencias(false);
    setMotivoAdvertencias('');
    setPagina(1);
  }

  async function seleccionarArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const seleccionado = evento.target.files?.[0] ?? null;
    limpiarRevision();
    setError(null);
    setArchivo(seleccionado);
    if (!seleccionado) return;

    if (!/\.(xlsx|xls)$/i.test(seleccionado.name)) {
      setError('Seleccioná un archivo Excel .xlsx o .xls generado con la plantilla oficial.');
      setArchivo(null);
    }
  }

  async function prevalidar() {
    setError(null);
    setMensajeGestion(null);
    setLoteCreado(null);

    if (!archivo) {
      setError('Primero seleccioná la planilla de la semana.');
      return;
    }
    if (!semanaInicio || !esLunes(semanaInicio)) {
      setError('La fecha de inicio debe corresponder a un lunes.');
      return;
    }
    if (semanaInicio < '2026-06-01' || semanaInicio > semanaMaxima) {
      setError(`La semana debe estar entre 2026-06-01 y ${semanaMaxima}.`);
      return;
    }
    if (superintendencias.length === 0) {
      setError('El padrón de superintendencias todavía no está disponible.');
      return;
    }

    setProcesando(true);
    try {
      const [filasProcesadas, hash] = await Promise.all([
        procesarPlantillaHistorica(archivo, superintendencias),
        sha256Archivo(archivo),
      ]);

      const { data, error: rpcError } = await supabase.rpc(
        'prevalidar_importacion_historica_allanamientos',
        {
          p_semana_inicio: semanaInicio,
          p_filas: filasProcesadas,
        },
      );
      if (rpcError) throw rpcError;

      setFilas(filasProcesadas);
      setArchivoHash(hash);
      setRevisiones((data ?? []) as RevisionImportacionHistorica[]);
      setPagina(1);
    } catch (err) {
      console.error('No se pudo prevalidar la importación histórica.', err);
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo interpretar o validar la planilla.',
      );
    } finally {
      setProcesando(false);
    }
  }

  async function importar() {
    if (!archivo || !puedeImportar) return;

    const filasConfirmadas = filas.map((fila, indice) => {
      const revision = revisiones[indice];
      if (revision?.estado !== 'advertencia') return fila;
      return {
        ...fila,
        confirmar_advertencia: true,
        motivo_confirmacion: motivoAdvertencias.trim(),
      };
    });

    setImportando(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'importar_lote_historico_allanamientos',
        {
          p_archivo_nombre: archivo.name,
          p_archivo_sha256: archivoHash,
          p_semana_inicio: semanaInicio,
          p_filas: filasConfirmadas,
        },
      );
      if (rpcError) throw rpcError;

      const loteId = String(data);
      setLoteCreado(loteId);
      setLotes((actuales) => [
        {
          id: loteId,
          archivo_nombre: archivo.name,
          semana_inicio: semanaInicio,
          semana_fin: sumarDias(semanaInicio, 6),
          estado: 'completado',
          filas_importadas: filas.length,
          filas_con_advertencia: resumen.advertencias,
          creado_at: new Date().toISOString(),
        },
        ...actuales,
      ].slice(0, 8));
    } catch (err) {
      console.error('No se pudo importar el lote histórico.', err);
      setError(
        err instanceof Error
          ? err.message
          : 'La importación fue rechazada y no se guardó ninguna fila.',
      );
    } finally {
      setImportando(false);
    }
  }

  function abrirAnulacion(lote: LoteReciente) {
    setError(null);
    setMensajeGestion(null);
    setMotivoAnulacion('');
    setLoteAnular(lote);
  }

  async function anularLote() {
    if (!loteAnular || motivoAnulacion.trim().length < 12) {
      setError('La anulación requiere un motivo de al menos 12 caracteres.');
      return;
    }

    setAnulando(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc(
        'anular_importacion_historica_allanamientos',
        {
          p_lote_id: loteAnular.id,
          p_motivo: motivoAnulacion.trim(),
        },
      );
      if (rpcError) throw rpcError;

      setLotes((actuales) =>
        actuales.map((lote) =>
          lote.id === loteAnular.id ? { ...lote, estado: 'anulado' } : lote,
        ),
      );
      setMensajeGestion(
        `Lote ${loteAnular.id} anulado. Sus ${loteAnular.filas_importadas} registros fueron retirados de las métricas.`,
      );
      setLoteAnular(null);
      setMotivoAnulacion('');
    } catch (err) {
      console.error('No se pudo anular el lote histórico.', err);
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo anular el lote. No se modificaron sus registros.',
      );
    } finally {
      setAnulando(false);
    }
  }

  return (
    <main className="cop-shell min-h-screen px-4 py-6 text-slate-200 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => router.push('/allanamientos')}
              className="border border-[#33465f] bg-[#050e1c] p-2.5 text-slate-400 transition hover:border-[#c4a35a] hover:text-white"
              aria-label="Volver a Allanamientos"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-[#c4a35a]" />
                <h1 className="text-xl font-extrabold text-white sm:text-2xl">
                  Importación histórica controlada
                </h1>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Acceso exclusivo del Administrador · un archivo por semana · operación atómica y auditada
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={descargarPlantillaHistorica}
            className="cop-action-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5"
          >
            <Download className="h-4 w-4" /> Descargar plantilla oficial
          </button>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="border border-[#33465f] bg-[#071426] p-5 lg:col-span-2">
            <div className="mb-5 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-[#c4a35a]" />
              <h2 className="font-bold text-white">1. Seleccionar y comprobar la semana</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-[220px_1fr_auto] md:items-end">
              <label className="space-y-1.5 text-xs font-semibold text-slate-400">
                Lunes de la semana
                <select
                  value={semanaInicio}
                  onChange={(evento) => {
                    setSemanaInicio(evento.target.value);
                    limpiarRevision();
                  }}
                  className="block w-full border border-[#33465f] bg-[#050e1c] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c4a35a]"
                >
                  {semanasDisponibles.map((lunes) => (
                    <option key={lunes} value={lunes}>
                      {formatearFechaCorta(lunes)} al {formatearFechaCorta(sumarDias(lunes, 6))}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-400">
                Archivo normalizado
                <div className="flex min-h-10 items-center border border-dashed border-[#33465f] bg-[#050e1c] px-3 py-2 text-xs text-slate-300">
                  <Upload className="mr-2 h-4 w-4 text-[#c4a35a]" />
                  <span className="truncate">{archivo?.name || 'Elegir archivo .xlsx'}</span>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={seleccionarArchivo}
                  className="sr-only"
                />
              </label>
              <button
                type="button"
                onClick={prevalidar}
                disabled={procesando || !archivo}
                className="cop-action-primary inline-flex h-10 items-center justify-center gap-2 px-4 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {procesando ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <SearchCheck className="h-4 w-4" />
                )}
                Prevalidar
              </button>
            </div>
          </div>

          <aside className="border border-[#33465f] border-l-4 border-l-[#c4a35a] bg-[#071426] p-5 text-xs text-slate-300">
            <h2 className="mb-3 font-bold text-[#c4a35a]">Reglas de integridad</h2>
            <ul className="list-disc space-y-2 pl-4 leading-relaxed">
              <li>Una IPP puede aparecer en distintas fechas y allanamientos.</li>
              <li>Una fila idéntica se bloquea como duplicado exacto.</li>
              <li>Igual superintendencia + fecha + IPP exige revisión, no se elimina.</li>
              <li>OS propia admite número o “URGENCIA”; OS COP puede quedar vacía.</li>
              <li>Si algo falla, la semana completa se revierte automáticamente.</li>
            </ul>
          </aside>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-800/60 bg-red-950/30 p-4 text-sm text-red-300">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {mensajeGestion && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-700/50 bg-emerald-950/30 p-4 text-sm text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{mensajeGestion}</span>
          </div>
        )}

        {loteCreado && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-700/50 bg-emerald-950/30 p-5 text-sm text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
            <div>
              <p className="font-bold">Semana importada correctamente</p>
              <p className="mt-1 text-xs text-emerald-300/80">
                Se guardaron {filas.length} registros. Lote de auditoría: {loteCreado}
              </p>
            </div>
          </div>
        )}

        {revisiones.length > 0 && !loteCreado && (
          <section className="overflow-hidden border border-[#33465f] bg-[#071426]">
            <div className="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-bold text-white">2. Resultado de la prevalidación</h2>
                <p className="mt-1 text-xs text-slate-400">
                  {archivo?.name} · semana {semanaInicio} al {sumarDias(semanaInicio, 6)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-lg border border-emerald-700/40 bg-emerald-950/30 px-3 py-1.5 text-emerald-300">
                  {resumen.aptas} aptas
                </span>
                <span className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-1.5 text-amber-300">
                  {resumen.advertencias} con advertencia
                </span>
                <span className="rounded-lg border border-red-700/40 bg-red-950/30 px-3 py-1.5 text-red-300">
                  {resumen.errores} con error
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-slate-950/70 uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Fila origen</th>
                    <th className="px-4 py-3">IPP / causa</th>
                    <th className="px-4 py-3">Superintendencia</th>
                    <th className="px-4 py-3">Ejecución</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {revisionesPagina.map((revision) => {
                    const fila = filas[revision.indice - 1];
                    const mensajes = [...(revision.errores ?? []), ...(revision.advertencias ?? [])];
                    return (
                      <tr key={`${revision.indice}-${revision.huella_contenido}`}>
                        <td className="px-4 py-3 text-slate-400">
                          {fila?.hoja_origen}:{revision.fila_origen}
                        </td>
                        <td className="px-4 py-3 font-semibold text-white">{fila?.numero_ipp}</td>
                        <td className="max-w-[260px] px-4 py-3 text-slate-300">
                          {fila?.superintendencia_nombre}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {fila?.fecha_ejecucion} {fila?.horario_ejecucion || '00:00'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-lg px-2 py-1 font-bold ${
                              revision.estado === 'apto'
                                ? 'bg-emerald-500/10 text-emerald-300'
                                : revision.estado === 'advertencia'
                                  ? 'bg-amber-500/10 text-amber-300'
                                  : 'bg-red-500/10 text-red-300'
                            }`}
                          >
                            {revision.estado}
                          </span>
                        </td>
                        <td className="max-w-[360px] px-4 py-3 text-slate-400">
                          {mensajes.length > 0 ? mensajes.join(' ') : 'Sin observaciones.'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3 text-xs text-slate-400">
              <span>
                Página {pagina} de {paginas} · {revisiones.length} registros
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPagina((actual) => Math.max(1, actual - 1))}
                  disabled={pagina === 1}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 disabled:opacity-30"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPagina((actual) => Math.min(paginas, actual + 1))}
                  disabled={pagina === paginas}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 disabled:opacity-30"
                >
                  Siguiente
                </button>
              </div>
            </div>

            {resumen.advertencias > 0 && resumen.errores === 0 && (
              <div className="space-y-3 border-t border-amber-900/40 bg-amber-950/10 p-5">
                <label className="flex items-start gap-3 text-xs text-amber-200">
                  <input
                    type="checkbox"
                    checked={confirmarAdvertencias}
                    onChange={(evento) => setConfirmarAdvertencias(evento.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-amber-500"
                  />
                  <span>
                    Revisé las coincidencias y confirmo que representan allanamientos válidos,
                    no una repetición accidental.
                  </span>
                </label>
                <textarea
                  value={motivoAdvertencias}
                  onChange={(evento) => setMotivoAdvertencias(evento.target.value)}
                  placeholder="Fundamento obligatorio (mínimo 8 caracteres), por ejemplo: verificado contra informe semanal firmado."
                  className="min-h-20 w-full border border-amber-900/50 bg-[#050e1c] p-3 text-xs text-white outline-none focus:border-[#c4a35a]"
                />
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-slate-800 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-xs text-slate-400">
                {resumen.errores > 0 ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                ) : (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
                <span>
                  {resumen.errores > 0
                    ? 'Corregí la plantilla y volvé a prevalidar. No se guardó ningún dato.'
                    : 'La base volverá a validar todo dentro de una única transacción antes de guardar.'}
                </span>
              </div>
              <button
                type="button"
                onClick={importar}
                disabled={!puedeImportar || importando}
                className="cop-action-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {importando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {importando ? 'Importando semana...' : `Importar ${filas.length} registros`}
              </button>
            </div>
          </section>
        )}

        <section className="border border-[#33465f] bg-[#071426] p-5">
          <h2 className="font-bold text-white">Lotes recientes</h2>
          <p className="mt-1 text-xs text-slate-500">
            Cada lote conserva el archivo, la semana, la cantidad y su identificador de auditoría.
          </p>
          {lotes.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">Todavía no hay importaciones históricas.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="pb-2">Semana</th>
                    <th className="pb-2">Archivo</th>
                    <th className="pb-2">Registros</th>
                    <th className="pb-2">Advertencias</th>
                    <th className="pb-2">Estado</th>
                    <th className="pb-2">Lote</th>
                    <th className="pb-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {lotes.map((lote) => (
                    <tr key={lote.id}>
                      <td className="py-2.5">{lote.semana_inicio} al {lote.semana_fin}</td>
                      <td className="max-w-[260px] truncate py-2.5">{lote.archivo_nombre}</td>
                      <td className="py-2.5">{lote.filas_importadas}</td>
                      <td className="py-2.5">{lote.filas_con_advertencia}</td>
                      <td className="py-2.5 capitalize">{lote.estado}</td>
                      <td className="max-w-[150px] truncate py-2.5 text-slate-500">{lote.id}</td>
                      <td className="py-2.5 text-right">
                        {lote.estado === 'completado' ? (
                          <button
                            type="button"
                            onClick={() => abrirAnulacion(lote)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-800/60 bg-red-950/20 px-2.5 py-1.5 font-semibold text-red-300 transition hover:bg-red-950/50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Anular lote
                          </button>
                        ) : (
                          <span className="text-slate-600">Sin acciones</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {loteAnular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-lg overflow-hidden border border-red-900/60 border-t-2 border-t-red-700 bg-[#071426]">
            <div className="border-b border-red-900/40 bg-red-950/20 p-5">
              <div className="flex items-center gap-3">
                <div className="border border-red-800/50 bg-red-500/10 p-2.5 text-red-300">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-white">Anular importación histórica</h2>
                  <p className="mt-1 text-xs text-red-300/80">
                    Esta acción retira el lote completo de las métricas y queda auditada.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="border border-[#33465f] bg-[#050e1c] p-4 text-xs text-slate-300">
                <p className="font-bold text-white">{loteAnular.archivo_nombre}</p>
                <p className="mt-1">
                  Semana {loteAnular.semana_inicio} al {loteAnular.semana_fin} · {loteAnular.filas_importadas} registros
                </p>
                <p className="mt-1 break-all text-slate-500">Lote: {loteAnular.id}</p>
              </div>

              <label className="block space-y-1.5 text-xs font-semibold text-slate-400">
                Motivo obligatorio
                <textarea
                  autoFocus
                  value={motivoAnulacion}
                  onChange={(evento) => setMotivoAnulacion(evento.target.value)}
                  placeholder="Ejemplo: el archivo contenía una fecha incorrecta y será reemplazado por una versión verificada."
                  className="min-h-24 w-full border border-[#33465f] bg-[#050e1c] p-3 text-xs font-normal text-white outline-none focus:border-red-500"
                />
              </label>

              <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-200">
                Si existe un informe consolidado de esta semana, quedará invalidado y deberá generarse nuevamente.
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-800 p-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setLoteAnular(null)}
                disabled={anulando}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slate-900 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={anularLote}
                disabled={anulando || motivoAnulacion.trim().length < 12}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {anulando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {anulando ? 'Anulando...' : 'Anular lote y retirar datos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
