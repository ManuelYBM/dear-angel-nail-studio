# Progreso de implementación

## Estado al 14 de agosto de 2026

| Fase                               | Estado       | Resultado actual                                                    |
| ---------------------------------- | ------------ | ------------------------------------------------------------------- |
| 0. Fundamentos y documentación     | Implementada | Alcance, decisiones y arquitectura actualizados                     |
| 1. Base Docker y sistema visual    | Implementada | Compose local en loopback; reconstrucción y ensayo limpio aprobados |
| 2. Identidad, seguridad y roles    | Implementada | Roles, lada visible, E.164 estricto y OTP mock sólo con opt-in      |
| 3. Disponibilidad y agenda         | Implementada | Agenda sin traslapes, paginada y con política dinámica              |
| 4. Catálogo, calculadora y cotiza. | Implementada | Galería con portada, cancelación y privacidad de cotizaciones       |
| 5. Visitas y recompensas           | Implementada | Camino visual, cupones, promociones y canje manual                  |
| 6. Anticipos SPEI                  | Implementada | Comprobantes privados y revisión administrativa                     |
| 7. Notificaciones e integraciones  | Implementada | Bandeja persistente, BullMQ real e integraciones activables         |
| 8. Panel administrativo y PWA      | Implementada | Reportes, auditoría, marca editable y PWA                           |
| 9. Calidad, seguridad y entrega    | Completada   | Calidad, Docker, E2E, respaldo/restauración y manuales aprobados    |

“Implementada” describe que la capacidad está presente en el repositorio. La fase 9 registra además la ejecución real de la lista de liberación sobre esta candidata; las credenciales de proveedores externos continúan como dependencias operativas y no como trabajo de código pendiente.

## Cambios consolidados en esta revisión

### Navegación y portada

- Una sola barra global aparece en todas las rutas, permanece visible durante el desplazamiento y ofrece Inicio, Experiencia, Diseños, Reservar, Políticas y sesión.
- En escritorio usa una fila; en tablet y móvil conserva marca y sesión arriba y permite desplazar horizontalmente los accesos sin provocar scroll lateral de la página.
- Las rutas internas conservan el botón Regresar, muestran el apartado activo y compensan la altura del encabezado para anclas y resúmenes sticky.
- Inicio incluye una selección de hasta tres diseños destacados, con imagen optimizada, duración, precio, reserva directa y acceso al catálogo completo; el catálogo mantiene filtros y favoritos.

### Worker y tareas periódicas

- `apps/worker` usa BullMQ sobre Redis; ya no es sólo un proceso de salud o una base futura.
- Registra cinco programadores: entregas pendientes cada 30 segundos, recordatorios cada 5 minutos, vencimiento de anticipos cada minuto, retención de comprobantes cada 6 horas y limpieza de autorregistros vencidos cada hora.
- Cada trabajo llama un endpoint interno de la API y presenta `WORKER_SHARED_SECRET` en `x-worker-token`.
- La API compara el secreto de forma segura y sólo acepta nombres de trabajo conocidos.
- `BACKGROUND_JOBS_MODE=worker` desactiva los programadores equivalentes dentro de la API para evitar ejecución duplicada.
- La salud del worker exige Redis, programadores configurados y una llamada reciente exitosa por cada trabajo; éxitos y fallos se conservan en Redis para no perder el estado al reiniciar.

### Entorno local y publicación temporal

- El Compose base queda reservado al desarrollo local y publica web, API, worker, PostgreSQL, Redis y MinIO únicamente en `127.0.0.1`.
- Los túneles Cloudflare y ngrok viven en `docker/compose.public.yaml`; se levantan combinando ese overlay con `compose.yaml`, `--env-file .env.public` y el perfil correspondiente. `.env.public.example` es la plantilla sin secretos.
- El overlay fija `name: dear-angel-public`, crea volúmenes independientes y se alterna con el proyecto local porque ambos enlazan los mismos puertos. Detener uno para iniciar el otro no elimina sus datos.
- El overlay público usa `NODE_ENV=production`, deshabilita `OTP_MOCK_DEBUG_ENABLED` y exige contraseñas, secretos, URLs HTTPS y decisiones explícitas para WhatsApp y SMTP.
- `.env.example` usa `localhost` para PostgreSQL, Redis y MinIO y sirve como referencia de ejecución en Windows. `compose.yaml` inyecta por separado los hosts internos de su red a los contenedores.
- El worker ejecutado en host no carga automáticamente el `.env` raíz; sus variables deben exportarse en la terminal o proporcionarse mediante Compose.

### Identidad y OTP de desarrollo

- El código OTP simulado está deshabilitado por defecto. Sólo se incluye en la respuesta cuando coinciden `NODE_ENV=development` y la activación temporal `OTP_MOCK_DEBUG_ENABLED=true`; debe volver a `false` al terminar la prueba local.
- Producción rechaza el flag de depuración y también rechaza el proveedor WhatsApp mock cuando WhatsApp real está habilitado.
- El mock sigue disponible para demostraciones locales deliberadas, sin convertirlo en un comportamiento de producción.
- Los formularios muestran país y lada —México `+52` por defecto—, normalizan a E.164 y separan correctamente un número internacional pegado o ya guardado. La API exige lada explícita y ya no infiere México.
- La sesión temporal de verificación nunca persiste `debugCode` y limpia datos antiguos. Meta usa Graph API configurable (`v26.0` por defecto) y plantillas `AUTHENTICATION` con botón **Copiar código**; el arranque completa nombres de plantilla faltantes sin sobrescribir ajustes administrativos.
- El autorregistro permanece como borrador durante un máximo de 24 horas: no activa la cuenta, no crea sesión y no participa en agenda, lealtad ni reportes antes de confirmar el OTP.
- Un intento interrumpido se reanuda al iniciar con el mismo teléfono y contraseña válidos. El reenvío usa el `challengeId` de esa verificación, nunca un teléfono aislado; un fallo del primer envío descarta el borrador y el quinto trabajo periódico elimina los vencidos.

