'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileSpreadsheet, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import CopAdminHeader from '@/components/CopAdminHeader';
import { consultarResumenesHistoricosAction, type ResumenHistoricoConsulta } from '@/app/actions/resumen-historico';
import { createClient } from '@/lib/supabase/client';
import { sha256Archivo } from '@/lib/importacion-historica';
import { procesarResumenHistorico, type ResumenHistoricoPreparado } from '@/lib/resumen-historico';

type Lote = {
  id: string;
  semana_inicio: string;
  semana_fin: string;
  total_presentado: number;
  archivo_excel: string;
  desglose_estado: 'por_unidad' | 'sin_desglose';
  estado: string;
  creado_at: string;
};

export default function ResumenHistoricoPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [fuente, setFuente] = useState<File | null>(null);
  const [revision, setRevision] = useState<ResumenHistoricoPreparado | null>(null);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [informesIndividuales, setInformesIndividuales] = useState<ResumenHistoricoConsulta[]>([]);
  const [motivo, setMotivo] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [anularId, setAnularId] = useState('');
  const [motivoAnulacion, setMotivoAnulacion] = useState('');

  useEffect(() => {
    async function cargar() {
      const [{ data: auth }, { data, error: listadoError }, archivo] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('resumenes_historicos_semanales')
          .select('id,semana_inicio,semana_fin,total_presentado,archivo_excel,desglose_estado,estado,creado_at')
          .order('creado_at', { ascending: false }).limit(20),
        consultarResumenesHistoricosAction('2026-06-01', '2026-09-27'),
      ]);
      setEmail(auth.user?.email ?? '');
      if (listadoError) setError('No se pudo consultar el módulo de resúmenes. Verificá la conexión y los permisos de la base de datos.');
      else setLotes((data ?? []) as Lote[]);
      if (archivo.success) setInformesIndividuales(archivo.resumenes.filter((r) => r.tipo !== 'documental'));
    }
    void cargar();
  }, [supabase]);

  function limpiarSeleccion() {
    setRevision(null);setConfirmado(false);setMotivo('');setError('');setMensaje('');
  }

  async function prevalidar() {
    if (!archivo || !fuente) { setError('Seleccioná el resumen semanal y el Excel original.'); return; }
    setOcupado(true);setError('');setMensaje('');setRevision(null);
    try {
      const [r, hash] = await Promise.all([procesarResumenHistorico(archivo), sha256Archivo(fuente)]);
      if (fuente.name !== r.archivo_excel || hash !== r.archivo_excel_sha256) {
        throw new Error('El Excel original no coincide con el nombre o SHA-256 registrados en el resumen.');
      }
      const [{ data: existente, error: e1 }, { data: detalle, error: e2 }] = await Promise.all([
        supabase.from('resumenes_historicos_semanales').select('id').eq('semana_inicio', r.semana_inicio).eq('estado','vigente').limit(1),
        supabase.from('importaciones_allanamientos').select('id').eq('semana_inicio', r.semana_inicio).eq('estado','completado').limit(1),
      ]);
      if (e1 || e2) throw new Error('No se pudo verificar si ya existe una carga de esa semana.');
      if (existente?.length || detalle?.length) throw new Error('Esa semana ya tiene un resumen o un lote individual activo.');
      setRevision(r);
      setConfirmado(false);
      setMotivo('');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo prevalidar el resumen.'); }
    finally { setOcupado(false); }
  }

  async function registrar() {
    if (!revision || !confirmado || motivo.trim().length < (revision.sin_desglose ? 30 : 12) || ocupado) return;
    setOcupado(true);setError('');setMensaje('');
    try {
      const { data, error: rpcError } = await supabase.rpc('registrar_resumen_historico_semanal', {
        p_semana_inicio: revision.semana_inicio,
        p_total: revision.total_presentado,
        p_archivo_excel: revision.archivo_excel,
        p_archivo_pdf: revision.archivo_pdf,
        p_archivo_excel_sha256: revision.archivo_excel_sha256,
        p_unidades: revision.unidades,
        p_observaciones: motivo.trim(),
      });
      if (rpcError) throw rpcError;
      setLotes((actual) => [{
        id:String(data),semana_inicio:revision.semana_inicio,semana_fin:revision.semana_fin,
        total_presentado:revision.total_presentado,archivo_excel:revision.archivo_excel,
        desglose_estado:revision.sin_desglose?'sin_desglose' as const:'por_unidad' as const,
        estado:'vigente',creado_at:new Date().toISOString(),
      },...actual].slice(0,20));
      setMensaje(`Registrado el resumen de ${revision.total_presentado} allanamientos informados. Verificá el renglón de abajo.`);
      setRevision(null);setArchivo(null);setFuente(null);setConfirmado(false);
    } catch (err) { setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo registrar el resumen.'); }
    finally { setOcupado(false); }
  }

  async function anular() {
    if (!anularId || motivoAnulacion.trim().length < 12 || ocupado) return;
    setOcupado(true);setError('');setMensaje('');
    try {
      const { error: rpcError } = await supabase.rpc('anular_resumen_historico_semanal', {
        p_resumen_id:anularId,p_motivo:motivoAnulacion.trim(),
      });
      if (rpcError) throw rpcError;
      setLotes((actual) => actual.map((l) => l.id===anularId ? {...l,estado:'anulado'} : l));
      setAnularId('');setMotivoAnulacion('');setMensaje('Resumen anulado. Se conservó el rastro de auditoría.');
    } catch (err) { setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo anular.'); }
    finally { setOcupado(false); }
  }

  async function cerrarSesion() {
    setSaliendo(true);
    const { error: err } = await supabase.auth.signOut();
    if (err) { setError('No se pudo cerrar sesión.');setSaliendo(false);return; }
    window.location.replace('/login');
  }

  return (
    <div className="cop-shell min-h-screen text-slate-100">
      <CopAdminHeader active="importacion" email={email} role="administrador" onLogout={cerrarSesion} loggingOut={saliendo} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <header className="border-b border-[#26364d] pb-5">
          <p className="cop-kicker">Archivo histórico · totales documentales</p>
          <h1 className="mt-2 text-xl font-black uppercase text-white sm:text-2xl">Resumen semanal</h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">Una semana por vez. Se conserva el total presentado y, cuando es verificable, el desglose por unidad. No genera allanamientos individuales.</p>
          <Link href="/admin/importar-allanamientos" className="mt-3 inline-block text-xs font-bold text-[#c4a35a] hover:underline">Volver a importación individual</Link>
        </header>

        {error && <div role="alert" className="border border-red-700 bg-red-950/40 p-3 text-xs text-red-200">{error}</div>}
        {mensaje && <div role="status" className="flex gap-2 border border-emerald-700 bg-emerald-950/30 p-3 text-xs text-emerald-200"><CheckCircle2 className="h-4 w-4 shrink-0" />{mensaje}</div>}

        <section className="space-y-4 border border-[#33465f] bg-[#071426] p-5">
          <div className="flex items-start gap-3"><FileSpreadsheet className="h-5 w-5 text-[#c4a35a]" /><div><h2 className="font-bold text-white">1. Seleccionar y verificar</h2><p className="text-xs text-slate-400">Usá el archivo de una semana marcado PARA PREVALIDAR y su Excel original.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-xs text-slate-300">Resumen preparado (.xlsx)
              <input type="file" accept=".xlsx" onChange={(e)=>{limpiarSeleccion();setArchivo(e.target.files?.[0]??null)}} className="block w-full text-xs" />
            </label>
            <label className="space-y-2 text-xs text-slate-300">Excel semanal original (.xlsx)
              <input type="file" accept=".xlsx" onChange={(e)=>{limpiarSeleccion();setFuente(e.target.files?.[0]??null)}} className="block w-full text-xs" />
            </label>
          </div>
          <button type="button" disabled={ocupado||!archivo||!fuente} onClick={prevalidar} className="cop-action-secondary disabled:opacity-40">
            {ocupado ? <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 inline h-4 w-4" />}Prevalidar semana
          </button>
        </section>

        {revision && <section className="space-y-4 border border-[#c4a35a]/50 bg-[#071426] p-5">
          <h2 className="font-bold text-white">2. Confirmar una semana</h2>
          <div className="grid gap-3 text-sm sm:grid-cols-3"><div>Semana: <strong>{revision.semana_inicio} al {revision.semana_fin}</strong></div><div>Total presentado: <strong>{revision.total_presentado}</strong></div><div>Unidades: <strong>{revision.unidades.length}</strong></div></div>
          <p className="break-all text-xs text-slate-400">Excel: {revision.archivo_excel} · PDF: {revision.archivo_pdf}</p>
          {revision.sin_desglose && <p className="flex gap-2 text-xs text-amber-300"><TriangleAlert className="h-4 w-4 shrink-0" />Total documental del PDF sin desglose verificable por superintendencia. No permite filtrar por unidad ni equivale a procedimientos individuales. Explicá la discrepancia de la planilla en la referencia.</p>}
          {revision.sin_informar.length>0 && <p className="flex gap-2 text-xs text-amber-300"><TriangleAlert className="h-4 w-4 shrink-0" />Totales sin informar: {revision.sin_informar.join(', ')}.</p>}
          <label className="block space-y-1.5 text-xs text-slate-300">Referencia o motivo de esta carga
            <textarea value={motivo} maxLength={1000} onChange={(e)=>setMotivo(e.target.value)} placeholder="Ejemplo: cotejado con el informe semanal presentado y el Excel original." className="min-h-20 w-full border border-[#33465f] bg-[#050e1c] p-3 text-white" />
            <span className="block text-amber-300">Mínimo {revision.sin_desglose?30:12} caracteres para habilitar el registro ({motivo.trim().length}/{revision.sin_desglose?30:12}).</span>
          </label>
          <label className="flex gap-2 text-xs text-slate-200"><input type="checkbox" checked={confirmado} onChange={(e)=>setConfirmado(e.target.checked)} /><span>Confirmo que el PDF y el Excel original corresponden a esta semana y que es una cifra histórica presentada.</span></label>
          <button type="button" disabled={ocupado||!confirmado||motivo.trim().length<(revision.sin_desglose?30:12)} onClick={registrar} className="cop-action-primary disabled:opacity-40">Registrar resumen documental</button>
        </section>}

        <section className="space-y-3 border border-[#33465f] bg-[#071426] p-5">
          <h2 className="font-bold text-white">Resúmenes recientes</h2>
          <p className="text-xs text-slate-400">Listado independiente de los allanamientos individuales. Una semana vigente sólo puede registrarse una vez.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead><tr className="border-b border-slate-700 text-slate-400"><th className="p-2">Semana</th><th className="p-2">Total presentado</th><th className="p-2">Estado</th><th className="p-2">Acción</th></tr></thead><tbody>
            {lotes.map((l)=><tr key={l.id} className="border-b border-slate-800"><td className="p-2">{l.semana_inicio} al {l.semana_fin}</td><td className="p-2 font-bold">{l.total_presentado}</td><td className="p-2">{l.estado} · {l.desglose_estado==='sin_desglose'?'Sin desglose':'Por unidad'}</td><td className="p-2">{l.estado==='vigente' && <button type="button" onClick={()=>{setAnularId(l.id);setMotivoAnulacion('')}} className="text-amber-300 hover:underline">Anular</button>}</td></tr>)}
            {lotes.length===0 && <tr><td colSpan={4} className="p-3 text-slate-500">Todavía no hay resúmenes registrados.</td></tr>}
          </tbody></table></div>
        </section>

        <section className="space-y-3 border border-[#33465f] bg-[#071426] p-5">
          <h2 className="font-bold text-white">Informes con carga individual</h2>
          <p className="text-xs text-slate-400">Se muestran junto al archivo semanal para consultar el PDF, sin registrar un segundo resumen ni duplicar las fichas.</p>
          {informesIndividuales.map((informe) => <div key={informe.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[#26364d] pt-3 text-xs">
            <div>
              <p className="font-bold text-slate-200">{informe.semana_inicio} al {informe.semana_fin} · {informe.tipo === 'parcial' ? 'Detalle parcial' : informe.tipo === 'conciliado' ? 'Detalle conciliado' : 'Carga individual'}</p>
              <p className="mt-1 text-slate-400">{informe.total_presentado} según PDF · {informe.filas_importadas} fichas importadas{informe.tipo === 'parcial' ? ' · pendiente de conciliación' : informe.tipo === 'conciliado' ? ` · ${informe.duplicados_declarados} duplicados declarados en el informe original` : ''}</p>
            </div>
            <a href={`/api/informes-historicos/${informe.semana_inicio}`} className="font-bold text-[#d5bd82] hover:underline">Descargar PDF</a>
          </div>)}
        </section>

        {anularId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label="Anular resumen histórico"><div className="w-full max-w-lg space-y-4 border border-red-800 bg-[#071426] p-6"><h2 className="font-bold text-white">Anular resumen histórico</h2><p className="text-xs text-slate-300">Se conservarán la cifra original, el motivo y la auditoría; dejará de estar vigente.</p><textarea autoFocus value={motivoAnulacion} onChange={(e)=>setMotivoAnulacion(e.target.value)} className="min-h-24 w-full border border-slate-700 bg-[#050e1c] p-3 text-xs" placeholder="Motivo documentado (al menos 12 caracteres)" /><div className="flex justify-end gap-2"><button type="button" onClick={()=>setAnularId('')} className="cop-action-secondary">Cancelar</button><button type="button" disabled={ocupado||motivoAnulacion.trim().length<12} onClick={anular} className="bg-red-700 px-4 py-2 text-xs font-bold disabled:opacity-40">Confirmar anulación</button></div></div></div>}
      </main>
    </div>
  );
}
