# Registro de decisiones del producto

## Dear Angel Nail Studio

Este documento conserva las decisiones confirmadas durante el levantamiento de requisitos. Es la referencia funcional para evitar contradicciones durante la implementación.

## Negocio y alcance

- El sistema es exclusivo para Dear Angel Nail Studio.
- No existen sucursales en el alcance inicial.
- Puede haber cualquier cantidad de manicuristas.
- Existe una sola administradora.
- Las manicuristas se archivan o desactivan; no se elimina su historial.
- La ubicación operativa es Mérida, Yucatán.
- La moneda es MXN.
- La aplicación será únicamente en español.

## Identidad y acceso

- Las clientas utilizan teléfono internacional y contraseña.
- No se exige correo a las clientas.
- El teléfono se verifica mediante OTP por WhatsApp.
- La recuperación de una clienta utiliza WhatsApp.
- Las manicuristas y la administradora pueden entrar con correo o teléfono y contraseña.
- La recuperación del personal utiliza correo.
- El número, tokens y plantillas de WhatsApp son variables de entorno.
- Debe existir un proveedor simulado para desarrollo local.
- Los perfiles de clientas creados manualmente pueden permanecer como invitados hasta activarse.
- La administradora puede desactivar y reactivar clientas.
- La administradora no puede leer contraseñas; puede iniciar un restablecimiento seguro.
- Datos de clienta: nombre completo, sexo, teléfono y contraseña cuando activa su cuenta.
- Opciones de sexo: mujer, hombre, otro y prefiero no responder.

## Horarios y disponibilidad

- Horario inicial global: lunes a viernes de 08:00 a 24:00.
- Fines de semana cerrados por defecto.
- La administradora puede cambiar días y horario globales.
- Cada manicurista puede modificar su disponibilidad, descansos y excepciones.
- Una manicurista puede pausar su perfil para impedir nuevas reservas.
- Pausar o reducir disponibilidad no elimina citas existentes.
- Si se afecta una cita existente se muestra una advertencia, pero no se obliga a reprogramar.

## Citas

- Duración inicial: 60 minutos.
- La duración es editable.
- Las citas pueden durar más o menos según el diseño.
- Las clientas reservan en intervalos publicados, inicialmente cada hora.
- Las manicuristas pueden crear citas manuales a cualquier minuto.
- Una cita manual no exige anticipo.
- Las citas manuales pueden vincular clientas registradas o invitadas.
- Ninguna cita puede traslaparse para la misma manicurista.
- Una cita puede terminar exactamente cuando inicia otra.
- Una extensión se impide cuando entra en conflicto.
- La reserva pública exige 4 horas de anticipación, configurable.
- Se puede reservar hasta 14 días adelante, configurable.
- No existe lista de espera.
- La clienta elige manicurista o “Cualquiera”.
- “Cualquiera” agrega los horarios de todas las manicuristas disponibles.
- El horario se retiene 10 minutos mientras se carga el comprobante.
- Una reprogramación hecha por la manicurista no consume la reprogramación permitida a la clienta.
- La clienta puede reprogramar una sola vez y con 24 horas de anticipación.
- La cancelación no devuelve el anticipo.
- Los 10 minutos de tolerancia son una política informativa; no producen una acción automática.
- La manicurista marca asistencia, finalización o ausencia.

## Catálogo y calculadora

- Solo la administradora publica diseños.
- Los diseños de catálogo tienen precio y duración establecidos.
- Se pueden reservar directamente.
- El catálogo permite favoritos y filtros.
- No se filtra por manicurista porque todas pueden realizar los servicios de manos.
- Se conservan los servicios y precios iniciales de la calculadora anterior.
- La administradora puede modificar y agregar técnicas, largos, decoraciones, extras, precios e iconos.
- Los iconos pueden subirse desde administración.
- El resultado de la calculadora es una estimación sujeta a revisión.
- Una solicitud personalizada admite hasta cinco imágenes.

## Cotizaciones

- Toda configuración de calculadora requiere revisión, aunque un diseño similar se haya cotizado antes.
- La clienta selecciona una manicurista o “Cualquiera”.
- Si selecciona una, solo esa manicurista recibe la solicitud.
- Si selecciona “Cualquiera”, todas reciben la notificación.
- La primera que confirma toma la solicitud de forma exclusiva.
- La administradora puede asignar solicitudes pendientes.
- La responsable confirma o cambia precio, duración y comentarios.
- Una vez revisada, la clienta solo reserva con esa manicurista.
- No se retienen horarios durante la revisión.
- Las solicitudes permanecen pendientes hasta atención o cancelación.
- “No tengo diseño” utiliza el mismo modelo de selección y contacto; después la manicurista crea la cita manual.

## Visitas y recompensas

- Las visitas pertenecen globalmente a la clienta, no a una manicurista.
- Solo una cita completada incrementa el contador.
- Una ausencia no incrementa visitas.
- Solo la administradora corrige visitas manualmente y debe quedar auditoría.
- La primera regla propuesta es: segunda visita desbloquea 10% para la siguiente cita.
- La administradora puede crear cualquier cantidad de hitos.
- Cada hito se desbloquea una sola vez.
- El camino continúa acumulándose y no se reinicia.
- Los cupones no vencen.
- El beneficio se representa mediante título y texto libre.
- Los cupones se muestran como bloqueados, disponibles o utilizados.
- La manicurista elige qué cupón canjear.
- No se combinan cupones.
- El canje se vincula con una cita.
- Solo la administradora puede revertir un canje.
- Las recompensas se aplican al cobro físico, nunca al anticipo.
- Existen códigos promocionales generales que generan cupones visuales.