### Agenda y políticas

- `GET /appointments` acepta `cursor` y `limit`, devuelve `items`, `nextCursor` y la `policy` vigente.
- La interfaz solicita páginas de 20 citas, concatena sin duplicados y ofrece “Cargar citas anteriores” mientras exista cursor.
- El límite de reprogramaciones de clienta y las horas mínimas de aviso se obtienen de la política administrable; ya no se documentan como valores fijos de la interfaz.
- La política conserva también duración, intervalo, anticipación mínima, horizonte de reserva y tiempo de retención configurables.
- La restricción PostgreSQL contra traslapes y las validaciones de disponibilidad continúan siendo la fuente de verdad.

### Cotizaciones y catálogo

- La clienta puede cancelar una cotización mientras esté `PENDING_REVIEW` o `IN_REVIEW`, siempre que no tenga una cita activa asociada.
- Una clienta sólo ve sus solicitudes. Una manicurista ve las solicitudes abiertas que puede tomar y, después del reclamo o asignación, sólo la responsable conserva acceso; la administradora mantiene la vista operativa completa. Las imágenes adjuntas reutilizan esa autorización y no se almacenan en caché pública.
- El estado `CANCELLED` está representado en API e interfaz y la cancelación queda auditada.
- Cada diseño admite una galería de hasta cinco imágenes. La administradora puede subir, eliminar y elegir “Usar como portada” sin borrar el resto de la galería.
- Una imagen nueva puede convertirse en portada y, si se elimina la actual, la siguiente imagen ordenada ocupa ese lugar.
- El listado público acepta `limit` entre 1 y 6 para alimentar previews eficientes sin descargar todo el catálogo; conserva el orden de destacados, orden manual y fecha.

### Calidad y respaldo

- El proyecto requiere Node.js `>=22.0.0` y npm `>=10.9.0`.
- `pretypecheck`, `prelint`, `pretest` y `prebuild` ejecutan `npm run db:generate`, por lo que Prisma Client se regenera antes de cada etapa de calidad.
- `npm run quality` encadena typecheck, ESLint, pruebas, build y comprobación de formato.
- La ejecución del 14 de agosto de 2026 pasó completa: tipado de API/web/worker, ESLint, 30 archivos con 104 pruebas de API, 6 pruebas del worker, builds de las tres aplicaciones, 33 rutas Next y formato.
- El `.tar.gz` de respaldo contiene manifiesto y hashes internos SHA-256; el checksum externo se genera como archivo adyacente. La verificación exige ambos y rechaza rutas inseguras o contenido incompatible.
- `scripts/verify-backup.ps1` valida el par de archivos y `npm run backup:test-restore` restaura en destinos aislados, compara el número de objetos con el manifiesto e informa —sin compararlos contra el manifiesto— los conteos de usuarios y migraciones aplicadas.
- El marcador de salud persiste en el volumen de respaldos y se actualiza tras una copia manual o programada; la restauración operativa verifica el archivo antes de detener aplicaciones y las deja detenidas si falla después de comenzar la mutación.
- Los scripts PowerShell anteriores apuntan al proyecto local. El proyecto público usa su daemon `backup`; una copia o verificación manual pública debe invocar Compose con `.env.public` y ambos archivos.
- La existencia de estas verificaciones y procedimientos está confirmada en el repositorio; su ejecución final sobre la candidata actual se registrará cuando se confirme la validación Docker.

## Estado de validación de la candidata

| Control                                                  | Estado documental                                           |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| Contratos de worker, OTP, agenda, cotizaciones y portada | Confirmados por inspección del código                       |
| Regeneración automática de Prisma en calidad             | Confirmada en `package.json`                                |
| Formato verificable de respaldo y restauración aislada   | Aprobado: 15 migraciones, 8 usuarios y 6 objetos            |
| `npm run quality` sobre la candidata completa            | Aprobada: API 104/104 y worker 6/6; tipos, lint y builds OK |
| Salud de todos los servicios Docker                      | Aprobada: siete servicios saludables y puertos en loopback  |
| `npm run test:e2e`                                       | Aprobada: 48 controles, incluido autorregistro interrumpido |
| `npm run test:clean-install`                             | Aprobada y entorno principal restaurado saludable           |
| HTML y PDF de los dos manuales                           | Regenerados y revisados visualmente                         |
| Túnel público con credenciales definitivas               | Pendiente externo                                           |

Comandos previstos para cerrar la validación:

```powershell
npm run quality
npm run backup:now
npm run backup:test-restore
npm run test:e2e
npm run test:clean-install
```

`test:clean-install` no relanza los perfiles `preview` ni `stable-preview`; los túneles se administran por separado con los dos archivos Compose.

## Pendientes externos no bloqueantes

- Credenciales y alta de Meta WhatsApp Business Platform.
- Aprobación de plantillas de WhatsApp.
- Contraseña de aplicación y validación del remitente SMTP.
- Cliente OAuth y autorización de Google Calendar.
- Datos bancarios SPEI definitivos.
- Logo, dirección, teléfonos, redes y mapa definitivos.
- Decisión de alojamiento permanente, dominio y TLS para producción; los túneles actuales son sólo de demostración.

## Cierre de la fase 9

La fase 9 quedó completada después de registrar la salida exitosa de calidad, respaldo/restauración, Docker limpio y E2E sobre la misma candidata, además de regenerar y revisar los manuales. Meta, SMTP, Google Calendar y los datos definitivos del negocio permanecen en la lista externa porque dependen de cuentas y decisiones de la propietaria.
