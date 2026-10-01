# Pruebas manuales

Lo que se encuentra probando la app a mano, con su estado. Cada fila nueva lleva fecha y cómo se probó.

## Cómo probar en local

| Dónde | Qué hace falta |
|---|---|
| Server | `npm run dev` en `fitogenix-server` (el `.env` apunta al Supabase real: lo que se haga queda en producción) |
| Navegador (Expo web) | `CORS_ORIGINS=http://localhost:8081` en el `.env` del server; sin eso el navegador bloquea todo con `Failed to fetch` (H-03: sin lista, sin CORS). `EXPO_PUBLIC_BACKEND_URL=http://localhost:3000` en native |
| Teléfono | Un *development build* instalado (la app usa `expo-dev-client` y Google Sign-In nativo: Expo Go no alcanza). **Desde F-08 hace falta uno nuevo** (`expo-secure-store`, `expo-crypto` y `usesAppleSignIn`), la misma red Wi-Fi y `EXPO_PUBLIC_BACKEND_URL=http://<IP de la Mac>:3000` |
| Onboarding | `EXPO_PUBLIC_SKIP_ONBOARDING=1` en el `.env` de native lo saltea (solo en desarrollo) |

## Pruebas pendientes del responsable (2026-10-01)

Lo que el código ya hace pero los tests automáticos no pueden ver (teléfono real, mails, proveedores, producción). Marcar ✅ con la fecha, o anotar lo que falle como observación `PM-` abajo.

### Antes de empezar

