# Paquete candidato: orden de migraciones

Este paquete **no fue ejecutado** como secuencia desde el baseline de producción. Aplicar sólo después de completar la prueba de reproducibilidad en Allanamientos-Pruebas. No usar este documento como autorización para modificar producción.

| Orden | Forward | Dependencia principal |
|---|---|---|
| 1 | `COP_20261007_01_usuario_habilitado.sql` | Esquema de producción; fail-closed para `requiere_cambio_clave` |
| 2 | `COP_20261007_02_actor_gestion_P1.sql` | Orden 1; seis RPC de gestión y helper P1 |
| 3 | `COP_20261007_03_actor_actual_P2.sql` | Orden 2; cuatro firmas nuevas y retiro de firmas anteriores |
| 4 | `COP_cantidades_no_negativas_2026-10-07.sql` | Tablas de allanamientos, colaboraciones y secuestros; datos existentes compatibles |
| 5 | `COP_20261009_08_consulta_restringir_lectura_detalle.sql` | Orden 1; excluye Consulta del helper de detalle antes de habilitar sus métricas |
| 6 | `COP_consulta_solo_agregados_2026-10-07.sql` | Orden 5; helper de acceso a métricas, proyección agregada y ambas RPC de métricas |
| 7 | `COP_20261009_09_importacion_auditoria_confirmacion.sql` | Backend de importación histórica; registra confirmaciones de advertencias en auditoría |
| 8 | `COP_gestion_sesiones_2026-10-08.sql` | Orden 1; Auth nativo y control de actividad de sesión |
| 9 | `COP_20261009_10_importacion_departamental_obligatorio.sql` | Backend de importación histórica; rechaza departamental ausente antes de escribir |

Cada forward tiene un archivo de rollback con el mismo nombre y sufijo `_rollback.sql`. Ejecutar los rollback, si corresponde, en orden inverso **9 → 1** y únicamente tras verificar sus precondiciones y consecuencias sobre datos creados después de cada migración.

`COP_20261007_00_validacion_historica.sql` fue retirado del paquete: `private.validar_y_sincronizar_allanamiento()` ya es idéntica en el baseline de producción y en Allanamientos-Pruebas. El par preparado previamente era redundante y su rollback no representaba el baseline real.