## Anticipos

- El anticipo inicial es de $100 y es editable globalmente.
- No existen anticipos distintos por servicio en el alcance inicial.
- El pago inicial se realiza por transferencia SPEI directa.
- El sistema genera una referencia.
- La clienta carga un comprobante dentro de 10 minutos.
- Al cargarlo, el horario queda bloqueado en estado “Pago por verificar”.
- Solo la administradora aprueba o rechaza.
- Al rechazar, el horario se libera.
- Se emite un comprobante digital de reservación.
- No hay CFDI.
- No hay reembolsos operados dentro de la plataforma.
- Los comprobantes se conservan un año.
- Las citas manuales permiten describir el estado o forma de anticipo en notas.
- La configuración bancaria se copia a cada reservación para conservar el dato mostrado al pagar.
- Las políticas tienen versión; un cambio de contenido exige una versión nueva.
- Los comprobantes aceptados son JPG, PNG, WebP o PDF de hasta 8 MB.
- El comprobante original solo es visible para su cliente y la administradora.
- La limpieza física de archivos vencidos se ejecuta al iniciar la API y después cada seis horas.
- El comprobante digital de reservación es imprimible, pero no constituye un CFDI.

## Notificaciones e integraciones

- Clientas y personal reciben notificaciones por WhatsApp.
- Existe un centro de notificaciones dentro de la plataforma.
- Se envían recordatorios 24 horas y 2 horas antes.
- Las manicuristas reciben avisos de citas, cambios, cotizaciones y pagos confirmados.
- Cada manicurista puede conectar su Google Calendar.
- La sincronización inicial es desde Dear Angel hacia el calendario.
- El correo `miniyahirpro@gmail.com` será el remitente SMTP inicial y se configura por entorno.
- No se deben compartir tokens ni contraseñas de aplicación por chat o repositorio.
- Los avisos se guardan internamente antes de intentar el canal externo; una falla de Meta, SMTP o Google nunca revierte una cita o un anticipo.
- Las entregas externas se reintentan hasta cinco veces con espera progresiva y conservan el último error para revisión administrativa.
- Los textos internos son editables por la administradora y aceptan `{{titulo}}` y `{{mensaje}}`; el nombre de la plantilla aprobada en Meta también es configurable.
- Los tokens OAuth de Google se cifran con AES-256-GCM usando una clave exclusiva del entorno.
- El perfil propio exige la contraseña actual para cambiar datos; cambiar el WhatsApp de una cuenta cliente obliga a verificar el número nuevo.

## Marca y configuración pública

- Paleta: crema, rosa pastel, lila y dorado.
- Se autoriza derivar los colores desde el manual de marca.
- Se utilizará temporalmente un logo extraído del PDF.
- La administradora puede reemplazar logo principal e icono desde su panel.
- La administradora puede editar dirección, teléfonos, WhatsApp, redes, mapa y demás datos públicos.
- La plataforma será instalable como PWA.
- La redacción del panel personal de administración será femenina.

## Políticas

- Deben existir una página permanente, un resumen en reserva y un aviso destacado antes del anticipo.
- La clienta debe aceptar expresamente la versión vigente.
- El anticipo no es reembolsable.
- Reagendar con el mismo anticipo se permite una vez.
- Los cambios de la clienta requieren un día de anticipación.
- Adultos asisten sin niños ni acompañantes.
- Menores de 16 años deben asistir con una persona adulta.
- Hay 10 minutos de tolerancia informativa.

## Infraestructura y datos

- La primera entrega se ejecuta localmente con Docker para demostración en laptop.
- Los respaldos son semanales.
- Se respaldan base de datos y archivos administrados.
- Debe existir un procedimiento probado de restauración.
- Los comprobantes se eliminan al cumplir un año.
- Los secretos permanecen fuera de respaldos y repositorio.

## Documentación acordada

- README de instalación Docker.
- Especificación y reglas de negocio.
- Casos de uso.
- Requisitos funcionales y no funcionales.
- Arquitectura, seguridad y base de datos.
- UML, modelo de datos y diagramas de flujo.
- Manual de clienta.
- Manual de manicurista.
- Manual de administradora.
- Capturas reales.
- Aviso de privacidad, términos y políticas para revisión legal.
- PDFs separados y fuentes editables dentro del repositorio.

## Pendientes externos no bloqueantes

- Credenciales y alta de WhatsApp Business Platform.
- Aprobación de plantillas de WhatsApp.
- Contraseña de aplicación SMTP.
- Credenciales de Google Calendar.
- Datos bancarios SPEI.
- Logo definitivo.
- Dirección, teléfono público, redes y mapa definitivos.

## Calidad y recuperación

- El respaldo semanal incluye PostgreSQL y todos los archivos del bucket privado.
- Las copias se publican de forma atómica, se verifican con SHA-256 y se conservan 90 días por defecto.
- Una restauración real exige confirmación explícita; su ensayo normal se realiza sobre destinos aislados.
- Los datos demo sólo se crean con `DEMO_DATA_ENABLED=true`, son ficticios y el proceso es idempotente.
- Producción no inicia con contraseñas locales, orígenes inseguros o credenciales faltantes de proveedores activos.
- La candidata de entrega debe pasar unitarios, build, auditoría de dependencias, e2e y ensayo Docker limpio.