| # | Tarea | Cómo | Qué tiene que pasar | Estado |
|---|---|---|---|---|
| MT-01 | Limpiar el `.env` de native (C-08) | Borrar `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `SERPAPI_API_KEY` y `EXPO_PUBLIC_SUPABASE_*`; vaciar la Papelera | En el `.env` de native solo quedan `EXPO_PUBLIC_BACKEND_URL`, los client IDs de Google y `EXPO_PUBLIC_SKIP_ONBOARDING` (opcional) | Pendiente |
| MT-02 | Build de desarrollo nuevo | `npx expo run:ios` (y `run:android` si aplica) desde `~/fitogenix-native` con `git pull` y `npm ci` | La app abre en el teléfono contra el server local (ver "Cómo probar en local") | Pendiente |

### Cuenta y sesión (F-02 a F-05, F-08, F-09)

| # | Tarea | Cómo | Qué tiene que pasar | Estado |
|---|---|---|---|---|
| MT-03 | Registro con email | Crear una cuenta con nombre, apellido, username y teléfono | Llega el mail de confirmación; después de confirmar, el login entra y Perfil muestra nombre y username | Pendiente |
| MT-04 | Login y errores | Login con el email en MAYÚSCULAS; después con contraseña mala; después con un username tomado al registrarse | Entra igual; contraseña mala → mensaje claro, sin decir si el email existe; username tomado → aviso en el formulario | Pendiente |
| MT-05 | Google | "Continuar con Google" en el teléfono | Entra; la primera vez se crea el perfil con el nombre de Google | Pendiente |
| MT-06 | Apple (iOS) | "Continuar con Apple" | Entra; sin errores de nonce ni de client ID | Pendiente |
| MT-07 | Recuperar contraseña (F-04) | "Olvidé mi contraseña" → código del mail → contraseña nueva | Llega el mail; con el código se cambia; la vieja ya no entra y la nueva sí. Con un email que no existe, la app dice lo mismo (no revela) | Pendiente |
| MT-08 | La sesión dura | Cerrar la app y abrirla; al día siguiente, abrirla otra vez (el token vence a la hora) | Sigue con la sesión, sin pedir login (el refresh es invisible) | Pendiente |
| MT-09 | Perfil (F-09) | Editar nombre y username; probar un username de otra cuenta | Se guarda; el tomado se rechaza; Perfil no muestra "Iniciar sesión" ni un instante al entrar (R-01) | Pendiente |
| MT-10 | Cerrar sesión y borrar cuenta | Cerrar sesión; volver a entrar; "Eliminar cuenta" | Cerrar vuelve a la bienvenida; eliminar borra la cuenta y no se puede volver a entrar con ella | Pendiente |

### Onboarding (F-06, F-10)

| # | Tarea | Cómo | Qué tiene que pasar | Estado |
|---|---|---|---|---|
| MT-11 | Respuestas con consentimiento | Hacer el onboarding, aceptar el consentimiento de salud, registrarse y entrar | Las respuestas llegan a la cuenta (lo verifico yo con una consulta si me avisás) | Pendiente |
| MT-12 | Sin consentimiento y "sin cuenta" | Rechazar el consentimiento; en otra prueba, elegir seguir sin cuenta | Sin consentimiento no se guardan síntomas, dietas ni alergias; sin cuenta no se guarda nada | Pendiente |
| MT-13 | Toques en el onboarding (PM-05) | Pasos "¿Qué querés evitar?" y "¿Cómo nos conociste?" en el teléfono | Cada opción se marca al tocarla | Pendiente |

### Escaneo, resultado y biblioteca (F-01, F-11)

| # | Tarea | Cómo | Qué tiene que pasar | Estado |
|---|---|---|---|---|
| MT-14 | Escanear (PM-03) | Escanear 3 productos reales con la cámara trasera | Lee el código y muestra el resultado | Pendiente |
| MT-15 | Buscar y casos raros | Buscar por nombre; un código que no está en el catálogo; una bebida alcohólica | Encuentra el producto; "todavía no está en el catálogo"; "Sin puntaje" con su explicación | Pendiente |
| MT-16 | Imágenes (PM-02) | Mirar las fotos de varios resultados | Si alguna no carga, anotar cuál (es DT-04) | Pendiente |
| MT-17 | Guardar e historial | Guardar con cuenta; sin cuenta; borrar una fila del historial | Con cuenta aparece en Guardados; sin cuenta invita a crearla; la fila borrada no vuelve al recargar | Pendiente |
| MT-18 | Feedback y reportes (F-11b) | Enviar feedback y "Reportar problema" de un producto, con y sin cuenta | "Enviado" solo cuando el server respondió; sin red se puede reintentar | Pendiente |

### Animaciones tocadas en R-01

| # | Tarea | Cómo | Qué tiene que pasar | Estado |
|---|---|---|---|---|
| MT-19 | Hojas inferiores | Abrir "Cómo puntuamos" y "Reportar problema"; cerrarlas con el fondo, con la X y arrastrando hacia abajo | Entran y salen suaves; arrastrar poco vuelve a su lugar, arrastrar mucho la cierra; al reabrir "Reportar", el formulario está vacío | Pendiente |
| MT-20 | Pestañas | Cambiar de pestaña tocando y deslizando el dedo a los costados | El indicador se mueve con rebote; deslizar cambia a la pestaña vecina; la pantalla entra deslizándose | Pendiente |
| MT-21 | Detalles | Guardar un producto; ver el contador del final del onboarding | El ícono rebota; el número cuenta de 0 al valor | Pendiente |

### Accesibilidad (F-13)

| # | Tarea | Cómo | Qué tiene que pasar | Estado |
|---|---|---|---|---|
| MT-22 | Checklist de accesibilidad | Los 20 puntos de [checklist-accesibilidad.md](checklist-accesibilidad.md), con VoiceOver y TalkBack | Todos en ✅ | Pendiente |

### Producción

| # | Tarea | Cómo | Qué tiene que pasar | Estado |
|---|---|---|---|---|
| MT-23 | Lookup en producción después de B-01 | Buscar un producto contra el server de Render (`main`) | Responde con puntaje (el esquema nuevo no rompió `main`) | Pendiente |
| MT-24 | Sin acceso directo (B-03) | `curl "<SUPABASE_URL>/rest/v1/profiles?select=id" -H "apikey: <publishable key>"` (y lo mismo con `scan_history`) | `42501` (permiso denegado), no datos | Pendiente |

## Observaciones

| # | Fecha | Dónde | Qué pasa | Análisis | Estado |
|---|---|---|---|---|---|
| PM-01 | 2026-09-30 | Navegador | Guardados, historial y búsqueda fallan con `Failed to fetch` | CORS: el `.env` local del server no tenía `CORS_ORIGINS` | ✅ Resuelto con la variable (solo local) |
| PM-02 | 2026-09-30 | Navegador | Después de una búsqueda, algunas imágenes no cargan (`net::ERR…`) | La app muestra `imageUrl` directo desde el sitio de origen (D-49); algunos sitios bloquean que otra página use sus imágenes. Es el hosting propio de imágenes, diferido | Pendiente: [DT-04](deuda-tecnica.md) / L-10. Verificar en el teléfono si pasa igual |
| PM-03 | 2026-09-30 | Navegador, cámara de la computadora | No lee códigos de barras (antes sí) | Sin analizar: puede ser la cámara frontal (imagen espejada o sin foco) o un cambio en el lector web | A verificar en el teléfono; si allá anda, se analiza solo el caso web |
| PM-04 | 2026-09-30 | Inicio, "Productos analizados" | El nombre del producto se corta en la primera letra ("S…", "F…") | Error de diseño previo al refactor: la tarjeta deja al nombre una sola línea muy angosta | Pendiente (native, diseño) |
| PM-05 | 2026-09-30 | Navegador, onboarding | En los pasos "¿Qué querés evitar?" y "¿Cómo nos conociste?" los toques no marcan las opciones ("Todos los anteriores" sí) | En web, un espaciador vacío (`<View style={{ flex: 1 }} />`) queda encima de la lista y se come los clics; en "evitar" además las tarjetas se superponen. Previo a F-10 (solo diseño web; el onboarding es igual en el teléfono). Visto en la prueba de punta a punta de F-08 | A verificar en el teléfono |
