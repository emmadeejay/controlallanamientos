// Informes cerrados de 17 semanas anteriores a la carga periódica.
// Huellas del archivo presentado, sin sustituir la conciliación de registros.
export type InformeHistorico = {
  semana_inicio: string;
  semana_fin: string;
  tipo: "documental" | "individual" | "parcial";
  total_informe: number;
  archivo_pdf: string;
  sha256: string;
};

export const INFORMES_HISTORICOS: readonly InformeHistorico[] = [
  { semana_inicio: "2026-06-01", semana_fin: "2026-06-07", tipo: "parcial", total_informe: 472, archivo_pdf: "INF. EST. ALLANAMIENTOS 01-07JUN26.pdf", sha256: "c97654fe788c0e3b0e9964c6b3ac9638b4e3209d4057199953f450a74a676067" },
  { semana_inicio: "2026-06-08", semana_fin: "2026-06-14", tipo: "documental", total_informe: 470, archivo_pdf: "INF. EST. ALLANAMIENTOS 8 AL 14 JUN26.pdf", sha256: "03d1877ccf75983aed4567bbab368703fa496a2bf00e4e54ab3dca9534ed069c" },
  { semana_inicio: "2026-06-15", semana_fin: "2026-06-21", tipo: "documental", total_informe: 440, archivo_pdf: "INF. EST. ALLANAMIENTOS 15-21 JUN.pdf", sha256: "63d046646ef7070d99d7db56ef72018b0baa8fe62430bf3bf1787a66da139254" },
  { semana_inicio: "2026-06-22", semana_fin: "2026-06-28", tipo: "documental", total_informe: 427, archivo_pdf: "INF. EST. ALLANAMIENTOS 22-28 JUN.pdf", sha256: "fffb218515b563a6674fca62960723216fb13f451b7d9bb16f46d6a824b599ca" },
  { semana_inicio: "2026-06-29", semana_fin: "2026-07-05", tipo: "documental", total_informe: 399, archivo_pdf: "INF. EST. ALLANAMIENTOS 29-05 JUL.pdf", sha256: "5785f4dd2cff91fa249ecb1d94e607454b3f352abf0e69affcbbcd4d3e539509" },
  { semana_inicio: "2026-07-06", semana_fin: "2026-07-12", tipo: "individual", total_informe: 323, archivo_pdf: "INF. EST. ALLANAMIENTOS 06-12 JUL.pdf", sha256: "1b84671f9272327426b9f6ef5eb4c08873930a3a58008bdcdfc5d78cd1029295" },
  { semana_inicio: "2026-07-13", semana_fin: "2026-07-19", tipo: "documental", total_informe: 375, archivo_pdf: "INF. EST. ALLANAMIENTOS 13-19 JUL.pdf", sha256: "b9f65d09cdfceabc22682c64aa38b6ae9b2deddb0658e76b62ffbedafc5a1161" },
  { semana_inicio: "2026-07-20", semana_fin: "2026-07-26", tipo: "documental", total_informe: 382, archivo_pdf: "INF. EST. ALLANAMIENTOS 20-26 JUL.pdf", sha256: "ca8a1e823a18b257bfd437e2c53b100b8f640b116864aa1af868729b1ad7c58a" },
  { semana_inicio: "2026-07-27", semana_fin: "2026-08-02", tipo: "documental", total_informe: 375, archivo_pdf: "INF. EST. ALLANAMIENTOS 27-02 AGOS.pdf", sha256: "8b7a0a12667a71b9a42ff35477c46bc3294bb1b6bc12e068c93462cacf766f3a" },
  { semana_inicio: "2026-08-03", semana_fin: "2026-08-09", tipo: "documental", total_informe: 430, archivo_pdf: "INF. EST. SEM. ALLANAMIENTOS 03-09 AGOS26.pdf", sha256: "fc1b5c3b0af7db24b3897afaa43a2207934b0a09268f213691f5d1a966a8a62f" },
  { semana_inicio: "2026-08-10", semana_fin: "2026-08-16", tipo: "documental", total_informe: 442, archivo_pdf: "INF. EST. SEM. ALLANAMIENTOS 10-16 AGOS26.pdf", sha256: "807e1196e2dc070c222db21ac527faf140362348b920bae0766456d2580411da" },
  { semana_inicio: "2026-08-17", semana_fin: "2026-08-23", tipo: "documental", total_informe: 410, archivo_pdf: "INF. EST. SEM. ALLANAMIENTOS 17-23 AGOS26.pdf", sha256: "aa1e9c0e98c740fcb73a7d7b7c7517f99523eb85d103e8bdf0f5fc8d562f1b3a" },
  { semana_inicio: "2026-08-24", semana_fin: "2026-08-30", tipo: "documental", total_informe: 454, archivo_pdf: "INF. EST. SEM. ALLANAMIENTOS 24-30 AGOS26.pdf", sha256: "99c90f3f0ec202c744fb1c85f90b5de5792ba83e9af27615f973b4982e48a44b" },
  { semana_inicio: "2026-08-31", semana_fin: "2026-09-06", tipo: "documental", total_informe: 456, archivo_pdf: "INF. EST. SEM. ALLANAMIENTOS 31-06 SEP26.pdf", sha256: "f18b2f465a908b705d63f9e6aa5fc2810ad36ebe839b34dbbcad22c7ed19f593" },
  { semana_inicio: "2026-09-07", semana_fin: "2026-09-13", tipo: "documental", total_informe: 466, archivo_pdf: "INF. EST. SEM. ALLANAMIENTOS 07-13 SEP26(1).pdf", sha256: "d429705c1ca3262a831f12e888f07ce339eec4e6009e07d3dc55020d1d7412d1" },
  { semana_inicio: "2026-09-14", semana_fin: "2026-09-20", tipo: "documental", total_informe: 551, archivo_pdf: "INF. EST. SEM. ALLANAMIENTOS 14-20 SEP26.pdf", sha256: "6d24904fea2136c9a7e7477c87a65410d53287c74df49c1537959fc857cdce2c" },
  { semana_inicio: "2026-09-21", semana_fin: "2026-09-27", tipo: "documental", total_informe: 502, archivo_pdf: "INF. EST. SEM. ALLANAMIENTOS 21-27 SEP26.pdf", sha256: "2d858b1b94082c5759885e51fcbdc065896cfcc993e1dff8ed1e3a0104fcebfb" },
];

export function informeHistoricoPorSemana(semana: string): InformeHistorico | undefined {
  return INFORMES_HISTORICOS.find((item) => item.semana_inicio === semana);
}
